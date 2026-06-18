import type {
  CiteKeyExport,
  ZoteroMonitorItem,
  ZoteroMonitorScope,
} from './types';

type JsonMap = Record<string, any>;

function normalizeString(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function normalizeIdentifier(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function normalizeArray(values: unknown): string[] {
  if (!Array.isArray(values)) {
    if (typeof values === 'string') {
      return values
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);
    }

    return [];
  }

  return values
    .map((value) => normalizeString(value))
    .filter((value) => !!value);
}

function parseTextOptions(values: unknown): string[] {
  const output: string[] = [];
  const seen = new Set<string>();

  for (const value of normalizeArray(values)) {
    const normalized = normalizeIdentifier(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    output.push(value);
  }

  return output;
}

function collectFrontmatterValues(values: unknown): string[] {
  const output: string[] = [];

  if (!Array.isArray(values)) {
    if (typeof values === 'string') {
      return [values.trim()].filter(Boolean);
    }

    return output;
  }

  for (const value of values) {
    if (value === null || value === undefined) continue;

    if (typeof value === 'string') {
      output.push(value.trim());
      continue;
    }

    if (typeof value === 'object') {
      if (typeof value.key === 'string') {
        output.push(value.key.trim());
      }

      if (typeof (value as any).citekey === 'string') {
        output.push((value as any).citekey.trim());
      }
    }
  }

  return output.filter(Boolean);
}

function extractCandidateKeys(item: ZoteroMonitorItem): string[] {
  const keys = new Set<string>([
    normalizeIdentifier(item.citekey),
    normalizeIdentifier(item.itemKey || ''),
  ]);

  const libraryID = normalizeIdentifier(String(item.libraryID));
  const libraryName = normalizeIdentifier(item.libraryName || '');

  if (libraryID) {
    keys.add(`${libraryID}:${item.itemKey ? normalizeIdentifier(item.itemKey) : item.citekey}`);
  }

  if (libraryName) {
    keys.add(`${libraryName}:${item.itemKey ? normalizeIdentifier(item.itemKey) : item.citekey}`);
  }

  return Array.from(keys).filter(Boolean);
}

function matchScope(values: string[], candidate: string): boolean {
  const normalized = normalizeIdentifier(candidate);
  return values.some((scope) => normalizeIdentifier(scope) === normalized);
}

export function formatScopeInput(scope?: string[]): string {
  return (scope || []).filter(Boolean).join(', ');
}

export function splitScopeInput(value: string): string[] {
  return parseTextOptions(value);
}

export function getItemCollectionPaths(item: JsonMap): string[] {
  const raw = item.collections;

  if (!raw) {
    return [];
  }

  const collections =
    typeof raw === 'string'
      ? raw
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean)
      : Array.isArray(raw)
      ? raw
          .map((entry) =>
            typeof entry === 'string'
              ? entry
              : normalizeString((entry as any).path || (entry as any).name)
          )
          .filter(Boolean)
      : [];

  return parseTextOptions(collections);
}

export function getItemTags(item: JsonMap): string[] {
  const raw = item.tags;

  if (!raw) {
    return [];
  }

  if (!Array.isArray(raw)) {
    return [];
  }

  const tags = raw.flatMap((entry) => {
    if (typeof entry === 'string') {
      return [entry.trim()];
    }

    if (entry && typeof entry === 'object') {
      return [normalizeString((entry as any).tag || (entry as any).name)];
    }

    return [];
  });

  return parseTextOptions(tags);
}

export function getZoteroItemCitekey(item: JsonMap): string | null {
  const source = normalizeString(
    (item as any).citationKey ||
      (item as any).citekey ||
      (item as any).key ||
      (item as any).itemKey
  );

  return source || null;
}

export function normalizeMonitorItem(
  item: JsonMap,
  candidate: CiteKeyExport
): ZoteroMonitorItem | null {
  const title = normalizeString(
    item.title || item.titleShort || item.name || candidate.title || candidate.citekey
  );
  if (!title) {
    return null;
  }

  const citekey = getZoteroItemCitekey(item) || candidate.citekey;
  if (!citekey) {
    return null;
  }

  return {
    title,
    citekey,
    libraryID: Number(candidate.libraryID || item.libraryID || 0),
    libraryName: normalizeString(item.libraryName || item.library?.name),
    itemKey: normalizeString(item.key || item.itemKey || ''),
    dateModified: normalizeString(item.dateModified || item.modified),
    dateAdded: normalizeString(item.dateAdded || item.added),
    item: {
      ...item,
    },
  };
}

export function groupItemsByLibrary(
  items: ZoteroMonitorItem[]
): Map<number, ZoteroMonitorItem[]> {
  const grouped = new Map<number, ZoteroMonitorItem[]>();

  for (const item of items) {
    const bucket = grouped.get(item.libraryID) || [];
    bucket.push(item);
    grouped.set(item.libraryID, bucket);
  }

  return grouped;
}

export function filterItemsByRecentDays(
  items: ZoteroMonitorItem[],
  recentDays: number | null | undefined
): ZoteroMonitorItem[] {
  const asNumber = Number(recentDays);
  if (!recentDays || !Number.isFinite(asNumber) || asNumber <= 0) {
    return items;
  }

  const cutoff = Date.now() - asNumber * 24 * 60 * 60 * 1000;

  return items.filter((item) => {
    const modified = Date.parse(item.dateModified || item.dateAdded || '');
    if (Number.isNaN(modified)) return false;
    return modified >= cutoff;
  });
}

export function filterItemsByScope(
  items: ZoteroMonitorItem[],
  scope: ZoteroMonitorScope
): ZoteroMonitorItem[] {
  const libraries = (scope.libraryScope || []).filter(Boolean);
  const collections = (scope.collectionScope || []).filter(Boolean);
  const tags = (scope.tagScope || []).filter(Boolean);

  if (!libraries.length && !collections.length && !tags.length) {
    return items;
  }

  return items.filter((item) => {
    if (libraries.length) {
      const libraryName = normalizeIdentifier(item.libraryName || '');
      if (
        !matchScope(libraries, String(item.libraryID)) &&
        !matchScope(libraries, libraryName)
      ) {
        return false;
      }
    }

    if (collections.length) {
      const itemCollections = getItemCollectionPaths(item.item).map((name) =>
        normalizeIdentifier(name)
      );
      if (!collections.some((entry) => itemCollections.includes(normalizeIdentifier(entry)))) {
        return false;
      }
    }

    if (tags.length) {
      const itemTags = getItemTags(item.item).map((tag) => normalizeIdentifier(tag));
      if (!tags.some((entry) => itemTags.includes(normalizeIdentifier(entry)))) {
        return false;
      }
    }

    return true;
  });
}

export function filterMissingZoteroItems(
  items: ZoteroMonitorItem[],
  frontmatters: Array<Record<string, any>>
): ZoteroMonitorItem[] {
  return items.filter((item) => {
    const candidateKeys = new Set(
      extractCandidateKeys(item).map((key) => normalizeIdentifier(key))
    );

    for (const frontmatter of frontmatters) {
      if (!frontmatter || typeof frontmatter !== 'object') {
        continue;
      }

      const valueKeys = new Set<string>([
        ...collectFrontmatterValues(frontmatter.zotero_key),
        ...collectFrontmatterValues(frontmatter.zoteroKey),
        ...collectFrontmatterValues(frontmatter.citekey),
        ...collectFrontmatterValues(frontmatter.citationKey),
        ...collectFrontmatterValues(frontmatter.citationkey),
        ...collectFrontmatterValues(frontmatter['citation-key']),
        ...collectFrontmatterValues(frontmatter.itemKey),
        ...collectFrontmatterValues(frontmatter.zoteroItemKey),
        ...collectFrontmatterValues(frontmatter.key),
      ].map(normalizeIdentifier));

      if (candidateKeys.size &&
        [...candidateKeys].some((key) => valueKeys.has(key))) {
        return false;
      }
    }

    return true;
  });
}
