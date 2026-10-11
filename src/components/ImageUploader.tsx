import React, { useRef, useState } from 'react';
import { Image as ImageIcon, Play, Trash2, Upload, ZoomIn } from 'lucide-react';
import demoAuthenticImg from '../assets/images/demo_authentic_field_report_1791711821300.jpg';
import demoSyntheticImg from '../assets/images/demo_synthetic_conference_1791711806419.jpg';

interface ImageUploaderProps {
  onAnalyzeImage: (payload: {
    imageBase64?: string;
    filename: string;
    mimeType: string;
    isDemo: boolean;
    demoPresetKey?: 'synthetic-summit' | 'authentic-buoy';
  }) => void;
  isLoading: boolean;
}

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_SIZE_BYTES = 10 * 1024 * 1024;

export function ImageUploader({ onAnalyzeImage, isLoading }: ImageUploaderProps) {
  const [selectedFile, setSelectedFile] = useState<{
    name: string;
    size: number;
    mimeType: string;
    dataUrl: string;
  } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const processFile = (file: File) => {
    setErrorMsg(null);
    setPreviewError(false);

    if (!ALLOWED_TYPES.includes(file.type)) {
      setErrorMsg('Unsupported image format. Please upload a .jpg, .jpeg, .png, or .webp file.');
      return;
    }

    if (file.size > MAX_SIZE_BYTES) {
      setErrorMsg('Image exceeds the 10 MB maximum file size limit.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setSelectedFile({
          name: file.name,
          size: file.size,
          mimeType: file.type,
          dataUrl: reader.result,
        });
      }
    };
    reader.onerror = () => {
      setErrorMsg('Failed to read the selected image file.');
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (isLoading) return;
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <div className="space-y-6">
      {!selectedFile ? (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            if (!isLoading) setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
            isDragging
              ? 'border-sky-500 bg-sky-500/5'
              : 'border-slate-300 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-600'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) processFile(f);
            }}
            className="hidden"
            id="image-file-picker"
          />

          <div className="mx-auto w-12 h-12 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-4">
            <Upload className="w-5 h-5 text-sky-500" />
          </div>

          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Drag and drop an image here, or{' '}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="text-sky-600 dark:text-sky-400 underline underline-offset-4 hover:text-sky-500 cursor-pointer"
            >
              browse files
            </button>
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5">
            Supports JPG, JPEG, PNG, and WEBP up to 10 MB. Magic bytes, dimensions, and EXIF tags are inspected server-side.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-4 w-full sm:w-auto">
            <div className="w-24 h-20 rounded-lg overflow-hidden bg-slate-200 dark:bg-slate-800 shrink-0 flex items-center justify-center border border-slate-300 dark:border-slate-700">
              {!previewError ? (
                <img
                  src={selectedFile.dataUrl}
                  alt={`Preview of ${selectedFile.name}`}
                  referrerPolicy="no-referrer"
                  onError={() => setPreviewError(true)}
                  className="w-full h-full object-cover"
                />
              ) : (
                <ImageIcon className="w-6 h-6 text-slate-400" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                {selectedFile.name}
              </p>
              <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mt-1 font-mono tabular-nums">
                <span>{selectedFile.mimeType.toUpperCase()}</span>
                <span aria-hidden="true">·</span>
                <span>{formatFileSize(selectedFile.size)}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
            <button
              type="button"
              disabled={isLoading}
              onClick={() => {
                setSelectedFile(null);
                if (fileInputRef.current) fileInputRef.current.value = '';
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5 text-red-500" />
              <span>Remove Image</span>
            </button>

            <button
              type="button"
              disabled={isLoading}
              onClick={() =>
                onAnalyzeImage({
                  imageBase64: selectedFile.dataUrl,
                  filename: selectedFile.name,
                  mimeType: selectedFile.mimeType,
                  isDemo: false,
                })
              }
              className="inline-flex items-center gap-2 px-5 py-2 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-500 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <ZoomIn className="w-4 h-4" />
              <span>Analyze Image</span>
            </button>
          </div>
        </div>
      )}

      {errorMsg && (
        <p role="alert" className="text-xs text-red-600 dark:text-red-400">
          {errorMsg}
        </p>
      )}

      {/* Demo & Live Specimen Gallery */}
      <div className="pt-4 border-t border-slate-200 dark:border-slate-800/80 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="text-xs text-slate-600 dark:text-slate-400">
            <span className="font-semibold text-slate-800 dark:text-slate-200">
              Forensic Reference Specimens
            </span>
            <span aria-hidden="true" className="mx-2">·</span>
            <span>Run Live AI Vision or Instant Demo Mode on curated test images</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Specimen 1: Synthetic Conference Photo */}
          <div className="flex items-center justify-between gap-3 p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60">
            <div className="flex items-center gap-3 min-w-0">
              <img
                src={demoSyntheticImg}
                alt="Climate summit press podium specimen"
                referrerPolicy="no-referrer"
                className="w-14 h-11 rounded object-cover shrink-0 bg-slate-800"
              />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                  Summit Podium Specimen
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                  Synthetic backdrop typography cues
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                disabled={isLoading}
                onClick={() =>
                  onAnalyzeImage({
                    filename: 'climate_summit_podium_press.jpg',
                    mimeType: 'image/jpeg',
                    isDemo: false,
                    demoPresetKey: 'synthetic-summit',
                  })
                }
                className="px-2.5 py-1.5 text-xs font-medium text-white bg-sky-600 hover:bg-sky-500 rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Live AI
              </button>
              <button
                type="button"
                disabled={isLoading}
                onClick={() =>
                  onAnalyzeImage({
                    filename: 'climate_summit_podium_press.jpg',
                    mimeType: 'image/jpeg',
                    isDemo: true,
                    demoPresetKey: 'synthetic-summit',
                  })
                }
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Play className="w-3 h-3" />
                <span>Demo</span>
              </button>
            </div>
          </div>

          {/* Specimen 2: Documentary Buoy Inspection */}
          <div className="flex items-center justify-between gap-3 p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60">
            <div className="flex items-center gap-3 min-w-0">
              <img
                src={demoAuthenticImg}
                alt="Coastal weather buoy documentary specimen"
                referrerPolicy="no-referrer"
                className="w-14 h-11 rounded object-cover shrink-0 bg-slate-800"
              />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                  Coastal Buoy Field Photo
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                  Coherent stencil text & lighting
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                disabled={isLoading}
                onClick={() =>
                  onAnalyzeImage({
                    filename: 'coastal_observatory_buoy_inspection.jpg',
                    mimeType: 'image/jpeg',
                    isDemo: false,
                    demoPresetKey: 'authentic-buoy',
                  })
                }
                className="px-2.5 py-1.5 text-xs font-medium text-white bg-sky-600 hover:bg-sky-500 rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Live AI
              </button>
              <button
                type="button"
                disabled={isLoading}
                onClick={() =>
                  onAnalyzeImage({
                    filename: 'coastal_observatory_buoy_inspection.jpg',
                    mimeType: 'image/jpeg',
                    isDemo: true,
                    demoPresetKey: 'authentic-buoy',
                  })
                }
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Play className="w-3 h-3" />
                <span>Demo</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
