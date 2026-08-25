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

function cleanString(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
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

export function createZoteroCitekeyLink(item: Record<string, any>): string {
  const citekey = getCitekey(item);
  if (!citekey) return '';

  const label = `@${citekey}`;
  const target =
    getPdfReaderTarget(item) ||
    getMarkdownLinkTarget(item.zoteroURL) ||
    getMarkdownLinkTarget(item.url) ||
    getMarkdownLinkTarget(item.zoteroURI) ||
    getMarkdownLinkTarget(item.desktopURI);

  return target ? `[${label}](${target})` : label;
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
