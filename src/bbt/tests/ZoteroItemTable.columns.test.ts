import type { ZoteroMonitorItem } from '../../types';
import {
  getInvalidZoteroItemTableColumns,
  getZoteroItemTableCellText,
  getZoteroItemTableChipValues,
  getZoteroItemTableSortValue,
  normalizeZoteroItemTableColumns,
} from '../../ZoteroItemTable.columns';

function makeItem(): ZoteroMonitorItem {
  return {
    title: 'Hydraulic safety margins in forests',
    citekey: 'smith2025hydraulic',
    libraryID: 1,
    libraryName: 'My Library',
    itemKey: 'ABCD1234',
    dateAdded: '2026-06-17T12:00:00Z',
    dateModified: '2026-06-18T12:00:00Z',
    item: {
      creators: [
        { firstName: 'Ada', lastName: 'Smith' },
        { name: 'Forest Research Group' },
      ],
      date: '2025-04',
      publicationTitle: 'Journal of Tree Physiology',
      proceedingsTitle: 'Proceedings fallback',
      bookTitle: 'Book fallback',
      publisher: 'Example Press',
      itemType: 'journalArticle',
      DOI: '10.1000/example',
      url: 'https://example.com/paper',
      tags: [{ tag: 'drought' }, { tag: 'hydraulics' }],
      collections: ['topics', 'topics/coding', 'topics/coding/r'],
    },
  };
}

describe('normalizeZoteroItemTableColumns()', () => {
  it('keeps configured order, expands legacy scope aliases, and ignores unknown columns', () => {
    expect(
      normalizeZoteroItemTableColumns([
        'title',
        'journal',
        'type',
        'scopes',
        'DOI',
        'not-a-column',
      ])
    ).toEqual([
      'title',
      'publication',
      'itemType',
      'tags',
      'collections',
      'doi',
    ]);
  });

  it('falls back to defaults when every configured entry is invalid', () => {
    expect(normalizeZoteroItemTableColumns(['nope'])).toEqual([
      'title',
      'citekey',
      'dateAdded',
      'tags',
      'collections',
    ]);
  });

  it('reports invalid entries while accepting aliases', () => {
    expect(
      getInvalidZoteroItemTableColumns(['journal', 'itemType', 'bogus'])
    ).toEqual(['bogus']);
  });
});

describe('Zotero item table cell extraction', () => {
  it('extracts core Zotero publication metadata', () => {
    const item = makeItem();

    expect(getZoteroItemTableCellText(item, 'creators')).toBe(
      'Ada Smith, Forest Research Group'
    );
    expect(getZoteroItemTableCellText(item, 'year')).toBe('2025');
    expect(getZoteroItemTableCellText(item, 'publication')).toBe(
      'Journal of Tree Physiology'
    );
    expect(getZoteroItemTableCellText(item, 'publisher')).toBe('Example Press');
    expect(getZoteroItemTableCellText(item, 'itemType')).toBe('journalArticle');
    expect(getZoteroItemTableCellText(item, 'doi')).toBe('10.1000/example');
    expect(getZoteroItemTableCellText(item, 'dateAdded')).toBe('2026-06-17');
  });

  it('uses leaf-only collection paths for chip values', () => {
    expect(getZoteroItemTableChipValues(makeItem(), 'collections')).toEqual([
      'topics/coding/r',
    ]);
  });

  it('sorts publication year numerically', () => {
    expect(getZoteroItemTableSortValue(makeItem(), 'year')).toBe(2025);
  });
});
