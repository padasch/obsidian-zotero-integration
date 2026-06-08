import {
  CiteKeyExport,
  ZoteroMonitorItem,
  ZoteroMonitorScope,
} from './types';

export const ZOTERO_MONITOR_CITEKEY_PROPERTY = 'citekey';
export const ZOTERO_MONITOR_LIBRARY_ID_PROPERTY = 'zoteroLibraryID';
export const ZOTERO_MONITOR_ITEM_KEY_PROPERTY = 'zoteroItemKey';

export function splitScopeInput(value: string): string[] {
  return value
    .split(',')
    .map((v) => v.trim())
    .filter((v) => !!v);
}

export function formatScopeInput(value?: string[]): string {
  return (value || []).join(', ');
}

function normalizeValue(value: any): string {
  return String(value || '')
    .trim()
    .toLocaleLowerCase();
}

function valuesFromFrontmatter(value: any): string[] {
  if (Array.isArray(value)) {
    return value.map(normalizeValue).filter((v) => !!v);
  }

  const normalized = normalizeValue(value);
  return normalized ? [normalized] : [];
}

function frontmatterIncludes(frontmatter: Record<string, any>, key: string, value: any) {
  const normalized = normalizeValue(value);
  if (!normalized) return false;

  return valuesFromFrontmatter(frontmatter[key]).includes(normalized);
}

export function getZoteroItemKey(item: any): string | null {
  if (item?.itemKey) return String(item.itemKey);
  if (item?.key) return String(item.key);
  if (typeof item?.uri === 'string') return item.uri.split('/').pop() || null;
  if (typeof item?.id === 'string' && item.id.includes('/')) {
    return item.id.split('/').pop() || null;
  }
  return null;
}

export function getZoteroItemCitekey(item: any, fallback?: string): string | null {
  if (item?.citekey) return String(item.citekey);
  if (item?.citationKey) return String(item.citationKey);
  if (item?.['citation-key']) return String(item['citation-key']);
  return fallback || null;
}

export function getItemTags(item: any): string[] {
  const tags = item?.tags || [];
  if (!Array.isArray(tags)) return [];

  return tags
    .map((tag) => {
      if (typeof tag === 'string') return tag;
      return tag?.tag || tag?.name || '';
    })
    .map((tag) => tag.trim())
    .filter((tag) => !!tag);
}

export function getItemCollectionPaths(item: any): string[] {
  const collections = item?.collections || [];
  if (!Array.isArray(collections)) return [];

  return collections
    .map((collection) => {
      if (typeof collection === 'string') return collection;
      return collection?.fullPath || collection?.path || collection?.name || '';
    })
    .map((collection) => collection.trim())
    .filter((collection) => !!collection);
}

export function normalizeMonitorItem(
  item: any,
  candidate: CiteKeyExport
): ZoteroMonitorItem | null {
  const citekey = getZoteroItemCitekey(item, candidate.citekey);
  if (!citekey) return null;

  const libraryID = Number(item?.libraryID || candidate.libraryID);
  if (!libraryID) return null;

  return {
    citekey,
    libraryID,
    libraryName: candidate.libraryName,
    itemKey: getZoteroItemKey(item),
    title: item?.title || candidate.title || citekey,
    dateAdded: item?.dateAdded,
    dateModified: item?.dateModified,
    collections: item?.collections,
    tags: item?.tags,
    item,
  };
}

export function isZoteroItemInFrontmatter(
  item: ZoteroMonitorItem,
  frontmatter: Record<string, any>
): boolean {
  if (!frontmatter) return false;

  const hasLibraryID = frontmatterIncludes(
    frontmatter,
    ZOTERO_MONITOR_LIBRARY_ID_PROPERTY,
    item.libraryID
  );

  if (
    item.itemKey &&
    hasLibraryID &&
    frontmatterIncludes(frontmatter, ZOTERO_MONITOR_ITEM_KEY_PROPERTY, item.itemKey)
  ) {
    return true;
  }

  if (
    hasLibraryID &&
    frontmatterIncludes(frontmatter, ZOTERO_MONITOR_CITEKEY_PROPERTY, item.citekey)
  ) {
    return true;
  }

  return frontmatterIncludes(
    frontmatter,
    ZOTERO_MONITOR_CITEKEY_PROPERTY,
    item.citekey
  );
}

export function filterMissingZoteroItems(
  items: ZoteroMonitorItem[],
  frontmatters: Array<Record<string, any>>
): ZoteroMonitorItem[] {
  return items.filter(
    (item) =>
      !frontmatters.some((frontmatter) =>
        isZoteroItemInFrontmatter(item, frontmatter)
      )
  );
}

export function filterItemsByRecentDays(
  items: ZoteroMonitorItem[],
  recentDays: number | null,
  now: Date = new Date()
): ZoteroMonitorItem[] {
  if (recentDays === null) return items;
  if (!Number.isFinite(recentDays) || recentDays <= 0) return items;

  const cutoff = now.getTime() - recentDays * 24 * 60 * 60 * 1000;
  return items.filter((item) => {
    if (!item.dateAdded) return false;
    const added = new Date(item.dateAdded).getTime();
    return Number.isFinite(added) && added >= cutoff;
  });
}

export function filterItemsByScope(
  items: ZoteroMonitorItem[],
  scope: ZoteroMonitorScope
): ZoteroMonitorItem[] {
  const libraryScope = scope.libraryScope.map(normalizeValue);
  const collectionScope = scope.collectionScope.map(normalizeValue);
  const tagScope = scope.tagScope.map(normalizeValue);

  return items.filter((item) => {
    if (libraryScope.length) {
      const libraryID = normalizeValue(item.libraryID);
      const libraryName = normalizeValue(item.libraryName);
      if (!libraryScope.includes(libraryID) && !libraryScope.includes(libraryName)) {
        return false;
      }
    }

    if (collectionScope.length) {
      const collections = getItemCollectionPaths(item.item).map(normalizeValue);
      if (!collectionScope.some((collection) => collections.includes(collection))) {
        return false;
      }
    }

    if (tagScope.length) {
      const tags = getItemTags(item.item).map(normalizeValue);
      if (!tagScope.some((tag) => tags.includes(tag))) {
        return false;
      }
    }

    return true;
  });
}

export function groupItemsByLibrary(
  items: ZoteroMonitorItem[]
): Map<number, ZoteroMonitorItem[]> {
  const groups = new Map<number, ZoteroMonitorItem[]>();

  for (const item of items) {
    const group = groups.get(item.libraryID) || [];
    group.push(item);
    groups.set(item.libraryID, group);
  }

  return groups;
}
