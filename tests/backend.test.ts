import assert from 'node:assert/strict';
import { validateAndNormalizeAIResponse } from '../src/server/aiEngine.ts';
import {
  determineClassification,
  determineRiskTier,
  RiskScoringEngine,
} from '../src/server/riskScoringEngine.ts';
import {
  detectImageMagicBytes,
  isPrivateOrReservedIp,
  SecurityValidationError,
  validateAndExtractImageMetadata,
  validateUrlForScraping,
} from '../src/server/security.ts';
import { createApp } from '../server.ts';

async function runTests() {
  let passed = 0;
  const test = async (name: string, fn: () => Promise<void> | void) => {
    try {
      await fn();
      passed++;
      console.log(`✓ PASS: ${name}`);
    } catch (err) {
      console.error(`✗ FAIL: ${name}`);
      console.error(err);
      process.exit(1);
    }
  };

  console.log('Running TruthLens AI Automated Test Suite...\n');

  // 1. SSRF Private IP & Hostname Prevention Tests
  await test('SSRF: Blocks loopback, RFC1918 private IPs, and cloud metadata IPs', () => {
    assert.equal(isPrivateOrReservedIp('127.0.0.1'), true);
    assert.equal(isPrivateOrReservedIp('0.0.0.0'), true);
    assert.equal(isPrivateOrReservedIp('10.0.0.1'), true);
    assert.equal(isPrivateOrReservedIp('172.16.5.4'), true);
    assert.equal(isPrivateOrReservedIp('192.168.1.100'), true);
    assert.equal(isPrivateOrReservedIp('169.254.169.254'), true);
    assert.equal(isPrivateOrReservedIp('::1'), true);
    assert.equal(isPrivateOrReservedIp('::ffff:127.0.0.1'), true);
    assert.equal(isPrivateOrReservedIp('8.8.8.8'), false);
    assert.equal(isPrivateOrReservedIp('93.184.216.34'), false);
  });

  await test('URL Validator: Rejects localhost, internal domains, private IPs, and non-HTTP schemes', async () => {
    const blockedUrls = [
      'http://localhost:8080/admin',
      'http://127.0.0.1/secret',
      'http://0.0.0.0/',
      'http://169.254.169.254/latest/meta-data/',
      'http://metadata.google.internal/computeMetadata/v1/',
      'http://192.168.1.1/router',
      'http://10.10.1.5/internal',
      'ftp://example.com/file.txt',
      'file:///etc/passwd',
      'javascript:alert(1)',
      'https://user:pass@example.com/private',
    ];

    for (const badUrl of blockedUrls) {
      let threw = false;
      try {
        await validateUrlForScraping(badUrl, { skipDnsLookup: true });
      } catch (err) {
        threw = err instanceof SecurityValidationError;
      }
      assert.equal(threw, true, `Expected SSRF validator to block: ${badUrl}`);
    }

    const validParsed = await validateUrlForScraping('https://example.com/news/article', {
      skipDnsLookup: true,
    });
    assert.equal(validParsed.hostname, 'example.com');
  });

  // 2. Image Magic Bytes & Dimension Validation Tests
  await test('Image Security: Validates true PNG/JPEG magic bytes and rejects spoofed extensions', async () => {
    // Minimal valid 32x32 PNG header buffer
    const pngBuffer = Buffer.alloc(64);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(pngBuffer, 0);
    pngBuffer.writeUInt32BE(13, 8);
    pngBuffer.write('IHDR', 12, 'ascii');
    pngBuffer.writeUInt32BE(64, 16); // width = 64
    pngBuffer.writeUInt32BE(48, 20); // height = 48
    pngBuffer.writeUInt8(8, 24); // bit depth = 8
    pngBuffer.writeUInt8(6, 25); // color type = RGBA

    const magic = detectImageMagicBytes(pngBuffer);
    assert.equal(magic.valid, true);
    assert.equal(magic.detectedMime, 'image/png');

    const meta = await validateAndExtractImageMetadata(
      pngBuffer,
      'sample_test.png',
      'image/png',
      10
    );
    assert.equal(meta.width, 64);
    assert.equal(meta.height, 48);
    assert.equal(meta.aspectRatio, '4:3');

    // Spoofed file (.jpg extension but text content)
    const spoofedBuffer = Buffer.from('<?php echo "malicious payload"; ?>', 'utf-8');
    await assert.rejects(
      async () => {
        await validateAndExtractImageMetadata(spoofedBuffer, 'exploit.jpg', 'image/jpeg', 10);
      },
      (err: unknown) =>
        err instanceof SecurityValidationError && err.code === 'INVALID_MAGIC_BYTES'
    );
  });

  // 3. Risk Scoring Engine Tests
  await test('Risk Scoring Engine: Computes explainable weighted scores and tiers accurately', () => {
    const engine = new RiskScoringEngine({
      source: 0.2,
      content: 0.2,
      metadata: 0.15,
      image: 0.3,
      ai: 0.15,
    });

    assert.equal(determineRiskTier(20), 'Low Risk');
    assert.equal(determineRiskTier(45), 'Moderate Risk');
    assert.equal(determineRiskTier(74), 'High Risk');
    assert.equal(determineRiskTier(88), 'Very High Risk');

    assert.equal(determineClassification(18), 'LIKELY_AUTHENTIC');
    assert.equal(determineClassification(52), 'SUSPICIOUS');
    assert.equal(determineClassification(78), 'LIKELY_MANIPULATED_OR_AI_GENERATED');

    const scoreOut = engine.calculateUrlRisk(
      {
        url: 'https://example.org/story',
        canonicalUrl: 'https://example.org/story',
        domain: 'example.org',
        subdomain: 'none',
        tld: 'org',
        isHttps: true,
        title: 'Test Article',
        description: 'Desc',
        author: 'Unknown',
        publishedDate: 'Unavailable',
        modifiedDate: 'Unavailable',
        mainTextPreview: 'Sample text content',
        wordCount: 400,
        imageCount: 2,
        externalLinksCount: 1,
        openGraph: {},
        twitterCard: {},
        schemaOrgTypes: [],
        contentSignals: ['Missing author'],
        textSnippets: ['Sample text content'],
      },
      [
        {
          category: 'source',
          severity: 'medium',
          description: 'Author missing',
          evidence: 'No author tag',
          confidence: 0.85,
        },
      ],
      62
    );

    assert.equal(scoreOut.riskScore >= 30 && scoreOut.riskScore <= 80, true);
    assert.equal(typeof scoreOut.breakdown.source, 'number');
  });

  // 4. AI Response Schema Validation Tests
  await test('AI Schema Validator: Accepts valid JSON and rejects malformed AI responses', () => {
    assert.throws(() => validateAndNormalizeAIResponse('not-a-json-string'));
    assert.throws(() =>
      validateAndNormalizeAIResponse(
        JSON.stringify({ classification: 'SUSPICIOUS', confidence: 5.0 })
      )
    );

    const validJson = JSON.stringify({
      classification: 'SUSPICIOUS',
      confidence: 0.82,
      risk_score: 74,
      summary: 'The content contains several signals that warrant verification.',
      signals: [
        {
          category: 'source',
          severity: 'medium',
          description: 'The source information could not be independently established.',
          evidence: 'No author or publication timestamp present.',
          confidence: 0.85,
        },
      ],
      explanation: {
        whatDetected: 'Missing author and timestamp.',
        whyItMatters: 'Reduces provenance accountability.',
        confidenceReasoning: '82% based on metadata absence.',
        whatToVerify: 'Verify original publisher.',
      },
      recommendations: ['Verify the claim using independent sources.'],
    });

    const parsed = validateAndNormalizeAIResponse(validJson);
    assert.equal(parsed.classification, 'SUSPICIOUS');
    assert.equal(parsed.confidence, 0.82);
    assert.equal(parsed.risk_score, 74);
    assert.equal(parsed.signals.length, 1);
  });

  // 5. Full API Endpoints Integration Test
  await test('API Endpoints: Auth, URL Demo & SSRF guard, Image Demo, History, Health, and Docs', async () => {
    const app = await createApp();
    const server = app.listen(0);
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 3099;
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
      // Health Check
      const healthRes = await fetch(`${baseUrl}/api/health`);
      assert.equal(healthRes.status, 200);
      const healthData = await healthRes.json();
      assert.equal(healthData.status, 'Operational');
      assert.equal(healthData.components.backend, 'Operational');

      // Auth Register & Login
      const regRes = await fetch(`${baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'test_analyst@truthlens.ai',
          password: 'SecurePassword123!',
        }),
      });
      assert.equal(regRes.status, 201);
      const regData = await regRes.json();
      assert.equal(Boolean(regData.token), true);

      const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'test_analyst@truthlens.ai',
          password: 'SecurePassword123!',
        }),
      });
      assert.equal(loginRes.status, 200);

      // SSRF blocked via API
      const ssrfRes = await fetch(`${baseUrl}/api/analyze/url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: 'http://127.0.0.1:8000/internal', isDemo: false }),
      });
      assert.equal(ssrfRes.status, 400);

      // URL Demo Analysis via API
      const urlDemoRes = await fetch(`${baseUrl}/api/analyze/url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: 'https://global-truth-wire-daily.net/breaking/2026-secret-grid-shutdown-exposed',
          isDemo: true,
          demoPreset: 'suspicious-claim',
        }),
      });
      assert.equal(urlDemoRes.status, 200);
      const urlDemoData = await urlDemoRes.json();
      assert.equal(urlDemoData.isDemo, true);
      assert.equal(urlDemoData.classification, 'SUSPICIOUS');

      // Image Demo Analysis via API
      const imgDemoRes = await fetch(`${baseUrl}/api/analyze/image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: 'climate_summit_podium_press.jpg',
          mimeType: 'image/jpeg',
          isDemo: true,
          demoPresetKey: 'synthetic-summit',
        }),
      });
      assert.equal(imgDemoRes.status, 200);
      const imgDemoData = await imgDemoRes.json();
      assert.equal(imgDemoData.classification, 'LIKELY_MANIPULATED_OR_AI_GENERATED');

      // Fetch Single Analysis Report
      const singleRes = await fetch(`${baseUrl}/api/analysis/${urlDemoData.id}`);
      assert.equal(singleRes.status, 200);

      // Fetch History
      const histRes = await fetch(`${baseUrl}/api/history`);
      assert.equal(histRes.status, 200);
      const histData = await histRes.json();
      assert.equal(histData.total >= 2, true);

      // Delete Record
      const delRes = await fetch(`${baseUrl}/api/history/${urlDemoData.id}`, {
        method: 'DELETE',
      });
      assert.equal(delRes.status, 200);

      // OpenAPI Docs
      const docsRes = await fetch(`${baseUrl}/api/docs`);
      assert.equal(docsRes.status, 200);
      const docsData = await docsRes.json();
      assert.equal(docsData.openapi, '3.1.0');
    } finally {
      server.close();
    }
  });

  console.log(`\nAll ${passed} test suites passed successfully!`);
}

runTests();
