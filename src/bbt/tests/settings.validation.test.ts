import { getInvalidPreservedProperties } from '../../settings/validation';

describe('getInvalidPreservedProperties()', () => {
  it('accepts known Zotero properties and current vault properties', () => {
    expect(
      getInvalidPreservedProperties(
        ['citekey', 'zoteroProject', 'customReviewedBy', 'unknownField'],
        ['customReviewedBy']
      )
    ).toEqual(['unknownField']);
  });

  it('does not warn for empty input', () => {
    expect(getInvalidPreservedProperties(undefined)).toEqual([]);
    expect(getInvalidPreservedProperties([])).toEqual([]);
  });
});
