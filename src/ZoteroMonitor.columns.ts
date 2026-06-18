import type { ZoteroMonitorTableColumn } from './types';

export const DEFAULT_ZOTERO_MONITOR_TABLE_COLUMNS: ZoteroMonitorTableColumn[] = [
  'title',
  'citekey',
  'dateAdded',
  'tags',
  'collections',
];

export const ZOTERO_MONITOR_TABLE_COLUMN_OPTIONS: Array<{
  key: ZoteroMonitorTableColumn;
  label: string;
  className: string;
}> = [
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
];

export const ZOTERO_MONITOR_TABLE_COLUMN_BY_KEY = Object.fromEntries(
  ZOTERO_MONITOR_TABLE_COLUMN_OPTIONS.map((column) => [column.key, column])
) as Record<ZoteroMonitorTableColumn, typeof ZOTERO_MONITOR_TABLE_COLUMN_OPTIONS[number]>;

export function normalizeMonitorTableColumns(
  columns?: readonly string[]
): ZoteroMonitorTableColumn[] {
  if (!columns?.length) {
    return DEFAULT_ZOTERO_MONITOR_TABLE_COLUMNS.slice();
  }

  const requested = new Set<string>();

  for (const column of columns) {
    if (column === 'scopes') {
      requested.add('tags');
      requested.add('collections');
    } else {
      requested.add(column);
    }
  }

  const normalized = ZOTERO_MONITOR_TABLE_COLUMN_OPTIONS
    .map((column) => column.key)
    .filter((column) => requested.has(column));

  return normalized.length
    ? normalized
    : DEFAULT_ZOTERO_MONITOR_TABLE_COLUMNS.slice();
}
