import { AnalysisResult } from '../types/analysis.ts';
import { formatClassificationLabel } from '../utils/pdfReport.ts';

interface EvidenceCardProps {
  result: AnalysisResult;
}

export function EvidenceCard({ result }: EvidenceCardProps) {
  const isUrl = result.analysisType === 'url' && result.urlData;

  const keyFacts = isUrl
    ? [
        { label: 'Source Domain', value: result.urlData!.domain },
        { label: 'Publication Date', value: result.urlData!.publishedDate },
        { label: 'Author Attribution', value: result.urlData!.author },
        {
          label: 'Structured Metadata',
          value:
            result.urlData!.schemaOrgTypes.length > 0 ||
            Object.keys(result.urlData!.openGraph).length > 0
              ? `Present (${result.urlData!.schemaOrgTypes.join(', ') || 'OpenGraph'})`
              : 'Limited',
        },
        {
          label: 'AI Assessment',
          value: formatClassificationLabel(result.classification),
        },
      ]
    : [
        {
          label: 'Source File',
          value: result.imageMetadata?.filename || result.inputReference,
        },
        {
          label: 'Capture Timestamp',
          value: result.imageMetadata?.exif.timestamp || 'Not Available in EXIF',
        },
        {
          label: 'Camera / Device',
          value: result.imageMetadata?.exif.cameraMakeModel || 'Unknown / Stripped',
        },
        {
          label: 'EXIF Container',
          value: result.imageMetadata?.exif.hasExif ? 'Present' : 'Limited / Stripped',
        },
        {
          label: 'AI Assessment',
          value: formatClassificationLabel(result.classification),
        },
      ];

  return (
    <section
      aria-label="Observed evidence"
      className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-5"
    >
      <div className="border-b border-slate-200 dark:border-slate-800 pb-3">
        <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
          Evidence Panel
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          Observed provenance facts and verbatim excerpts extracted directly from the submission.
        </p>
      </div>

      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-xs">
        {keyFacts.map((item) => (
          <div
            key={item.label}
            className="flex items-baseline justify-between gap-3 py-2 border-b border-slate-100 dark:border-slate-800/70"
          >
            <dt className="text-slate-500 dark:text-slate-400 font-medium">
              {item.label}
            </dt>
            <dd className="text-slate-900 dark:text-slate-100 font-mono text-right truncate max-w-[220px]">
              {item.value}
            </dd>
          </div>
        ))}
      </dl>

      {isUrl && result.urlData!.textSnippets.length > 0 && (
        <div className="space-y-2.5 pt-2">
          <h4 className="text-xs font-semibold text-slate-800 dark:text-slate-200">
            Extracted Webpage Text Snippets Influencing Assessment
          </h4>
          <div className="space-y-2">
            {result.urlData!.textSnippets.map((snippet, idx) => (
              <blockquote
                key={idx}
                className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300 leading-relaxed"
              >
                “{snippet}”
              </blockquote>
            ))}
          </div>
        </div>
      )}

      {!isUrl && result.imageAssessment && (
        <div className="space-y-2.5 pt-2">
          <h4 className="text-xs font-semibold text-slate-800 dark:text-slate-200">
            Observed Visual & Container Indicators
          </h4>
          {result.imageAssessment.visualAnomalies.length === 0 &&
          result.imageAssessment.editingIndicators.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              No high-severity visual splicing or synthetic artifacts were flagged during inspection.
            </p>
          ) : (
            <ul className="space-y-1.5 text-xs text-slate-700 dark:text-slate-300">
              {[
                ...result.imageAssessment.visualAnomalies,
                ...result.imageAssessment.editingIndicators,
              ].map((item, idx) => (
                <li
                  key={idx}
                  className="py-1.5 px-3 rounded bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800"
                >
                  {item}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
