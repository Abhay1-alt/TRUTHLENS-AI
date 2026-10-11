import { useState } from 'react';
import { ExternalLink, FileSearch, Search, Trash2 } from 'lucide-react';
import { AnalysisResult } from '../types/analysis.ts';
import { formatClassificationLabel } from '../utils/pdfReport.ts';

interface HistoryTableProps {
  records: AnalysisResult[];
  isLoading: boolean;
  onSelectRecord: (record: AnalysisResult) => void;
  onDeleteRecord: (id: string) => void;
  onStartNewAnalysis: () => void;
}

export function HistoryTable({
  records,
  isLoading,
  onSelectRecord,
  onDeleteRecord,
  onStartNewAnalysis,
}: HistoryTableProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'url' | 'image'>('all');

  const filtered = records.filter((rec) => {
    if (typeFilter !== 'all' && rec.analysisType !== typeFilter) return false;
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      rec.inputReference.toLowerCase().includes(q) ||
      rec.classification.toLowerCase().includes(q) ||
      rec.summary.toLowerCase().includes(q)
    );
  });

  return (
    <section
      aria-label="Analysis history"
      className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-5"
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
            Analysis History
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Click any historical assessment record to inspect its full evidence report or export a PDF.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter by domain or file..."
              className="pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
          </div>

          <div className="inline-flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800">
            {(['all', 'url', 'image'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTypeFilter(t)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md uppercase transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  typeFilter === t
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2 py-4">
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              className="h-10 rounded-lg bg-slate-100 dark:bg-slate-800/60 animate-pulse"
            />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 space-y-3">
          <FileSearch className="w-8 h-8 text-slate-400 mx-auto" />
          <div className="space-y-1">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
              No Analysis Records Found
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
              Submit a webpage URL or upload an image in the Analyzer to generate your first authenticity report.
            </p>
          </div>
          <button
            type="button"
            onClick={onStartNewAnalysis}
            className="px-4 py-2 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-500 rounded-lg transition-colors cursor-pointer"
          >
            Analyze Content Now
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-500 dark:text-slate-400">
                <th className="py-3 pr-4">Date</th>
                <th className="py-3 px-4">Type</th>
                <th className="py-3 px-4">Reference</th>
                <th className="py-3 px-4">Result</th>
                <th className="py-3 px-4 text-right">Risk Score</th>
                <th className="py-3 px-4 text-right">Confidence</th>
                <th className="py-3 pl-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800/70 text-xs">
              {filtered.map((rec) => {
                const statusColor =
                  rec.classification === 'LIKELY_AUTHENTIC'
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : rec.classification === 'SUSPICIOUS'
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-red-600 dark:text-red-400';

                return (
                  <tr
                    key={rec.id}
                    onClick={() => onSelectRecord(rec)}
                    className="h-11 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer"
                  >
                    <td className="py-2.5 pr-4 font-mono text-slate-600 dark:text-slate-400 tabular-nums whitespace-nowrap">
                      {new Date(rec.createdAt).toLocaleDateString('en-US', {
                        month: 'short',
                        day: '2-digit',
                        year: 'numeric',
                      })}
                    </td>
                    <td className="py-2.5 px-4 font-mono uppercase text-slate-700 dark:text-slate-300 whitespace-nowrap">
                      {rec.analysisType}
                      {rec.isDemo ? ' · DEMO' : ''}
                    </td>
                    <td className="py-2.5 px-4 text-slate-900 dark:text-slate-100 font-medium max-w-[260px] truncate">
                      {rec.inputReference}
                    </td>
                    <td className={`py-2.5 px-4 font-semibold whitespace-nowrap ${statusColor}`}>
                      {formatClassificationLabel(rec.classification)}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono font-semibold text-slate-900 dark:text-slate-100 tabular-nums whitespace-nowrap">
                      {rec.riskScore} / 100
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono text-slate-600 dark:text-slate-400 tabular-nums whitespace-nowrap">
                      {Math.round(rec.confidence * 100)}%
                    </td>
                    <td
                      className="py-2.5 pl-4 text-right whitespace-nowrap"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => onSelectRecord(rec)}
                          aria-label={`Open report ${rec.id}`}
                          className="p-1.5 text-slate-500 hover:text-sky-500 transition-colors cursor-pointer"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteRecord(rec.id)}
                          aria-label={`Delete report ${rec.id}`}
                          className="p-1.5 text-slate-500 hover:text-red-500 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
