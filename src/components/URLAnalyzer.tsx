import React, { useState } from 'react';
import { Globe, Play, Search, Sparkles } from 'lucide-react';

interface URLAnalyzerProps {
  onAnalyzeUrl: (url: string, isDemo: boolean, demoPreset?: string) => void;
  isLoading: boolean;
}

export function URLAnalyzer({ onAnalyzeUrl, isLoading }: URLAnalyzerProps) {
  const [url, setUrl] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) {
      setValidationError('Please enter a webpage URL to analyze.');
      return;
    }
    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        setValidationError('Only http:// and https:// URLs are supported.');
        return;
      }
      setValidationError(null);
      onAnalyzeUrl(trimmed, false);
    } catch {
      setValidationError('Enter a complete URL starting with https:// (e.g., https://example.com/article).');
    }
  };

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit} className="space-y-3" noValidate>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <label
            htmlFor="url-analyzer-input"
            className="block text-sm font-medium text-slate-800 dark:text-slate-200"
          >
            Enter Public Webpage or Article URL
          </label>
          <span className="text-xs font-mono text-emerald-600 dark:text-emerald-400">
            Powered by Server-Side Google Gemini API (gemini-3.8-flash)
          </span>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Globe className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              id="url-analyzer-input"
              type="url"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                if (validationError) setValidationError(null);
              }}
              placeholder="https://example.com/article"
              disabled={isLoading}
              className="w-full pl-10 pr-4 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 disabled:opacity-60"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-sky-600 hover:bg-sky-500 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Search className="w-4 h-4" />
            <span>Analyze URL with Gemini</span>
          </button>
        </div>

        {validationError && (
          <p role="alert" className="text-xs text-red-600 dark:text-red-400">
            {validationError}
          </p>
        )}

        <p className="text-xs text-slate-500 dark:text-slate-400">
          Extracts domain provenance, OpenGraph/Schema.org metadata, author attribution, publication dates, and rhetorical risk signals, then analyzes them with the server-side Google Gemini API.
        </p>
      </form>

      <div className="pt-4 border-t border-slate-200 dark:border-slate-800/80">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="text-xs text-slate-600 dark:text-slate-400">
            <span className="font-semibold text-slate-800 dark:text-slate-200">
              One-Click Test Specimens
            </span>
            <span aria-hidden="true" className="mx-2">·</span>
            <span>Run live Google Gemini API analysis or instant Demo preset</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={isLoading}
              onClick={() => {
                const liveSample = 'https://en.wikipedia.org/wiki/Deepfake';
                setUrl(liveSample);
                setValidationError(null);
                onAnalyzeUrl(liveSample, false);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-sky-600 hover:bg-sky-500 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Live Gemini: Wikipedia Article</span>
            </button>

            <button
              type="button"
              disabled={isLoading}
              onClick={() => {
                const specimenUrl =
                  'https://global-truth-wire-daily.net/breaking/2026-secret-grid-shutdown-exposed';
                setUrl(specimenUrl);
                setValidationError(null);
                onAnalyzeUrl(specimenUrl, false, 'suspicious-claim');
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-800 dark:text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Live Gemini: Viral Grid Claim</span>
            </button>

            <button
              type="button"
              disabled={isLoading}
              onClick={() =>
                onAnalyzeUrl(
                  'https://www.noaa.gov/news-release/ocean-heat-content-observation-2026',
                  true,
                  'verified-science'
                )
              }
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Play className="w-3.5 h-3.5" />
              <span>Offline Demo Preset</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
