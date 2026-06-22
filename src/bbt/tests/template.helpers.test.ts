import moment from 'moment';

import { renderTemplate } from '../template.env';
import {
  DEFAULT_LITERATURE_NOTE_TEMPLATE,
  getTemplates,
} from '../template.helpers';

jest.mock(
  'obsidian',
  () => ({
    moment: require('moment'),
    Notice: jest.fn(),
    TFile: class {},
  }),
  { virtual: true }
);

describe('getTemplates', () => {
  it('uses the built-in literature note template when no template file is configured', async () => {
    const templates = await getTemplates({
      exportFormat: {
        name: 'Literature Note',
        outputPathTemplate: '@{{citekey}}.md',
        imageOutputPathTemplate: 'images/',
        imageBaseNameTemplate: '@{{citekey}}-image',
      },
    } as any);

    expect(templates.template).toBe(DEFAULT_LITERATURE_NOTE_TEMPLATE);
  });

  it('renders stable Zotero identity fields and annotation sections', async () => {
    const output = await renderTemplate('', DEFAULT_LITERATURE_NOTE_TEMPLATE, {
      title: 'Example "Paper"',
      citationKey: 'smith2026example',
      libraryID: 1,
      itemKey: 'ABC123',
      date: moment('2026-06-19', 'YYYY-MM-DD'),
      itemType: 'journalArticle',
      authors: 'Smith, Jane',
      publicationTitle: 'Journal of Examples',
      DOI: '10.1000/example',
      url: 'https://example.com/paper',
      desktopURI: 'zotero://select/library/items/ABC123',
      dateAdded: moment('2026-06-18', 'YYYY-MM-DD'),
      importDate: moment('2026-06-19', 'YYYY-MM-DD'),
      zoteroProject: ['[[Project A]]'],
      zoteroTopic: ['ecosystem'],
      zoteroNote: 'Read for methods',
      zoteroStatus: 'new',
      annotations: [
        {
          colorCategory: 'Gray',
          annotatedText: 'Follow this up',
          comment: 'Needs project note',
          desktopURI: 'zotero://open-pdf/library/items/ABC123',
          page: 2,
        },
      ],
    });

    expect(output).toContain('citekey: "smith2026example"');
    expect(output).toContain('zoteroLibraryID: 1');
    expect(output).toContain('zoteroItemKey: "ABC123"');
    expect(output).toContain('zoteroYear: "2026"');
    expect(output).toContain('zoteroAnnotationCount: 1');
    expect(output).toContain('zoteroOpenTaskCount: 1');
    expect(output).toContain('zoteroOpenTasks: true');
    expect(output).toContain('zoteroPDF: "no pdf available"');
    expect(output).toContain('zoteroReader: "no pdf available"');
    expect(output).toContain('zoteroURL: "[weblink](https://example.com/paper)"');
    expect(output).toContain(
      'zoteroURI: "[zotero item](zotero://select/library/items/ABC123)"'
    );
    expect(output).toMatch(/zoteroProject:\s*\n {2}- "\[\[Project A\]\]"/);
    expect(output).toMatch(/zoteroTopic:\s*\n {2}- "ecosystem"/);
    expect(output).toContain('zoteroNote: "Read for methods"');
    expect(output).toContain('zoteroStatus: "new"');
    expect(output).toMatch(/zoteroTags:\s*\n {2}- "\/notags"/);
    expect(output).toContain('Automated Metadata');
    expect(output).toContain('## Notes');
    expect(output).toContain('%% begin notes %%');
    expect(output).toContain('Follow-up Annotations');
    expect(output).toContain('## All Annotations');
    expect(output).toContain('Follow this up');
  });
});
