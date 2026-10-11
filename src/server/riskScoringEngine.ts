import {
  Classification,
  ImageTechnicalMetadata,
  ImageVisualAssessment,
  RiskBreakdown,
  RiskWeights,
  Signal,
  UrlExtractedData,
} from '../types/analysis.ts';

export function getConfiguredRiskWeights(): RiskWeights {
  const source = parseFloat(process.env.WEIGHT_SOURCE || '0.20');
  const content = parseFloat(process.env.WEIGHT_CONTENT || '0.20');
  const metadata = parseFloat(process.env.WEIGHT_METADATA || '0.15');
  const image = parseFloat(process.env.WEIGHT_IMAGE || '0.30');
  const ai = parseFloat(process.env.WEIGHT_AI || '0.15');

  const sum = source + content + metadata + image + ai;
  if (sum <= 0 || Number.isNaN(sum)) {
    return { source: 0.2, content: 0.2, metadata: 0.15, image: 0.3, ai: 0.15 };
  }

  return {
    source: Number((source / sum).toFixed(2)),
    content: Number((content / sum).toFixed(2)),
    metadata: Number((metadata / sum).toFixed(2)),
    image: Number((image / sum).toFixed(2)),
    ai: Number((ai / sum).toFixed(2)),
  };
}

export function determineRiskTier(
  score: number
): 'Low Risk' | 'Moderate Risk' | 'High Risk' | 'Very High Risk' {
  if (score <= 30) return 'Low Risk';
  if (score <= 60) return 'Moderate Risk';
  if (score <= 80) return 'High Risk';
  return 'Very High Risk';
}

export function determineClassification(
  riskScore: number,
  aiSuggestion?: Classification
): Classification {
  if (riskScore >= 68) {
    return 'LIKELY_MANIPULATED_OR_AI_GENERATED';
  }
  if (riskScore >= 34) {
    return 'SUSPICIOUS';
  }
  if (aiSuggestion === 'SUSPICIOUS' && riskScore >= 28) {
    return 'SUSPICIOUS';
  }
  return 'LIKELY_AUTHENTIC';
}

function clampScore(val: number): number {
  return Math.max(0, Math.min(100, Math.round(val)));
}

function scoreSignalsForCategory(
  signals: Signal[],
  category: Signal['category'],
  baselineScore: number
): number {
  const relevant = signals.filter((s) => s.category === category);
  if (relevant.length === 0) return clampScore(baselineScore);

  let delta = 0;
  for (const sig of relevant) {
    const weight = sig.severity === 'high' ? 32 : sig.severity === 'medium' ? 18 : 6;
    // Low-severity positive signals (like HTTPS connection verified) do not inflate risk
    const isPositiveIndicator =
      sig.severity === 'low' &&
      /\b(https|verified|consistent|present|authentic|valid|intact)\b/i.test(sig.description);
    if (!isPositiveIndicator) {
      delta += weight * Math.max(0.5, sig.confidence);
    }
  }
  return clampScore(baselineScore + delta);
}

/**
 * Computes transparent, explainable component risk scores and composite risk score.
 */
export class RiskScoringEngine {
  private weights: RiskWeights;

  constructor(weights?: RiskWeights) {
    this.weights = weights || getConfiguredRiskWeights();
  }

  public calculateUrlRisk(
    urlData: UrlExtractedData,
    signals: Signal[],
    aiRawRiskScore: number
  ): {
    riskScore: number;
    riskTier: 'Low Risk' | 'Moderate Risk' | 'High Risk' | 'Very High Risk';
    breakdown: RiskBreakdown;
  } {
    let sourceBase = urlData.isHttps ? 14 : 48;
    if (urlData.author === 'Unknown') sourceBase += 16;

    let metadataBase = 15;
    if (urlData.publishedDate === 'Unavailable') metadataBase += 18;
    if (urlData.schemaOrgTypes.length === 0) metadataBase += 12;
    if (Object.keys(urlData.openGraph).length === 0) metadataBase += 10;

    let contentBase = 16 + urlData.contentSignals.length * 8;
    if (urlData.wordCount < 80) contentBase += 14;

    const sourceScore = scoreSignalsForCategory(signals, 'source', sourceBase);
    const contentScore = scoreSignalsForCategory(signals, 'content', contentBase);
    const metadataScore = scoreSignalsForCategory(signals, 'metadata', metadataBase);
    const visualScore = scoreSignalsForCategory(signals, 'visual', 18);
    const aiScore = clampScore(aiRawRiskScore);

    // For URL analysis without direct pixel inspection, redistribute image weight proportionally
    const effectiveTotalWeight =
      this.weights.source +
      this.weights.content +
      this.weights.metadata +
      this.weights.ai +
      this.weights.image * 0.35;

    const composite =
      (sourceScore * this.weights.source +
        contentScore * this.weights.content +
        metadataScore * this.weights.metadata +
        visualScore * (this.weights.image * 0.35) +
        aiScore * this.weights.ai) /
      effectiveTotalWeight;

    const blendedScore = clampScore(composite * 0.65 + aiScore * 0.35);

    return {
      riskScore: blendedScore,
      riskTier: determineRiskTier(blendedScore),
      breakdown: {
        source: sourceScore,
        content: contentScore,
        metadata: metadataScore,
        visual: visualScore,
        aiAssessment: aiScore,
        weights: this.weights,
      },
    };
  }

  public calculateImageRisk(
    metadata: ImageTechnicalMetadata,
    visualAssessment: ImageVisualAssessment,
    signals: Signal[],
    aiRawRiskScore: number
  ): {
    riskScore: number;
    riskTier: 'Low Risk' | 'Moderate Risk' | 'High Risk' | 'Very High Risk';
    breakdown: RiskBreakdown;
  } {
    let metadataBase = metadata.exif.hasExif ? 14 : 42;
    if (!metadata.exif.cameraMakeModel) metadataBase += 12;
    if (
      metadata.exif.software &&
      /\b(midjourney|stable diffusion|dall-e|firefly|comfyui|photoshop|gimp)\b/i.test(
        metadata.exif.software
      )
    ) {
      metadataBase += 28;
    }

    const visualBase = Math.round(
      Math.max(
        visualAssessment.aiGeneratedProbability * 100,
        visualAssessment.manipulationProbability * 100
      ) * 0.75
    );

    const sourceScore = scoreSignalsForCategory(
      signals,
      'source',
      metadata.exif.cameraMakeModel ? 16 : 38
    );
    const contentScore = scoreSignalsForCategory(signals, 'content', 22);
    const metadataScore = scoreSignalsForCategory(signals, 'metadata', metadataBase);
    const visualScore = scoreSignalsForCategory(signals, 'visual', visualBase);
    const aiScore = clampScore(aiRawRiskScore);

    const weightedComposite =
      sourceScore * this.weights.source +
      contentScore * this.weights.content +
      metadataScore * this.weights.metadata +
      visualScore * this.weights.image +
      aiScore * this.weights.ai;

    const blendedScore = clampScore(weightedComposite * 0.6 + aiScore * 0.4);

    return {
      riskScore: blendedScore,
      riskTier: determineRiskTier(blendedScore),
      breakdown: {
        source: sourceScore,
        content: contentScore,
        metadata: metadataScore,
        visual: visualScore,
        aiAssessment: aiScore,
        weights: this.weights,
      },
    };
  }
}
