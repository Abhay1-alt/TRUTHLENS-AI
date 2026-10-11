import { AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { Signal } from '../types/analysis.ts';

interface SignalCardProps {
  signal: Signal;
}

/**
 * Displays a detected signal using unboxed metadata with typographic separators
 * and explicit semantic severity text + icon (Zero-Pill & No-Border-L-4 compliant).
 */
export function SignalCard({ signal }: SignalCardProps) {
  const isHigh = signal.severity === 'high';
  const isMedium = signal.severity === 'medium';

  const severityLabel = isHigh
    ? 'High Severity'
    : isMedium
      ? 'Medium Severity'
      : 'Low Risk / Nominal';

  const severityColor = isHigh
    ? 'text-red-600 dark:text-red-400'
    : isMedium
      ? 'text-amber-600 dark:text-amber-400'
      : 'text-emerald-600 dark:text-emerald-400';

  const Icon = isHigh ? AlertTriangle : isMedium ? Info : CheckCircle2;

  return (
    <div className="py-4 first:pt-0 last:pb-0 border-b last:border-b-0 border-slate-200 dark:border-slate-800/80 space-y-2">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
        <div className="flex items-center gap-2">
          <Icon className={`w-4 h-4 shrink-0 ${severityColor}`} />
          <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {signal.description}
          </h4>
        </div>

        {/* Unboxed metadata with typographic separators */}
        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums shrink-0">
          <span className={`font-semibold ${severityColor}`}>{severityLabel}</span>
          <span aria-hidden="true">·</span>
          <span className="capitalize">{signal.category}</span>
          <span aria-hidden="true">·</span>
          <span>Conf {Math.round(signal.confidence * 100)}%</span>
        </div>
      </div>

      <p className="text-xs text-slate-600 dark:text-slate-400 pl-6 leading-relaxed">
        <span className="font-semibold text-slate-700 dark:text-slate-300">
          Observed Evidence:{' '}
        </span>
        {signal.evidence}
      </p>
    </div>
  );
}
