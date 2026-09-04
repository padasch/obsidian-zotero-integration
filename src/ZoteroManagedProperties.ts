import type { ZoteroManagedUserRelevance } from './types';

export type AnnotationColor =
  | 'Yellow'
  | 'Red'
  | 'Green'
  | 'Blue'
  | 'Purple'
  | 'Magenta'
  | 'Orange'
  | 'Gray';

export const ZOTERO_ANNOTATION_COLORS: AnnotationColor[] = [
  'Yellow',
  'Red',
  'Green',
  'Blue',
  'Purple',
  'Magenta',
  'Orange',
  'Gray',
];

export const ZOTERO_ANNOTATION_COLOR_HEX: Record<AnnotationColor, string> = {
  Yellow: '#ffd400',
  Red: '#ff6666',
  Green: '#5fb236',
  Blue: '#2ea8e5',
  Purple: '#a28ae5',
  Magenta: '#e56eee',
  Orange: '#f19837',
  Gray: '#aaaaaa',
};

export const ZOTERO_RELEVANCE_VALUES: ZoteroManagedUserRelevance[] = [
  'no',
  'low',
  'medium',
  'high',
];

// Intentionally strips control characters that can break YAML frontmatter.
/* eslint-disable no-control-regex */
const FRONTMATTER_CONTROL_CHARS =
  /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\ufeff]/g;
/* eslint-enable no-control-regex */
const FRONTMATTER_LINEBREAK_CHARS = /[\r\n\t\u0085\u2028\u2029]+/g;

function cleanString(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

export function sanitizeFrontmatterString(value: unknown): string {
  return cleanString(value)
    .replace(/\\/g, '')
    .replace(FRONTMATTER_LINEBREAK_CHARS, ' ')
    .replace(FRONTMATTER_CONTROL_CHARS, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function normalizeZoteroRelevance(
  value: unknown
): ZoteroManagedUserRelevance {
  const cleaned = sanitizeFrontmatterString(value).toLocaleLowerCase();
  return ZOTERO_RELEVANCE_VALUES.includes(
    cleaned as ZoteroManagedUserRelevance
  )
    ? (cleaned as ZoteroManagedUserRelevance)
    : 'no';
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object') return false;
  return Object.getPrototypeOf(value) === Object.prototype;
}

export function sanitizeFrontmatterValue<T>(value: T): T {
  if (typeof value === 'string') {
    return sanitizeFrontmatterString(value) as T;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeFrontmatterValue(entry)) as T;
  }

  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        sanitizeFrontmatterValue(entry),
      ])
    ) as T;
  }

  return value;
}

function isEmptyStatus(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (Array.isArray(value)) return value.length === 0;
  return String(value).trim() === '';
}

function getCitekey(item: Record<string, any>): string {
  return cleanString(
    item.citationKey ||
      item.citekey ||
      item['citation-key'] ||
      item.zoteroCitekey ||
      item.key
  ).replace(/^@+/, '');
}

export function getMarkdownLinkTarget(value: unknown): string {
  const text = cleanString(value);
  if (!text || /^no pdf available$/i.test(text)) return '';

  const match = text.match(/^\[[^\]]*]\(([^)]+)\)$/);
  return (match ? match[1] : text).trim();
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (match, hex) => {
      const codePoint = parseInt(hex, 16);
      return codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : match;
    })
    .replace(/&#(\d+);/g, (match, code) => {
      const codePoint = parseInt(code, 10);
      return codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : match;
    });
}

export function plainCitation(value: unknown): string {
  return decodeHtmlEntities(cleanString(value))
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/(div|p|li|tr|h[1-6])>/gi, ' ')
    .replace(/!\[([^\]]*)]\(([^)]*)\)/g, (_, label, target) =>
      cleanString(label) || cleanString(target)
    )
    .replace(/\[([^\]]*)]\(([^)]*)\)/g, (_, label, target) =>
      cleanString(label) || cleanString(target)
    )
    .replace(/<[^>]+>/g, '')
    .replace(/\\([\\`*_{}[\]()#+\-.!|>])/g, '$1')
    .replace(/[`*_]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function createZoteroCitation(item: Record<string, any>): string {
  return plainCitation(item.bibliography || item.zoteroCitation);
}

export function applyZoteroOwnedFrontmatterProperties(
  frontmatter: Record<string, any>,
  item: Record<string, any>,
  labelMode: 'citekey' | 'emoji' = 'citekey'
) {
  const zoteroCitekeyLink = createZoteroCitekeyLink(item, labelMode);

  if (zoteroCitekeyLink) {
    frontmatter.zoteroCitekeyLink =
      sanitizeFrontmatterString(zoteroCitekeyLink);
  }

  frontmatter.zoteroCitation = sanitizeFrontmatterString(
    createZoteroCitation(item)
  );
}

function getPdfReaderTarget(item: Record<string, any>): string {
  const direct =
    getMarkdownLinkTarget(item.pdfZoteroLink) ||
    getMarkdownLinkTarget(item.zoteroReader);
  if (direct) return direct;

  const attachments = Array.isArray(item.attachments) ? item.attachments : [];
  const pdf = attachments.find((attachment) =>
    cleanString(attachment?.path).toLocaleLowerCase().endsWith('.pdf')
  );

  if (!pdf) return '';

  return (
    getMarkdownLinkTarget(pdf.pdfURI) ||
    getMarkdownLinkTarget(pdf.pdfZoteroLink) ||
    getMarkdownLinkTarget(pdf.desktopURI)
  );
}

export function createZoteroCitekeyLink(
  item: Record<string, any>,
  labelMode: 'citekey' | 'emoji' = 'citekey'
): string {
  const citekey = getCitekey(item);
  if (!citekey) return '';

  const citekeyLabel = `@${citekey}`;
  const label = labelMode === 'emoji' ? '\u{1F4C4}' : citekeyLabel;
  const target =
    getPdfReaderTarget(item) ||
    getMarkdownLinkTarget(item.zoteroURL) ||
    getMarkdownLinkTarget(item.url) ||
    getMarkdownLinkTarget(item.zoteroURI) ||
    getMarkdownLinkTarget(item.desktopURI);

  return target ? `[${label}](${target})` : citekeyLabel;
}

export function sortFrontmatterProperties(frontmatter: Record<string, any>) {
  const sortedKeys = Object.keys(frontmatter).sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: 'base' })
  );
  const sortedValues: Record<string, any> = {};

  for (const key of sortedKeys) {
    sortedValues[key] = frontmatter[key];
  }

  for (const key of Object.keys(frontmatter)) {
    delete frontmatter[key];
  }

  for (const key of sortedKeys) {
    frontmatter[key] = sortedValues[key];
  }
}

function quoteYamlScalar(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function isAlreadyQuotedYamlScalar(value: string): boolean {
  return (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  );
}

function unquoteYamlScalar(value: string): string | null {
  if (!isAlreadyQuotedYamlScalar(value)) return null;

  const inner = value.slice(1, -1);
  if (value.startsWith("'")) {
    return inner.replace(/''/g, "'");
  }

  return inner.replace(/\\"/g, '"');
}

function isYamlTypedScalar(value: string): boolean {
  const lower = value.toLocaleLowerCase();
  return (
    lower === 'true' ||
    lower === 'false' ||
    lower === 'null' ||
    /^[-+]?\d+(\.\d+)?$/.test(value) ||
    /^\d{4}-\d{2}-\d{2}(t\d{2}:\d{2}(:\d{2})?)?/i.test(value)
  );
}

function isYamlCollectionLiteral(value: string): boolean {
  return (
    (value.startsWith('[') && value.endsWith(']')) ||
    (value.startsWith('{') && value.endsWith('}'))
  );
}

function needsYamlQuotes(value: string): boolean {
  if (!value) return false;
  if (isAlreadyQuotedYamlScalar(value)) return false;
  if (isYamlTypedScalar(value)) return false;
  if (isYamlCollectionLiteral(value)) return false;
  if (value === '|' || value === '>') return false;

  return (
    /^[-?:]\s/.test(value) ||
    /:\s/.test(value) ||
    /\s#/.test(value) ||
    /^[#&*!%@`>|'",[\]{},]/.test(value)
  );
}

function sanitizeRenderedYamlValue(value: string): string {
  const unquoted = unquoteYamlScalar(value.trim());
  if (unquoted !== null) {
    return quoteYamlScalar(sanitizeFrontmatterString(unquoted));
  }

  const sanitized = sanitizeFrontmatterString(value);
  return needsYamlQuotes(sanitized) ? quoteYamlScalar(sanitized) : sanitized;
}

function sanitizeRenderedFrontmatterLine(line: string): string {
  if (!line.trim() || /^\s*#/.test(line)) return line;

  const listItemMatch = line.match(/^(\s*-\s+)(.*)$/);
  if (listItemMatch) {
    return `${listItemMatch[1]}${sanitizeRenderedYamlValue(listItemMatch[2])}`;
  }

  const propertyMatch = line.match(/^(\s*[^:#][^:]*:\s*)(.*)$/);
  if (propertyMatch) {
    return `${propertyMatch[1]}${sanitizeRenderedYamlValue(propertyMatch[2])}`;
  }

  const indent = line.match(/^\s*/)?.[0] || '';
  return `${indent}${sanitizeFrontmatterString(line.slice(indent.length))}`;
}

export function sanitizeRenderedFrontmatter(markdown: string): string {
  const lines = markdown.split(/\r?\n/);
  if (lines[0]?.trim() !== '---') return markdown;

  const closingIndex = lines.findIndex(
    (line, index) => index > 0 && line.trim() === '---'
  );
  if (closingIndex < 0) return markdown;

  const sanitizedFrontmatter = lines
    .slice(1, closingIndex)
    .map(sanitizeRenderedFrontmatterLine);

  return [
    '---',
    ...sanitizedFrontmatter,
    '---',
    ...lines.slice(closingIndex + 1),
  ].join('\n');
}

export function getAnnotationCount(templateData: Record<string, any>): number {
  const annotations = templateData.annotations;
  return Array.isArray(annotations) ? annotations.length : 0;
}

export function applyAnnotatedStatusFromAnnotations(
  frontmatter: Record<string, any>,
  templateData: Record<string, any>
) {
  if (getAnnotationCount(templateData) <= 0) return;

  const status = frontmatter.zoteroStatus;
  if (isEmptyStatus(status) || cleanString(status).toLocaleLowerCase() === 'new') {
    frontmatter.zoteroStatus = 'annotated';
  }
}
