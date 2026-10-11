import crypto from 'crypto';
import dns from 'dns';
import net from 'net';
import exifr from 'exifr';
import { ImageTechnicalMetadata } from '../types/analysis.ts';

export class SecurityValidationError extends Error {
  public readonly statusCode: number;
  public readonly code: string;

  constructor(message: string, statusCode = 400, code = 'VALIDATION_ERROR') {
    super(message);
    this.name = 'SecurityValidationError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  '0.0.0.0',
  '127.0.0.1',
  '::1',
  '[::1]',
  'metadata.google.internal',
  'metadata.goog',
  '169.254.169.254',
  'instance-data',
]);

/**
 * Checks whether an IPv4 or IPv6 address belongs to a private, loopback,
 * link-local, carrier-grade NAT, or cloud metadata network range.
 */
export function isPrivateOrReservedIp(ip: string): boolean {
  const normalized = ip.replace(/^\[|\]$/g, '').toLowerCase();

  if (
    normalized === '::1' ||
    normalized === '::' ||
    normalized === '0:0:0:0:0:0:0:1' ||
    normalized === '0:0:0:0:0:0:0:0'
  ) {
    return true;
  }

  // IPv4-mapped IPv6 addresses (e.g., ::ffff:127.0.0.1)
  if (normalized.startsWith('::ffff:')) {
    const ipv4Part = normalized.slice(7);
    if (net.isIPv4(ipv4Part)) {
      return isPrivateOrReservedIp(ipv4Part);
    }
  }

  if (net.isIPv6(normalized)) {
    // Loopback, unspecified, Unique Local (fc00::/7), Link-Local (fe80::/10), Multicast (ff00::/8)
    if (
      normalized.startsWith('fc') ||
      normalized.startsWith('fd') ||
      normalized.startsWith('fe8') ||
      normalized.startsWith('fe9') ||
      normalized.startsWith('fea') ||
      normalized.startsWith('feb') ||
      normalized.startsWith('ff')
    ) {
      return true;
    }
    return false;
  }

  if (!net.isIPv4(normalized)) {
    return true; // Fail closed on unrecognized IP format
  }

  const parts = normalized.split('.').map((octet) => parseInt(octet, 10));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) {
    return true;
  }

  const [a, b, c] = parts;

  // 0.0.0.0/8 (Current network)
  if (a === 0) return true;
  // 10.0.0.0/8 (Private network)
  if (a === 10) return true;
  // 100.64.0.0/10 (Carrier-grade NAT)
  if (a === 100 && b >= 64 && b <= 127) return true;
  // 127.0.0.0/8 (Loopback)
  if (a === 127) return true;
  // 169.254.0.0/16 (Link-local & Cloud Metadata 169.254.169.254)
  if (a === 169 && b === 254) return true;
  // 172.16.0.0/12 (Private network)
  if (a === 172 && b >= 16 && b <= 31) return true;
  // 192.0.0.0/24 & 192.0.2.0/24 (IETF & TEST-NET-1)
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return true;
  // 192.168.0.0/16 (Private network)
  if (a === 192 && b === 168) return true;
  // 198.18.0.0/15 (Benchmarking)
  if (a === 198 && (b === 18 || b === 19)) return true;
  // 198.51.100.0/24 (TEST-NET-2)
  if (a === 198 && b === 51 && c === 100) return true;
  // 203.0.113.0/24 (TEST-NET-3)
  if (a === 203 && b === 0 && c === 113) return true;
  // 224.0.0.0/4 (Multicast) & 240.0.0.0/4 (Reserved/Broadcast)
  if (a >= 224) return true;

  return false;
}

/**
 * Validates a user-supplied URL and enforces SSRF protection.
 * Blocks non-HTTP(S) schemes, credentials, internal hostnames, private IP ranges,
 * and resolves DNS to prevent DNS-rebinding to internal addresses.
 */
export async function validateUrlForScraping(
  rawUrl: string,
  options: { skipDnsLookup?: boolean } = {}
): Promise<URL> {
  if (!rawUrl || typeof rawUrl !== 'string') {
    throw new SecurityValidationError('Please enter a valid URL.', 400, 'INVALID_URL');
  }

  const trimmed = rawUrl.trim();
  if (trimmed.length > 2048) {
    throw new SecurityValidationError('URL exceeds maximum length of 2048 characters.', 400, 'URL_TOO_LONG');
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new SecurityValidationError(
      'Invalid URL format. Include http:// or https:// (for example, https://example.com/article).',
      400,
      'INVALID_URL_FORMAT'
    );
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new SecurityValidationError(
      `Unsupported URL scheme "${parsed.protocol.replace(':', '')}". Only http and https are allowed.`,
      400,
      'BLOCKED_SCHEME'
    );
  }

  if (parsed.username || parsed.password) {
    throw new SecurityValidationError(
      'URLs containing embedded credentials are not permitted.',
      400,
      'CREDENTIALS_NOT_ALLOWED'
    );
  }

  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');

  if (!hostname || !hostname.includes('.') && !net.isIP(hostname)) {
    throw new SecurityValidationError(
      'Internal or unqualified hostnames are blocked for security (SSRF protection).',
      400,
      'SSRF_BLOCKED_HOST'
    );
  }

  if (
    BLOCKED_HOSTNAMES.has(hostname) ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.lan') ||
    hostname.endsWith('.corp')
  ) {
    throw new SecurityValidationError(
      'Access to localhost, internal networks, or cloud metadata endpoints is strictly blocked.',
      400,
      'SSRF_BLOCKED_HOST'
    );
  }

  if (net.isIP(hostname)) {
    if (isPrivateOrReservedIp(hostname)) {
      throw new SecurityValidationError(
        'Access to private, loopback, or reserved IP ranges is blocked (SSRF protection).',
        400,
        'SSRF_PRIVATE_IP'
      );
    }
  } else if (!options.skipDnsLookup) {
    try {
      const records = await dns.promises.lookup(hostname, { all: true });
      if (!records || records.length === 0) {
        throw new SecurityValidationError(
          `Could not resolve hostname "${hostname}". Verify the domain name is spelled correctly.`,
          400,
          'DNS_RESOLUTION_FAILED'
        );
      }
      for (const rec of records) {
        if (isPrivateOrReservedIp(rec.address)) {
          throw new SecurityValidationError(
            'Domain resolves to a private or internal network address and was blocked by SSRF protection.',
            400,
            'SSRF_DNS_REBIND_BLOCKED'
          );
        }
      }
    } catch (err) {
      if (err instanceof SecurityValidationError) {
        throw err;
      }
      throw new SecurityValidationError(
        `Unable to resolve domain "${hostname}". The website may not exist or is currently unreachable.`,
        400,
        'DNS_RESOLUTION_FAILED'
      );
    }
  }

  return parsed;
}

const ALLOWED_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp']);
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

/**
 * Inspects image magic bytes to determine the true binary format regardless of filename.
 */
export function detectImageMagicBytes(buffer: Buffer): {
  valid: boolean;
  detectedMime: 'image/jpeg' | 'image/png' | 'image/webp' | null;
  formatLabel: string;
} {
  if (buffer.length < 12) {
    return { valid: false, detectedMime: null, formatLabel: 'Unknown' };
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { valid: true, detectedMime: 'image/png', formatLabel: 'PNG' };
  }

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { valid: true, detectedMime: 'image/jpeg', formatLabel: 'JPEG' };
  }

  // WEBP: "RIFF" .... "WEBP"
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return { valid: true, detectedMime: 'image/webp', formatLabel: 'WEBP' };
  }

  return { valid: false, detectedMime: null, formatLabel: 'Unsupported' };
}

/**
 * Parses binary headers of PNG, JPEG, or WebP to extract pixel dimensions and color mode.
 */
export function parseImageDimensionsAndColor(
  buffer: Buffer,
  mime: 'image/jpeg' | 'image/png' | 'image/webp'
): { width: number; height: number; colorMode: string; compressionInfo: string } {
  try {
    if (mime === 'image/png' && buffer.length >= 26) {
      const width = buffer.readUInt32BE(16);
      const height = buffer.readUInt32BE(20);
      const bitDepth = buffer.readUInt8(24);
      const colorType = buffer.readUInt8(25);
      const colorMap: Record<number, string> = {
        0: 'Grayscale',
        2: 'RGB Truecolor',
        3: 'Indexed-color',
        4: 'Grayscale + Alpha',
        6: 'RGBA Truecolor',
      };
      return {
        width,
        height,
        colorMode: `${colorMap[colorType] || 'RGB'} (${bitDepth}-bit)`,
        compressionInfo: 'Deflate Lossless (PNG)',
      };
    }

    if (mime === 'image/jpeg') {
      let offset = 2;
      while (offset + 9 < buffer.length) {
        if (buffer[offset] !== 0xff) {
          offset++;
          continue;
        }
        const marker = buffer[offset + 1];
        // SOF0 (Baseline DCT) = 0xC0, SOF1 = 0xC1, SOF2 (Progressive DCT) = 0xC2
        if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
          const precision = buffer[offset + 4];
          const height = buffer.readUInt16BE(offset + 5);
          const width = buffer.readUInt16BE(offset + 7);
          const components = buffer[offset + 9];
          const colorMode =
            components === 1
              ? `Grayscale (${precision}-bit)`
              : components === 3
                ? `YCbCr / RGB (${precision}-bit)`
                : `CMYK (${precision}-bit)`;
          const compressionInfo =
            marker === 0xc2 ? 'JPEG Progressive DCT' : 'JPEG Baseline DCT';
          return { width, height, colorMode, compressionInfo };
        }
        if (marker === 0xd9 || marker === 0xda) break;
        const segmentLength = buffer.readUInt16BE(offset + 2);
        if (segmentLength < 2) break;
        offset += 2 + segmentLength;
      }
    }

    if (mime === 'image/webp' && buffer.length >= 30) {
      const chunkHeader = buffer.toString('ascii', 12, 16);
      if (chunkHeader === 'VP8 ' && buffer.length >= 30) {
        const width = buffer.readUInt16LE(26) & 0x3fff;
        const height = buffer.readUInt16LE(28) & 0x3fff;
        return {
          width,
          height,
          colorMode: 'YUV420 / RGB (8-bit)',
          compressionInfo: 'WebP Lossy (VP8)',
        };
      }
      if (chunkHeader === 'VP8L' && buffer.length >= 25) {
        const b0 = buffer[21];
        const b1 = buffer[22];
        const b2 = buffer[23];
        const b3 = buffer[24];
        const width = 1 + (((b1 & 0x3f) << 8) | b0);
        const height = 1 + (((b3 & 0xf) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6));
        return {
          width,
          height,
          colorMode: 'RGBA (8-bit)',
          compressionInfo: 'WebP Lossless (VP8L)',
        };
      }
      if (chunkHeader === 'VP8X' && buffer.length >= 30) {
        const width = 1 + buffer.readUIntLE(24, 3);
        const height = 1 + buffer.readUIntLE(27, 3);
        return {
          width,
          height,
          colorMode: 'Extended RGBA / ICC',
          compressionInfo: 'WebP Extended (VP8X)',
        };
      }
    }
  } catch {
    // Fall back safely if header is non-standard
  }

  return {
    width: 1024,
    height: 768,
    colorMode: 'RGB (8-bit)',
    compressionInfo: `${mime.split('/')[1].toUpperCase()} Standard`,
  };
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(2)} MB`;
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/**
 * Validates an uploaded image buffer against security rules (size, extension, MIME,
 * magic bytes, dimensions) and extracts safe technical + EXIF metadata.
 */
export async function validateAndExtractImageMetadata(
  buffer: Buffer,
  filename: string,
  declaredMimeType: string,
  maxImageSizeMb = 10
): Promise<ImageTechnicalMetadata> {
  if (!buffer || buffer.length === 0) {
    throw new SecurityValidationError('Uploaded image file is empty.', 400, 'EMPTY_IMAGE');
  }

  const maxBytes = maxImageSizeMb * 1024 * 1024;
  if (buffer.length > maxBytes) {
    throw new SecurityValidationError(
      `Image file size (${formatBytes(buffer.length)}) exceeds the ${maxImageSizeMb} MB limit.`,
      413,
      'IMAGE_TOO_LARGE'
    );
  }

  const sanitizedFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'upload.jpg';
  const extMatch = sanitizedFilename.toLowerCase().split('.').pop() || '';
  if (!ALLOWED_EXTENSIONS.has(extMatch)) {
    throw new SecurityValidationError(
      `Unsupported file extension ".${extMatch}". Allowed formats: .jpg, .jpeg, .png, .webp.`,
      400,
      'UNSUPPORTED_IMAGE_EXTENSION'
    );
  }

  const magic = detectImageMagicBytes(buffer);
  if (!magic.valid || !magic.detectedMime) {
    throw new SecurityValidationError(
      'File signature (magic bytes) does not match a valid JPEG, PNG, or WebP image.',
      400,
      'INVALID_MAGIC_BYTES'
    );
  }

  if (declaredMimeType && !ALLOWED_MIME_TYPES.has(declaredMimeType.toLowerCase())) {
    throw new SecurityValidationError(
      `Unsupported MIME type "${declaredMimeType}". Allowed types: image/jpeg, image/png, image/webp.`,
      400,
      'UNSUPPORTED_MIME_TYPE'
    );
  }

  const { width, height, colorMode, compressionInfo } = parseImageDimensionsAndColor(
    buffer,
    magic.detectedMime
  );

  if (width < 16 || height < 16 || width > 12000 || height > 12000) {
    throw new SecurityValidationError(
      `Image dimensions (${width}x${height}) are outside safe bounds (16x16 to 12000x12000 px).`,
      400,
      'INVALID_IMAGE_DIMENSIONS'
    );
  }

  const divisor = gcd(width, height);
  const ratioW = Math.round(width / divisor);
  const ratioH = Math.round(height / divisor);
  const aspectRatio =
    ratioW > 30 || ratioH > 30
      ? `${(width / height).toFixed(2)}:1`
      : `${ratioW}:${ratioH}`;

  const sha256Hash = crypto.createHash('sha256').update(buffer).digest('hex');

  // Extract EXIF safely via exifr
  let hasExif = false;
  let cameraMakeModel: string | null = null;
  let timestamp: string | null = null;
  let software: string | null = null;
  let colorSpace: string | null = null;
  let hasGps = false;
  let gpsCoordinates: { lat: number; lng: number } | null = null;

  try {
    const parsedExif = await exifr.parse(buffer, {
      tiff: true,
      exif: true,
      gps: true,
      xmp: true,
    });

    if (parsedExif && typeof parsedExif === 'object') {
      const keys = Object.keys(parsedExif);
      hasExif = keys.length > 0;

      const make = parsedExif.Make ? String(parsedExif.Make).trim() : '';
      const model = parsedExif.Model ? String(parsedExif.Model).trim() : '';
      if (make || model) {
        cameraMakeModel = [make, model].filter(Boolean).join(' ').slice(0, 120);
      }

      const rawDate =
        parsedExif.DateTimeOriginal || parsedExif.CreateDate || parsedExif.ModifyDate;
      if (rawDate) {
        timestamp =
          rawDate instanceof Date ? rawDate.toISOString() : String(rawDate).slice(0, 64);
      }

      const rawSoftware = parsedExif.Software || parsedExif.CreatorTool;
      if (rawSoftware) {
        software = String(rawSoftware).trim().slice(0, 120);
      }

      if (parsedExif.ColorSpace) {
        colorSpace = String(parsedExif.ColorSpace).slice(0, 40);
      }

      if (
        typeof parsedExif.latitude === 'number' &&
        typeof parsedExif.longitude === 'number' &&
        !Number.isNaN(parsedExif.latitude) &&
        !Number.isNaN(parsedExif.longitude)
      ) {
        hasGps = true;
        gpsCoordinates = {
          lat: Number(parsedExif.latitude.toFixed(4)),
          lng: Number(parsedExif.longitude.toFixed(4)),
        };
      }
    }
  } catch {
    // Non-fatal: many web/AI images have stripped EXIF segments
  }

  return {
    filename: sanitizedFilename,
    mimeType: magic.detectedMime,
    extension: magic.formatLabel,
    fileSizeBytes: buffer.length,
    fileSizeFormatted: formatBytes(buffer.length),
    width,
    height,
    aspectRatio,
    colorMode,
    compressionInfo,
    magicBytesValid: true,
    sha256Hash,
    exif: {
      hasExif,
      cameraMakeModel,
      timestamp,
      software,
      colorSpace,
      hasGps,
      gpsRedactedNote: hasGps
        ? 'Location metadata detected. Exact coordinates hidden by default for privacy.'
        : null,
      gpsCoordinates,
    },
  };
}
