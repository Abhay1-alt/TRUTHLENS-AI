import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { SystemHealthStatus } from '../types/analysis.ts';

interface AdminDashboardProps {
  health: SystemHealthStatus | null;
  onRefresh: () => void;
}

export function AdminDashboard({ health, onRefresh }: AdminDashboardProps) {
  if (!health) {
    return (
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4">
        <div className="h-6 w-48 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 bg-slate-100 dark:bg-slate-800/60 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const { metrics } = health;

  const kpis = [
    { label: 'Total Analyses', value: metrics.totalAnalyses, unit: 'reports' },
    { label: 'URL Analyses', value: metrics.urlAnalyses, unit: 'webpages' },
    { label: 'Image Analyses', value: metrics.imageAnalyses, unit: 'media files' },
    { label: 'Average Risk Score', value: `${metrics.averageRiskScore}/100`, unit: 'composite' },
    { label: 'AI Engine Errors', value: metrics.aiApiErrors, unit: 'events' },
    { label: 'Rate Limit Hits', value: metrics.rateLimitHits, unit: 'throttled' },
  ];

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
              Observability & Analytics Console
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Real-time aggregation of URL and Image authenticity analyses, risk distribution, and engine telemetry.
            </p>
          </div>
          <button
            type="button"
            onClick={onRefresh}
            className="px-3.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors self-start whitespace-nowrap shrink-0 cursor-pointer"
          >
            Refresh Telemetry
          </button>
        </div>

        {/* 6 KPI Stat Grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {kpis.map((kpi) => (
            <div
              key={kpi.label}
              className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 space-y-1"
            >
              <p className="text-xs text-slate-500 dark:text-slate-400">{kpi.label}</p>
              <p className="font-mono text-2xl font-bold text-slate-900 dark:text-white tabular-nums">
                {kpi.value}
              </p>
              <p className="text-xs text-slate-400 dark:text-slate-500 font-mono">
                {kpi.unit}
              </p>
            </div>
          ))}
        </div>

        {/* Recharts Visualizations */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-2">
          <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-950/40 space-y-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Daily Analysis Volume by Modality (7-Day Window)
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Comparison of URL vs. Image inspections processed.
              </p>
            </div>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={metrics.dailyAnalyses}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.25} />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      borderColor: '#1e293b',
                      color: '#f8fafc',
                      fontSize: '12px',
                    }}
                  />
                  <Bar dataKey="urlCount" name="URL Analyses" fill="#0284c7" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="imageCount" name="Image Analyses" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-950/40 space-y-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Average Composite Risk Score Trend
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Mean risk score (0–100) across daily submissions.
              </p>
            </div>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={metrics.dailyAnalyses}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.25} />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      borderColor: '#1e293b',
                      color: '#f8fafc',
                      fontSize: '12px',
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="avgRisk"
                    name="Avg Risk Score"
                    stroke="#10b981"
                    strokeWidth={2.5}
                    dot={{ r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
