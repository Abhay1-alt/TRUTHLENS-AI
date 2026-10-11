import { Classification, RiskBreakdown } from '../types/analysis.ts';
import { formatClassificationLabel } from '../utils/pdfReport.ts';

interface RiskScoreProps {
  score: number;
  riskTier: 'Low Risk' | 'Moderate Risk' | 'High Risk' | 'Very High Risk';
  classification: Classification;
  breakdown: RiskBreakdown;
}

export function RiskScore({
  score,
  riskTier,
  classification,
  breakdown,
}: RiskScoreProps) {
  const radius = 56;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, score));
  const strokeDashoffset = circumference - (clamped / 100) * circumference;

  const strokeColor =
    clamped <= 30
      ? 'stroke-emerald-500'
      : clamped <= 60
        ? 'stroke-amber-500'
        : 'stroke-red-500';

  const statusTextColor =
    classification === 'LIKELY_AUTHENTIC'
      ? 'text-emerald-600 dark:text-emerald-400'
      : classification === 'SUSPICIOUS'
        ? 'text-amber-600 dark:text-amber-400'
        : 'text-red-600 dark:text-red-400';

  const rows = [
    {
      label: 'Source Provenance',
      weight: `${Math.round(breakdown.weights.source * 100)}%`,
      value: breakdown.source,
    },
    {
      label: 'Content & Rhetoric',
      weight: `${Math.round(breakdown.weights.content * 100)}%`,
      value: breakdown.content,
    },
    {
      label: 'Technical Metadata',
      weight: `${Math.round(breakdown.weights.metadata * 100)}%`,
      value: breakdown.metadata,
    },
    {
      label: 'Visual / Media Integrity',
      weight: `${Math.round(breakdown.weights.image * 100)}%`,
      value: breakdown.visual,
    },
    {
      label: 'AI Engine Assessment',
      weight: `${Math.round(breakdown.weights.ai * 100)}%`,
      value: breakdown.aiAssessment,
    },
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
      {/* Left: Circular Score Gauge */}
      <div className="lg:col-span-5 flex flex-col sm:flex-row lg:flex-col items-center gap-5 text-center sm:text-left lg:text-center border-b lg:border-b-0 lg:border-r border-slate-200 dark:border-slate-800 pb-6 lg:pb-0 lg:pr-6">
        <div className="relative w-36 h-36 flex items-center justify-center shrink-0">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 132 132">
            <circle
              cx="66"
              cy="66"
              r={radius}
              fill="none"
              strokeWidth="10"
              className="stroke-slate-200 dark:stroke-slate-800"
            />
            <circle
              cx="66"
              cy="66"
              r={radius}
              fill="none"
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              className={`${strokeColor} transition-all duration-500`}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="font-mono text-3xl font-bold text-slate-900 dark:text-white tabular-nums">
              {clamped}
            </span>
            <span className="font-mono text-xs text-slate-500 dark:text-slate-400 tabular-nums">
              / 100
            </span>
          </div>
        </div>

        <div className="space-y-1">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Authenticity Assessment
          </p>
          <p className={`text-xl font-bold tracking-tight ${statusTextColor}`}>
            {formatClassificationLabel(classification)}
          </p>
          <div className="flex items-center justify-center sm:justify-start lg:justify-center gap-2 text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
            <span>Tier: {riskTier}</span>
            <span aria-hidden="true">·</span>
            <span>0–30 Low / 31–60 Mod / 61–80 High</span>
          </div>
        </div>
      </div>

      {/* Right: Transparent Component Risk Breakdown */}
      <div className="lg:col-span-7 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Weighted Risk Breakdown
          </h3>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Explainable Signal Contributions
          </span>
        </div>

        <div className="space-y-3">
          {rows.map((row) => {
            const barColor =
              row.value <= 30
                ? 'bg-emerald-500'
                : row.value <= 60
                  ? 'bg-amber-500'
                  : 'bg-red-500';
            return (
              <div key={row.label} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                    <span className="font-medium">{row.label}</span>
                    <span aria-hidden="true" className="text-slate-400">·</span>
                    <span className="text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                      Weight {row.weight}
                    </span>
                  </div>
                  <span className="font-mono font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                    {row.value} / 100
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${barColor} transition-all duration-300`}
                    style={{ width: `${Math.max(4, Math.min(100, row.value))}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
