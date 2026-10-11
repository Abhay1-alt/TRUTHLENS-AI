import { AnalysisResult } from '../types/analysis.ts';

/**
 * Modular Storage Adapter Interface.
 * Designed so the storage layer can seamlessly transition from local/memory storage
 * to AWS S3, Cloudinary, or Supabase Storage in production deployments.
 */
export interface StorageAdapter {
  readonly providerName: 'local' | 's3' | 'cloudinary' | 'supabase';
  saveAnalysisRecord(record: AnalysisResult): Promise<void>;
  getAnalysisRecord(id: string): Promise<AnalysisResult | null>;
  listAnalysisRecords(userId?: string): Promise<AnalysisResult[]>;
  deleteAnalysisRecord(id: string): Promise<boolean>;
}

export class LocalMemoryStorageAdapter implements StorageAdapter {
  public readonly providerName = 'local' as const;
  private records = new Map<string, AnalysisResult>();

  constructor() {
    this.seedInitialRecords();
  }

  private seedInitialRecords() {
    const now = Date.now();
    const sample1: AnalysisResult = {
      id: 'tl_sample_summit_01',
      userId: 'system_demo',
      analysisType: 'image',
      inputReference: 'summit_press_photo_composite.jpg',
      classification: 'LIKELY_MANIPULATED_OR_AI_GENERATED',
      confidence: 0.86,
      riskScore: 81,
      riskTier: 'Very High Risk',
      summary:
        '[DEMO RESULT] Visual inspection identified garbled background typography on the conference backdrop ("INTETTIONAL CLIMT") and stripped camera EXIF metadata, which strongly correlate with diffusion-based synthetic image generation.',
      isDemo: true,
      breakdown: {
        source: 68,
        content: 54,
        metadata: 78,
        visual: 88,
        aiAssessment: 84,
        weights: { source: 0.2, content: 0.2, metadata: 0.15, image: 0.3, ai: 0.15 },
      },
      signals: [
        {
          id: 'sig_s1',
          category: 'visual',
          severity: 'high',
          description: 'Malformed glyph rendering on conference stage backdrop banner.',
          evidence: 'Backdrop lettering displays misspelled/merged characters ("INTETTIONAL CLIMT") typical of diffusion text synthesis.',
          confidence: 0.91,
        },
        {
          id: 'sig_s2',
          category: 'visual',
          severity: 'medium',
          description: 'Asymmetrical facial micro-features among secondary crowd attendees.',
          evidence: 'Peripheral seated figures in rows 2-3 show blurred ear geometry and inconsistent eyeglass frames.',
          confidence: 0.79,
        },
        {
          id: 'sig_s3',
          category: 'metadata',
          severity: 'medium',
          description: 'Complete absence of camera EXIF, lens profile, and capture timestamp.',
          evidence: 'JPEG container lacks IFD0/Exif sub-IFD tags expected from press DSLR/mirrorless bodies.',
          confidence: 0.84,
        },
      ],
      recommendations: [
        'Perform a reverse image search against official wire service archives (AP, Reuters, AFP).',
        'Inspect high-resolution background signage and badges for typographic coherence.',
        'Request the original raw file or C2PA Content Credentials from the publisher.',
      ],
      explanation: {
        whatDetected:
          'We detected synthetic text rendering artifacts on the stage signage, subtle crowd facial distortions, and stripped camera EXIF metadata.',
        whyItMatters:
          'Generative image models frequently struggle with small background typography and strip or omit physical camera sensor metadata.',
        confidenceReasoning:
          'Confidence is 86% because malformed lettering combined with missing EXIF is a strong composite indicator, though heavy post-processing or upscaling can occasionally introduce similar artifacts.',
        whatToVerify:
          'Verify whether the depicted summit session took place on the claimed date and compare with official accredited press photography.',
      },
      imageMetadata: {
        filename: 'summit_press_photo_composite.jpg',
        mimeType: 'image/jpeg',
        extension: 'JPEG',
        fileSizeBytes: 842150,
        fileSizeFormatted: '822.4 KB',
        width: 1408,
        height: 1056,
        aspectRatio: '4:3',
        colorMode: 'YCbCr / RGB (8-bit)',
        compressionInfo: 'JPEG Baseline DCT',
        magicBytesValid: true,
        sha256Hash: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
        exif: {
          hasExif: false,
          cameraMakeModel: null,
          timestamp: null,
          software: null,
          colorSpace: 'sRGB',
          hasGps: false,
          gpsRedactedNote: null,
          gpsCoordinates: null,
        },
      },
      imageAssessment: {
        aiGeneratedProbability: 0.84,
        manipulationProbability: 0.42,
        editingIndicators: ['Stripped EXIF container', 'Uniform noise floor across depth planes'],
        visualAnomalies: [
          'Garbled background banner typography',
          'Crowd facial asymmetry in peripheral seating',
        ],
      },
      executionTimeMs: 420,
      aiModelUsed: 'demo-preset-engine',
      pipelineSteps: [
        { step: 'Input validated', status: 'completed', detail: 'JPEG magic bytes & dimensions verified', durationMs: 12 },
        { step: 'Metadata analyzed', status: 'completed', detail: 'EXIF and container headers inspected', durationMs: 28 },
        { step: 'AI authenticity analysis', status: 'completed', detail: 'Visual & contextual signals evaluated', durationMs: 340 },
        { step: 'Risk assessment', status: 'completed', detail: 'Weighted risk score computed (81/100)', durationMs: 18 },
        { step: 'Generating explanation', status: 'completed', detail: 'Structured report compiled', durationMs: 22 },
      ],
      createdAt: new Date(now - 3600 * 1000 * 14).toISOString(),
      status: 'completed',
    };

    const sample2: AnalysisResult = {
      id: 'tl_sample_noaa_02',
      userId: 'system_demo',
      analysisType: 'url',
      inputReference: 'https://www.noaa.gov/news-release/ocean-heat-content-observation-2026',
      classification: 'LIKELY_AUTHENTIC',
      confidence: 0.91,
      riskScore: 16,
      riskTier: 'Low Risk',
      summary:
        '[DEMO RESULT] The analyzed webpage exhibits strong institutional provenance, complete structured metadata, measured scientific language with explicit uncertainty intervals, and verifiable cross-references.',
      isDemo: true,
      breakdown: {
        source: 14,
        content: 16,
        metadata: 15,
        visual: 18,
        aiAssessment: 16,
        weights: { source: 0.2, content: 0.2, metadata: 0.15, image: 0.3, ai: 0.15 },
      },
      signals: [
        {
          id: 'sig_n1',
          category: 'source',
          severity: 'low',
          description: 'HTTPS connection with established institutional .gov domain provenance.',
          evidence: 'Domain resolved to noaa.gov over TLS with matching canonical URL.',
          confidence: 0.96,
        },
        {
          id: 'sig_n2',
          category: 'metadata',
          severity: 'low',
          description: 'Complete structured publication metadata and Schema.org NewsArticle markup.',
          evidence: 'Both article:published_time (2026-09-18) and organizational author attribution are present.',
          confidence: 0.92,
        },
      ],
      recommendations: [
        'Confirm the primary dataset accession ID in the World Ocean Database.',
        'Compare reported figures against peer-reviewed hydrological bulletins.',
      ],
      explanation: {
        whatDetected:
          'Institutional domain security (HTTPS .gov), complete OpenGraph and Schema.org metadata, explicit institutional authorship, and quantitative claims backed by named datasets.',
        whyItMatters:
          'Authentic scientific and public-interest reporting typically provides traceable authorship, timestamps, and specific methodological references.',
        confidenceReasoning:
          'Confidence is 91% due to consistent alignment across domain provenance, metadata integrity, and measured prose.',
        whatToVerify:
          'Cross-check the cited World Ocean Database accession number on the official NCEI archive.',
      },
      executionTimeMs: 310,
      aiModelUsed: 'demo-preset-engine',
      pipelineSteps: [
        { step: 'Input validated', status: 'completed', detail: 'URL syntax & SSRF guard passed', durationMs: 15 },
        { step: 'Content extracted', status: 'completed', detail: '1,420 words & 4 images parsed', durationMs: 95 },
        { step: 'Metadata analyzed', status: 'completed', detail: 'OpenGraph & Schema.org verified', durationMs: 20 },
        { step: 'AI authenticity analysis', status: 'completed', detail: 'Editorial & provenance signals inspected', durationMs: 150 },
        { step: 'Risk assessment', status: 'completed', detail: 'Weighted risk score computed (16/100)', durationMs: 15 },
        { step: 'Generating explanation', status: 'completed', detail: 'Structured report compiled', durationMs: 15 },
      ],
      createdAt: new Date(now - 3600 * 1000 * 32).toISOString(),
      status: 'completed',
    };

    this.records.set(sample1.id, sample1);
    this.records.set(sample2.id, sample2);
  }

  public async saveAnalysisRecord(record: AnalysisResult): Promise<void> {
    this.records.set(record.id, record);
  }

  public async getAnalysisRecord(id: string): Promise<AnalysisResult | null> {
    return this.records.get(id) || null;
  }

  public async listAnalysisRecords(userId?: string): Promise<AnalysisResult[]> {
    const all = Array.from(this.records.values());
    const filtered = userId
      ? all.filter((r) => r.userId === userId || r.userId === 'system_demo' || !r.userId)
      : all;
    return filtered.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  public async deleteAnalysisRecord(id: string): Promise<boolean> {
    return this.records.delete(id);
  }
}

export const storageService: StorageAdapter = new LocalMemoryStorageAdapter();
