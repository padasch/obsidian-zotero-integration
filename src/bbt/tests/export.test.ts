import { applyNewNoteDefaults } from '../newNoteDefaults';

describe('applyNewNoteDefaults', () => {
  it('adds zoteroStatus new for a newly created note without managed status', () => {
    const frontmatter: Record<string, unknown> = {};

    applyNewNoteDefaults(frontmatter);

    expect(frontmatter.zoteroStatus).toBe('new');
    expect(frontmatter.zoteroRelevance).toBe('no');
  });

  it('does not overwrite an existing zoteroStatus', () => {
    const frontmatter: Record<string, unknown> = {
      zoteroStatus: 'reading',
      zoteroRelevance: 'high',
    };

    applyNewNoteDefaults(frontmatter);

    expect(frontmatter.zoteroStatus).toBe('reading');
    expect(frontmatter.zoteroRelevance).toBe('high');
  });

  it('does not overwrite a status supplied by managed import properties', () => {
    const frontmatter: Record<string, unknown> = {};

    applyNewNoteDefaults(frontmatter, {
      zoteroProject: [],
      zoteroTopic: [],
      zoteroNote: '',
      zoteroRelevance: 'medium',
      zoteroStatus: 'priority',
    });

    expect(frontmatter.zoteroStatus).toBeUndefined();
    expect(frontmatter.zoteroRelevance).toBeUndefined();
  });
});
