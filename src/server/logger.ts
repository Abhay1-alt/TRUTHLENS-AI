import crypto from 'crypto';

export interface StructuredLogEntry {
  timestamp: string;
  level: 'INFO' | 'WARN' | 'ERROR';
  requestId: string;
  analysisId?: string;
  analysisType?: 'url' | 'image';
  executionTimeMs?: number;
  aiLatencyMs?: number;
  event: string;
  message: string;
  errorCode?: string;
}

const SENSITIVE_KEYS = new Set([
  'password',
  'password_hash',
  'token',
  'authorization',
  'apiKey',
  'api_key',
  'jwt',
  'imageBase64',
]);

export function generateRequestId(): string {
  return `req_${crypto.randomBytes(6).toString('hex')}`;
}

export function generateAnalysisId(): string {
  return `tl_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;
}

export function sanitizeMetadata(meta?: Record<string, unknown>): Record<string, unknown> {
  if (!meta) return {};
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) {
    if (SENSITIVE_KEYS.has(k.toLowerCase())) {
      clean[k] = '[REDACTED]';
    } else {
      clean[k] = v;
    }
  }
  return clean;
}

export const logger = {
  info(entry: Omit<StructuredLogEntry, 'timestamp' | 'level'>) {
    const record: StructuredLogEntry = {
      timestamp: new Date().toISOString(),
      level: 'INFO',
      ...entry,
    };
    console.log(JSON.stringify(record));
  },
  warn(entry: Omit<StructuredLogEntry, 'timestamp' | 'level'>) {
    const record: StructuredLogEntry = {
      timestamp: new Date().toISOString(),
      level: 'WARN',
      ...entry,
    };
    console.warn(JSON.stringify(record));
  },
  error(entry: Omit<StructuredLogEntry, 'timestamp' | 'level'>) {
    const record: StructuredLogEntry = {
      timestamp: new Date().toISOString(),
      level: 'ERROR',
      ...entry,
    };
    console.error(JSON.stringify(record));
  },
};
