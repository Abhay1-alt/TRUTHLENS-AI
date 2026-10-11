import { useState } from 'react';
import { ArrowRight, FileSearch, Play, ShieldCheck, Upload } from 'lucide-react';
import heroForensicImg from '../assets/images/hero_forensic_lens_1791711791838.jpg';

interface LandingHeroProps {
  onStartUrlAnalysis: () => void;
  onStartImageAnalysis: () => void;
  onRunQuickDemo: () => void;
}

export function LandingHero({
  onStartUrlAnalysis,
  onStartImageAnalysis,
  onRunQuickDemo,
}: LandingHeroProps) {
  const [imgError, setImgError] = useState(false);

  const capabilities = [
    {
      num: '01.',
      title: 'Centralized AIAnalysisEngine Abstraction',
      description:
        'A unified provider-agnostic inference layer evaluates multimodal evidence using structured JSON schemas, automatic retry validation, and strict separation between observed facts and AI inference.',
    },
    {
      num: '02.',
      title: 'SSRF-Hardened Webpage & Metadata Extraction',
      description:
        'Extracts domain hierarchy, TLS status, OpenGraph, Twitter Cards, Schema.org JSON-LD, author attribution, and rhetorical signals while blocking loopback, RFC1918 private IPs, and cloud metadata endpoints.',
    },
    {
      num: '03.',
      title: 'Binary Magic-Byte & Privacy-Safe EXIF Inspection',
      description:
        'Verifies raw file signatures (JPEG, PNG, WebP), pixel geometry, color space, SHA-256 digests, and camera EXIF headers while redacting exact GPS coordinates by default.',
    },
    {
      num: '04.',
      title: 'Transparent Weighted Risk Scoring',
      description:
        'Combines Source (20%), Content (20%), Metadata (15%), Visual (30%), and AI Assessment (15%) signals into an explainable 0–100 risk score and downloadable forensic PDF report.',
    },
  ];

  return (
    <div className="space-y-12 pb-8">
      {/* Hero Section: 2-Column Split with items-stretch */}
      <section className="relative overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 sm:p-10">
        {/* Subtle compositor-only ambient radial glow */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-24 -right-24 w-96 h-96 rounded-full bg-sky-500/10 blur-3xl transition-opacity duration-700"
        />

        <div className="relative grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
          <div className="lg:col-span-7 flex flex-col justify-between space-y-6">
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-xs font-medium text-sky-600 dark:text-sky-400">
                <ShieldCheck className="w-4 h-4 shrink-0" />
                <span>Multimodal Content Authenticity & Provenance Platform</span>
              </div>

              <h1
                className="font-display font-bold tracking-tight text-slate-900 dark:text-white leading-[1.12]"
                style={{
                  fontSize: 'clamp(2.25rem, 4vw, 3.5rem)',
                  textWrap: 'balance',
                }}
              >
                Can You Trust What You See?
              </h1>

              <p className="text-base text-slate-600 dark:text-slate-300 leading-relaxed max-w-2xl">
                Analyze URLs and images with AI-powered authenticity analysis. Detect suspicious content, manipulated images, AI-generated media, and potentially misleading information through explainable forensic signals.
              </p>
            </div>

            <div className="space-y-4 pt-2">
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={onStartUrlAnalysis}
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-sky-600 hover:bg-sky-500 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <FileSearch className="w-4 h-4" />
                  <span>Analyze URL</span>
                  <ArrowRight className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={onStartImageAnalysis}
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-slate-800 dark:text-slate-100 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Upload className="w-4 h-4 text-sky-500" />
                  <span>Upload Image</span>
                </button>

                <button
                  type="button"
                  onClick={onRunQuickDemo}
                  className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Play className="w-4 h-4 text-amber-500" />
                  <span>Try Demo</span>
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <span>Probabilistic Assessment</span>
                <span aria-hidden="true">·</span>
                <span>Zero-Trust SSRF Guard</span>
                <span aria-hidden="true">·</span>
                <span>EXIF & Magic-Byte Verification</span>
                <span aria-hidden="true">·</span>
                <span>Exportable PDF Reports</span>
              </div>
            </div>
          </div>

          {/* Right Column: High-Impact 16:9 Visual Carrier */}
          <div className="lg:col-span-5 flex">
            <div className="relative w-full rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-950 flex flex-col justify-end min-h-[260px]">
              {!imgError ? (
                <img
                  src={heroForensicImg}
                  alt="Optical prism refracting light across digital newsprint and photographic film layers"
                  referrerPolicy="no-referrer"
                  onError={() => setImgError(true)}
                  className="absolute inset-0 w-full h-full object-cover"
                />
              ) : (
                <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-950 to-sky-950" />
              )}
              <div className="relative z-10 bg-gradient-to-t from-black/85 via-black/45 to-transparent p-5 pt-16 text-white">
                <p className="font-mono text-xs text-sky-300 tabular-nums">
                  Engine Pipeline · URL & Image Forensics
                </p>
                <p className="text-xs text-slate-200 mt-1 leading-relaxed">
                  Separates observed technical evidence from probabilistic AI inference to support human editorial verification.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Core Capabilities Grid (Editorial Numbering) */}
      <section aria-label="Core capabilities" className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
              Forensic Verification Architecture
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Engineered for transparent, auditable media and webpage risk evaluation.
            </p>
          </div>
          <span className="text-xs font-mono text-slate-500 dark:text-slate-400 tabular-nums">
            Weights: Source 20% · Content 20% · Metadata 15% · Image 30% · AI 15%
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {capabilities.map((cap) => (
            <div
              key={cap.title}
              className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-2"
            >
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                <span className="font-mono text-sky-600 dark:text-sky-400 mr-2">
                  {cap.num}
                </span>
                {cap.title}
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                {cap.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Modular Extensibility Roadmap Strip */}
      <section
        aria-label="Extensibility architecture"
        className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-3"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
            Modular Analyzer Registry
          </h3>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Version 1 Active Modalities vs. Extensible Plugin Interfaces
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 pt-1 text-xs">
          {[
            { name: 'URLAnalyzer', active: true },
            { name: 'ImageAnalyzer', active: true },
            { name: 'VideoAnalyzer', active: false },
            { name: 'AudioAnalyzer', active: false },
            { name: 'DocumentAnalyzer', active: false },
            { name: 'DeepfakeAnalyzer', active: false },
            { name: 'EmailAnalyzer', active: false },
            { name: 'JobOfferAnalyzer', active: false },
          ].map((mod) => (
            <div
              key={mod.name}
              className={`p-3 rounded-lg border ${
                mod.active
                  ? 'border-sky-500/40 bg-sky-500/5 text-slate-900 dark:text-slate-100'
                  : 'border-slate-200 dark:border-slate-800 text-slate-400 dark:text-slate-500'
              }`}
            >
              <p className="font-mono font-semibold truncate">{mod.name}</p>
              <p className="text-xs mt-1">
                {mod.active ? 'Active (v1.0)' : 'Interface Ready'}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
