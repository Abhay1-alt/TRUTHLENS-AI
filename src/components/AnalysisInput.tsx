import { Globe, Image as ImageIcon } from 'lucide-react';
import { ImageUploader } from './ImageUploader.tsx';
import { URLAnalyzer } from './URLAnalyzer.tsx';

interface AnalysisInputProps {
  activeTab: 'url' | 'image';
  onTabChange: (tab: 'url' | 'image') => void;
  onAnalyzeUrl: (url: string, isDemo: boolean, demoPreset?: string) => void;
  onAnalyzeImage: (payload: {
    imageBase64?: string;
    filename: string;
    mimeType: string;
    isDemo: boolean;
    demoPresetKey?: 'synthetic-summit' | 'authentic-buoy';
  }) => void;
  isLoading: boolean;
}

export function AnalysisInput({
  activeTab,
  onTabChange,
  onAnalyzeUrl,
  onAnalyzeImage,
  isLoading,
}: AnalysisInputProps) {
  return (
    <section
      aria-label="Content authenticity input"
      className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-6"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
            Multimodal Authenticity Inspector
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Select an input modality below to evaluate provenance, technical metadata, and AI risk indicators.
          </p>
        </div>

        {/* Segmented Tab Control */}
        <div
          role="tablist"
          aria-label="Analysis modality"
          className="inline-flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800/90 self-start"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'url'}
            onClick={() => onTabChange('url')}
            className={`inline-flex items-center gap-2 px-4 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'url'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>URL Analysis</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'image'}
            onClick={() => onTabChange('image')}
            className={`inline-flex items-center gap-2 px-4 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'image'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <ImageIcon className="w-3.5 h-3.5" />
            <span>Image Analysis</span>
          </button>
        </div>
      </div>

      {activeTab === 'url' ? (
        <URLAnalyzer onAnalyzeUrl={onAnalyzeUrl} isLoading={isLoading} />
      ) : (
        <ImageUploader onAnalyzeImage={onAnalyzeImage} isLoading={isLoading} />
      )}
    </section>
  );
}
