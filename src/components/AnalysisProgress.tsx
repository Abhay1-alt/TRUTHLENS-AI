import { Check, Circle, Loader2 } from 'lucide-react';
import { AnalysisPipelineStage } from '../types/analysis.ts';

interface AnalysisProgressProps {
  stage: AnalysisPipelineStage;
  analysisType: 'url' | 'image';
  targetLabel: string;
}

const PIPELINE_STEPS: {
  key: AnalysisPipelineStage;
  label: string;
  urlDetail: string;
  imageDetail: string;
}[] = [
  {
    key: 'validating',
    label: 'Input validated',
    urlDetail: 'Verifying URL syntax, HTTPS transport, and SSRF IP/DNS guards',
    imageDetail: 'Checking file size, MIME header, and raw binary magic bytes',
  },
  {
    key: 'extracting',
    label: 'Content extracted',
    urlDetail: 'Fetching webpage HTML, article prose, and outbound citations',
    imageDetail: 'Decoding pixel dimensions, color space, and compression profile',
  },
  {
    key: 'analyzing',
    label: 'Metadata analyzed',
    urlDetail: 'Inspecting OpenGraph, Twitter Card, and Schema.org JSON-LD',
    imageDetail: 'Parsing EXIF container tags, camera model, and software markers',
  },
  {
    key: 'processing',
    label: 'AI authenticity analysis & risk scoring',
    urlDetail: 'Evaluating rhetorical patterns, source credibility, and risk weights',
    imageDetail: 'Inspecting visual lighting, typography, anatomy, and composite score',
  },
];

const STAGE_ORDER: Record<AnalysisPipelineStage, number> = {
  idle: -1,
  validating: 0,
  extracting: 1,
  analyzing: 2,
  processing: 3,
  completed: 4,
  failed: -1,
};

export function AnalysisProgress({
  stage,
  analysisType,
  targetLabel,
}: AnalysisProgressProps) {
  const currentIdx = STAGE_ORDER[stage] ?? 0;

  return (
    <div
      role="status"
      aria-live="polite"
      className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-5"
    >
      <div className="flex items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div>
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Analyzing Content
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate max-w-xl font-mono">
            {targetLabel}
          </p>
        </div>
        <span className="text-xs font-mono text-sky-600 dark:text-sky-400 tabular-nums whitespace-nowrap shrink-0">
          Stage {Math.min(4, Math.max(1, currentIdx + 1))} of 4
        </span>
      </div>

      <div className="space-y-3">
        {PIPELINE_STEPS.map((step, idx) => {
          const isDone = idx < currentIdx;
          const isCurrent = idx === currentIdx;
          return (
            <div
              key={step.key}
              className={`flex items-start gap-3.5 p-2.5 rounded-lg transition-colors ${
                isCurrent
                  ? 'bg-sky-500/10 text-slate-900 dark:text-slate-100'
                  : isDone
                    ? 'text-slate-700 dark:text-slate-300'
                    : 'text-slate-400 dark:text-slate-600'
              }`}
            >
              <div className="mt-0.5 shrink-0">
                {isDone ? (
                  <Check className="w-4 h-4 text-emerald-500" />
                ) : isCurrent ? (
                  <Loader2 className="w-4 h-4 text-sky-500 animate-spin" />
                ) : (
                  <Circle className="w-4 h-4" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold">{step.label}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {analysisType === 'url' ? step.urlDetail : step.imageDetail}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
