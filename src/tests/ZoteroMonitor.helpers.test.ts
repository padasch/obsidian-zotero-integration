import {
  filterItemsByRecentDays,
  filterItemsByScope,
  filterMissingZoteroItems,
  groupItemsByLibrary,
  isZoteroItemInFrontmatter,
} from '../ZoteroMonitor.helpers';
import type { ZoteroMonitorItem } from '../types';

function item(overrides: Partial<ZoteroMonitorItem> = {}): ZoteroMonitorItem {
  return {
    citekey: 'smith2024',
    libraryID: 1,
    libraryName: 'My Library',
    itemKey: 'ABC123',
    title: 'A useful paper',
    dateAdded: '2024-01-20T10:00:00Z',
    item: {
      citekey: 'smith2024',
      collections: [{ fullPath: 'Reading/Queue' }],
      itemKey: 'ABC123',
      libraryID: 1,
      tags: [{ tag: 'to-read' }],
      title: 'A useful paper',
    },
    ...overrides,
  };
}

describe('isZoteroItemInFrontmatter()', () => {
  it('matches exact library ID and Zotero item key', () => {
    expect(
      isZoteroItemInFrontmatter(item(), {
        zoteroLibraryID: 1,
        zoteroItemKey: 'ABC123',
      })
    ).toBe(true);
  });

  it('matches exact library ID and citekey', () => {
    expect(
      isZoteroItemInFrontmatter(item(), {
        citekey: 'smith2024',
        zoteroLibraryID: '1',
      })
    ).toBe(true);
  });

  it('matches citekey-only legacy notes', () => {
    expect(
      isZoteroItemInFrontmatter(item(), {
        citekey: 'smith2024',
      })
    ).toBe(true);
  });

  it('does not match unrelated frontmatter', () => {
    expect(
      isZoteroItemInFrontmatter(item(), {
        citekey: 'jones2024',
        zoteroLibraryID: 2,
        zoteroItemKey: 'XYZ987',
      })
    ).toBe(false);
  });
});

describe('filterMissingZoteroItems()', () => {
  it('removes items represented in any vault frontmatter', () => {
    expect(
      filterMissingZoteroItems(
        [item(), item({ citekey: 'jones2024', itemKey: 'XYZ987' })],
        [{ citekey: 'smith2024' }]
      ).map((missing) => missing.citekey)
    ).toEqual(['jones2024']);
  });
});

describe('filterItemsByRecentDays()', () => {
  it('keeps items added within the configured window', () => {
    const now = new Date('2024-02-01T00:00:00Z');

    expect(
      filterItemsByRecentDays(
        [
          item({ citekey: 'recent', dateAdded: '2024-01-31T00:00:00Z' }),
          item({ citekey: 'old', dateAdded: '2023-12-01T00:00:00Z' }),
        ],
        30,
        now
      ).map((filtered) => filtered.citekey)
    ).toEqual(['recent']);
  });

  it('keeps all items when recent days is null', () => {
    expect(
      filterItemsByRecentDays(
        [item({ citekey: 'recent' }), item({ citekey: 'old' })],
        null
      )
    ).toHaveLength(2);
  });
});

describe('filterItemsByScope()', () => {
  it('filters by library ID or library name', () => {
    expect(
      filterItemsByScope(
        [
          item(),
          item({ citekey: 'other', libraryID: 2, libraryName: 'Other' }),
        ],
        {
          collectionScope: [],
          libraryScope: ['My Library'],
          tagScope: [],
        }
      ).map((filtered) => filtered.citekey)
    ).toEqual(['smith2024']);
  });

  it('filters by exact collection path', () => {
    expect(
      filterItemsByScope([item()], {
        collectionScope: ['Reading/Queue'],
        libraryScope: [],
        tagScope: [],
      })
    ).toHaveLength(1);
  });

  it('filters by exact tag', () => {
    expect(
      filterItemsByScope([item()], {
        collectionScope: [],
        libraryScope: [],
        tagScope: ['to-read'],
      })
    ).toHaveLength(1);
  });
});

describe('groupItemsByLibrary()', () => {
  it('groups imports by library ID', () => {
    const groups = groupItemsByLibrary([
      item({ citekey: 'one', libraryID: 1 }),
      item({ citekey: 'two', libraryID: 2 }),
      item({ citekey: 'three', libraryID: 1 }),
    ]);

    expect(groups.get(1)!.map((grouped) => grouped.citekey)).toEqual([
      'one',
      'three',
    ]);
    expect(groups.get(2)!.map((grouped) => grouped.citekey)).toEqual(['two']);
  });
});
