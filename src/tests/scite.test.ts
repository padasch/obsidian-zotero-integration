import {
  buildSciteManagedProperties,
  getSciteReportUrl,
  isSciteMetadataFresh,
  normalizeSciteDoi,
  normalizeSciteSettings,
  normalizeSciteTalliesResponse,
} from '../scite';
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
    zoteroPreservedProperties: [],
    zoteroSciteApiToken: '',
    zoteroSciteEnabled: false,
    zoteroSciteRefreshIntervalDays: 7,
    zoteroSciteRefreshOnImport: true,
    zoteroTaskAnnotationColors: [],
    ...overrides,
  };
}

describe('normalizeSciteDoi()', () => {
  it('cleans DOI URLs and doi prefixes', () => {
    expect(normalizeSciteDoi('https://doi.org/10.123/example.')).toBe(
      '10.123/example'
    );
    expect(normalizeSciteDoi('doi: 10.555/test')).toBe('10.555/test');
  });
});

describe('normalizeSciteTalliesResponse()', () => {
  it('normalizes current and legacy tally field names', () => {
    expect(
      normalizeSciteTalliesResponse(
        {
          citingPublications: '42',
          contrasting: 2,
          mentioningValue: 30,
          supporting: 8,
          total: 43,
          unclassifiedValue: 3,
        },
        '10.123/example'
      )
    ).toEqual({
      citingPublications: 42,
      contradicting: 2,
      doi: '10.123/example',
      mentioning: 30,
      supporting: 8,
      total: 43,
      unclassified: 3,
    });
  });
});

describe('buildSciteManagedProperties()', () => {
  it('maps scite tallies to managed Obsidian properties', () => {
    expect(
      buildSciteManagedProperties(
        {
          citingPublications: 42,
          contradicting: 1,
          doi: '10.123/example',
          mentioning: 35,
          supporting: 6,
          total: 44,
          unclassified: 2,
        },
        '2026-06-09T10:00:00.000Z'
      )
    ).toEqual({
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
});

describe('isSciteMetadataFresh()', () => {
  it('uses the configured refresh interval', () => {
    expect(
      isSciteMetadataFresh(
        { zoteroSciteUpdatedAt: '2026-06-01T00:00:00.000Z' },
        settings({ zoteroSciteRefreshIntervalDays: 10 }),
        Date.parse('2026-06-09T00:00:00.000Z')
      )
    ).toBe(true);

    expect(
      isSciteMetadataFresh(
        { zoteroSciteUpdatedAt: '2026-06-01T00:00:00.000Z' },
        settings({ zoteroSciteRefreshIntervalDays: 7 }),
        Date.parse('2026-06-09T00:00:00.000Z')
      )
    ).toBe(false);
  });
});

describe('normalizeSciteSettings()', () => {
  it('fills new scite setting defaults during migration', () => {
    const normalized = normalizeSciteSettings(
      settings({
        zoteroSciteApiToken: ' token ',
        zoteroSciteRefreshIntervalDays: Number.NaN,
        zoteroSciteRefreshOnImport: undefined as any,
      })
    );

    expect(normalized.zoteroSciteApiToken).toBe('token');
    expect(normalized.zoteroSciteEnabled).toBe(false);
    expect(normalized.zoteroSciteRefreshIntervalDays).toBe(7);
    expect(normalized.zoteroSciteRefreshOnImport).toBe(true);
  });
});

describe('getSciteReportUrl()', () => {
  it('uses scite DOI report URLs', () => {
    expect(getSciteReportUrl('10.1101/2020.01.26.919985')).toBe(
      'https://scite.ai/reports/10.1101/2020.01.26.919985'
    );
  });
});
