import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import {
  Classification,
  ImageTechnicalMetadata,
  ImageVisualAssessment,
  Signal,
  SignalCategory,
  SignalSeverity,
  StructuredExplanation,
  UrlExtractedData,
} from '../types/analysis.ts';

export interface RawAIAnalysisOutput {
  classification: Classification;
  confidence: number;
  risk_score: number;
  summary: string;
  signals: Signal[];
  image_assessment?: ImageVisualAssessment;
  explanation: StructuredExplanation;
  recommendations: string[];
}

const SYSTEM_INSTRUCTION = `You are an AI content authenticity analysis engine for TruthLens AI.

Your task is to analyze URLs, webpages, and images for signals associated with potentially manipulated, AI-generated, misleading, or suspicious content.

You must NOT claim 100% certainty unless the evidence is conclusive.
Distinguish strictly between:
1. Observed evidence (concrete technical metadata, text patterns, or visual artifacts present in the input)
2. AI inference (probabilistic interpretation of those signals)
3. Uncertainty (what cannot be determined from the available data alone)

Never invent metadata, sources, evidence, or facts.
Do NOT automatically classify a website as fake merely because its domain is unfamiliar.
If evidence is insufficient for a specific check, explicitly state "Insufficient evidence."

Return structured JSON only matching the provided responseSchema.
Possible classification values:
- LIKELY_AUTHENTIC
- SUSPICIOUS
- LIKELY_MANIPULATED_OR_AI_GENERATED

The classification is a probabilistic assessment, not definitive forensic proof.`;

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    classification: {
      type: Type.STRING,
      description:
        'Must be one of: LIKELY_AUTHENTIC, SUSPICIOUS, LIKELY_MANIPULATED_OR_AI_GENERATED',
    },
    confidence: {
      type: Type.NUMBER,
      description: 'Probabilistic confidence in the assessment between 0.0 and 0.98 (never 1.0).',
    },
    risk_score: {
      type: Type.INTEGER,
      description: 'Estimated risk score between 0 and 100.',
    },
    summary: {
      type: Type.STRING,
      description:
        'Balanced 2-3 sentence assessment summary distinguishing observed evidence from probabilistic inference.',
    },
    signals: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          category: {
            type: Type.STRING,
            description: 'One of: source, content, metadata, visual, ai',
          },
          severity: {
            type: Type.STRING,
            description: 'One of: low, medium, high',
          },
          description: {
            type: Type.STRING,
            description: 'Concise explanation of the detected signal.',
          },
          evidence: {
            type: Type.STRING,
            description: 'Specific observed evidence from the input backing this signal.',
          },
          confidence: {
            type: Type.NUMBER,
            description: 'Confidence in this specific signal between 0.0 and 1.0.',
          },
        },
        required: ['category', 'severity', 'description', 'evidence', 'confidence'],
      },
    },
    image_assessment: {
      type: Type.OBJECT,
      properties: {
        aiGeneratedProbability: {
          type: Type.NUMBER,
          description: 'Estimated probability (0.0 to 1.0) of synthetic/AI generation.',
        },
        manipulationProbability: {
          type: Type.NUMBER,
          description: 'Estimated probability (0.0 to 1.0) of digital editing or compositing.',
        },
        editingIndicators: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
        },
        visualAnomalies: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
        },
      },
      required: [
        'aiGeneratedProbability',
        'manipulationProbability',
        'editingIndicators',
        'visualAnomalies',
      ],
    },
    explanation: {
      type: Type.OBJECT,
      properties: {
        whatDetected: {
          type: Type.STRING,
          description: 'Clear explanation of WHAT signals were detected.',
        },
        whyItMatters: {
          type: Type.STRING,
          description: 'Clear explanation of WHY these signals matter for authenticity.',
        },
        confidenceReasoning: {
          type: Type.STRING,
          description: 'HOW confident the system is and what uncertainty remains.',
        },
        whatToVerify: {
          type: Type.STRING,
          description: 'WHAT specific facts or sources the user should independently verify.',
        },
      },
      required: ['whatDetected', 'whyItMatters', 'confidenceReasoning', 'whatToVerify'],
    },
    recommendations: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: '3 to 5 concrete verification actions for the user.',
    },
  },
  required: [
    'classification',
    'confidence',
    'risk_score',
    'summary',
    'signals',
    'explanation',
    'recommendations',
  ],
};

const VALID_CLASSIFICATIONS = new Set<Classification>([
  'LIKELY_AUTHENTIC',
  'SUSPICIOUS',
  'LIKELY_MANIPULATED_OR_AI_GENERATED',
]);
const VALID_CATEGORIES = new Set<SignalCategory>(['source', 'content', 'metadata', 'visual', 'ai']);
const VALID_SEVERITIES = new Set<SignalSeverity>(['low', 'medium', 'high']);

/**
 * Validates and normalizes the raw JSON response from the AI model.
 * Throws an error if required fields are missing or malformed so the caller can retry.
 */
export function validateAndNormalizeAIResponse(rawText: string): RawAIAnalysisOutput {
  if (!rawText || typeof rawText !== 'string') {
    throw new Error('Empty response from AI engine.');
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(rawText.trim());
  } catch {
    throw new Error('AI response is not valid JSON.');
  }

  const rawClass = String(parsed.classification || '')
    .toUpperCase()
    .trim() as Classification;
  const classification: Classification = VALID_CLASSIFICATIONS.has(rawClass)
    ? rawClass
    : 'SUSPICIOUS';

  const confidenceNum = Number(parsed.confidence);
  if (Number.isNaN(confidenceNum) || confidenceNum < 0 || confidenceNum > 1) {
    throw new Error('Invalid confidence value in AI response.');
  }
  const confidence = Number(Math.min(0.98, Math.max(0.1, confidenceNum)).toFixed(2));

  const riskScoreNum = Number(parsed.risk_score);
  if (Number.isNaN(riskScoreNum) || riskScoreNum < 0 || riskScoreNum > 100) {
    throw new Error('Invalid risk_score in AI response.');
  }
  const risk_score = Math.round(riskScoreNum);

  const summary = String(parsed.summary || '').trim();
  if (summary.length < 10) {
    throw new Error('Summary missing or too short in AI response.');
  }

  if (!Array.isArray(parsed.signals) || parsed.signals.length === 0) {
    throw new Error('AI response must include at least one structured signal.');
  }

  const signals: Signal[] = parsed.signals.slice(0, 12).map((item: unknown, idx: number) => {
    const s = (item || {}) as Record<string, unknown>;
    const rawCat = String(s.category || 'content').toLowerCase() as SignalCategory;
    const rawSev = String(s.severity || 'medium').toLowerCase() as SignalSeverity;
    const sigConf = Number(s.confidence);
    return {
      id: `sig_${idx + 1}`,
      category: VALID_CATEGORIES.has(rawCat) ? rawCat : 'content',
      severity: VALID_SEVERITIES.has(rawSev) ? rawSev : 'medium',
      description: String(s.description || 'Signal detected during inspection.').slice(0, 800),
      evidence: String(s.evidence || 'Observed in submitted content.').slice(0, 800),
      confidence: Number.isNaN(sigConf)
        ? 0.75
        : Number(Math.min(0.99, Math.max(0.1, sigConf)).toFixed(2)),
    };
  });

  const rawExp = (parsed.explanation || {}) as Record<string, unknown>;
  const explanation: StructuredExplanation = {
    whatDetected: String(rawExp.whatDetected || summary).slice(0, 1800),
    whyItMatters: String(
      rawExp.whyItMatters ||
        'These indicators help evaluate whether the content has undergone synthetic generation, editorial manipulation, or lacks verifiable provenance.'
    ).slice(0, 1800),
    confidenceReasoning: String(
      rawExp.confidenceReasoning ||
        `Confidence is rated at ${Math.round(confidence * 100)}% based on available technical and contextual signals. Automated detection is probabilistic.`
    ).slice(0, 1800),
    whatToVerify: String(
      rawExp.whatToVerify ||
        'Independently verify key claims, original publication timestamps, and primary source attribution.'
    ).slice(0, 1800),
  };

  const recommendations = Array.isArray(parsed.recommendations)
    ? parsed.recommendations
        .map((r) => String(r).slice(0, 400))
        .filter(Boolean)
        .slice(0, 6)
    : [
        'Verify the claim using independent primary sources.',
        'Check the original publication date and author attribution.',
      ];

  let image_assessment: ImageVisualAssessment | undefined;
  if (parsed.image_assessment && typeof parsed.image_assessment === 'object') {
    const ia = parsed.image_assessment as Record<string, unknown>;
    image_assessment = {
      aiGeneratedProbability: Number(
        Math.min(0.99, Math.max(0, Number(ia.aiGeneratedProbability) || 0)).toFixed(2)
      ),
      manipulationProbability: Number(
        Math.min(0.99, Math.max(0, Number(ia.manipulationProbability) || 0)).toFixed(2)
      ),
      editingIndicators: Array.isArray(ia.editingIndicators)
        ? ia.editingIndicators.map((x) => String(x).slice(0, 250)).slice(0, 6)
        : [],
      visualAnomalies: Array.isArray(ia.visualAnomalies)
        ? ia.visualAnomalies.map((x) => String(x).slice(0, 250)).slice(0, 6)
        : [],
    };
  }

  return {
    classification,
    confidence,
    risk_score,
    summary,
    signals,
    image_assessment,
    explanation,
    recommendations,
  };
}

/**
 * Centralized AIAnalysisEngine abstraction powered by the platform's Google Gemini API key
 * (process.env.GEMINI_API_KEY).
 */
export class AIAnalysisEngine {
  private readonly modelName: string;
  private readonly providerName: string;

  constructor() {
    this.providerName = process.env.AI_PROVIDER || 'google-gemini';
    this.modelName = process.env.AI_MODEL || 'gemini-3.8-flash';
  }

  public getProviderInfo(): { provider: string; model: string; hasApiKey: boolean } {
    const apiKey = process.env.GEMINI_API_KEY || process.env.AI_API_KEY || '';
    const hasApiKey = Boolean(apiKey && apiKey !== 'MY_GEMINI_API_KEY');
    return {
      provider: this.providerName,
      model: this.modelName,
      hasApiKey,
    };
  }

  private getClient(): GoogleGenAI {
    const apiKey = process.env.GEMINI_API_KEY || process.env.AI_API_KEY;
    if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
      throw new Error('AI_API_KEY_UNAVAILABLE');
    }
    return new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }

  /**
   * Analyzes extracted webpage content and metadata via the centralized Gemini AI engine.
   * Uses ThinkingLevel.LOW for fast, responsive structured JSON generation with automatic retry.
   */
  public async analyzeUrl(urlData: UrlExtractedData): Promise<RawAIAnalysisOutput> {
    const ai = this.getClient();

    const prompt = `Perform a comprehensive multimodal content authenticity and credibility assessment on the following extracted webpage data.

URL: ${urlData.url}
Domain: ${urlData.domain} (Subdomain: ${urlData.subdomain}, TLD: .${urlData.tld}, HTTPS: ${urlData.isHttps})
Canonical URL: ${urlData.canonicalUrl || 'None'}
Title: ${urlData.title}
Description: ${urlData.description || 'None'}
Author Attribution: ${urlData.author}
Published Date: ${urlData.publishedDate}
Modified Date: ${urlData.modifiedDate}
Word Count: ${urlData.wordCount}
Embedded Images Count: ${urlData.imageCount}
External Links Count: ${urlData.externalLinksCount}
Schema.org Types: ${urlData.schemaOrgTypes.join(', ') || 'None'}
OpenGraph Keys Present: ${Object.keys(urlData.openGraph).join(', ') || 'None'}
Pre-screened Content Signals: ${urlData.contentSignals.join(' | ') || 'None'}

Representative Text Snippets:
${urlData.textSnippets.map((s, i) => `[Snippet ${i + 1}]: "${s}"`).join('\n')}

Main Article Content Excerpt:
"""
${urlData.mainTextPreview}
"""

Evaluate source provenance, metadata completeness, rhetorical/editorial patterns (such as sensational language, unsupported claims, date inconsistencies, or AI-generated phrasing patterns), and provide observed evidence for every signal.`;

    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const response = await ai.models.generateContent({
          model: this.modelName,
          contents: prompt,
          config: {
            systemInstruction: SYSTEM_INSTRUCTION,
            responseMimeType: 'application/json',
            responseSchema: RESPONSE_SCHEMA,
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            temperature: 0.2,
          },
        });

        const text = response.text;
        if (!text) {
          throw new Error('Model returned empty text.');
        }
        return validateAndNormalizeAIResponse(text);
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
      }
    }

    throw lastError || new Error('AI URL analysis failed after retries.');
  }

  /**
   * Analyzes an uploaded image (pixels + technical/EXIF metadata) via the centralized Gemini AI engine.
   * Uses ThinkingLevel.LOW for fast multimodal inspection with automatic retry.
   */
  public async analyzeImage(
    imageBuffer: Buffer,
    metadata: ImageTechnicalMetadata
  ): Promise<RawAIAnalysisOutput> {
    const ai = this.getClient();
    const base64Data = imageBuffer.toString('base64');

    const prompt = `Perform a forensic visual and metadata authenticity inspection on the attached image.

Technical & EXIF Metadata Extracted:
- Filename: ${metadata.filename}
- Verified MIME Type (Magic Bytes): ${metadata.mimeType} (${metadata.extension})
- Resolution: ${metadata.width} x ${metadata.height} (${metadata.aspectRatio})
- File Size: ${metadata.fileSizeFormatted}
- Color Mode: ${metadata.colorMode}
- Compression: ${metadata.compressionInfo}
- SHA-256 Digest: ${metadata.sha256Hash}
- EXIF Present: ${metadata.exif.hasExif ? 'Yes' : 'No'}
- Camera Make/Model: ${metadata.exif.cameraMakeModel || 'Not Available'}
- Capture Timestamp: ${metadata.exif.timestamp || 'Not Available'}
- Software / CreatorTool Tag: ${metadata.exif.software || 'Not Available'}
- GPS Metadata Present: ${metadata.exif.hasGps ? 'Yes (Coordinates Redacted)' : 'No'}

Inspect the visual content carefully for signals including:
1. Unnatural skin, fabric, or background textures
2. Inconsistent lighting direction, reflections, or shadow geometry
3. Distorted objects, architectural lines, or inconsistent perspective
4. Malformed or garbled background text, signage, or insignia
5. Anatomical inconsistencies (hands, fingers, eyes, teeth, crowd faces)
6. Repeated cloning patterns, splicing boundaries, or compositing edge artifacts
7. Alignment between visual characteristics and the presence/absence of camera EXIF metadata

Remember: Present findings as probabilistic signals with concrete visual evidence, not absolute proof.`;

    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const response = await ai.models.generateContent({
          model: this.modelName,
          contents: {
            parts: [
              {
                inlineData: {
                  mimeType: metadata.mimeType,
                  data: base64Data,
                },
              },
              {
                text: prompt,
              },
            ],
          },
          config: {
            systemInstruction: SYSTEM_INSTRUCTION,
            responseMimeType: 'application/json',
            responseSchema: RESPONSE_SCHEMA,
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            temperature: 0.2,
          },
        });

        const text = response.text;
        if (!text) {
          throw new Error('Model returned empty text.');
        }
        return validateAndNormalizeAIResponse(text);
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
      }
    }

    throw lastError || new Error('AI Image analysis failed after retries.');
  }

  /**
   * Curated URL specimen data so users can also run live Gemini AI analysis on realistic
   * synthetic/viral specimens or use offline Demo Mode when requested.
   */
  public getUrlSpecimenData(presetKey = 'suspicious-claim'): UrlExtractedData {
    if (presetKey === 'verified-science') {
      return {
        url: 'https://www.noaa.gov/news-release/ocean-heat-content-observation-2026',
        canonicalUrl: 'https://www.noaa.gov/news-release/ocean-heat-content-observation-2026',
        domain: 'noaa.gov',
        subdomain: 'www',
        tld: 'gov',
        isHttps: true,
        title: 'North Atlantic Buoy Network Records Seasonal Thermal Stratification Shift',
        description:
          'Annual telemetry synthesis from 4,200 Argo profiling floats and coastal moorings details upper-ocean heat distribution across the North Atlantic basin.',
        author: 'NOAA National Centers for Environmental Information (NCEI)',
        publishedDate: '2026-09-18T14:00:00Z',
        modifiedDate: '2026-09-19T09:15:00Z',
        mainTextPreview:
          'Data collected across the third quarter of 2026 by the international Argo float array and moored coastal observatories indicate a 0.14°C variance in mixed-layer depth temperatures relative to the 2015–2025 decadal baseline. Researchers cross-validated satellite altimetry against in-situ conductivity-temperature-depth (CTD) sensors deployed along the 45°N transect. Full dataset tables and calibration uncertainty intervals (±0.02°C) are archived in the World Ocean Database.',
        wordCount: 1420,
        imageCount: 4,
        externalLinksCount: 11,
        openGraph: {
          'og:title': 'North Atlantic Buoy Network Records Seasonal Thermal Stratification Shift',
          'og:type': 'article',
          'og:site_name': 'National Oceanic and Atmospheric Administration',
        },
        twitterCard: {
          'twitter:card': 'summary_large_image',
        },
        schemaOrgTypes: ['NewsArticle', 'GovernmentOrganization'],
        contentSignals: [],
        textSnippets: [
          'Data collected across the third quarter of 2026 by the international Argo float array and moored coastal observatories indicate a 0.14°C variance...',
          'Full dataset tables and calibration uncertainty intervals (±0.02°C) are archived in the World Ocean Database.',
        ],
      };
    }

    return {
      url: 'https://global-truth-wire-daily.net/breaking/2026-secret-grid-shutdown-exposed',
      canonicalUrl: null,
      domain: 'global-truth-wire-daily.net',
      subdomain: 'none',
      tld: 'net',
      isHttps: true,
      title: 'SHOCKING: Secret 72-Hour Continental Power Grid Shutdown Exposed by Unnamed Insider!',
      description:
        'What mainstream outlets are hiding about the upcoming mandatory energy blackout scheduled for next month.',
      author: 'Unknown',
      publishedDate: 'Unavailable',
      modifiedDate: 'Unavailable',
      mainTextPreview:
        'An anonymous senior engineer inside the continental energy commission has leaked explosive documents proving a coordinated 72-hour power grid shutdown is secretly scheduled. Mainstream media won’t tell you what is happening behind closed doors! According to unverified screenshots circulating on messaging channels, emergency transformers have already been placed on standby without public oversight. Share this immediately before the article is removed!',
      wordCount: 385,
      imageCount: 1,
      externalLinksCount: 0,
      openGraph: {
        'og:title': 'SHOCKING: Secret 72-Hour Continental Power Grid Shutdown Exposed!',
      },
      twitterCard: {},
      schemaOrgTypes: [],
      contentSignals: [
        'Missing explicit author attribution or byline metadata.',
        'Missing structured publication timestamp (article:published_time / JSON-LD).',
        'Headline contains sensational or emotionally charged phrasing.',
        'Body text includes high-arousal or sensationalist language patterns.',
      ],
      textSnippets: [
        'Headline: "SHOCKING: Secret 72-Hour Continental Power Grid Shutdown Exposed by Unnamed Insider!"',
        'An anonymous senior engineer inside the continental energy commission has leaked explosive documents proving a coordinated 72-hour power grid shutdown...',
        'Mainstream media won’t tell you what is happening behind closed doors! Share this immediately before the article is removed!',
      ],
    };
  }

  /**
   * Clearly labeled Demo Mode presets that work without requiring live external network/API calls.
   */
  public getDemoUrlAnalysis(presetKey = 'suspicious-claim'): {
    urlData: UrlExtractedData;
    aiOutput: RawAIAnalysisOutput;
  } {
    const urlData = this.getUrlSpecimenData(presetKey);

    if (presetKey === 'verified-science') {
      const aiOutput: RawAIAnalysisOutput = {
        classification: 'LIKELY_AUTHENTIC',
        confidence: 0.91,
        risk_score: 16,
        summary:
          '[DEMO RESULT] The analyzed webpage exhibits strong institutional provenance, complete structured metadata, measured scientific language with explicit uncertainty intervals, and verifiable cross-references.',
        signals: [
          {
            id: 'demo_sig_1',
            category: 'source',
            severity: 'low',
            description: 'HTTPS connection with established institutional .gov domain provenance.',
            evidence: 'Domain resolved to noaa.gov over TLS with matching canonical URL.',
            confidence: 0.96,
          },
          {
            id: 'demo_sig_2',
            category: 'metadata',
            severity: 'low',
            description: 'Complete structured publication metadata and Schema.org NewsArticle markup.',
            evidence: 'Both article:published_time (2026-09-18) and organizational author attribution are present.',
            confidence: 0.92,
          },
          {
            id: 'demo_sig_3',
            category: 'content',
            severity: 'low',
            description: 'Measured technical reporting with explicit methodology and error bars.',
            evidence: 'Cites specific sensor arrays (Argo floats, CTD sensors) and ±0.02°C calibration intervals without sensational phrasing.',
            confidence: 0.89,
          },
        ],
        explanation: {
          whatDetected:
            'Institutional domain security (HTTPS .gov), complete OpenGraph and Schema.org metadata, explicit institutional authorship, and quantitative claims backed by named datasets.',
          whyItMatters:
            'Authentic scientific and public-interest reporting typically provides traceable authorship, timestamps, and specific methodological references rather than anonymous emotional appeals.',
          confidenceReasoning:
            'Confidence is 91% due to consistent alignment across domain provenance, metadata integrity, and measured prose. As this is a Demo Result, no live external crawl was performed.',
          whatToVerify:
            'Cross-check the cited World Ocean Database accession number and confirm the release date on the official NCEI archive.',
        },
        recommendations: [
          'Confirm the primary dataset accession ID in the World Ocean Database.',
          'Compare reported figures against peer-reviewed hydrological bulletins.',
          'Verify that the URL matches the official agency domain before citing.',
        ],
      };

      return { urlData, aiOutput };
    }

    const aiOutput: RawAIAnalysisOutput = {
      classification: 'SUSPICIOUS',
      confidence: 0.84,
      risk_score: 76,
      summary:
        '[DEMO RESULT] The webpage contains multiple high-risk editorial and provenance signals, including missing author attribution, absent publication timestamps, zero outbound primary source citations, and urgent sensationalist phrasing.',
      signals: [
        {
          id: 'demo_sig_1',
          category: 'content',
          severity: 'high',
          description: 'Sensationalist headline and urgency-inducing viral sharing commands.',
          evidence: 'Uses all-caps "SHOCKING", "Mainstream media won’t tell you", and "Share this immediately before the article is removed!"',
          confidence: 0.91,
        },
        {
          id: 'demo_sig_2',
          category: 'source',
          severity: 'medium',
          description: 'Extraordinary infrastructure claim relies exclusively on unnamed insider and unverified screenshots.',
          evidence: 'Zero outbound links to regulatory filings, grid operator notices, or named officials.',
          confidence: 0.86,
        },
        {
          id: 'demo_sig_3',
          category: 'metadata',
          severity: 'medium',
          description: 'Missing author byline, publication date, and Schema.org structured metadata.',
          evidence: 'Author field is Unknown; article:published_time and JSON-LD schema are absent.',
          confidence: 0.88,
        },
        {
          id: 'demo_sig_4',
          category: 'source',
          severity: 'low',
          description: 'HTTPS transport encryption is active.',
          evidence: 'Page served over https:// protocol (note: HTTPS only secures transport, not editorial accuracy).',
          confidence: 0.99,
        },
      ],
      explanation: {
        whatDetected:
          'We detected missing authorship and publication dates, absence of outbound links to primary documents, and emotionally manipulative language urging immediate sharing.',
        whyItMatters:
          'Fabricated or misleading viral articles frequently omit publication dates and named authors to evade accountability while using urgency cues ("Share before deleted") to bypass critical verification.',
        confidenceReasoning:
          'Confidence in the Suspicious classification is 84% based on converging linguistic and metadata indicators. However, automated analysis cannot independently verify non-public regulatory events.',
        whatToVerify:
          'Check official system status bulletins from your regional transmission operator (ISO/RTO) and public utility commission filings.',
      },
      recommendations: [
        'Verify the claim against official regional power grid operator (ISO/RTO) public advisories.',
        'Search for independent reporting from established energy and infrastructure journalists.',
        'Treat claims relying solely on "unnamed insiders" and "unverified screenshots" with caution.',
      ],
    };

    return { urlData, aiOutput };
  }
}
