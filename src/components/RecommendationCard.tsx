import { StructuredExplanation } from '../types/analysis.ts';

interface RecommendationCardProps {
  explanation: StructuredExplanation;
  recommendations: string[];
}

export function RecommendationCard({
  explanation,
  recommendations,
}: RecommendationCardProps) {
  const explanationSections = [
    {
      number: '01.',
      title: 'What Was Detected',
      content: explanation.whatDetected,
    },
    {
      number: '02.',
      title: 'Why It Matters',
      content: explanation.whyItMatters,
    },
    {
      number: '03.',
      title: 'Confidence & Uncertainty',
      content: explanation.confidenceReasoning,
    },
    {
      number: '04.',
      title: 'What You Should Verify',
      content: explanation.whatToVerify,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Why this result? Explanation System */}
      <section
        aria-label="Why this result explanation"
        className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-5"
      >
        <div className="border-b border-slate-200 dark:border-slate-800 pb-3">
          <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
            Why This Result?
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Structured breakdown separating observed evidence, AI inference, and remaining uncertainty.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {explanationSections.map((sec) => (
            <div key={sec.title} className="space-y-1.5">
              <h4 className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                <span className="font-mono text-sky-600 dark:text-sky-400 mr-1.5">
                  {sec.number}
                </span>
                {sec.title}
              </h4>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                {sec.content}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Recommended Actions + Responsible AI */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <section
          aria-label="Recommended verification steps"
          className="lg:col-span-7 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4"
        >
          <div className="border-b border-slate-200 dark:border-slate-800 pb-3">
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Recommended Verification Steps
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Concrete actions to independently validate the content before relying on or sharing it.
            </p>
          </div>

          <ol className="space-y-2.5 text-xs text-slate-700 dark:text-slate-300">
            {recommendations.map((rec, index) => (
              <li key={index} className="flex items-start gap-3 leading-relaxed">
                <span className="font-mono font-semibold text-sky-600 dark:text-sky-400 tabular-nums shrink-0">
                  0{index + 1}.
                </span>
                <span>{rec}</span>
              </li>
            ))}
          </ol>
        </section>

        <section
          aria-label="Responsible AI disclosure"
          className="lg:col-span-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 p-6 space-y-3"
        >
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
            Responsible AI & Assessment Boundaries
          </h3>
          <ul className="space-y-2 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            <li>· AI-generated and manipulation detection is strictly probabilistic.</li>
            <li>· No automated detector can guarantee that content is 100% real or fake.</li>
            <li>· A suspicious score does not prove that content is false.</li>
            <li>· An authentic score does not prove that content is true.</li>
            <li>· Important claims should always be independently verified with primary sources.</li>
          </ul>
        </section>
      </div>
    </div>
  );
}
