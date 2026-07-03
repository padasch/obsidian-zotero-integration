import { applyNewNoteDefaults } from '../newNoteDefaults';

describe('applyNewNoteDefaults', () => {
  it('adds zoteroStatus new for a newly created note without managed status', () => {
    const frontmatter: Record<string, unknown> = {};

    applyNewNoteDefaults(frontmatter);

    expect(frontmatter.zoteroStatus).toBe('new');
  });

  it('does not overwrite an existing zoteroStatus', () => {
    const frontmatter: Record<string, unknown> = {
      zoteroStatus: 'reading',
    };

    applyNewNoteDefaults(frontmatter);

    expect(frontmatter.zoteroStatus).toBe('reading');
  });

  it('does not overwrite a status supplied by managed import properties', () => {
    const frontmatter: Record<string, unknown> = {};

    applyNewNoteDefaults(frontmatter, {
      zoteroProject: [],
      zoteroTopic: [],
      zoteroNote: '',
      zoteroStatus: 'priority',
    });

    expect(frontmatter.zoteroStatus).toBeUndefined();
  });
});
