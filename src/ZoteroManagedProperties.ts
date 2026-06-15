import type { App, TFile } from 'obsidian';

import {
  ExportFormat,
  ZoteroConnectorSettings,
  ZoteroManagedUserProperties,
} from './types';
import {
  SCITE_MANAGED_PROPERTY_KEYS,
  getSciteManagedPropertiesForDoi,
  normalizeSciteSettings,
} from './scite';
import {
  getItemCollectionPaths,
  getItemTags,
  getZoteroItemCitekey,
  getZoteroItemKey,
} from './ZoteroMonitor.helpers';
import { getLocalURI } from './bbt/helpers';

export const ZOTERO_ANNOTATION_COLORS = [
  'Yellow',
  'Red',
  'Green',
  'Blue',
  'Purple',
  'Magenta',
  'Orange',
  'Gray',
] as const;

export type ZoteroAnnotationColor = (typeof ZOTERO_ANNOTATION_COLORS)[number];

export const ZOTERO_ANNOTATION_COLOR_HEX: Record<
  ZoteroAnnotationColor,
  string
> = {
  Yellow: '#ffd400',
  Red: '#ff6666',
  Green: '#5fb236',
  Blue: '#2ea8e5',
  Purple: '#a28ae5',
  Magenta: '#e56eee',
  Orange: '#f19837',
  Gray: '#aaaaaa',
};

export const DEFAULT_ZOTERO_PRESERVED_PROPERTIES = [
  'zoteroProject',
  'zoteroTopic',
  'zoteroNote',
  'zoteroSummary',
  'zoteroStatus',
];

export const DEFAULT_ZOTERO_TASK_ANNOTATION_COLORS: ZoteroAnnotationColor[] = [
  'Purple',
  'Magenta',
  'Gray',
];

export const ZOTERO_NO_PDF_PLACEHOLDER = 'no pdf available';
export const DEFAULT_ZOTERO_IMAGE_OUTPUT_PATH_TEMPLATE = 'images/';
export const DEFAULT_ZOTERO_IMAGE_BASE_NAME_TEMPLATE = '@{{citekey}}-image';

const DEFAULT_USER_PROPERTIES: Required<ZoteroManagedUserProperties> = {
  zoteroProject: [],
  zoteroTopic: [],
  zoteroNote: '',
  zoteroSummary: '',
  zoteroStatus: 'new',
};

const MANAGED_ZOTERO_PROPERTY_KEYS = [
  'zoteroCitekey',
  'zoteroAbstract',
  'zoteroLibraryID',
  'zoteroItemKey',
  'zoteroTitle',
  'zoteroYear',
  'zoteroType',
  'zoteroAuthors',
  'zoteroPublication',
  'zoteroDOI',
  'zoteroURL',
  'zoteroURI',
  'zoteroPDF',
  'zoteroReader',
  'zoteroDateAdded',
  'zoteroDateModified',
  'zoteroTags',
  'zoteroCollections',
  'zoteroAnnotationCount',
  'zoteroOpenTasks',
  'zoteroOpenTaskCount',
];

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

function cleanString(value: any): string {
  return String(value || '').trim();
}

function cleanSingleLineString(value: any): string | undefined {
  const cleaned = cleanString(value)
    .replace(/\s*(\r\n|\r|\n)\s*/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim();

  return cleaned || undefined;
}

function cleanStringList(value: any): string[] {
  if (!Array.isArray(value)) return [];

  return unique(value.map(cleanString).filter((item) => !!item));
}

function isValidZoteroAnnotationColor(
  value: string
): value is ZoteroAnnotationColor {
  return (ZOTERO_ANNOTATION_COLORS as readonly string[]).includes(value);
}

export function normalizePreservedProperties(value: any): string[] {
  if (!Array.isArray(value)) return DEFAULT_ZOTERO_PRESERVED_PROPERTIES;
  return cleanStringList(value);
}

export function normalizeTaskAnnotationColors(
  value: any
): ZoteroAnnotationColor[] {
  if (!Array.isArray(value)) return DEFAULT_ZOTERO_TASK_ANNOTATION_COLORS;

  return cleanStringList(value).filter(isValidZoteroAnnotationColor);
}

export function normalizeExportFormatOutputPaths(
  value: ExportFormat[]
): ExportFormat[] {
  return value.map((format) => {
    const next = { ...format };

    if (next.outputPathTemplate?.trim() === '{{citekey}}.md') {
      next.outputPathTemplate = '@{{citekey}}.md';
    }

    if (
      ['{{citekey}}/', 'images/{{citekey}}/'].includes(
        next.imageOutputPathTemplate?.trim()
      )
    ) {
      next.imageOutputPathTemplate = DEFAULT_ZOTERO_IMAGE_OUTPUT_PATH_TEMPLATE;
    }

    if (
      !next.imageBaseNameTemplate ||
      next.imageBaseNameTemplate.trim() === 'image'
    ) {
      next.imageBaseNameTemplate = DEFAULT_ZOTERO_IMAGE_BASE_NAME_TEMPLATE;
    }

    return next;
  });
}

export function normalizeManagedImportSettings(
  settings: ZoteroConnectorSettings
): ZoteroConnectorSettings {
  return normalizeSciteSettings({
    ...settings,
    exportFormats: normalizeExportFormatOutputPaths(
      settings.exportFormats || []
    ),
    zoteroPreservedProperties: normalizePreservedProperties(
      settings.zoteroPreservedProperties
    ),
    zoteroTaskAnnotationColors: normalizeTaskAnnotationColors(
      settings.zoteroTaskAnnotationColors
    ),
  });
}

function getDateProperty(value: any): string | undefined {
  if (!value) return undefined;

  if (typeof value.toISOString === 'function') {
    return value.toISOString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  return String(value);
}

function getYear(value: any): string | undefined {
  if (!value) return undefined;

  if (typeof value.format === 'function') {
    const year = value.format('YYYY');
    return year === 'Invalid date' ? undefined : year;
  }

  const match = String(value).match(/\b(1\d{3}|2\d{3})\b/);
  return match?.[1];
}

function getCreatorName(creator: any): string {
  if (creator?.name) return cleanString(creator.name);

  return [creator?.firstName, creator?.lastName]
    .map(cleanString)
    .filter((part) => !!part)
    .join(' ');
}

function getAuthors(item: any): string[] {
  const creators = Array.isArray(item?.creators) ? item.creators : [];
  const authors = creators.filter((creator: any) =>
    ['author', 'podcaster', 'director'].includes(creator?.creatorType)
  );
  const selected = authors.length ? authors : creators;

  return unique(selected.map(getCreatorName).filter((name: string) => !!name));
}

function getPublication(item: any): string | undefined {
  return [
    item?.publicationTitle,
    item?.journalAbbreviation,
    item?.bookTitle,
    item?.conferenceName,
    item?.proceedingsTitle,
    item?.websiteTitle,
    item?.publisher,
  ]
    .map(cleanString)
    .find((value) => !!value);
}

function attachmentString(attachment: any): string {
  return [
    attachment?.path,
    attachment?.localPath,
    attachment?.attachmentPath,
    attachment?.filename,
    attachment?.title,
    attachment?.contentType,
    attachment?.mimeType,
  ]
    .map(cleanString)
    .join(' ')
    .toLocaleLowerCase();
}

function isPdfAttachment(attachment: any): boolean {
  const searchable = attachmentString(attachment);
  return Boolean(
    attachment?.pdfURI ||
      attachment?.readerURI ||
      searchable.includes('application/pdf') ||
      searchable.includes('.pdf')
  );
}

function getPdfAttachment(item: any): any {
  const attachments = Array.isArray(item?.attachments) ? item.attachments : [];
  return attachments.find(isPdfAttachment);
}

function getLocalPdfLink(item: any): string | undefined {
  const pdf = getPdfAttachment(item);
  const path = cleanString(pdf?.path || pdf?.localPath || pdf?.attachmentPath);
  if (!path) return undefined;
  if (/^[a-z]+:\/\//i.test(path)) return path;

  return `file://${encodeURI(path)}`;
}

function getMarkdownLink(target: any, label: string): string | undefined {
  const uri = cleanString(target);
  if (!uri) return undefined;

  return `[${label}](${uri})`;
}

function selectUriToReaderUri(value: any): string | undefined {
  const uri = cleanString(value);
  if (!uri) return undefined;

  if (uri.startsWith('zotero://open-pdf/')) return uri;
  if (uri.startsWith('zotero://select/')) {
    return uri.replace('zotero://select/', 'zotero://open-pdf/');
  }
  if (uri.startsWith('http://zotero.org/')) {
    return getLocalURI('open-pdf', uri);
  }

  return undefined;
}

function getReaderUri(item: any): string | undefined {
  const pdf = getPdfAttachment(item);
  if (!pdf) return undefined;

  const directReaderUri = [
    pdf?.pdfURI,
    pdf?.readerURI,
    pdf?.annotationReaderURI,
  ]
    .map((uri) => selectUriToReaderUri(uri) || cleanString(uri))
    .find((uri) => !!uri);
  if (directReaderUri) return directReaderUri;

  const derivedReaderUri =
    selectUriToReaderUri(pdf?.desktopURI) ||
    selectUriToReaderUri(pdf?.select) ||
    selectUriToReaderUri(pdf?.uri);
  if (derivedReaderUri) return derivedReaderUri;

  const attachmentKey = getZoteroItemKey(pdf);
  return attachmentKey
    ? `zotero://open-pdf/library/items/${attachmentKey}`
    : undefined;
}

function getLocalPdfProperty(item: any): string {
  return (
    getMarkdownLink(getLocalPdfLink(item), 'Local pdf') ||
    ZOTERO_NO_PDF_PLACEHOLDER
  );
}

function getReaderProperty(item: any): string {
  return (
    getMarkdownLink(getReaderUri(item), 'zotero reader') ||
    ZOTERO_NO_PDF_PLACEHOLDER
  );
}

function getAnnotations(item: any): any[] {
  const attachments = Array.isArray(item?.attachments) ? item.attachments : [];
  const attachmentAnnotations = attachments.flatMap((attachment: any) =>
    Array.isArray(attachment?.annotations) ? attachment.annotations : []
  );

  if (attachmentAnnotations.length) return attachmentAnnotations;
  return Array.isArray(item?.annotations) ? item.annotations : [];
}

function getOpenTaskCount(item: any, settings: ZoteroConnectorSettings): number {
  const taskColors = normalizeTaskAnnotationColors(
    settings.zoteroTaskAnnotationColors
  );
  if (!taskColors.length) return 0;

  const validColors = new Set(taskColors);
  return getAnnotations(item).filter((annotation) =>
    validColors.has(annotation?.colorCategory)
  ).length;
}

function removeEmptyManagedValue(
  frontmatter: Record<string, any>,
  key: string,
  value: any
) {
  if (
    value === undefined ||
    value === null ||
    value === '' ||
    (Array.isArray(value) && value.length === 0)
  ) {
    delete frontmatter[key];
    return;
  }

  frontmatter[key] = value;
}

function getAliases(frontmatter: Record<string, any>): string[] {
  const aliases = frontmatter.aliases;

  if (Array.isArray(aliases)) {
    return aliases.map(cleanString).filter((alias) => !!alias);
  }

  const alias = cleanString(aliases);
  return alias ? [alias] : [];
}

function mergeAliases(
  frontmatter: Record<string, any>,
  item: any,
  previousFrontmatter?: Record<string, any>
) {
  const citekey = getZoteroItemCitekey(item);
  const title = cleanString(item?.title);
  const managedAlias = citekey && title ? `@${citekey}: ${title}` : '';

  if (!managedAlias) return;

  const oldManagedAliases = new Set(
    [citekey ? `@${citekey}` : '', title, managedAlias].filter(
      (alias) => !!alias
    )
  );
  const existingAliases = [
    ...getAliases(previousFrontmatter || {}),
    ...getAliases(frontmatter),
  ].filter((alias) => !oldManagedAliases.has(alias));

  frontmatter.aliases = unique([...existingAliases, managedAlias]);
}

function isEmptyFrontmatterValue(value: any): boolean {
  return (
    value === undefined ||
    value === null ||
    value === '' ||
    (Array.isArray(value) && value.length === 0)
  );
}

function getUserPropertyDefaults(
  properties?: ZoteroManagedUserProperties
): Required<ZoteroManagedUserProperties> {
  return {
    zoteroProject: properties?.zoteroProject || DEFAULT_USER_PROPERTIES.zoteroProject,
    zoteroTopic: properties?.zoteroTopic || DEFAULT_USER_PROPERTIES.zoteroTopic,
    zoteroNote:
      properties?.zoteroNote === undefined
        ? DEFAULT_USER_PROPERTIES.zoteroNote
        : properties.zoteroNote,
    zoteroSummary:
      properties?.zoteroSummary === undefined
        ? DEFAULT_USER_PROPERTIES.zoteroSummary
        : properties.zoteroSummary,
    zoteroStatus:
      properties?.zoteroStatus === undefined
        ? DEFAULT_USER_PROPERTIES.zoteroStatus
        : properties.zoteroStatus,
  };
}

function sortFrontmatterProperties(frontmatter: Record<string, any>) {
  const sorted = Object.entries(frontmatter).sort(([a], [b]) =>
    a.localeCompare(b, undefined, { sensitivity: 'base' })
  );

  for (const key of Object.keys(frontmatter)) {
    delete frontmatter[key];
  }

  for (const [key, value] of sorted) {
    frontmatter[key] = value;
  }
}

export function buildManagedZoteroProperties(
  item: any,
  settings: ZoteroConnectorSettings,
  sciteProperties?: Record<string, any>
): Record<string, any> {
  const citekey = getZoteroItemCitekey(item);
  const annotations = getAnnotations(item);
  const openTaskCount = getOpenTaskCount(item, settings);

  return {
    zoteroCitekey: citekey,
    zoteroAbstract: cleanSingleLineString(item?.abstractNote),
    zoteroLibraryID: item?.libraryID,
    zoteroItemKey: getZoteroItemKey(item),
    zoteroTitle: item?.title,
    zoteroYear: getYear(item?.date || item?.dateAdded),
    zoteroType: item?.itemType,
    zoteroAuthors: getAuthors(item),
    zoteroPublication: getPublication(item),
    zoteroDOI: item?.DOI || item?.doi,
    zoteroURL: getMarkdownLink(item?.url, 'weblink'),
    zoteroURI: getMarkdownLink(
      item?.desktopURI || item?.select || item?.uri,
      'zotero item'
    ),
    zoteroPDF: getLocalPdfProperty(item),
    zoteroReader: getReaderProperty(item),
    zoteroDateAdded: getDateProperty(item?.dateAdded),
    zoteroDateModified: getDateProperty(item?.dateModified),
    zoteroTags: getItemTags(item),
    zoteroCollections: getItemCollectionPaths(item),
    zoteroAnnotationCount: annotations.length,
    zoteroOpenTasks: openTaskCount > 0,
    zoteroOpenTaskCount: openTaskCount,
    ...(sciteProperties || {}),
  };
}

export function applyManagedZoteroFrontmatter(
  frontmatter: Record<string, any>,
  item: any,
  settings: ZoteroConnectorSettings,
  properties?: ZoteroManagedUserProperties,
  previousFrontmatter?: Record<string, any>,
  sciteProperties?: Record<string, any>
) {
  const managed = buildManagedZoteroProperties(item, settings, sciteProperties);

  for (const key of MANAGED_ZOTERO_PROPERTY_KEYS) {
    removeEmptyManagedValue(frontmatter, key, managed[key]);
  }

  if (sciteProperties) {
    for (const key of SCITE_MANAGED_PROPERTY_KEYS) {
      removeEmptyManagedValue(frontmatter, key, managed[key]);
    }
  }

  mergeAliases(frontmatter, item, previousFrontmatter);

  const preserved = normalizePreservedProperties(
    settings.zoteroPreservedProperties
  );
  const defaults = getUserPropertyDefaults(properties);

  for (const property of preserved) {
    if (!Object.prototype.hasOwnProperty.call(defaults, property)) continue;

    if (!isEmptyFrontmatterValue(previousFrontmatter?.[property])) {
      frontmatter[property] = previousFrontmatter![property];
      continue;
    }

    if (isEmptyFrontmatterValue(frontmatter[property])) {
      const value = defaults[property as keyof typeof defaults];
      frontmatter[property] = Array.isArray(value) ? value.slice() : value;
    }
  }

  sortFrontmatterProperties(frontmatter);
}

export async function writeManagedZoteroFrontmatter(
  app: App,
  file: TFile,
  item: any,
  settings: ZoteroConnectorSettings,
  properties?: ZoteroManagedUserProperties,
  previousFrontmatter?: Record<string, any>
) {
  const fileManager = (app as any).fileManager;
  if (!fileManager?.processFrontMatter) {
    console.warn(
      'Cannot write Zotero managed properties because this Obsidian version does not support processFrontMatter.'
    );
    return;
  }

  const sciteResult = await getSciteManagedPropertiesForDoi(
    item?.DOI || item?.doi,
    settings,
    previousFrontmatter
  );
  if (sciteResult.error) {
    console.warn('Unable to fetch scite citation metadata', sciteResult.error);
  }

  await fileManager.processFrontMatter(
    file,
    (frontmatter: Record<string, any>) => {
      applyManagedZoteroFrontmatter(
        frontmatter,
        item,
        settings,
        properties,
        previousFrontmatter,
        sciteResult.properties
      );
    }
  );
}

export async function writeSciteManagedFrontmatter(
  app: App,
  file: TFile,
  settings: ZoteroConnectorSettings,
  previousFrontmatter?: Record<string, any>,
  options: { force?: boolean } = {}
) {
  const fileManager = (app as any).fileManager;
  if (!fileManager?.processFrontMatter) {
    console.warn(
      'Cannot write scite managed properties because this Obsidian version does not support processFrontMatter.'
    );
    return { status: 'error' as const };
  }

  const sciteResult = await getSciteManagedPropertiesForDoi(
    previousFrontmatter?.zoteroDOI ||
      previousFrontmatter?.DOI ||
      previousFrontmatter?.doi,
    settings,
    previousFrontmatter,
    options
  );

  if (sciteResult.properties) {
    await fileManager.processFrontMatter(
      file,
      (frontmatter: Record<string, any>) => {
        for (const key of SCITE_MANAGED_PROPERTY_KEYS) {
          removeEmptyManagedValue(
            frontmatter,
            key,
            sciteResult.properties?.[key]
          );
        }
        sortFrontmatterProperties(frontmatter);
      }
    );
  }

  return sciteResult;
}
