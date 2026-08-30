import {
  getDuplicateCitekeyCandidatePath,
  getPort,
  mkMDDir,
  replaceIllegalChars,
  sanitizeFilePath,
} from '../helpers';
import {
  filterItemsByRecentScope,
  getItemCollectionPaths,
} from '../../ZoteroMonitor.helpers';
import {
  applyAnnotatedStatusFromAnnotations,
  createZoteroCitekeyLink,
  sanitizeFrontmatterString,
  sanitizeFrontmatterValue,
  sanitizeRenderedFrontmatter,
  sortFrontmatterProperties,
} from '../../ZoteroManagedProperties';

describe('getPort()', () => {
  it('returns correct port for database', () => {
    expect(getPort('Juris-M')).toBe('24119');
    expect(getPort('Zotero')).toBe('23119');
  });
});

describe('mkMDDir()', () => {
  it('does not call createFolder if path exists', async () => {
    global.app = {
      vault: {
        adapter: {
          exists: async () => true,
        },
        createFolder: jest.fn(async () => {}),
      },
    } as any;

    await mkMDDir('mock');

    expect(global.app.vault.createFolder as jest.Mock).not.toBeCalled();
  });

  it('does call createFolder if path exists', async () => {
    global.app = {
      vault: {
        adapter: {
          exists: async () => false,
        },
        createFolder: jest.fn(async () => {}),
      },
    } as any;

    await mkMDDir('mock');

    expect(global.app.vault.createFolder as jest.Mock).toBeCalled();
  });
});

describe('replaceIllegalChars()', () => {
  it('replaces ? and * with spaces', () => {
    const chars = ['?', '*'];
    chars.forEach((c) => {
      expect(replaceIllegalChars(`Hello${c}  world`)).toBe('Hello world');
    });
  });

  it('replaces :"<>| with dash', () => {
    const chars = [':', '"', '<', '>', '|'];
    chars.forEach((c) => {
      expect(replaceIllegalChars(`Hello${c}  world`)).toBe('Hello - world');
    });
  });

  it('leaves no trailing or leading spaces', () => {
    expect(replaceIllegalChars('?')).toBe('');
    expect(replaceIllegalChars(':')).toBe('-');
    expect(replaceIllegalChars('*hello?')).toBe('hello');
  });
});

describe('sanitizeFilePath()', () => {
  it('keeps slashes', () => {
    expect(sanitizeFilePath('/hello/world.txt')).toBe('/hello/world.txt');
  });

  it('replaces ? and * with spaces', () => {
    const chars = ['?', '*'];
    chars.forEach((c) => {
      expect(sanitizeFilePath(`/hel${c} lo/${c}world${c}.txt`)).toBe(
        '/hel lo/world.txt'
      );
    });
  });

  it('replaces :"<>| with dash', () => {
    const chars = [':', '"', '<', '>', '|'];
    chars.forEach((c) => {
      expect(sanitizeFilePath(`/hel${c} lo/${c}world${c}.txt`)).toBe(
        '/hel - lo/- world -.txt'
      );
    });
  });

  it('leaves no trailing or leading spaces', () => {
    expect(replaceIllegalChars('?')).toBe('');
    expect(replaceIllegalChars(':')).toBe('-');
    expect(replaceIllegalChars('*hello?')).toBe('hello');
  });
});

describe('getDuplicateCitekeyCandidatePath()', () => {
  it('maps a Better BibTeX a-suffixed citekey note to the unsuffixed note path', () => {
    expect(
      getDuplicateCitekeyCandidatePath('Literature/@smith2024a.md', 'smith2024a')
    ).toBe('Literature/@smith2024.md');
  });

  it('returns null for citekeys that do not end with a', () => {
    expect(
      getDuplicateCitekeyCandidatePath('Literature/@smith2024.md', 'smith2024')
    ).toBeNull();
  });

  it('returns null when the citekey is not part of the note filename', () => {
    expect(
      getDuplicateCitekeyCandidatePath('Literature/Some title.md', 'smith2024a')
    ).toBeNull();
  });

  it('handles bare filename imports', () => {
    expect(getDuplicateCitekeyCandidatePath('@smith2024a.md', 'smith2024a')).toBe(
      '@smith2024.md'
    );
  });
});

describe('getItemCollectionPaths()', () => {
  it('keeps only the deepest collection paths when Zotero returns parent paths', () => {
    expect(
      getItemCollectionPaths({
        collections: [
          'topics',
          'topics/coding',
          'topics/coding/r',
          'reading',
        ],
      })
    ).toEqual(['topics/coding/r', 'reading']);
  });

  it('normalizes duplicate separators before pruning parent paths', () => {
    expect(
      getItemCollectionPaths({
        collections: 'topics, topics//coding, topics/coding/r',
      })
    ).toEqual(['topics/coding/r']);
  });
});

describe('filterItemsByRecentScope()', () => {
  const realNow = Date.now;

  beforeEach(() => {
    Date.now = jest.fn(() => new Date('2026-08-25T12:00:00Z').getTime());
    jest.useFakeTimers().setSystemTime(new Date('2026-08-25T12:00:00Z'));
  });

  afterEach(() => {
    Date.now = realNow;
    jest.useRealTimers();
  });

  const items = [
    {
      title: 'today',
      citekey: 'today',
      libraryID: 1,
      dateAdded: '2026-08-25T08:00:00Z',
      item: {},
    },
    {
      title: 'week',
      citekey: 'week',
      libraryID: 1,
      dateAdded: '2026-08-21T08:00:00Z',
      item: {},
    },
    {
      title: 'old',
      citekey: 'old',
      libraryID: 1,
      dateAdded: '2026-07-01T08:00:00Z',
      item: {},
    },
  ];

  it('filters items added today using the local day boundary', () => {
    expect(filterItemsByRecentScope(items, 'today', 0).map((item) => item.citekey)).toEqual([
      'today',
    ]);
  });

  it('filters items added within the last N days', () => {
    expect(filterItemsByRecentScope(items, 'days', 7).map((item) => item.citekey)).toEqual([
      'today',
      'week',
    ]);
  });

  it('selects the newest N items by date added', () => {
    expect(filterItemsByRecentScope(items, 'latest', 2).map((item) => item.citekey)).toEqual([
      'today',
      'week',
    ]);
  });
});

describe('createZoteroCitekeyLink()', () => {
  it('prefers a Zotero PDF reader link', () => {
    expect(
      createZoteroCitekeyLink({
        citationKey: 'smith2026',
        url: 'https://example.com/paper',
        desktopURI: 'zotero://select/library/items/ABC123',
        attachments: [
          {
            path: '/tmp/paper.pdf',
            pdfURI: 'zotero://open-pdf/library/items/PDF123',
          },
        ],
      })
    ).toBe('[@smith2026](zotero://open-pdf/library/items/PDF123)');
  });

  it('falls back to web URL, Zotero item URI, then plain citekey', () => {
    expect(
      createZoteroCitekeyLink({
        citationKey: 'smith2026',
        url: 'https://example.com/paper',
        desktopURI: 'zotero://select/library/items/ABC123',
      })
    ).toBe('[@smith2026](https://example.com/paper)');

    expect(
      createZoteroCitekeyLink({
        citationKey: 'smith2026',
        desktopURI: 'zotero://select/library/items/ABC123',
      })
    ).toBe('[@smith2026](zotero://select/library/items/ABC123)');

    expect(createZoteroCitekeyLink({ citationKey: 'smith2026' })).toBe(
      '@smith2026'
    );
  });

  it('can use a paper icon as the link label', () => {
    expect(
      createZoteroCitekeyLink(
        {
          citationKey: 'smith2026',
          url: 'https://example.com/paper',
        },
        'emoji'
      )
    ).toBe('[📄](https://example.com/paper)');
  });

  it('keeps a useful citekey label when no link target exists in emoji mode', () => {
    expect(createZoteroCitekeyLink({ citationKey: 'smith2026' }, 'emoji')).toBe(
      '@smith2026'
    );
  });
});

describe('sortFrontmatterProperties()', () => {
  it('sorts keys alphabetically in place', () => {
    const frontmatter = {
      zoteroStatus: 'new',
      aliases: ['@smith2026: Title'],
      zoteroCitekey: 'smith2026',
    };

    sortFrontmatterProperties(frontmatter);

    expect(Object.keys(frontmatter)).toEqual([
      'aliases',
      'zoteroCitekey',
      'zoteroStatus',
    ]);
  });
});

describe('frontmatter sanitization', () => {
  it('removes YAML-hostile backslashes and control characters from strings', () => {
    expect(
      sanitizeFrontmatterString(
        'Tree response to \\alpha drought\u0000\nwith\tspacing'
      )
    ).toBe('Tree response to alpha drought with spacing');
  });

  it('cleans strings recursively while preserving non-string values', () => {
    expect(
      sanitizeFrontmatterValue({
        zoteroProject: ['[[Project \\alpha]]'],
        zoteroOpenTasks: true,
        zoteroYear: 2026,
      })
    ).toEqual({
      zoteroProject: ['[[Project alpha]]'],
      zoteroOpenTasks: true,
      zoteroYear: 2026,
    });
  });

  it('sanitizes only a rendered YAML frontmatter block', () => {
    const markdown = [
      '---',
      'title: "Photosynthesis \\alpha response"',
      'zoteroAuthors:',
      '  - "Smith \\beta"',
      'zoteroURL: [weblink](https://example.com/paper)',
      'zoteroYear: 2026',
      '---',
      '',
      'Body keeps \\alpha notation.',
    ].join('\n');

    const sanitized = sanitizeRenderedFrontmatter(markdown);

    expect(sanitized).toContain("title: 'Photosynthesis alpha response'");
    expect(sanitized).toContain("  - 'Smith beta'");
    expect(sanitized).toContain(
      "zoteroURL: '[weblink](https://example.com/paper)'"
    );
    expect(sanitized).toContain('zoteroYear: 2026');
    expect(sanitized).toContain('Body keeps \\alpha notation.');
  });

  it('quotes rendered scalar values that would be ambiguous YAML', () => {
    const markdown = [
      '---',
      'title: Carbon balance: drought recovery # field trial',
      'aliases:',
      '  - "@smith2026: Carbon balance \\gamma"',
      'zoteroNote: Follow-up: check methods',
      '---',
      'Body',
    ].join('\n');

    expect(sanitizeRenderedFrontmatter(markdown)).toContain(
      "title: 'Carbon balance: drought recovery # field trial'"
    );
    expect(sanitizeRenderedFrontmatter(markdown)).toContain(
      "  - '@smith2026: Carbon balance gamma'"
    );
    expect(sanitizeRenderedFrontmatter(markdown)).toContain(
      "zoteroNote: 'Follow-up: check methods'"
    );
  });
});

describe('applyAnnotatedStatusFromAnnotations()', () => {
  it('sets empty or new statuses to annotated when annotations exist', () => {
    const emptyFrontmatter: Record<string, unknown> = {};
    const newFrontmatter: Record<string, unknown> = {
      zoteroStatus: 'new',
    };
    const templateData = {
      annotations: [{ annotatedText: 'Evidence' }],
    };

    applyAnnotatedStatusFromAnnotations(emptyFrontmatter, templateData);
    applyAnnotatedStatusFromAnnotations(newFrontmatter, templateData);

    expect(emptyFrontmatter.zoteroStatus).toBe('annotated');
    expect(newFrontmatter.zoteroStatus).toBe('annotated');
  });

  it('preserves explicit non-new statuses and ignores unannotated imports', () => {
    const readingFrontmatter: Record<string, unknown> = {
      zoteroStatus: 'reading',
    };
    const emptyFrontmatter: Record<string, unknown> = {};

    applyAnnotatedStatusFromAnnotations(readingFrontmatter, {
      annotations: [{ annotatedText: 'Evidence' }],
    });
    applyAnnotatedStatusFromAnnotations(emptyFrontmatter, { annotations: [] });

    expect(readingFrontmatter.zoteroStatus).toBe('reading');
    expect(emptyFrontmatter.zoteroStatus).toBeUndefined();
  });
});
