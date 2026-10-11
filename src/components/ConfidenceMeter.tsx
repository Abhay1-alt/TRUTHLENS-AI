import { ImageVisualAssessment } from '../types/analysis.ts';

interface ConfidenceMeterProps {
  confidence: number;
  aiModelUsed: string;
  executionTimeMs: number;
  imageAssessment?: ImageVisualAssessment;
}

export function ConfidenceMeter({
  confidence,
  aiModelUsed,
  executionTimeMs,
  imageAssessment,
}: ConfidenceMeterProps) {
  const pct = Math.round(confidence * 100);

  return (
    <div className="pt-6 border-t border-slate-200 dark:border-slate-800 grid grid-cols-1 md:grid-cols-3 gap-6">
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium text-slate-600 dark:text-slate-400">
            Assessment Confidence
          </span>
          <span className="font-mono font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
            {pct}%
          </span>
        </div>
        <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
          <div
            className="h-full rounded-full bg-sky-500 transition-all duration-300"
            style={{ width: `${Math.max(5, Math.min(100, pct))}%` }}
          />
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Probabilistic confidence based on signal convergence (never 100%).
        </p>
      </div>

      {imageAssessment ? (
        <>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-slate-600 dark:text-slate-400">
                AI-Generated Probability
              </span>
              <span className="font-mono font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                {Math.round(imageAssessment.aiGeneratedProbability * 100)}%
              </span>
            </div>
            <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
              <div
                className="h-full rounded-full bg-amber-500 transition-all duration-300"
                style={{
                  width: `${Math.max(4, Math.round(imageAssessment.aiGeneratedProbability * 100))}%`,
                }}
              />
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Visual diffusion / synthetic texture likelihood.
            </p>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-slate-600 dark:text-slate-400">
                Manipulation / Editing Probability
              </span>
              <span className="font-mono font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                {Math.round(imageAssessment.manipulationProbability * 100)}%
              </span>
            </div>
            <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
              <div
                className="h-full rounded-full bg-purple-500 transition-all duration-300"
                style={{
                  width: `${Math.max(4, Math.round(imageAssessment.manipulationProbability * 100))}%`,
                }}
              />
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Compositing, splicing, or heavy retouching likelihood.
            </p>
          </div>
        </>
      ) : (
        <div className="md:col-span-2 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-500 dark:text-slate-400 pt-1">
          <div className="flex items-center gap-2 font-mono tabular-nums">
            <span>Engine: {aiModelUsed}</span>
            <span aria-hidden="true">·</span>
            <span>Execution Time: {executionTimeMs} ms</span>
          </div>
          <span>
            Scores reflect weighted evidence signals rather than absolute truth.
          </span>
        </div>
      )}
    </div>
  );
}
