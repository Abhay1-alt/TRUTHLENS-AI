export type Classification =
  | 'LIKELY_AUTHENTIC'
  | 'SUSPICIOUS'
  | 'LIKELY_MANIPULATED_OR_AI_GENERATED';

export type SignalSeverity = 'low' | 'medium' | 'high';

export type SignalCategory = 'source' | 'content' | 'metadata' | 'visual' | 'ai';

export type AnalysisPipelineStage =
  | 'idle'
  | 'validating'
  | 'extracting'
  | 'analyzing'
  | 'processing'
  | 'completed'
  | 'failed';

export interface Signal {
  id?: string;
  category: SignalCategory;
  severity: SignalSeverity;
  description: string;
  evidence: string;
  confidence: number;
}

export interface RiskWeights {
  source: number;
  content: number;
  metadata: number;
  image: number;
  ai: number;
}

export interface RiskBreakdown {
  source: number;
  content: number;
  metadata: number;
  visual: number;
  aiAssessment: number;
  weights: RiskWeights;
}

export interface UrlExtractedData {
  url: string;
  canonicalUrl: string | null;
  domain: string;
  subdomain: string;
  tld: string;
  isHttps: boolean;
  title: string;
  description: string;
  author: string;
  publishedDate: string;
  modifiedDate: string;
  mainTextPreview: string;
  wordCount: number;
  imageCount: number;
  externalLinksCount: number;
  openGraph: Record<string, string>;
  twitterCard: Record<string, string>;
  schemaOrgTypes: string[];
  contentSignals: string[];
  textSnippets: string[];
}

export interface ImageExifSummary {
  hasExif: boolean;
  cameraMakeModel: string | null;
  timestamp: string | null;
  software: string | null;
  colorSpace: string | null;
  hasGps: boolean;
  gpsRedactedNote: string | null;
  gpsCoordinates: { lat: number; lng: number } | null;
}

export interface ImageTechnicalMetadata {
  filename: string;
  mimeType: string;
  extension: string;
  fileSizeBytes: number;
  fileSizeFormatted: string;
  width: number;
  height: number;
  aspectRatio: string;
  colorMode: string;
  compressionInfo: string;
  magicBytesValid: boolean;
  sha256Hash: string;
  exif: ImageExifSummary;
}

export interface ImageVisualAssessment {
  aiGeneratedProbability: number;
  manipulationProbability: number;
  editingIndicators: string[];
  visualAnomalies: string[];
}

export interface StructuredExplanation {
  whatDetected: string;
  whyItMatters: string;
  confidenceReasoning: string;
  whatToVerify: string;
}

export interface PipelineStepRecord {
  step: string;
  status: 'completed' | 'active' | 'pending' | 'skipped';
  detail: string;
  durationMs?: number;
}

export interface AnalysisResult {
  id: string;
  userId?: string;
  analysisType: 'url' | 'image';
  inputReference: string;
  classification: Classification;
  confidence: number;
  riskScore: number;
  riskTier: 'Low Risk' | 'Moderate Risk' | 'High Risk' | 'Very High Risk';
  summary: string;
  isDemo: boolean;
  breakdown: RiskBreakdown;
  signals: Signal[];
  recommendations: string[];
  explanation: StructuredExplanation;
  urlData?: UrlExtractedData;
  imageMetadata?: ImageTechnicalMetadata;
  imageAssessment?: ImageVisualAssessment;
  imagePreviewDataUrl?: string;
  executionTimeMs: number;
  aiModelUsed: string;
  pipelineSteps: PipelineStepRecord[];
  createdAt: string;
  status?: 'completed' | 'archived';
}

export interface SystemHealthStatus {
  status: 'Operational' | 'Degraded';
  timestamp: string;
  uptimeSeconds: number;
  components: {
    backend: 'Operational' | 'Degraded';
    database: 'Operational' | 'Degraded';
    aiEngine: 'Operational' | 'Demo Fallback';
    storage: 'Operational';
  };
  config: {
    aiProvider: string;
    aiModel: string;
    maxImageSizeMb: number;
    rateLimitEnabled: boolean;
    anonLimitPerHour: number;
    authLimitPerHour: number;
    weights: RiskWeights;
  };
  metrics: {
    totalAnalyses: number;
    urlAnalyses: number;
    imageAnalyses: number;
    averageRiskScore: number;
    aiApiErrors: number;
    rateLimitHits: number;
    dailyAnalyses: {
      date: string;
      urlCount: number;
      imageCount: number;
      avgRisk: number;
    }[];
  };
}
