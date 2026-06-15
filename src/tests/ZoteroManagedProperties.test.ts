import {
  DEFAULT_ZOTERO_TASK_ANNOTATION_COLORS,
  ZOTERO_NO_PDF_PLACEHOLDER,
  ZOTERO_ANNOTATION_COLORS,
  applyManagedZoteroFrontmatter,
  normalizeExportFormatOutputPaths,
  normalizeManagedImportSettings,
  normalizePreservedProperties,
  normalizeTaskAnnotationColors,
} from '../ZoteroManagedProperties';
import type { ZoteroConnectorSettings } from '../types';

function settings(
  overrides: Partial<ZoteroConnectorSettings> = {}
): ZoteroConnectorSettings {
  return {
    citeFormats: [],
    database: 'Zotero',
    exportFormats: [],
    noteImportFolder: '',
    openNoteAfterImport: false,
    whichNotesToOpenAfterImport: 'first-imported-note',
    zoteroMonitorAutomaticAction: 'notice',
    zoteroMonitorCheckOnStartup: false,
    zoteroMonitorCollectionScope: [],
    zoteroMonitorEnabled: false,
    zoteroMonitorImportFormat: '',
    zoteroMonitorIntervalMinutes: 0,
    zoteroMonitorLibraryScope: [],
    zoteroMonitorReadingStatusProperty: 'readingStatus',
    zoteroMonitorReadingStatusValue: 'unread',
    zoteroMonitorRecentDays: 30,
    zoteroMonitorTagScope: [],
    zoteroOrphanedProperty: 'zoteroOrphaned',
    zoteroPreservedProperties: [
      'zoteroProject',
      'zoteroTopic',
      'zoteroNote',
      'zoteroSummary',
      'zoteroStatus',
    ],
    zoteroSciteApiToken: '',
    zoteroSciteEnabled: false,
    zoteroSciteRefreshIntervalDays: 7,
    zoteroSciteRefreshOnImport: true,
    zoteroTaskAnnotationColors: DEFAULT_ZOTERO_TASK_ANNOTATION_COLORS,
    ...overrides,
  };
}

function item(overrides: Record<string, any> = {}) {
  return {
    abstractNote: 'This paper explains\nuseful things.',
    citationKey: 'smith2024',
    citekey: 'smith2024',
    creators: [
      {
        creatorType: 'author',
        firstName: 'Jane',
        lastName: 'Smith',
      },
    ],
    date: '2024-03-15',
    dateAdded: '2024-03-16T10:00:00Z',
    dateModified: '2024-03-17T10:00:00Z',
    desktopURI: 'zotero://select/library/items/ABC123',
    DOI: '10.123/example',
    itemKey: 'ABC123',
    itemType: 'journalArticle',
    libraryID: 1,
    publicationTitle: 'Journal of Useful Papers',
    tags: [{ tag: 'climate' }],
    title: 'A useful paper',
    url: 'https://example.com/paper',
    attachments: [
      {
        path: '/tmp/Paper File.pdf',
        pdfURI: 'zotero://open-pdf/library/items/PDF123',
        annotations: [
          { colorCategory: 'Purple', id: 'a1' },
          { colorCategory: 'Yellow', id: 'a2' },
        ],
      },
    ],
    collections: [{ fullPath: 'Reading/Queue' }],
    ...overrides,
  };
}

describe('normalizeTaskAnnotationColors()', () => {
  it('defaults to Purple, Magenta, and Gray when no saved value exists', () => {
    expect(normalizeTaskAnnotationColors(undefined)).toEqual([
      'Purple',
      'Magenta',
      'Gray',
    ]);
  });

  it('filters invalid saved values against the Zotero palette', () => {
    expect(normalizeTaskAnnotationColors(['Red', 'Cyan', 'Orange'])).toEqual([
      'Red',
      'Orange',
    ]);
  });

  it('exposes exactly the valid Zotero annotation colors', () => {
    expect(ZOTERO_ANNOTATION_COLORS).toEqual([
      'Yellow',
      'Red',
      'Green',
      'Blue',
      'Purple',
      'Magenta',
      'Orange',
      'Gray',
    ]);
  });
});

describe('normalizePreservedProperties()', () => {
  it('allows users to clear the preserved property list', () => {
    expect(normalizePreservedProperties([])).toEqual([]);
  });
});

describe('normalizeExportFormatOutputPaths()', () => {
  it('migrates the old default citekey filename to @citekey', () => {
    expect(
      normalizeExportFormatOutputPaths([
        {
          name: 'Literature Note',
          outputPathTemplate: '{{citekey}}.md',
          imageOutputPathTemplate: '{{citekey}}/',
          imageBaseNameTemplate: 'image',
        },
      ])
    ).toEqual([
      {
        name: 'Literature Note',
        outputPathTemplate: '@{{citekey}}.md',
        imageOutputPathTemplate: 'images/',
        imageBaseNameTemplate: '@{{citekey}}-image',
      },
    ]);
  });

  it('leaves custom path templates unchanged', () => {
    expect(
      normalizeExportFormatOutputPaths([
        {
          name: 'Custom',
          outputPathTemplate: 'Literature/{{citekey}}.md',
          imageOutputPathTemplate: 'Assets/{{citekey}}/',
          imageBaseNameTemplate: '{{citekey}}-figure',
        },
      ])
    ).toEqual([
      {
        name: 'Custom',
        outputPathTemplate: 'Literature/{{citekey}}.md',
        imageOutputPathTemplate: 'Assets/{{citekey}}/',
        imageBaseNameTemplate: '{{citekey}}-figure',
      },
    ]);
  });

  it('migrates the previous images/citekey default folder to citekey-prefixed names', () => {
    expect(
      normalizeExportFormatOutputPaths([
        {
          name: 'Literature Note',
          outputPathTemplate: '@{{citekey}}.md',
          imageOutputPathTemplate: 'images/{{citekey}}/',
          imageBaseNameTemplate: 'image',
        },
      ])
    ).toEqual([
      {
        name: 'Literature Note',
        outputPathTemplate: '@{{citekey}}.md',
        imageOutputPathTemplate: 'images/',
        imageBaseNameTemplate: '@{{citekey}}-image',
      },
    ]);
  });
});

describe('normalizeManagedImportSettings()', () => {
  it('migrates existing default import formats during settings load', () => {
    expect(
      normalizeManagedImportSettings(
        settings({
          exportFormats: [
            {
              name: 'Literature Note',
              outputPathTemplate: '{{citekey}}.md',
              imageOutputPathTemplate: '{{citekey}}/',
              imageBaseNameTemplate: 'image',
            },
          ],
        })
      ).exportFormats[0]
    ).toMatchObject({
      outputPathTemplate: '@{{citekey}}.md',
      imageOutputPathTemplate: 'images/',
      imageBaseNameTemplate: '@{{citekey}}-image',
    });
  });
});

describe('applyManagedZoteroFrontmatter()', () => {
  it('refreshes Zotero-owned properties', () => {
    const frontmatter: Record<string, any> = {
      zoteroTitle: 'Old title',
    };

    applyManagedZoteroFrontmatter(frontmatter, item(), settings());

    expect(frontmatter).toMatchObject({
      zoteroAbstract: 'This paper explains useful things.',
      zoteroAnnotationCount: 2,
      zoteroAuthors: ['Jane Smith'],
      zoteroCitekey: 'smith2024',
      zoteroCollections: ['Reading/Queue'],
      zoteroDOI: '10.123/example',
      zoteroItemKey: 'ABC123',
      zoteroLibraryID: 1,
      zoteroOpenTaskCount: 1,
      zoteroOpenTasks: true,
      zoteroPDF: '[Local pdf](file:///tmp/Paper%20File.pdf)',
      zoteroPublication: 'Journal of Useful Papers',
      zoteroReader: '[zotero reader](zotero://open-pdf/library/items/PDF123)',
      zoteroTags: ['climate'],
      zoteroTitle: 'A useful paper',
      zoteroType: 'journalArticle',
      zoteroURI: '[zotero item](zotero://select/library/items/ABC123)',
      zoteroURL: '[weblink](https://example.com/paper)',
      zoteroYear: '2024',
    });
  });

  it('writes scite properties when provided by the managed writer', () => {
    const frontmatter: Record<string, any> = {};

    applyManagedZoteroFrontmatter(
      frontmatter,
      item(),
      settings(),
      undefined,
      undefined,
      {
        zoteroSciteCitingPublications: 42,
        zoteroSciteContradicting: 1,
        zoteroSciteMentioning: 35,
        zoteroSciteStatus: 'ok',
        zoteroSciteSupporting: 6,
        zoteroSciteTotalStatements: 44,
        zoteroSciteUnclassified: 2,
        zoteroSciteUpdatedAt: '2026-06-09T10:00:00.000Z',
        zoteroSciteURL: 'https://scite.ai/reports/10.123/example',
      }
    );

    expect(frontmatter).toMatchObject({
      zoteroSciteCitingPublications: 42,
      zoteroSciteContradicting: 1,
      zoteroSciteMentioning: 35,
      zoteroSciteStatus: 'ok',
      zoteroSciteSupporting: 6,
      zoteroSciteTotalStatements: 44,
      zoteroSciteUnclassified: 2,
      zoteroSciteUpdatedAt: '2026-06-09T10:00:00.000Z',
      zoteroSciteURL: 'https://scite.ai/reports/10.123/example',
    });
  });

  it('derives zoteroReader from an attachment Zotero URI', () => {
    const frontmatter: Record<string, any> = {};

    applyManagedZoteroFrontmatter(
      frontmatter,
      item({
        attachments: [
          {
            path: '/tmp/Paper File.pdf',
            uri: 'http://zotero.org/users/1/items/PDF123',
          },
        ],
      }),
      settings()
    );

    expect(frontmatter.zoteroReader).toBe(
      '[zotero reader](zotero://open-pdf/library/items/PDF123)'
    );
  });

  it('derives group zoteroReader links from attachment Zotero URIs', () => {
    const frontmatter: Record<string, any> = {};

    applyManagedZoteroFrontmatter(
      frontmatter,
      item({
        attachments: [
          {
            path: '/tmp/Paper File.pdf',
            uri: 'http://zotero.org/groups/123/items/PDF123',
          },
        ],
      }),
      settings()
    );

    expect(frontmatter.zoteroReader).toBe(
      '[zotero reader](zotero://open-pdf/groups/123/items/PDF123)'
    );
  });

  it('uses localPath for zoteroPDF and converts attachment select links for zoteroReader', () => {
    const frontmatter: Record<string, any> = {};

    applyManagedZoteroFrontmatter(
      frontmatter,
      item({
        attachments: [
          {
            localPath: '/tmp/Local Paper.pdf',
            desktopURI: 'zotero://select/library/items/PDF123',
          },
        ],
      }),
      settings()
    );

    expect(frontmatter.zoteroPDF).toBe(
      '[Local pdf](file:///tmp/Local%20Paper.pdf)'
    );
    expect(frontmatter.zoteroReader).toBe(
      '[zotero reader](zotero://open-pdf/library/items/PDF123)'
    );
  });

  it('writes PDF placeholders when no PDF attachment is available', () => {
    const frontmatter: Record<string, any> = {};

    applyManagedZoteroFrontmatter(
      frontmatter,
      item({ attachments: [] }),
      settings()
    );

    expect(frontmatter.zoteroPDF).toBe(ZOTERO_NO_PDF_PLACEHOLDER);
    expect(frontmatter.zoteroReader).toBe(ZOTERO_NO_PDF_PLACEHOLDER);
  });

  it('keeps reader links when the PDF has no local path', () => {
    const frontmatter: Record<string, any> = {};

    applyManagedZoteroFrontmatter(
      frontmatter,
      item({
        attachments: [
          {
            contentType: 'application/pdf',
            uri: 'http://zotero.org/users/1/items/PDF123',
          },
        ],
      }),
      settings()
    );

    expect(frontmatter.zoteroPDF).toBe(ZOTERO_NO_PDF_PLACEHOLDER);
    expect(frontmatter.zoteroReader).toBe(
      '[zotero reader](zotero://open-pdf/library/items/PDF123)'
    );
  });

  it('preserves hand-edited user fields', () => {
    const frontmatter: Record<string, any> = {
      zoteroNote: 'Recommended by Sam',
      zoteroProject: ['[[Project A]]'],
      zoteroStatus: 'reading',
      zoteroSummary: 'Already summarized.',
      zoteroTopic: ['photosynthesis'],
    };

    applyManagedZoteroFrontmatter(frontmatter, item(), settings(), {
      zoteroNote: 'New import note',
      zoteroProject: ['[[Project B]]'],
      zoteroStatus: 'new',
      zoteroSummary: 'New summary.',
      zoteroTopic: ['drought'],
    });

    expect(frontmatter.zoteroProject).toEqual(['[[Project A]]']);
    expect(frontmatter.zoteroTopic).toEqual(['photosynthesis']);
    expect(frontmatter.zoteroNote).toBe('Recommended by Sam');
    expect(frontmatter.zoteroSummary).toBe('Already summarized.');
    expect(frontmatter.zoteroStatus).toBe('reading');
  });

  it('restores preserved fields from previous frontmatter after template overwrite', () => {
    const frontmatter: Record<string, any> = {
      aliases: ['Template alias'],
      zoteroNote: 'Template note',
      zoteroProject: ['[[Template Project]]'],
      zoteroStatus: 'new',
    };
    const previousFrontmatter: Record<string, any> = {
      aliases: ['Manual alias'],
      zoteroNote: 'Recommended by Sam',
      zoteroProject: ['[[Project A]]'],
      zoteroStatus: 'reading',
    };

    applyManagedZoteroFrontmatter(
      frontmatter,
      item(),
      settings(),
      undefined,
      previousFrontmatter
    );

    expect(frontmatter.zoteroProject).toEqual(['[[Project A]]']);
    expect(frontmatter.zoteroNote).toBe('Recommended by Sam');
    expect(frontmatter.zoteroStatus).toBe('reading');
    expect(frontmatter.aliases).toEqual([
      'Manual alias',
      'Template alias',
      '@smith2024: A useful paper',
    ]);
  });

  it('initializes missing preserved fields', () => {
    const frontmatter: Record<string, any> = {};

    applyManagedZoteroFrontmatter(frontmatter, item(), settings(), {
      zoteroProject: ['[[Project B]]'],
      zoteroTopic: ['drought'],
      zoteroNote: 'Recommended by Sam',
      zoteroSummary: 'Useful hydraulic traits paper.',
      zoteroStatus: 'new',
    });

    expect(frontmatter.zoteroProject).toEqual(['[[Project B]]']);
    expect(frontmatter.zoteroTopic).toEqual(['drought']);
    expect(frontmatter.zoteroNote).toBe('Recommended by Sam');
    expect(frontmatter.zoteroSummary).toBe('Useful hydraulic traits paper.');
    expect(frontmatter.zoteroStatus).toBe('new');
  });

  it('merges managed aliases with existing aliases', () => {
    const frontmatter: Record<string, any> = {
      aliases: ['Manual alias'],
    };

    applyManagedZoteroFrontmatter(frontmatter, item(), settings());

    expect(frontmatter.aliases).toEqual([
      'Manual alias',
      '@smith2024: A useful paper',
    ]);
  });

  it('removes old generated aliases when refreshing managed aliases', () => {
    const frontmatter: Record<string, any> = {
      aliases: [
        'Manual alias',
        '@smith2024',
        'A useful paper',
        '@smith2024: A useful paper',
      ],
    };

    applyManagedZoteroFrontmatter(frontmatter, item(), settings());

    expect(frontmatter.aliases).toEqual([
      'Manual alias',
      '@smith2024: A useful paper',
    ]);
  });

  it('sorts frontmatter properties alphabetically', () => {
    const frontmatter: Record<string, any> = {
      zoteroStatus: 'new',
      aliases: ['Manual alias'],
      zoteroProject: ['[[Project A]]'],
    };

    applyManagedZoteroFrontmatter(frontmatter, item(), settings());

    expect(Object.keys(frontmatter)).toEqual(
      [...Object.keys(frontmatter)].sort((a, b) =>
        a.localeCompare(b, undefined, { sensitivity: 'base' })
      )
    );
  });

  it('writes no open tasks when configured colors are absent', () => {
    const frontmatter: Record<string, any> = {};

    applyManagedZoteroFrontmatter(
      frontmatter,
      item(),
      settings({ zoteroTaskAnnotationColors: ['Blue'] })
    );

    expect(frontmatter.zoteroOpenTaskCount).toBe(0);
    expect(frontmatter.zoteroOpenTasks).toBe(false);
  });
});
