import * as cheerio from 'cheerio';
import { UrlExtractedData } from '../types/analysis.ts';
import { SecurityValidationError, validateUrlForScraping } from './security.ts';

const MAX_RESPONSE_BYTES = 2.5 * 1024 * 1024; // 2.5 MB limit
const FETCH_TIMEOUT_MS = 8500;
const MAX_REDIRECTS = 3;

function parseDomainParts(hostname: string): {
  domain: string;
  subdomain: string;
  tld: string;
} {
  const parts = hostname.toLowerCase().split('.').filter(Boolean);
  if (parts.length <= 2) {
    return {
      domain: parts.join('.'),
      subdomain: 'none',
      tld: parts[parts.length - 1] || '',
    };
  }
  const tld = parts[parts.length - 1];
  const domain = `${parts[parts.length - 2]}.${tld}`;
  const subdomain = parts.slice(0, parts.length - 2).join('.');
  return { domain, subdomain, tld };
}

/**
 * Safely fetches a public URL with redirect validation, SSRF checks on every hop,
 * response size caps, timeout enforcement, and HTML content-type verification.
 */
async function safeFetchHtml(initialUrl: URL): Promise<{ html: string; finalUrl: URL }> {
  let currentUrl = initialUrl;

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(currentUrl.toString(), {
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'User-Agent': 'TruthLensAI-ContentVerifier/1.0 (+https://truthlens.ai/bot)',
          Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location) {
          throw new SecurityValidationError('Redirect response missing Location header.', 502, 'BAD_REDIRECT');
        }
        if (redirectCount === MAX_REDIRECTS) {
          throw new SecurityValidationError(
            `Maximum redirect limit (${MAX_REDIRECTS}) exceeded while fetching URL.`,
            400,
            'TOO_MANY_REDIRECTS'
          );
        }
        const nextUrlRaw = new URL(location, currentUrl).toString();
        currentUrl = await validateUrlForScraping(nextUrlRaw);
        continue;
      }

      if (!response.ok) {
        throw new SecurityValidationError(
          `Target website returned HTTP ${response.status} (${response.statusText || 'Unavailable'}).`,
          422,
          'WEBSITE_UNAVAILABLE'
        );
      }

      const contentType = (response.headers.get('content-type') || '').toLowerCase();
      if (
        contentType &&
        !contentType.includes('text/html') &&
        !contentType.includes('application/xhtml+xml') &&
        !contentType.includes('text/plain')
      ) {
        throw new SecurityValidationError(
          `Unsupported content-type "${contentType.split(';')[0]}". URL analysis requires a publicly accessible webpage (HTML).`,
          400,
          'INVALID_CONTENT_TYPE'
        );
      }

      const reader = response.body?.getReader();
      if (!reader) {
        const text = await response.text();
        return { html: text.slice(0, MAX_RESPONSE_BYTES), finalUrl: currentUrl };
      }

      const chunks: Uint8Array[] = [];
      let totalBytes = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          totalBytes += value.byteLength;
          if (totalBytes > MAX_RESPONSE_BYTES) {
            await reader.cancel();
            break;
          }
          chunks.push(value);
        }
      }

      const decoder = new TextDecoder('utf-8', { fatal: false });
      const combined = Buffer.concat(chunks);
      return { html: decoder.decode(combined), finalUrl: currentUrl };
    } catch (err: unknown) {
      if (err instanceof SecurityValidationError) {
        throw err;
      }
      if (err instanceof Error && err.name === 'AbortError') {
        throw new SecurityValidationError(
          `Request timed out after ${FETCH_TIMEOUT_MS / 1000} seconds while fetching webpage.`,
          504,
          'FETCH_TIMEOUT'
        );
      }
      throw new SecurityValidationError(
        'Website unavailable or blocked automated requests. Check the URL or try another page.',
        422,
        'FETCH_FAILED'
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new SecurityValidationError('Too many redirects.', 400, 'TOO_MANY_REDIRECTS');
}

/**
 * Extracts structured editorial, metadata, and heuristic content signals from a webpage.
 */
export async function extractUrlContent(rawUrl: string): Promise<UrlExtractedData> {
  const validatedUrl = await validateUrlForScraping(rawUrl);
  const { html, finalUrl } = await safeFetchHtml(validatedUrl);

  const $ = cheerio.load(html);

  // Extract JSON-LD / Schema.org before stripping scripts
  const schemaOrgTypes: string[] = [];
  let jsonLdAuthor = '';
  let jsonLdPublished = '';
  let jsonLdModified = '';

  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const rawJson = $(el).contents().text().trim();
      if (!rawJson) return;
      const parsed = JSON.parse(rawJson);
      const items = Array.isArray(parsed) ? parsed : parsed['@graph'] ? parsed['@graph'] : [parsed];
      for (const item of items) {
        if (item && typeof item === 'object') {
          if (item['@type']) {
            const types = Array.isArray(item['@type']) ? item['@type'] : [item['@type']];
            for (const t of types) {
              if (typeof t === 'string' && !schemaOrgTypes.includes(t)) {
                schemaOrgTypes.push(t);
              }
            }
          }
          if (!jsonLdAuthor && item.author) {
            if (typeof item.author === 'string') {
              jsonLdAuthor = item.author;
            } else if (Array.isArray(item.author) && item.author[0]?.name) {
              jsonLdAuthor = String(item.author[0].name);
            } else if (item.author.name) {
              jsonLdAuthor = String(item.author.name);
            }
          }
          if (!jsonLdPublished && item.datePublished) {
            jsonLdPublished = String(item.datePublished);
          }
          if (!jsonLdModified && item.dateModified) {
            jsonLdModified = String(item.dateModified);
          }
        }
      }
    } catch {
      // Ignore malformed JSON-LD blocks
    }
  });

  // Extract OpenGraph & Twitter Cards
  const openGraph: Record<string, string> = {};
  const twitterCard: Record<string, string> = {};

  $('meta').each((_, el) => {
    const prop = ($(el).attr('property') || '').toLowerCase().trim();
    const name = ($(el).attr('name') || '').toLowerCase().trim();
    const content = ($(el).attr('content') || '').trim();
    if (!content) return;

    if (prop.startsWith('og:') || prop.startsWith('article:')) {
      openGraph[prop] = content.slice(0, 300);
    }
    if (name.startsWith('twitter:') || prop.startsWith('twitter:')) {
      const key = name.startsWith('twitter:') ? name : prop;
      twitterCard[key] = content.slice(0, 300);
    }
  });

  const canonicalUrl =
    $('link[rel="canonical"]').attr('href')?.trim() || openGraph['og:url'] || null;

  const title = (
    $('title').first().text().trim() ||
    openGraph['og:title'] ||
    twitterCard['twitter:title'] ||
    $('h1').first().text().trim() ||
    'Untitled Page'
  ).slice(0, 300);

  const description = (
    $('meta[name="description"]').attr('content')?.trim() ||
    openGraph['og:description'] ||
    twitterCard['twitter:description'] ||
    ''
  ).slice(0, 600);

  const author = (
    $('meta[name="author"]').attr('content')?.trim() ||
    $('meta[property="article:author"]').attr('content')?.trim() ||
    $('[rel="author"]').first().text().trim() ||
    $('.author, .byline, [itemprop="author"]').first().text().trim() ||
    jsonLdAuthor ||
    'Unknown'
  )
    .replace(/\s+/g, ' ')
    .slice(0, 140);

  const publishedDate = (
    $('meta[property="article:published_time"]').attr('content')?.trim() ||
    $('meta[name="pubdate"]').attr('content')?.trim() ||
    $('time[datetime]').first().attr('datetime')?.trim() ||
    jsonLdPublished ||
    'Unavailable'
  ).slice(0, 80);

  const modifiedDate = (
    $('meta[property="article:modified_time"]').attr('content')?.trim() ||
    jsonLdModified ||
    'Unavailable'
  ).slice(0, 80);

  // Count images and external links before removing clutter
  const imageCount = $('img').length;
  let externalLinksCount = 0;
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') || '';
    if (href.startsWith('http://') || href.startsWith('https://')) {
      try {
        const u = new URL(href);
        if (u.hostname.toLowerCase() !== finalUrl.hostname.toLowerCase()) {
          externalLinksCount++;
        }
      } catch {
        // Ignore invalid href
      }
    }
  });

  // Remove script, style, nav, footer, aside for clean main text extraction
  $('script, style, noscript, iframe, svg, nav, footer, header, aside, form').remove();

  const paragraphs: string[] = [];
  $('article p, main p, p').each((_, el) => {
    const txt = $(el).text().replace(/\s+/g, ' ').trim();
    if (txt.length >= 40 && !paragraphs.includes(txt)) {
      paragraphs.push(txt);
    }
  });

  const fullText =
    paragraphs.length > 0
      ? paragraphs.join('\n\n')
      : $('body').text().replace(/\s+/g, ' ').trim();

  const words = fullText.split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  const mainTextPreview = fullText.slice(0, 3200);

  // Heuristic content signals & verbatim snippets
  const contentSignals: string[] = [];
  const textSnippets: string[] = [];

  if (finalUrl.protocol !== 'https:') {
    contentSignals.push('Insecure HTTP connection (no TLS encryption).');
  }
  if (author === 'Unknown' || !author) {
    contentSignals.push('Missing explicit author attribution or byline metadata.');
  }
  if (publishedDate === 'Unavailable' || !publishedDate) {
    contentSignals.push('Missing structured publication timestamp (article:published_time / JSON-LD).');
  }
  if (Object.keys(openGraph).length === 0 && schemaOrgTypes.length === 0) {
    contentSignals.push('Limited structured metadata (no OpenGraph or Schema.org JSON-LD tags detected).');
  }

  // Check sensational language or clickbait patterns in title and paragraphs
  const sensationalRegex =
    /\b(shocking|unbelievable|secret|exposed|miracle|you won't believe|mainstream media won't tell|100% proof|hoax|bombshell)\b/i;
  if (sensationalRegex.test(title)) {
    contentSignals.push('Headline contains sensational or emotionally charged phrasing.');
    textSnippets.push(`Headline: "${title}"`);
  }

  for (const p of paragraphs.slice(0, 12)) {
    if (sensationalRegex.test(p) && textSnippets.length < 4) {
      contentSignals.push('Body text includes high-arousal or sensationalist language patterns.');
      textSnippets.push(p.slice(0, 240));
    }
  }

  // Collect representative snippets if none matched sensational regex
  if (textSnippets.length === 0 && paragraphs.length > 0) {
    textSnippets.push(...paragraphs.slice(0, 3).map((p) => p.slice(0, 240)));
  }

  const { domain, subdomain, tld } = parseDomainParts(finalUrl.hostname);

  return {
    url: finalUrl.toString(),
    canonicalUrl,
    domain,
    subdomain,
    tld,
    isHttps: finalUrl.protocol === 'https:',
    title,
    description,
    author,
    publishedDate,
    modifiedDate,
    mainTextPreview,
    wordCount,
    imageCount,
    externalLinksCount,
    openGraph,
    twitterCard,
    schemaOrgTypes,
    contentSignals: Array.from(new Set(contentSignals)),
    textSnippets: textSnippets.slice(0, 4),
  };
}
