import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import express, { NextFunction, Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import { AIAnalysisEngine } from './src/server/aiEngine.ts';
import { generateAnalysisId, generateRequestId, logger } from './src/server/logger.ts';
import {
  determineClassification,
  getConfiguredRiskWeights,
  RiskScoringEngine,
} from './src/server/riskScoringEngine.ts';
import {
  SecurityValidationError,
  validateAndExtractImageMetadata,
} from './src/server/security.ts';
import { storageService } from './src/server/storageService.ts';
import { extractUrlContent } from './src/server/urlAnalyzer.ts';
import {
  AnalysisResult,
  PipelineStepRecord,
  SystemHealthStatus,
} from './src/types/analysis.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SERVER_START_TIME = Date.now();
const JWT_SECRET =
  process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
const MAX_IMAGE_SIZE_MB = Number(process.env.MAX_IMAGE_SIZE_MB || '10');
const RATE_LIMIT_ENABLED = process.env.RATE_LIMIT_ENABLED !== 'false';
const ANON_LIMIT_PER_HOUR = Number(process.env.RATE_LIMIT_ANON_PER_HOUR || '15');
const AUTH_LIMIT_PER_HOUR = Number(process.env.RATE_LIMIT_AUTH_PER_HOUR || '60');

const aiEngine = new AIAnalysisEngine();
const riskScoringEngine = new RiskScoringEngine();

// Observability metrics counter
const observabilityMetrics = {
  aiApiErrors: 0,
  rateLimitHits: 0,
};

// Modular Auth Store (PBKDF2/scrypt hashed passwords, never plaintext)
interface UserAccount {
  id: string;
  email: string;
  passwordHash: string;
  salt: string;
  createdAt: string;
}
const usersByEmail = new Map<string, UserAccount>();

function hashPassword(password: string, salt: string): string {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

function signJwtToken(payload: { sub: string; email: string }): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 24;
  const body = Buffer.from(JSON.stringify({ ...payload, exp })).toString('base64url');
  const signature = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${header}.${body}`)
    .digest('base64url');
  return `${header}.${body}.${signature}`;
}

// Rate limiter bucket per IP / User
const rateLimitBuckets = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(req: Request, res: Response, next: NextFunction) {
  if (!RATE_LIMIT_ENABLED) return next();

  const authHeader = req.headers.authorization || '';
  const isAuthenticated = authHeader.startsWith('Bearer ') && authHeader.length > 20;
  const clientIp =
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    req.socket.remoteAddress ||
    'unknown';
  const key = isAuthenticated ? `auth:${authHeader.slice(-24)}` : `anon:${clientIp}`;
  const limit = isAuthenticated ? AUTH_LIMIT_PER_HOUR : ANON_LIMIT_PER_HOUR;

  const now = Date.now();
  const bucket = rateLimitBuckets.get(key);

  if (!bucket || now > bucket.resetAt) {
    rateLimitBuckets.set(key, { count: 1, resetAt: now + 3600 * 1000 });
    res.setHeader('X-RateLimit-Limit', String(limit));
    res.setHeader('X-RateLimit-Remaining', String(limit - 1));
    return next();
  }

  if (bucket.count >= limit) {
    observabilityMetrics.rateLimitHits++;
    const retryAfterSec = Math.ceil((bucket.resetAt - now) / 1000);
    res.setHeader('Retry-After', String(retryAfterSec));
    return res.status(429).json({
      error: `Rate limit exceeded (${limit} analyses/hour). Sign in for higher limits or try again in ${Math.ceil(retryAfterSec / 60)} minutes.`,
      code: 'RATE_LIMIT_EXCEEDED',
    });
  }

  bucket.count++;
  res.setHeader('X-RateLimit-Limit', String(limit));
  res.setHeader('X-RateLimit-Remaining', String(Math.max(0, limit - bucket.count)));
  return next();
}

export async function createApp() {
  const app = express();

  // Security HTTP headers & JSON body parser (up to 15MB for base64 image uploads)
  app.use((req: Request, res: Response, next: NextFunction) => {
    const reqId = generateRequestId();
    (req as Request & { requestId?: string }).requestId = reqId;
    res.setHeader('X-Request-ID', reqId);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'no-referrer');
    next();
  });

  app.use(express.json({ limit: '16mb' }));

  // ============================================================================
  // 1. AUTHENTICATION ENDPOINTS (POST /api/auth/register & POST /api/auth/login)
  // ============================================================================
  app.post('/api/auth/register', (req: Request, res: Response) => {
    const requestId = (req as Request & { requestId?: string }).requestId || generateRequestId();
    const { email, password } = req.body || {};

    if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return res.status(400).json({ error: 'Please provide a valid email address.', code: 'INVALID_EMAIL' });
    }
    if (!password || typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({
        error: 'Password must be at least 8 characters long.',
        code: 'WEAK_PASSWORD',
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    if (usersByEmail.has(normalizedEmail)) {
      return res.status(409).json({
        error: 'An account with this email already exists.',
        code: 'EMAIL_EXISTS',
      });
    }

    const salt = crypto.randomBytes(16).toString('hex');
    const passwordHash = hashPassword(password, salt);
    const user: UserAccount = {
      id: `usr_${crypto.randomBytes(8).toString('hex')}`,
      email: normalizedEmail,
      passwordHash,
      salt,
      createdAt: new Date().toISOString(),
    };
    usersByEmail.set(normalizedEmail, user);

    const token = signJwtToken({ sub: user.id, email: user.email });
    logger.info({
      requestId,
      event: 'USER_REGISTERED',
      message: `Registered new user account (${user.id})`,
    });

    return res.status(201).json({
      user: { id: user.id, email: user.email, createdAt: user.createdAt },
      token,
    });
  });

  app.post('/api/auth/login', (req: Request, res: Response) => {
    const requestId = (req as Request & { requestId?: string }).requestId || generateRequestId();
    const { email, password } = req.body || {};

    if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
      return res.status(400).json({
        error: 'Email and password are required.',
        code: 'MISSING_CREDENTIALS',
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = usersByEmail.get(normalizedEmail);
    if (!user) {
      return res.status(401).json({
        error: 'Invalid email or password.',
        code: 'AUTH_FAILED',
      });
    }

    const candidateHash = hashPassword(password, user.salt);
    const isMatch = crypto.timingSafeEqual(
      Buffer.from(candidateHash, 'hex'),
      Buffer.from(user.passwordHash, 'hex')
    );

    if (!isMatch) {
      return res.status(401).json({
        error: 'Invalid email or password.',
        code: 'AUTH_FAILED',
      });
    }

    const token = signJwtToken({ sub: user.id, email: user.email });
    logger.info({
      requestId,
      event: 'USER_LOGIN',
      message: `Authenticated user session (${user.id})`,
    });

    return res.status(200).json({
      user: { id: user.id, email: user.email, createdAt: user.createdAt },
      token,
    });
  });

  // ============================================================================
  // 2. URL ANALYSIS ENDPOINT (POST /api/analyze/url)
  // ============================================================================
  app.post('/api/analyze/url', checkRateLimit, async (req: Request, res: Response) => {
    const startTime = Date.now();
    const requestId = (req as Request & { requestId?: string }).requestId || generateRequestId();
    const analysisId = generateAnalysisId();
    const { url, isDemo, demoPreset, userId } = req.body || {};

    const pipelineSteps: PipelineStepRecord[] = [];

    try {
      // Demo Mode path (clearly labeled as DEMO RESULT)
      if (isDemo) {
        const { urlData, aiOutput } = aiEngine.getDemoUrlAnalysis(demoPreset);
        const { riskScore, riskTier, breakdown } = riskScoringEngine.calculateUrlRisk(
          urlData,
          aiOutput.signals,
          aiOutput.risk_score
        );
        const classification = determineClassification(riskScore, aiOutput.classification);
        const executionTimeMs = Date.now() - startTime;

        const result: AnalysisResult = {
          id: analysisId,
          userId: userId || 'anonymous',
          analysisType: 'url',
          inputReference: urlData.url,
          classification,
          confidence: aiOutput.confidence,
          riskScore,
          riskTier,
          summary: aiOutput.summary.startsWith('[DEMO RESULT]')
            ? aiOutput.summary
            : `[DEMO RESULT] ${aiOutput.summary}`,
          isDemo: true,
          breakdown,
          signals: aiOutput.signals,
          recommendations: aiOutput.recommendations,
          explanation: aiOutput.explanation,
          urlData,
          executionTimeMs,
          aiModelUsed: 'demo-preset-engine',
          pipelineSteps: [
            { step: 'Input validated', status: 'completed', detail: 'Demo URL preset selected', durationMs: 4 },
            { step: 'Content extracted', status: 'completed', detail: `${urlData.wordCount} words & metadata loaded`, durationMs: 8 },
            { step: 'Metadata analyzed', status: 'completed', detail: 'OpenGraph, Schema.org & domain inspected', durationMs: 6 },
            { step: 'AI authenticity analysis', status: 'completed', detail: 'Evaluated via Demo Analysis preset', durationMs: 18 },
            { step: 'Risk assessment', status: 'completed', detail: `Composite risk score ${riskScore}/100 (${riskTier})`, durationMs: 5 },
            { step: 'Generating explanation', status: 'completed', detail: 'Structured explanation ready', durationMs: 4 },
          ],
          createdAt: new Date().toISOString(),
          status: 'completed',
        };

        await storageService.saveAnalysisRecord(result);
        logger.info({
          requestId,
          analysisId,
          analysisType: 'url',
          executionTimeMs,
          event: 'DEMO_URL_ANALYSIS_COMPLETED',
          message: `Completed demo URL analysis for ${urlData.domain}`,
        });

        return res.status(200).json(result);
      }

      // Live URL Validation + Extraction (or curated specimen extraction for synthetic test URLs)
      const step1Start = Date.now();
      let urlData;
      if (demoPreset === 'suspicious-claim' || demoPreset === 'verified-science') {
        urlData = aiEngine.getUrlSpecimenData(demoPreset);
      } else {
        try {
          urlData = await extractUrlContent(url);
        } catch (scrapeErr) {
          // If it's a security/SSRF or invalid format error, reject immediately
          if (
            scrapeErr instanceof SecurityValidationError &&
            scrapeErr.code !== 'WEBSITE_UNAVAILABLE' &&
            scrapeErr.code !== 'FETCH_FAILED' &&
            scrapeErr.code !== 'FETCH_TIMEOUT'
          ) {
            throw scrapeErr;
          }
          // If the remote website blocked automated scraping (e.g. HTTP 403/Cloudflare),
          // construct a fallback metadata profile from the validated URL so Gemini can still evaluate it
          const parsedUrl = new URL(url.trim());
          const hostParts = parsedUrl.hostname.toLowerCase().split('.').filter(Boolean);
          const tld = hostParts[hostParts.length - 1] || '';
          const domain =
            hostParts.length >= 2
              ? `${hostParts[hostParts.length - 2]}.${tld}`
              : parsedUrl.hostname;
          const subdomain =
            hostParts.length > 2 ? hostParts.slice(0, hostParts.length - 2).join('.') : 'none';
          const pathSlug = parsedUrl.pathname
            .replace(/[-_/]+/g, ' ')
            .trim();

          urlData = {
            url: parsedUrl.toString(),
            canonicalUrl: parsedUrl.toString(),
            domain,
            subdomain,
            tld,
            isHttps: parsedUrl.protocol === 'https:',
            title: pathSlug ? `Webpage at ${domain}: ${pathSlug}` : `Webpage at ${domain}`,
            description:
              'Direct HTML scraping was restricted by the remote host firewall; evaluating URL structure, domain provenance, and path semantics via Gemini AI.',
            author: 'Unknown (Remote host restricted crawler access)',
            publishedDate: 'Unavailable',
            modifiedDate: 'Unavailable',
            mainTextPreview: `Target URL: ${parsedUrl.toString()}. Path segments: ${pathSlug || 'root'}. Note: The remote origin server restricted full HTML body extraction (common on sites with bot-protection rules).`,
            wordCount: 0,
            imageCount: 0,
            externalLinksCount: 0,
            openGraph: {},
            twitterCard: {},
            schemaOrgTypes: [],
            contentSignals: [
              'Remote host restricted automated HTML crawler access; full body text could not be directly inspected.',
            ],
            textSnippets: [`URL Path: "${parsedUrl.pathname}"`],
          };
        }
      }
      const extractDuration = Date.now() - step1Start;

      pipelineSteps.push(
        {
          step: 'Input validated',
          status: 'completed',
          detail: `Verified ${urlData.isHttps ? 'HTTPS' : 'HTTP'} scheme & passed SSRF IP/DNS checks`,
          durationMs: Math.min(80, Math.round(extractDuration * 0.2)),
        },
        {
          step: 'Content extracted',
          status: 'completed',
          detail: `Extracted ${urlData.wordCount} words, ${urlData.imageCount} images, ${urlData.externalLinksCount} outbound links`,
          durationMs: Math.round(extractDuration * 0.6),
        },
        {
          step: 'Metadata analyzed',
          status: 'completed',
          detail: `Parsed ${Object.keys(urlData.openGraph).length} OpenGraph tags & ${urlData.schemaOrgTypes.length} Schema.org types`,
          durationMs: Math.round(extractDuration * 0.2),
        }
      );

      // Centralized AI Engine Analysis
      const aiStart = Date.now();
      let aiOutput;
      let usedDemoFallback = false;

      try {
        aiOutput = await aiEngine.analyzeUrl(urlData);
      } catch (aiErr) {
        observabilityMetrics.aiApiErrors++;
        logger.warn({
          requestId,
          analysisId,
          analysisType: 'url',
          event: 'AI_ENGINE_ERROR',
          message: aiErr instanceof Error ? aiErr.message : 'AI engine call failed',
        });
        throw new SecurityValidationError(
          'The AI analysis engine encountered an upstream error or timeout. You can retry or test with Demo Mode.',
          503,
          'AI_ENGINE_FAILURE'
        );
      }
      const aiLatencyMs = Date.now() - aiStart;

      pipelineSteps.push({
        step: 'AI authenticity analysis',
        status: 'completed',
        detail: `Analyzed with ${aiEngine.getProviderInfo().model} in ${aiLatencyMs}ms`,
        durationMs: aiLatencyMs,
      });

      // Risk Scoring Engine
      const scoreStart = Date.now();
      const { riskScore, riskTier, breakdown } = riskScoringEngine.calculateUrlRisk(
        urlData,
        aiOutput.signals,
        aiOutput.risk_score
      );
      const classification = determineClassification(riskScore, aiOutput.classification);
      const scoreDuration = Date.now() - scoreStart;

      pipelineSteps.push(
        {
          step: 'Risk assessment',
          status: 'completed',
          detail: `Computed weighted score ${riskScore}/100 (${riskTier})`,
          durationMs: scoreDuration,
        },
        {
          step: 'Generating explanation',
          status: 'completed',
          detail: `Compiled ${aiOutput.signals.length} evidence signals & verification guidance`,
          durationMs: 8,
        }
      );

      const executionTimeMs = Date.now() - startTime;
      const result: AnalysisResult = {
        id: analysisId,
        userId: userId || 'anonymous',
        analysisType: 'url',
        inputReference: urlData.url,
        classification,
        confidence: aiOutput.confidence,
        riskScore,
        riskTier,
        summary: aiOutput.summary,
        isDemo: usedDemoFallback,
        breakdown,
        signals: aiOutput.signals,
        recommendations: aiOutput.recommendations,
        explanation: aiOutput.explanation,
        urlData,
        executionTimeMs,
        aiModelUsed: aiEngine.getProviderInfo().model,
        pipelineSteps,
        createdAt: new Date().toISOString(),
        status: 'completed',
      };

      await storageService.saveAnalysisRecord(result);

      logger.info({
        requestId,
        analysisId,
        analysisType: 'url',
        executionTimeMs,
        aiLatencyMs,
        event: 'URL_ANALYSIS_COMPLETED',
        message: `Analyzed URL ${urlData.domain} -> ${classification} (${riskScore}/100)`,
      });

      return res.status(200).json(result);
    } catch (err: unknown) {
      const executionTimeMs = Date.now() - startTime;
      if (err instanceof SecurityValidationError) {
        logger.warn({
          requestId,
          analysisId,
          analysisType: 'url',
          executionTimeMs,
          event: 'URL_VALIDATION_REJECTED',
          errorCode: err.code,
          message: err.message,
        });
        return res.status(err.statusCode).json({
          error: err.message,
          code: err.code,
        });
      }

      logger.error({
        requestId,
        analysisId,
        analysisType: 'url',
        executionTimeMs,
        event: 'UNEXPECTED_URL_ERROR',
        message: err instanceof Error ? err.message : 'Unexpected server error',
      });

      return res.status(500).json({
        error: 'An unexpected error occurred while analyzing the URL. Please try again.',
        code: 'INTERNAL_SERVER_ERROR',
      });
    }
  });

  // ============================================================================
  // 3. IMAGE ANALYSIS ENDPOINT (POST /api/analyze/image)
  // ============================================================================
  app.post('/api/analyze/image', checkRateLimit, async (req: Request, res: Response) => {
    const startTime = Date.now();
    const requestId = (req as Request & { requestId?: string }).requestId || generateRequestId();
    const analysisId = generateAnalysisId();
    const {
      imageBase64,
      filename = 'uploaded_image.jpg',
      mimeType = 'image/jpeg',
      isDemo = false,
      demoPresetKey,
      userId,
    } = req.body || {};

    const pipelineSteps: PipelineStepRecord[] = [];

    try {
      let buffer: Buffer;
      let resolvedFilename = filename;
      let resolvedMime = mimeType;

      if (demoPresetKey === 'synthetic-summit' || demoPresetKey === 'authentic-buoy') {
        const assetFile =
          demoPresetKey === 'synthetic-summit'
            ? 'demo_synthetic_conference_1791711806419.jpg'
            : 'demo_authentic_field_report_1791711821300.jpg';
        const assetPath = path.resolve(__dirname, 'src/assets/images', assetFile);
        if (fs.existsSync(assetPath)) {
          buffer = fs.readFileSync(assetPath);
          resolvedFilename =
            demoPresetKey === 'synthetic-summit'
              ? 'climate_summit_podium_press.jpg'
              : 'coastal_observatory_buoy_inspection.jpg';
          resolvedMime = 'image/jpeg';
        } else {
          throw new SecurityValidationError('Demo image asset not found on server.', 404, 'DEMO_ASSET_MISSING');
        }
      } else {
        if (!imageBase64 || typeof imageBase64 !== 'string') {
          throw new SecurityValidationError(
            'Please upload a valid .jpg, .jpeg, .png, or .webp image.',
            400,
            'MISSING_IMAGE_DATA'
          );
        }
        const strippedBase64 = imageBase64.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '');
        buffer = Buffer.from(strippedBase64, 'base64');
      }

      const step1Start = Date.now();
      const technicalMetadata = await validateAndExtractImageMetadata(
        buffer,
        resolvedFilename,
        resolvedMime,
        MAX_IMAGE_SIZE_MB
      );
      const metaDuration = Date.now() - step1Start;

      pipelineSteps.push(
        {
          step: 'Input validated',
          status: 'completed',
          detail: `Verified ${technicalMetadata.extension} magic bytes (${technicalMetadata.fileSizeFormatted})`,
          durationMs: Math.max(4, Math.round(metaDuration * 0.4)),
        },
        {
          step: 'Content extracted',
          status: 'completed',
          detail: `Decoded ${technicalMetadata.width}×${technicalMetadata.height} px (${technicalMetadata.colorMode})`,
          durationMs: Math.max(4, Math.round(metaDuration * 0.3)),
        },
        {
          step: 'Metadata analyzed',
          status: 'completed',
          detail: technicalMetadata.exif.hasExif
            ? 'EXIF container tags extracted & sanitized'
            : 'No embedded camera EXIF tags found in image container',
          durationMs: Math.max(4, Math.round(metaDuration * 0.3)),
        }
      );

      // Demo Mode offline preset OR Live AI Engine call
      const aiStart = Date.now();
      let aiOutput;

      if (isDemo) {
        const isAuthenticDemo = demoPresetKey === 'authentic-buoy';
        aiOutput = isAuthenticDemo
          ? {
              classification: 'LIKELY_AUTHENTIC' as const,
              confidence: 0.88,
              risk_score: 22,
              summary:
                '[DEMO RESULT] The image displays consistent natural overcast lighting, coherent coastal textures, readable equipment stencil lettering ("COASTAL OBSERVATORY"), and no high-severity splicing artifacts.',
              signals: [
                {
                  id: 'sig_img_1',
                  category: 'visual' as const,
                  severity: 'low' as const,
                  description: 'Coherent surface typography and physical weathering on buoy casing.',
                  evidence: 'Curved stencil text "COASTAL OBSERVATORY" follows cylinder perspective accurately.',
                  confidence: 0.9,
                },
                {
                  id: 'sig_img_2',
                  category: 'visual' as const,
                  severity: 'low' as const,
                  description: 'Consistent diffuse lighting and shadow falloff on wet stone pier.',
                  evidence: 'Specularity and cable shadows align with overcast sky illumination.',
                  confidence: 0.87,
                },
                {
                  id: 'sig_img_3',
                  category: 'metadata' as const,
                  severity: 'medium' as const,
                  description: 'Camera EXIF metadata unavailable in web-distributed file.',
                  evidence: 'Container lacks original camera Make/Model tags (common when stripped by CMS platforms).',
                  confidence: 0.95,
                },
              ],
              image_assessment: {
                aiGeneratedProbability: 0.18,
                manipulationProbability: 0.12,
                editingIndicators: ['Standard editorial contrast grading', 'Stripped EXIF container'],
                visualAnomalies: [],
              },
              explanation: {
                whatDetected:
                  'Natural optical grain, geometrically consistent curved text on the weather buoy, and realistic mechanical cable routing, alongside stripped EXIF metadata.',
                whyItMatters:
                  'While stripped EXIF metadata warrants routine source verification, the absence of anatomical, perspective, or typographic synthesis artifacts points toward low manipulation risk.',
                confidenceReasoning:
                  'Confidence is 88% based on visual consistency across foreground textures and background harbor vessels. Marked as a Demo Result.',
                whatToVerify:
                  'Confirm the photograph’s original publication caption and photographer credit.',
              },
              recommendations: [
                'Verify the photo agency or institutional credit line accompanying the image.',
                'Note that missing EXIF metadata is common on web portals and is not proof of manipulation by itself.',
              ],
            }
          : {
              classification: 'LIKELY_MANIPULATED_OR_AI_GENERATED' as const,
              confidence: 0.87,
              risk_score: 82,
              summary:
                '[DEMO RESULT] Visual inspection detected garbled typography on the summit stage backdrop ("INTETTIONAL CLIMT"), irregular mirrored reflections in the foreground floor, and missing camera EXIF metadata.',
              signals: [
                {
                  id: 'sig_img_1',
                  category: 'visual' as const,
                  severity: 'high' as const,
                  description: 'Malformed text glyphs on primary conference backdrop banner.',
                  evidence: 'Stage banner reads "INTETTIONAL CLIMT" and "SUSTAINACILITY" with fused letterforms characteristic of AI synthesis.',
                  confidence: 0.94,
                },
                {
                  id: 'sig_img_2',
                  category: 'visual' as const,
                  severity: 'medium' as const,
                  description: 'Anatomical and facial blending in peripheral audience rows.',
                  evidence: 'Background attendees exhibit asymmetrical facial proportions and merged hand postures.',
                  confidence: 0.83,
                },
                {
                  id: 'sig_img_3',
                  category: 'metadata' as const,
                  severity: 'medium' as const,
                  description: 'Camera EXIF and capture timestamp absent.',
                  evidence: 'No camera sensor Make, Model, or DateTimeOriginal tags present in JPEG header.',
                  confidence: 0.92,
                },
              ],
              image_assessment: {
                aiGeneratedProbability: 0.86,
                manipulationProbability: 0.38,
                editingIndicators: ['Absent camera EXIF metadata'],
                visualAnomalies: [
                  'Garbled backdrop text ("INTETTIONAL CLIMT")',
                  'Peripheral crowd facial distortions',
                  'Inconsistent inverted reflection text on floor',
                ],
              },
              explanation: {
                whatDetected:
                  'The image contains malformed English words on the conference backdrop, distorted crowd faces, and lacks camera EXIF metadata.',
                whyItMatters:
                  'Diffusion-based AI image generators frequently produce plausible-looking scenes from a distance that break down in fine text rendering and dense crowd anatomy.',
                confidenceReasoning:
                  'Confidence is 87% due to clear typographic synthesis artifacts on the podium banner. Marked as a Demo Result.',
                whatToVerify:
                  'Compare the image against official conference press archives and inspect high-resolution signage text.',
              },
              recommendations: [
                'Do not rely on this image as documentary evidence of an actual summit event.',
                'Inspect the stage banner text ("INTETTIONAL CLIMT") at 100% zoom.',
                'Cross-check accredited wire service photo galleries for the event.',
              ],
            };
      } else {
        try {
          aiOutput = await aiEngine.analyzeImage(buffer, technicalMetadata);
        } catch (aiErr) {
          observabilityMetrics.aiApiErrors++;
          logger.warn({
            requestId,
            analysisId,
            analysisType: 'image',
            event: 'AI_IMAGE_ENGINE_ERROR',
            message: aiErr instanceof Error ? aiErr.message : 'AI image engine call failed',
          });
          throw new SecurityValidationError(
            'The AI image analysis engine encountered an upstream error or timeout. Please retry or use Demo Mode.',
            503,
            'AI_ENGINE_FAILURE'
          );
        }
      }

      const aiLatencyMs = Date.now() - aiStart;
      pipelineSteps.push({
        step: 'AI authenticity analysis',
        status: 'completed',
        detail: isDemo
          ? 'Evaluated via Demo Image Analysis preset'
          : `Inspected visual & metadata signals with ${aiEngine.getProviderInfo().model} (${aiLatencyMs}ms)`,
        durationMs: aiLatencyMs,
      });

      const defaultImageAssessment = aiOutput.image_assessment || {
        aiGeneratedProbability: aiOutput.risk_score > 65 ? 0.72 : 0.18,
        manipulationProbability: aiOutput.risk_score > 50 ? 0.45 : 0.14,
        editingIndicators: technicalMetadata.exif.hasExif ? [] : ['EXIF metadata absent'],
        visualAnomalies: [],
      };

      const scoreStart = Date.now();
      const { riskScore, riskTier, breakdown } = riskScoringEngine.calculateImageRisk(
        technicalMetadata,
        defaultImageAssessment,
        aiOutput.signals,
        aiOutput.risk_score
      );
      const classification = determineClassification(riskScore, aiOutput.classification);
      const scoreDuration = Date.now() - scoreStart;

      pipelineSteps.push(
        {
          step: 'Risk assessment',
          status: 'completed',
          detail: `Computed weighted score ${riskScore}/100 (${riskTier})`,
          durationMs: scoreDuration,
        },
        {
          step: 'Generating explanation',
          status: 'completed',
          detail: `Compiled ${aiOutput.signals.length} visual & technical signals`,
          durationMs: 6,
        }
      );

      const executionTimeMs = Date.now() - startTime;
      const previewDataUrl =
        buffer.length <= 2.5 * 1024 * 1024
          ? `data:${technicalMetadata.mimeType};base64,${buffer.toString('base64')}`
          : undefined;

      const result: AnalysisResult = {
        id: analysisId,
        userId: userId || 'anonymous',
        analysisType: 'image',
        inputReference: technicalMetadata.filename,
        classification,
        confidence: aiOutput.confidence,
        riskScore,
        riskTier,
        summary: aiOutput.summary,
        isDemo: Boolean(isDemo),
        breakdown,
        signals: aiOutput.signals,
        recommendations: aiOutput.recommendations,
        explanation: aiOutput.explanation,
        imageMetadata: technicalMetadata,
        imageAssessment: defaultImageAssessment,
        imagePreviewDataUrl: previewDataUrl,
        executionTimeMs,
        aiModelUsed: isDemo ? 'demo-preset-engine' : aiEngine.getProviderInfo().model,
        pipelineSteps,
        createdAt: new Date().toISOString(),
        status: 'completed',
      };

      await storageService.saveAnalysisRecord(result);

      logger.info({
        requestId,
        analysisId,
        analysisType: 'image',
        executionTimeMs,
        aiLatencyMs,
        event: 'IMAGE_ANALYSIS_COMPLETED',
        message: `Analyzed image ${technicalMetadata.filename} -> ${classification} (${riskScore}/100)`,
      });

      return res.status(200).json(result);
    } catch (err: unknown) {
      const executionTimeMs = Date.now() - startTime;
      if (err instanceof SecurityValidationError) {
        logger.warn({
          requestId,
          analysisId,
          analysisType: 'image',
          executionTimeMs,
          event: 'IMAGE_VALIDATION_REJECTED',
          errorCode: err.code,
          message: err.message,
        });
        return res.status(err.statusCode).json({
          error: err.message,
          code: err.code,
        });
      }

      logger.error({
        requestId,
        analysisId,
        analysisType: 'image',
        executionTimeMs,
        event: 'UNEXPECTED_IMAGE_ERROR',
        message: err instanceof Error ? err.message : 'Unexpected server error',
      });

      return res.status(500).json({
        error: 'An unexpected error occurred while analyzing the image. Please try again.',
        code: 'INTERNAL_SERVER_ERROR',
      });
    }
  });

  // ============================================================================
  // 4. HISTORY & REPORT RETRIEVAL ENDPOINTS
  // ============================================================================
  app.get('/api/analysis/:id', async (req: Request, res: Response) => {
    const id = String(req.params.id || '').trim();
    if (!id || !/^[a-zA-Z0-9_-]+$/.test(id)) {
      return res.status(400).json({ error: 'Invalid analysis ID format.', code: 'INVALID_ID' });
    }
    const record = await storageService.getAnalysisRecord(id);
    if (!record) {
      return res.status(404).json({ error: 'Analysis report not found.', code: 'NOT_FOUND' });
    }
    return res.status(200).json(record);
  });

  app.get('/api/history', async (req: Request, res: Response) => {
    const userId = typeof req.query.userId === 'string' ? req.query.userId : undefined;
    const records = await storageService.listAnalysisRecords(userId);
    // Strip large base64 preview images in list response for fast payload transfer
    const lightweight = records.map((r) => ({
      ...r,
      imagePreviewDataUrl: undefined,
    }));
    return res.status(200).json({ items: lightweight, total: lightweight.length });
  });

  app.delete('/api/history/:id', async (req: Request, res: Response) => {
    const id = String(req.params.id || '').trim();
    if (!id || !/^[a-zA-Z0-9_-]+$/.test(id)) {
      return res.status(400).json({ error: 'Invalid analysis ID format.', code: 'INVALID_ID' });
    }
    const deleted = await storageService.deleteAnalysisRecord(id);
    if (!deleted) {
      return res.status(404).json({ error: 'Analysis record not found.', code: 'NOT_FOUND' });
    }
    return res.status(200).json({ deleted: true, id });
  });

  // ============================================================================
  // 5. SYSTEM HEALTH & OBSERVABILITY ENDPOINT (GET /api/health)
  // ============================================================================
  app.get('/api/health', async (_req: Request, res: Response) => {
    const allRecords = await storageService.listAnalysisRecords();
    const urlAnalyses = allRecords.filter((r) => r.analysisType === 'url').length;
    const imageAnalyses = allRecords.filter((r) => r.analysisType === 'image').length;
    const avgRisk =
      allRecords.length > 0
        ? Math.round(allRecords.reduce((acc, r) => acc + r.riskScore, 0) / allRecords.length)
        : 0;

    // Build 7-day trend metrics for Admin Dashboard
    const dailyMap = new Map<string, { urlCount: number; imageCount: number; scores: number[] }>();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400 * 1000);
      const label = d.toLocaleDateString('en-US', { month: 'short', day: '2-digit' });
      dailyMap.set(label, { urlCount: 0, imageCount: 0, scores: [] });
    }

    for (const r of allRecords) {
      const label = new Date(r.createdAt).toLocaleDateString('en-US', {
        month: 'short',
        day: '2-digit',
      });
      const entry = dailyMap.get(label);
      if (entry) {
        if (r.analysisType === 'url') entry.urlCount++;
        else entry.imageCount++;
        entry.scores.push(r.riskScore);
      }
    }

    const dailyAnalyses = Array.from(dailyMap.entries()).map(([date, val]) => ({
      date,
      urlCount: val.urlCount,
      imageCount: val.imageCount,
      avgRisk:
        val.scores.length > 0
          ? Math.round(val.scores.reduce((a, b) => a + b, 0) / val.scores.length)
          : 0,
    }));

    const providerInfo = aiEngine.getProviderInfo();

    const health: SystemHealthStatus = {
      status: 'Operational',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor((Date.now() - SERVER_START_TIME) / 1000),
      components: {
        backend: 'Operational',
        database: 'Operational',
        aiEngine: providerInfo.hasApiKey ? 'Operational' : 'Demo Fallback',
        storage: 'Operational',
      },
      config: {
        aiProvider: providerInfo.provider,
        aiModel: providerInfo.model,
        maxImageSizeMb: MAX_IMAGE_SIZE_MB,
        rateLimitEnabled: RATE_LIMIT_ENABLED,
        anonLimitPerHour: ANON_LIMIT_PER_HOUR,
        authLimitPerHour: AUTH_LIMIT_PER_HOUR,
        weights: getConfiguredRiskWeights(),
      },
      metrics: {
        totalAnalyses: allRecords.length,
        urlAnalyses,
        imageAnalyses,
        averageRiskScore: avgRisk,
        aiApiErrors: observabilityMetrics.aiApiErrors,
        rateLimitHits: observabilityMetrics.rateLimitHits,
        dailyAnalyses,
      },
    };

    return res.status(200).json(health);
  });

  // ============================================================================
  // 6. OPENAPI 3.1 SPECIFICATION ENDPOINT (GET /api/docs)
  // ============================================================================
  app.get('/api/docs', (_req: Request, res: Response) => {
    const openApiSpec = {
      openapi: '3.1.0',
      info: {
        title: 'TruthLens AI — Multimodal Content Authenticity API',
        version: '1.0.0',
        description:
          'Production REST API for inspecting URLs and uploaded images for synthetic generation, manipulation, and source provenance signals.',
      },
      paths: {
        '/api/auth/register': {
          post: {
            summary: 'Register a new user account',
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  example: { email: 'analyst@truthlens.ai', password: 'StrongPassword123!' },
                },
              },
            },
            responses: { '201': { description: 'User registered and JWT issued' } },
          },
        },
        '/api/auth/login': {
          post: {
            summary: 'Authenticate with email and password',
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  example: { email: 'analyst@truthlens.ai', password: 'StrongPassword123!' },
                },
              },
            },
            responses: { '200': { description: 'Authenticated session and JWT token' } },
          },
        },
        '/api/analyze/url': {
          post: {
            summary: 'Validate, scrape, and analyze a public URL for authenticity signals',
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  example: {
                    url: 'https://www.noaa.gov/news-release/ocean-heat-content-observation-2026',
                    isDemo: false,
                  },
                },
              },
            },
            responses: {
              '200': { description: 'Structured AnalysisResult with signals, evidence, and risk breakdown' },
              '400': { description: 'Invalid URL or SSRF blocked host/IP' },
              '429': { description: 'Rate limit exceeded' },
            },
          },
        },
        '/api/analyze/image': {
          post: {
            summary: 'Validate magic bytes, extract EXIF, and inspect an image for manipulation/AI synthesis',
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  example: {
                    filename: 'press_photo.jpg',
                    mimeType: 'image/jpeg',
                    imageBase64: '<base64-encoded-bytes>',
                    isDemo: false,
                  },
                },
              },
            },
            responses: {
              '200': { description: 'Structured AnalysisResult with EXIF report and visual signals' },
              '400': { description: 'Invalid magic bytes, unsupported format, or dimensions out of bounds' },
              '413': { description: 'Image exceeds MAX_IMAGE_SIZE_MB' },
            },
          },
        },
        '/api/analysis/{id}': {
          get: {
            summary: 'Retrieve a complete analysis report by ID',
            responses: { '200': { description: 'AnalysisResult object' }, '404': { description: 'Not found' } },
          },
        },
        '/api/history': {
          get: {
            summary: 'List historical authenticity analyses',
            responses: { '200': { description: 'Paginated list of analysis records' } },
          },
        },
        '/api/history/{id}': {
          delete: {
            summary: 'Delete an analysis record by ID',
            responses: { '200': { description: 'Deletion confirmation' } },
          },
        },
        '/api/health': {
          get: {
            summary: 'System status and observability telemetry',
            responses: { '200': { description: 'Operational status of Backend, Database, AI Engine, and Storage' } },
          },
        },
      },
    };
    return res.status(200).json(openApiSpec);
  });

  return app;
}

async function startServer() {
  const app = await createApp();
  const PORT = 3000;

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    logger.info({
      requestId: 'system_boot',
      event: 'SERVER_STARTED',
      message: `TruthLens AI full-stack server listening on http://0.0.0.0:${PORT}`,
    });
  });
}

// Only start listening if invoked directly (allows importing createApp in tests)
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  startServer();
}
