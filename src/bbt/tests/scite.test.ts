import {
  applyScitePropertiesToFrontmatter,
  getNoteDoi,
  normalizeDoi,
} from '../../scite';

jest.mock(
  'obsidian',
  () => ({
    request: jest.fn(),
    TFile: class {},
  }),
  { virtual: true }
);

describe('scite helpers', () => {
  it('normalizes DOI values from common note formats', () => {
    expect(normalizeDoi('https://doi.org/10.1000/example')).toBe(
      '10.1000/example'
    );
    expect(normalizeDoi('doi: 10.1000/example')).toBe('10.1000/example');
    expect(getNoteDoi({ zoteroDOI: 'https://dx.doi.org/10.1000/example' })).toBe(
      '10.1000/example'
    );
  });

  it('replaces stale scite frontmatter with fresh defined values', () => {
    const frontmatter: Record<string, unknown> = {
      zoteroSciteCitingPublications: 100,
      zoteroSciteContradicting: 2,
      keepMe: true,
    };

    applyScitePropertiesToFrontmatter(frontmatter, {
      zoteroSciteCitingPublications: 3,
      zoteroSciteContradicting: undefined,
      zoteroSciteStatus: 'ok',
    });

    expect(frontmatter).toEqual({
      keepMe: true,
      zoteroSciteCitingPublications: 3,
      zoteroSciteStatus: 'ok',
    });
  });
});
