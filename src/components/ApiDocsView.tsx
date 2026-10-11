import { ExternalLink } from 'lucide-react';

export function ApiDocsView() {
  const endpoints = [
    {
      method: 'POST',
      path: '/api/analyze/url',
      summary: 'Validate, scrape, and analyze a public URL for authenticity and provenance signals.',
      requestExample: `{
  "url": "https://www.noaa.gov/news-release/ocean-heat-content-observation-2026",
  "isDemo": false
}`,
      responseExample: `{
  "id": "tl_m8x9p_4f2a1c",
  "analysisType": "url",
  "classification": "LIKELY_AUTHENTIC",
  "confidence": 0.91,
  "riskScore": 16,
  "riskTier": "Low Risk",
  "summary": "The analyzed webpage exhibits strong institutional provenance...",
  "signals": [
    {
      "category": "source",
      "severity": "low",
      "description": "HTTPS connection with established .gov domain provenance.",
      "evidence": "Domain resolved to noaa.gov over TLS.",
      "confidence": 0.96
    }
  ]
}`,
    },
    {
      method: 'POST',
      path: '/api/analyze/image',
      summary: 'Validate magic bytes, extract EXIF headers, and inspect an image for AI synthesis or editing.',
      requestExample: `{
  "filename": "press_photo.jpg",
  "mimeType": "image/jpeg",
  "imageBase64": "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ...",
  "isDemo": false
}`,
      responseExample: `{
  "id": "tl_m8x9q_9b1e4d",
  "analysisType": "image",
  "classification": "SUSPICIOUS",
  "confidence": 0.84,
  "riskScore": 74,
  "imageAssessment": {
    "aiGeneratedProbability": 0.68,
    "manipulationProbability": 0.31
  }
}`,
    },
    {
      method: 'POST',
      path: '/api/auth/register',
      summary: 'Register a user account with scrypt password hashing and receive a signed JWT.',
      requestExample: `{
  "email": "analyst@truthlens.ai",
  "password": "StrongPassword123!"
}`,
      responseExample: `{
  "user": { "id": "usr_8f91a2c4", "email": "analyst@truthlens.ai" },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}`,
    },
    {
      method: 'POST',
      path: '/api/auth/login',
      summary: 'Authenticate with email and password and receive a JWT bearer token.',
      requestExample: `{
  "email": "analyst@truthlens.ai",
  "password": "StrongPassword123!"
}`,
      responseExample: `{
  "user": { "id": "usr_8f91a2c4", "email": "analyst@truthlens.ai" },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}`,
    },
    {
      method: 'GET',
      path: '/api/analysis/{id}',
      summary: 'Retrieve a complete structured analysis report by its unique identifier.',
    },
    {
      method: 'GET',
      path: '/api/history',
      summary: 'Retrieve historical analysis records ordered by creation timestamp.',
    },
    {
      method: 'DELETE',
      path: '/api/history/{id}',
      summary: 'Delete a specific analysis report from history.',
    },
    {
      method: 'GET',
      path: '/api/health',
      summary: 'Return operational health of Backend, Database, AI Engine, Storage, and active rate limits.',
    },
  ];

  return (
    <section
      aria-label="API documentation"
      className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-6"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
            REST API Documentation (OpenAPI 3.1)
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Complete specification for TruthLens AI endpoints. Raw OpenAPI JSON is also served at GET /api/docs.
          </p>
        </div>
        <a
          href="/api/docs"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-sky-600 dark:text-sky-400 border border-sky-500/30 rounded-lg hover:bg-sky-500/10 transition-colors self-start whitespace-nowrap shrink-0"
        >
          <span>Raw OpenAPI JSON (/api/docs)</span>
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>

      <div className="divide-y divide-slate-200 dark:divide-slate-800">
        {endpoints.map((ep) => (
          <div key={`${ep.method}-${ep.path}`} className="py-5 first:pt-0 last:pb-0 space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <span
                className={`font-mono text-xs font-bold uppercase ${
                  ep.method === 'POST'
                    ? 'text-sky-600 dark:text-sky-400'
                    : ep.method === 'DELETE'
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-emerald-600 dark:text-emerald-400'
                }`}
              >
                {ep.method}
              </span>
              <code className="font-mono text-sm font-semibold text-slate-900 dark:text-slate-100">
                {ep.path}
              </code>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                — {ep.summary}
              </span>
            </div>

            {(ep.requestExample || ep.responseExample) && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-1">
                {ep.requestExample && (
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                      Request Body Example
                    </p>
                    <pre className="p-3 rounded-lg bg-slate-950 text-slate-200 text-xs font-mono overflow-x-auto border border-slate-800">
                      {ep.requestExample}
                    </pre>
                  </div>
                )}
                {ep.responseExample && (
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                      Response 200 OK Example
                    </p>
                    <pre className="p-3 rounded-lg bg-slate-950 text-slate-200 text-xs font-mono overflow-x-auto border border-slate-800">
                      {ep.responseExample}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
