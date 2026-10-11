import { useState } from 'react';
import { Download, RotateCcw } from 'lucide-react';
import { AnalysisResult, SignalSeverity } from '../types/analysis.ts';
import { downloadAnalysisPdfReport } from '../utils/pdfReport.ts';
import { ConfidenceMeter } from './ConfidenceMeter.tsx';
import { EvidenceCard } from './EvidenceCard.tsx';
import { MetadataCard } from './MetadataCard.tsx';
import { RecommendationCard } from './RecommendationCard.tsx';
import { RiskScore } from './RiskScore.tsx';
import { SignalCard } from './SignalCard.tsx';

interface ReportViewerProps {
  result: AnalysisResult;
  onAnalyzeAnother: () => void;
}

export function ReportViewer({ result, onAnalyzeAnother }: ReportViewerProps) {
  const [severityFilter, setSeverityFilter] = useState<'all' | SignalSeverity>('all');

  const filteredSignals =
    severityFilter === 'all'
      ? result.signals
      : result.signals.filter((s) => s.severity === severityFilter);

  return (
    <div className="space-y-6">
      {/* Demo Mode Disclosure Banner when result.isDemo is true */}
      {result.isDemo && (
        <div
          role="region"
          aria-label="Demo mode notice"
          className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
        >
          <div className="text-xs text-amber-900 dark:text-amber-200">
            <span className="font-bold">DEMO RESULT</span>
            <span aria-hidden="true" className="mx-2">·</span>
            <span>
              This report was generated using a curated Demo Mode specimen so you can inspect the full forensic interface without consuming live API quota.
            </span>
          </div>
          <span className="font-mono text-xs text-amber-800 dark:text-amber-300 whitespace-nowrap shrink-0">
            ID: {result.id}
          </span>
        </div>
      )}

      {/* Primary Assessment & Risk Breakdown Card */}
      <section
        aria-label="Primary authenticity assessment"
        className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-6"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
              <span className="uppercase">{result.analysisType} Assessment</span>
              <span aria-hidden="true">·</span>
              <span>{new Date(result.createdAt).toLocaleString()}</span>
              <span aria-hidden="true">·</span>
              <span>Report {result.id}</span>
            </div>
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 mt-1 truncate">
              {result.urlData?.title || result.inputReference}
            </h2>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => downloadAnalysisPdfReport(result)}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-500 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download Report</span>
            </button>

            <button
              type="button"
              onClick={onAnalyzeAnother}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Analyze Another</span>
            </button>
          </div>
        </div>

        {/* Summary Prose */}
        <div className="space-y-1.5">
          <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            Executive Summary
          </h3>
          <p className="text-sm text-slate-800 dark:text-slate-200 leading-relaxed">
            {result.summary}
          </p>
        </div>

        {/* Circular Gauge + Risk Breakdown */}
        <RiskScore
          score={result.riskScore}
          riskTier={result.riskTier}
          classification={result.classification}
          breakdown={result.breakdown}
        />

        {/* Confidence & Sub-Probabilities */}
        <ConfidenceMeter
          confidence={result.confidence}
          aiModelUsed={result.aiModelUsed}
          executionTimeMs={result.executionTimeMs}
          imageAssessment={result.imageAssessment}
        />
      </section>

      {/* Why This Result + Recommendations */}
      <RecommendationCard
        explanation={result.explanation}
        recommendations={result.recommendations}
      />

      {/* Detected Signals Section with Interactive Severity Filter */}
      <section
        aria-label="Detected signals"
        className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-5"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Detected Signals ({filteredSignals.length})
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Individual technical, editorial, and visual signals with observed evidence.
            </p>
          </div>

          <div className="inline-flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800 self-start">
            {(['all', 'high', 'medium', 'low'] as const).map((sev) => (
              <button
                key={sev}
                type="button"
                onClick={() => setSeverityFilter(sev)}
                className={`px-3 py-1 text-xs font-medium rounded-md capitalize transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  severityFilter === sev
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {sev === 'all' ? 'All Signals' : `${sev}`}
              </button>
            ))}
          </div>
        </div>

        {filteredSignals.length === 0 ? (
          <p className="text-xs text-slate-500 dark:text-slate-400 py-4">
            No signals match the selected severity filter.
          </p>
        ) : (
          <div className="divide-y divide-slate-200 dark:divide-slate-800/80">
            {filteredSignals.map((sig, idx) => (
              <SignalCard key={sig.id || idx} signal={sig} />
            ))}
          </div>
        )}
      </section>

      {/* Two-Column Evidence & Technical Metadata View */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <EvidenceCard result={result} />
        <MetadataCard result={result} />
      </div>
    </div>
  );
}
