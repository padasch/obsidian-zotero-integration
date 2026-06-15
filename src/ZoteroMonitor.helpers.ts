import {
  CiteKeyExport,
  ZoteroOrphanedNote,
  ZoteroMonitorItem,
  ZoteroMonitorScope,
  ZoteroVaultNote,
} from './types';

export const ZOTERO_MONITOR_CITEKEY_PROPERTY = 'zoteroCitekey';
export const ZOTERO_MONITOR_LEGACY_CITEKEY_PROPERTY = 'citekey';
export const ZOTERO_MONITOR_LIBRARY_ID_PROPERTY = 'zoteroLibraryID';
export const ZOTERO_MONITOR_ITEM_KEY_PROPERTY = 'zoteroItemKey';
export const ZOTERO_ORPHANED_DEFAULT_PROPERTY = 'zoteroOrphaned';
export const ZOTERO_ORPHANED_CHECKED_AT_PROPERTY = 'zoteroOrphanedCheckedAt';
export const ZOTERO_ORPHANED_REASON_PROPERTY = 'zoteroOrphanedReason';

export function splitScopeInput(value: string): string[] {
  return value
    .split(',')
    .map((v) => v.trim())
    .filter((v) => !!v);
}

export function formatScopeInput(value?: string[]): string {
  return (value || []).join(', ');
}

export interface DirectCitekeyInput {
  citekey: string;
  libraryID?: number;
}

export function parseDirectCitekeyInput(value: string): DirectCitekeyInput[] {
  const seen = new Set<string>();
  const refs: DirectCitekeyInput[] = [];

  for (const rawPart of value.split(/[,\s;]+/g)) {
    const raw = rawPart.trim().replace(/^@/, '');
    if (!raw) continue;

    const match = raw.match(/^(\d+)[/:](.+)$/);
    const libraryID = match ? Number(match[1]) : undefined;
    const citekey = (match ? match[2] : raw).trim().replace(/^@/, '');
    if (!citekey) continue;

    const key = `${libraryID || ''}:${citekey.toLocaleLowerCase()}`;
    if (seen.has(key)) continue;

    seen.add(key);
    refs.push({ citekey, libraryID });
  }

  return refs;
}

export function formatDirectCitekeyInput(candidate: CiteKeyExport): string {
  return `${candidate.libraryID}:${candidate.citekey}`;
}

function directInputMatchesCandidate(
  input: DirectCitekeyInput,
  candidate: CiteKeyExport
): boolean {
  const sameCitekey =
    input.citekey.toLocaleLowerCase() ===
    candidate.citekey.toLocaleLowerCase();
  if (!sameCitekey) return false;

  return input.libraryID === undefined || input.libraryID === candidate.libraryID;
}

export function filterDirectCitekeySuggestions(
  candidates: CiteKeyExport[],
  query: string,
  selected: DirectCitekeyInput[] = [],
  limit = 12
): CiteKeyExport[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();

  return candidates
    .filter(
      (candidate) =>
        !selected.some((input) => directInputMatchesCandidate(input, candidate))
    )
    .filter((candidate) => {
      if (!normalizedQuery) return true;

      return [
        candidate.citekey,
        `@${candidate.citekey}`,
        candidate.title,
        candidate.libraryName,
        candidate.libraryID,
      ]
        .join(' ')
        .toLocaleLowerCase()
        .includes(normalizedQuery);
    })
    .sort((a, b) => {
      const titleComparison = a.title.localeCompare(b.title, undefined, {
        sensitivity: 'base',
      });
      if (titleComparison !== 0) return titleComparison;

      const citekeyComparison = a.citekey.localeCompare(b.citekey, undefined, {
        sensitivity: 'base',
      });
      if (citekeyComparison !== 0) return citekeyComparison;

      return a.libraryID - b.libraryID;
    })
    .slice(0, limit);
}

export function getDelimitedTokenBounds(
  value: string,
  cursor = value.length
): { start: number; end: number; query: string } {
  const safeCursor = Math.max(0, Math.min(cursor, value.length));
  const beforeCursor = value.slice(0, safeCursor);
  const previousComma = beforeCursor.lastIndexOf(',');
  const previousNewline = beforeCursor.lastIndexOf('\n');
  const start = Math.max(previousComma, previousNewline) + 1;
  const nextComma = value.indexOf(',', safeCursor);
  const nextNewline = value.indexOf('\n', safeCursor);
  const nextSeparators = [nextComma, nextNewline].filter((index) => index >= 0);
  const end = nextSeparators.length ? Math.min(...nextSeparators) : value.length;

  return {
    start,
    end,
    query: value.slice(start, safeCursor).trim(),
  };
}

export function replaceDelimitedToken(
  value: string,
  cursor: number,
  replacement: string
): { value: string; cursor: number } {
  const bounds = getDelimitedTokenBounds(value, cursor);
  const prefix = value.slice(0, bounds.start);
  const suffix = value.slice(bounds.end);
  const spacer = prefix && !/\s$/.test(prefix) ? ' ' : '';
  const nextValue = `${prefix}${spacer}${replacement}${suffix}`;
  const nextCursor = prefix.length + spacer.length + replacement.length;

  return {
    value: nextValue,
    cursor: nextCursor,
  };
}

function normalizeSuggestionSearch(value: string): string {
  return value
    .replace(/[\[\]]/g, '')
    .trim()
    .toLocaleLowerCase();
}

export function filterDelimitedSuggestions(
  suggestions: string[],
  query: string,
  limit = 8
): string[] {
  const rawQuery = query.trim().toLocaleLowerCase();
  if (!rawQuery) return [];

  const normalizedQuery = normalizeSuggestionSearch(query);

  return suggestions
    .filter((suggestion) => {
      const rawSuggestion = suggestion.toLocaleLowerCase();
      const normalizedSuggestion = normalizeSuggestionSearch(suggestion);

      return (
        rawSuggestion.includes(rawQuery) ||
        (Boolean(normalizedQuery) &&
          normalizedSuggestion.includes(normalizedQuery))
      );
    })
    .slice(0, limit);
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

function firstFrontmatterValue(
  frontmatter: Record<string, any>,
  keys: string[]
): string | undefined {
  for (const key of keys) {
    const value = valuesFromFrontmatter(frontmatter[key])[0];
    if (value) return value;
  }

  return undefined;
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

  if (
    hasLibraryID &&
    frontmatterIncludes(
      frontmatter,
      ZOTERO_MONITOR_LEGACY_CITEKEY_PROPERTY,
      item.citekey
    )
  ) {
    return true;
  }

  return (
    frontmatterIncludes(
      frontmatter,
      ZOTERO_MONITOR_CITEKEY_PROPERTY,
      item.citekey
    ) ||
    frontmatterIncludes(
      frontmatter,
      ZOTERO_MONITOR_LEGACY_CITEKEY_PROPERTY,
      item.citekey
    )
  );
}

export function hasZoteroIdentity(frontmatter: Record<string, any>): boolean {
  return Boolean(
    firstFrontmatterValue(frontmatter, [
      ZOTERO_MONITOR_CITEKEY_PROPERTY,
      ZOTERO_MONITOR_LEGACY_CITEKEY_PROPERTY,
      'zoteroCiteKey',
    ]) ||
      firstFrontmatterValue(frontmatter, [
        ZOTERO_MONITOR_ITEM_KEY_PROPERTY,
        'itemKey',
      ])
  );
}

export function getOrphanedZoteroNote(
  note: ZoteroVaultNote,
  zoteroItems: ZoteroMonitorItem[]
): ZoteroOrphanedNote | null {
  if (!hasZoteroIdentity(note.frontmatter)) return null;

  if (
    zoteroItems.some((item) =>
      isZoteroItemInFrontmatter(item, note.frontmatter)
    )
  ) {
    return null;
  }

  const citekey = firstFrontmatterValue(note.frontmatter, [
    ZOTERO_MONITOR_CITEKEY_PROPERTY,
    ZOTERO_MONITOR_LEGACY_CITEKEY_PROPERTY,
    'zoteroCiteKey',
  ]);
  const libraryID = firstFrontmatterValue(note.frontmatter, [
    ZOTERO_MONITOR_LIBRARY_ID_PROPERTY,
  ]);
  const itemKey = firstFrontmatterValue(note.frontmatter, [
    ZOTERO_MONITOR_ITEM_KEY_PROPERTY,
    'itemKey',
  ]);

  let reason = 'No matching Zotero item found';
  if (libraryID && itemKey) {
    reason = `No Zotero item with library ${libraryID} and item key ${itemKey}`;
  } else if (libraryID && citekey) {
    reason = `No Zotero item with library ${libraryID} and citekey ${citekey}`;
  } else if (citekey) {
    reason = `No Zotero item with citekey ${citekey}`;
  }

  return {
    ...note,
    citekey,
    libraryID,
    itemKey,
    reason,
  };
}

export function filterOrphanedZoteroNotes(
  notes: ZoteroVaultNote[],
  zoteroItems: ZoteroMonitorItem[]
): ZoteroOrphanedNote[] {
  return notes
    .map((note) => getOrphanedZoteroNote(note, zoteroItems))
    .filter((note): note is ZoteroOrphanedNote => !!note);
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
