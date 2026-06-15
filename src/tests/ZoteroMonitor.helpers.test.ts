import {
  filterDirectCitekeySuggestions,
  filterItemsByRecentDays,
  filterItemsByScope,
  filterDelimitedSuggestions,
  filterMissingZoteroItems,
  filterOrphanedZoteroNotes,
  formatDirectCitekeyInput,
  getDelimitedTokenBounds,
  getOrphanedZoteroNote,
  groupItemsByLibrary,
  hasZoteroIdentity,
  isZoteroItemInFrontmatter,
  parseDirectCitekeyInput,
  replaceDelimitedToken,
} from '../ZoteroMonitor.helpers';
import type { ZoteroMonitorItem, ZoteroVaultNote } from '../types';

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
        zoteroCitekey: 'smith2024',
        zoteroLibraryID: '1',
      })
    ).toBe(true);
  });

  it('matches exact library ID and legacy citekey', () => {
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
        [{ zoteroCitekey: 'smith2024' }]
      ).map((missing) => missing.citekey)
    ).toEqual(['jones2024']);
  });
});

describe('parseDirectCitekeyInput()', () => {
  it('parses plain citekeys and strips @ prefixes', () => {
    expect(parseDirectCitekeyInput('@smith2024, jones2020')).toEqual([
      { citekey: 'smith2024', libraryID: undefined },
      { citekey: 'jones2020', libraryID: undefined },
    ]);
  });

  it('parses library-qualified citekeys', () => {
    expect(parseDirectCitekeyInput('1:smith2024 2/jones2020')).toEqual([
      { citekey: 'smith2024', libraryID: 1 },
      { citekey: 'jones2020', libraryID: 2 },
    ]);
  });

  it('deduplicates repeated citekeys within the same library scope', () => {
    expect(parseDirectCitekeyInput('smith2024 @smith2024 1:smith2024')).toEqual([
      { citekey: 'smith2024', libraryID: undefined },
      { citekey: 'smith2024', libraryID: 1 },
    ]);
  });
});

describe('direct citekey suggestions', () => {
  const suggestions = [
    {
      citekey: 'smith2024',
      libraryID: 1,
      libraryName: 'My Library',
      title: 'Photosynthesis in forest seedlings',
    },
    {
      citekey: 'jones2020',
      libraryID: 2,
      libraryName: 'Project Group',
      title: 'Hydraulic safety margins',
    },
  ];

  it('formats selected suggestions as library-qualified citekeys', () => {
    expect(formatDirectCitekeyInput(suggestions[0])).toBe('1:smith2024');
  });

  it('matches suggestions by title, citekey, and library', () => {
    expect(filterDirectCitekeySuggestions(suggestions, 'seedlings')).toEqual([
      suggestions[0],
    ]);
    expect(filterDirectCitekeySuggestions(suggestions, '@jones')).toEqual([
      suggestions[1],
    ]);
    expect(filterDirectCitekeySuggestions(suggestions, 'project group')).toEqual([
      suggestions[1],
    ]);
  });

  it('excludes already selected suggestions', () => {
    expect(
      filterDirectCitekeySuggestions(suggestions, '', [
        { citekey: 'smith2024', libraryID: 1 },
      ])
    ).toEqual([suggestions[1]]);
  });
});

describe('delimited token suggestion helpers', () => {
  it('finds the current token after a comma', () => {
    expect(getDelimitedTokenBounds('[[Project A]], [[Pro', 20)).toEqual({
      start: 14,
      end: 20,
      query: '[[Pro',
    });
  });

  it('replaces only the current comma-separated token', () => {
    expect(
      replaceDelimitedToken('[[Project A]], [[Pro', 20, '[[Project B]]')
    ).toEqual({
      value: '[[Project A]], [[Project B]]',
      cursor: 28,
    });
  });

  it('filters suggestions using wikilink brackets or plain text', () => {
    const suggestions = ['[[Project Alpha]]', '[[Project Beta]]'];

    expect(filterDelimitedSuggestions(suggestions, '[[Bet')).toEqual([
      '[[Project Beta]]',
    ]);
    expect(filterDelimitedSuggestions(suggestions, 'alpha')).toEqual([
      '[[Project Alpha]]',
    ]);
  });
});

describe('orphaned Zotero note helpers', () => {
  function note(
    frontmatter: Record<string, any>,
    overrides: Partial<ZoteroVaultNote> = {}
  ): ZoteroVaultNote {
    return {
      basename: 'A note',
      path: 'A note.md',
      frontmatter,
      ...overrides,
    };
  }

  it('recognizes notes with Zotero identity properties', () => {
    expect(hasZoteroIdentity({ zoteroCitekey: 'smith2024' })).toBe(true);
    expect(hasZoteroIdentity({ citekey: 'smith2024' })).toBe(true);
    expect(hasZoteroIdentity({ title: 'Not a literature note' })).toBe(false);
  });

  it('does not flag notes matched by library ID and item key', () => {
    expect(
      getOrphanedZoteroNote(
        note({ zoteroLibraryID: 1, zoteroItemKey: 'ABC123' }),
        [item()]
      )
    ).toBeNull();
  });

  it('does not flag legacy notes matched by citekey only', () => {
    expect(
      getOrphanedZoteroNote(note({ citekey: 'smith2024' }), [item()])
    ).toBeNull();
  });

  it('flags Zotero-identified Obsidian notes that are absent from Zotero', () => {
    const orphaned = filterOrphanedZoteroNotes(
      [
        note({ zoteroCitekey: 'smith2024' }, { path: 'Present.md' }),
        note(
          {
            zoteroCitekey: 'deleted2024',
            zoteroItemKey: 'DELETED',
            zoteroLibraryID: 1,
          },
          { path: 'Deleted.md' }
        ),
        note({ title: 'Not a Zotero note' }, { path: 'Regular.md' }),
      ],
      [item()]
    );

    expect(orphaned).toHaveLength(1);
    expect(orphaned[0].path).toBe('Deleted.md');
    expect(orphaned[0].reason).toContain('item key deleted');
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
