import { useState } from 'react';
import { Eye, EyeOff, MapPin } from 'lucide-react';
import { AnalysisResult } from '../types/analysis.ts';

interface MetadataCardProps {
  result: AnalysisResult;
}

export function MetadataCard({ result }: MetadataCardProps) {
  const [showGpsCoordinates, setShowGpsCoordinates] = useState(false);

  if (result.analysisType === 'image' && result.imageMetadata) {
    const meta = result.imageMetadata;
    const exif = meta.exif;

    const techRows = [
      { label: 'File Type', value: `${meta.extension} (${meta.mimeType})` },
      { label: 'Resolution', value: `${meta.width} × ${meta.height} px (${meta.aspectRatio})` },
      { label: 'File Size', value: meta.fileSizeFormatted },
      { label: 'Color Mode', value: meta.colorMode },
      { label: 'Compression', value: meta.compressionInfo },
      { label: 'Magic Bytes Signature', value: meta.magicBytesValid ? 'Verified' : 'Invalid' },
      { label: 'SHA-256 Digest', value: `${meta.sha256Hash.slice(0, 20)}...` },
    ];

    const exifRows = [
      { label: 'Camera', value: exif.cameraMakeModel || 'Not Available' },
      { label: 'Timestamp', value: exif.timestamp || 'Not Available' },
      { label: 'Software', value: exif.software || 'Not Available' },
      { label: 'GPS', value: exif.hasGps ? 'Available (Redacted)' : 'Not Available' },
    ];

    return (
      <section
        aria-label="Image technical metadata"
        className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-5"
      >
        <div className="border-b border-slate-200 dark:border-slate-800 pb-3">
          <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
            Image Information & EXIF Viewer
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Binary header inspection and embedded camera container tags.
          </p>
        </div>

        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-slate-800 dark:text-slate-200">
            Technical Properties
          </h4>
          <dl className="divide-y divide-slate-100 dark:divide-slate-800/70 text-xs">
            {techRows.map((row) => (
              <div key={row.label} className="py-2 flex items-center justify-between gap-4">
                <dt className="text-slate-500 dark:text-slate-400">{row.label}</dt>
                <dd className="font-mono text-slate-900 dark:text-slate-100 tabular-nums text-right">
                  {row.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="space-y-2 pt-2">
          <h4 className="text-xs font-semibold text-slate-800 dark:text-slate-200">
            EXIF Data
          </h4>
          <dl className="divide-y divide-slate-100 dark:divide-slate-800/70 text-xs">
            {exifRows.map((row) => (
              <div key={row.label} className="py-2 flex items-center justify-between gap-4">
                <dt className="text-slate-500 dark:text-slate-400">{row.label}</dt>
                <dd className="font-mono text-slate-900 dark:text-slate-100 tabular-nums text-right">
                  {row.value}
                </dd>
              </div>
            ))}
          </dl>

          {/* Privacy-preserving GPS disclosure */}
          {exif.hasGps && (
            <div className="mt-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs text-amber-800 dark:text-amber-300">
                <MapPin className="w-4 h-4 shrink-0" />
                <div>
                  <p className="font-semibold">Location metadata detected.</p>
                  {showGpsCoordinates && exif.gpsCoordinates ? (
                    <p className="font-mono tabular-nums mt-0.5">
                      Lat: {exif.gpsCoordinates.lat}, Lng: {exif.gpsCoordinates.lng}
                    </p>
                  ) : (
                    <p className="text-xs opacity-80">
                      Exact coordinates are hidden by default to protect privacy.
                    </p>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowGpsCoordinates((prev) => !prev)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded border border-amber-500/40 text-amber-900 dark:text-amber-200 hover:bg-amber-500/20 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {showGpsCoordinates ? (
                  <>
                    <EyeOff className="w-3.5 h-3.5" />
                    <span>Hide metadata</span>
                  </>
                ) : (
                  <>
                    <Eye className="w-3.5 h-3.5" />
                    <span>Show metadata</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </section>
    );
  }

  // URL Technical & Structured Metadata View
  const urlData = result.urlData;
  const domainRows = urlData
    ? [
        { label: 'Domain', value: urlData.domain },
        { label: 'Subdomain', value: urlData.subdomain },
        { label: 'Top-Level Domain (TLD)', value: `.${urlData.tld}` },
        { label: 'HTTPS Transport', value: urlData.isHttps ? 'Active (TLS)' : 'Insecure (HTTP)' },
        { label: 'Canonical URL', value: urlData.canonicalUrl || 'Not Declared' },
        { label: 'Article Word Count', value: `${urlData.wordCount} words` },
        { label: 'Embedded Images / Links', value: `${urlData.imageCount} images · ${urlData.externalLinksCount} links` },
        {
          label: 'Schema.org / JSON-LD',
          value: urlData.schemaOrgTypes.length > 0 ? urlData.schemaOrgTypes.join(', ') : 'None Found',
        },
        {
          label: 'OpenGraph Tags',
          value: `${Object.keys(urlData.openGraph).length} properties extracted`,
        },
        {
          label: 'Twitter Card Tags',
          value: `${Object.keys(urlData.twitterCard).length} properties extracted`,
        },
      ]
    : [
        { label: 'Input Reference', value: result.inputReference },
        { label: 'Analysis Engine', value: result.aiModelUsed },
      ];

  return (
    <section
      aria-label="Webpage technical metadata"
      className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-5"
    >
      <div className="border-b border-slate-200 dark:border-slate-800 pb-3">
        <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
          Domain & Structured Metadata Viewer
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          Extracted transport security, domain hierarchy, OpenGraph, and JSON-LD schema signals.
        </p>
      </div>

      <dl className="divide-y divide-slate-100 dark:divide-slate-800/70 text-xs">
        {domainRows.map((row) => (
          <div key={row.label} className="py-2 flex items-center justify-between gap-4">
            <dt className="text-slate-500 dark:text-slate-400">{row.label}</dt>
            <dd className="font-mono text-slate-900 dark:text-slate-100 tabular-nums text-right truncate max-w-[260px]">
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
