import type { ZoteroItemTableColumn, ZoteroMonitorItem } from './types';
import { getItemCollectionPaths, getItemTags } from './ZoteroMonitor.helpers';

type ColumnOption = {
  key: ZoteroItemTableColumn;
  label: string;
  className: string;
};

type ColumnAliasValue = ZoteroItemTableColumn | ZoteroItemTableColumn[];

export const DEFAULT_ZOTERO_ITEM_TABLE_COLUMNS: ZoteroItemTableColumn[] = [
  'title',
  'citekey',
  'dateAdded',
  'tags',
  'collections',
];

export const ZOTERO_ITEM_TABLE_COLUMN_OPTIONS: ColumnOption[] = [
  {
    key: 'title',
    label: 'Title',
    className: 'zt-monitor-table-title-cell',
  },
  {
    key: 'citekey',
    label: 'Citekey',
    className: 'zt-monitor-table-citekey',
  },
  {
    key: 'creators',
    label: 'Creators',
    className: 'zt-monitor-table-creators',
  },
  {
    key: 'year',
    label: 'Year',
    className: 'zt-monitor-table-year',
  },
  {
    key: 'date',
    label: 'Date',
    className: 'zt-monitor-table-date',
  },
  {
    key: 'publication',
    label: 'Publication',
    className: 'zt-monitor-table-publication',
  },
  {
    key: 'publisher',
    label: 'Publisher',
    className: 'zt-monitor-table-publisher',
  },
  {
    key: 'itemType',
    label: 'Type',
    className: 'zt-monitor-table-type',
  },
  {
    key: 'library',
    label: 'Library',
    className: 'zt-monitor-table-library',
  },
  {
    key: 'dateModified',
    label: 'Modified',
    className: 'zt-monitor-table-date',
  },
  {
    key: 'dateAdded',
    label: 'Added',
    className: 'zt-monitor-table-date',
  },
  {
    key: 'tags',
    label: 'Tags',
    className: 'zt-monitor-table-tags',
  },
  {
    key: 'collections',
    label: 'Collections',
    className: 'zt-monitor-table-collections',
  },
  {
    key: 'doi',
    label: 'DOI',
    className: 'zt-monitor-table-doi',
  },
  {
    key: 'url',
    label: 'URL',
    className: 'zt-monitor-table-url',
  },
];

export const ZOTERO_ITEM_TABLE_COLUMN_BY_KEY = Object.fromEntries(
  ZOTERO_ITEM_TABLE_COLUMN_OPTIONS.map((column) => [column.key, column])
) as Record<ZoteroItemTableColumn, ColumnOption>;

const COLUMN_ALIASES: Record<string, ColumnAliasValue> = {
  added: 'dateAdded',
  datecreated: 'dateAdded',
  modified: 'dateModified',
  dateupdated: 'dateModified',
  author: 'creators',
  authors: 'creators',
  creator: 'creators',
  publicationtitle: 'publication',
  journaltitle: 'publication',
  journal: 'publication',
  publishedin: 'publication',
  type: 'itemType',
  itemtype: 'itemType',
  zoteroitemtype: 'itemType',
  doi: 'doi',
  url: 'url',
  scope: ['tags', 'collections'],
  scopes: ['tags', 'collections'],
  tagscollections: ['tags', 'collections'],
};

const COLUMN_LOOKUP = new Map<string, ColumnAliasValue>(
  ZOTERO_ITEM_TABLE_COLUMN_OPTIONS.map((column) => [
    normalizeColumnLookupKey(column.key),
    column.key,
  ])
);

for (const [alias, value] of Object.entries(COLUMN_ALIASES)) {
  COLUMN_LOOKUP.set(normalizeColumnLookupKey(alias), value);
}

function normalizeColumnLookupKey(value: string): string {
  return value.trim().replace(/[\s_-]+/g, '').toLocaleLowerCase();
}

function normalizeString(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function getSource(item: ZoteroMonitorItem): Record<string, unknown> {
  return (item.item || {}) as Record<string, unknown>;
}

function formatSimpleValue(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number') {
    return normalizeString(value);
  }

  if (Array.isArray(value)) {
    return value
      .map((entry) => formatSimpleValue(entry))
      .filter(Boolean)
      .join(', ');
  }

  return '';
}

function getItemString(item: ZoteroMonitorItem, keys: string[]): string {
  const source = getSource(item);

  for (const key of keys) {
    const value = formatSimpleValue(source[key]);
    if (value) return value;
  }

  return '';
}

function formatCreatorName(creator: unknown): string {
  if (!creator || typeof creator !== 'object') {
    return normalizeString(creator);
  }

  const source = creator as Record<string, unknown>;
  const name = normalizeString(source.name);
  if (name) return name;

  return [normalizeString(source.firstName), normalizeString(source.lastName)]
    .filter(Boolean)
    .join(' ')
    .trim();
}

function getCreators(item: ZoteroMonitorItem): string {
  const creators = getSource(item).creators;

  if (Array.isArray(creators)) {
    return creators.map(formatCreatorName).filter(Boolean).join(', ');
  }

  return getItemString(item, ['creators', 'authors', 'author']);
}

function getPublication(item: ZoteroMonitorItem): string {
  return getItemString(item, [
    'publicationTitle',
    'proceedingsTitle',
    'bookTitle',
    'journalAbbreviation',
    'websiteTitle',
    'blogTitle',
  ]);
}

function getPublicationYear(item: ZoteroMonitorItem): string {
  const value = getItemString(item, ['year', 'date']);
  const match = value.match(/\b(1[5-9]\d{2}|20\d{2}|21\d{2})\b/);
  return match?.[1] || '';
}

function formatDate(value?: string): string {
  if (!value) return '';

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;

  return parsed.toISOString().slice(0, 10);
}

function getDateSortValue(value?: string): number {
  if (!value) return 0;

  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function normalizeZoteroItemTableColumnKey(
  column: string
): ColumnAliasValue | null {
  const normalized = normalizeColumnLookupKey(column);
  return normalized ? COLUMN_LOOKUP.get(normalized) || null : null;
}

export function getInvalidZoteroItemTableColumns(
  columns?: readonly string[]
): string[] {
  if (!columns?.length) return [];

  return columns.filter((column) => !normalizeZoteroItemTableColumnKey(column));
}

export function normalizeZoteroItemTableColumns(
  columns?: readonly string[]
): ZoteroItemTableColumn[] {
  if (!columns?.length) {
    return DEFAULT_ZOTERO_ITEM_TABLE_COLUMNS.slice();
  }

  const normalized: ZoteroItemTableColumn[] = [];
  const seen = new Set<ZoteroItemTableColumn>();

  for (const column of columns) {
    const value = normalizeZoteroItemTableColumnKey(column);
    const values = Array.isArray(value) ? value : value ? [value] : [];

    for (const item of values) {
      if (seen.has(item)) continue;
      seen.add(item);
      normalized.push(item);
    }
  }

  return normalized.length
    ? normalized
    : DEFAULT_ZOTERO_ITEM_TABLE_COLUMNS.slice();
}

export function getZoteroItemTableColumnKeys(): string[] {
  return ZOTERO_ITEM_TABLE_COLUMN_OPTIONS.map((column) => column.key);
}

export function getZoteroItemTableColumnHelp(): string {
  return getZoteroItemTableColumnKeys().join(', ');
}

export function getZoteroItemTableCellText(
  item: ZoteroMonitorItem,
  column: ZoteroItemTableColumn
): string {
  switch (column) {
    case 'title':
      return item.title || item.citekey;
    case 'citekey':
      return item.citekey;
    case 'creators':
      return getCreators(item);
    case 'year':
      return getPublicationYear(item);
    case 'date':
      return getItemString(item, ['date']);
    case 'publication':
      return getPublication(item);
    case 'publisher':
      return getItemString(item, ['publisher']);
    case 'itemType':
      return getItemString(item, ['itemType', 'type']);
    case 'library':
      return item.libraryName || `Library ${item.libraryID}`;
    case 'dateModified':
      return formatDate(
        item.dateModified || item.dateAdded || getItemString(item, ['dateModified'])
      );
    case 'dateAdded':
      return formatDate(item.dateAdded || getItemString(item, ['dateAdded', 'added']));
    case 'tags':
      return getItemTags(item.item).join(', ');
    case 'collections':
      return getItemCollectionPaths(item.item).join(', ');
    case 'doi':
      return getItemString(item, ['DOI', 'doi']);
    case 'url':
      return getItemString(item, ['url', 'URL']);
  }
}

export function getZoteroItemTableChipValues(
  item: ZoteroMonitorItem,
  column: ZoteroItemTableColumn
): string[] {
  if (column === 'tags') {
    return getItemTags(item.item).map((tag) => `#${tag}`);
  }

  if (column === 'collections') {
    return getItemCollectionPaths(item.item);
  }

  return [];
}

export function isZoteroItemTableChipColumn(
  column: ZoteroItemTableColumn
): boolean {
  return column === 'tags' || column === 'collections';
}

export function getZoteroItemTableSortValue(
  item: ZoteroMonitorItem,
  column: ZoteroItemTableColumn
): string | number {
  switch (column) {
    case 'dateAdded':
      return getDateSortValue(item.dateAdded);
    case 'dateModified':
      return getDateSortValue(item.dateModified || item.dateAdded);
    case 'year':
      return Number(getPublicationYear(item)) || 0;
    default:
      return getZoteroItemTableCellText(item, column);
  }
}
