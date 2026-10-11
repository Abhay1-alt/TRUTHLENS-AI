import { CheckCircle2, RefreshCw } from 'lucide-react';
import { SystemHealthStatus } from '../types/analysis.ts';

interface SystemHealthViewProps {
  health: SystemHealthStatus | null;
  onRefresh: () => void;
}

export function SystemHealthView({ health, onRefresh }: SystemHealthViewProps) {
  const rows = health
    ? [
        { name: 'Backend API Orchestrator', status: health.components.backend, detail: 'Express + SSRF & Magic-Byte Guards' },
        { name: 'Database & Persistence', status: health.components.database, detail: 'Firebase Firestore + Hardened Security Rules' },
        { name: 'AI Analysis Engine', status: health.components.aiEngine, detail: `${health.config.aiProvider} (${health.config.aiModel})` },
        { name: 'Storage Layer', status: health.components.storage, detail: 'Local Memory Adapter (S3/Cloudinary extensible)' },
      ]
    : [];

  return (
    <section
      aria-label="System health status"
      className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-6"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
            System Status
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Live telemetry from GET /api/health verifying core service availability and security parameters.
          </p>
        </div>

        <button
          type="button"
          onClick={onRefresh}
          className="inline-flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors self-start whitespace-nowrap shrink-0 cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Check /api/health</span>
        </button>
      </div>

      {!health ? (
        <div className="space-y-2 py-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-12 rounded-lg bg-slate-100 dark:bg-slate-800 animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg">
            {rows.map((r) => (
              <div
                key={r.name}
                className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
              >
                <div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {r.name}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{r.detail}</p>
                </div>
                <div className="flex items-center gap-2 text-xs font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{r.status}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2 text-xs">
            <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 space-y-2">
              <h3 className="font-semibold text-slate-900 dark:text-slate-100">
                Active Security & Rate Limit Policy
              </h3>
              <dl className="space-y-1.5 text-slate-600 dark:text-slate-400 font-mono tabular-nums">
                <div className="flex justify-between">
                  <dt>Max Image Upload Size:</dt>
                  <dd className="text-slate-900 dark:text-slate-100">{health.config.maxImageSizeMb} MB</dd>
                </div>
                <div className="flex justify-between">
                  <dt>Rate Limiting Enabled:</dt>
                  <dd className="text-slate-900 dark:text-slate-100">
                    {health.config.rateLimitEnabled ? 'Yes' : 'No'}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt>Anonymous Quota:</dt>
                  <dd className="text-slate-900 dark:text-slate-100">
                    {health.config.anonLimitPerHour} analyses/hour
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt>Authenticated Quota:</dt>
                  <dd className="text-slate-900 dark:text-slate-100">
                    {health.config.authLimitPerHour} analyses/hour
                  </dd>
                </div>
              </dl>
            </div>

            <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 space-y-2">
              <h3 className="font-semibold text-slate-900 dark:text-slate-100">
                Configured Risk Scoring Weights
              </h3>
              <dl className="space-y-1.5 text-slate-600 dark:text-slate-400 font-mono tabular-nums">
                <div className="flex justify-between">
                  <dt>Source Signals:</dt>
                  <dd className="text-slate-900 dark:text-slate-100">
                    {Math.round(health.config.weights.source * 100)}%
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt>Content Signals:</dt>
                  <dd className="text-slate-900 dark:text-slate-100">
                    {Math.round(health.config.weights.content * 100)}%
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt>Metadata Signals:</dt>
                  <dd className="text-slate-900 dark:text-slate-100">
                    {Math.round(health.config.weights.metadata * 100)}%
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt>Image / Visual Signals:</dt>
                  <dd className="text-slate-900 dark:text-slate-100">
                    {Math.round(health.config.weights.image * 100)}%
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt>AI Engine Assessment:</dt>
                  <dd className="text-slate-900 dark:text-slate-100">
                    {Math.round(health.config.weights.ai * 100)}%
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
