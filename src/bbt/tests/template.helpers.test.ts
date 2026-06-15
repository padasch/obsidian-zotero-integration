import { DEFAULT_IMPORT_TEMPLATE } from '../template.helpers';
import { renderTemplate } from '../template.env';

const moment = require('moment');

function getRenderedCallout(rendered: string, marker: string): string[] {
  const lines = rendered.split('\n');
  const start = lines.findIndex((line) => line.includes(marker));
  expect(start).toBeGreaterThanOrEqual(0);

  const block: string[] = [];
  for (let index = start; index < lines.length; index++) {
    const line = lines[index];
    if (index > start && line === '') break;
    block.push(line);
  }

  return block;
}

jest.mock(
  'obsidian',
  () => ({
    moment: require('moment'),
    Notice: jest.fn(),
  }),
  { virtual: true }
);

describe('DEFAULT_IMPORT_TEMPLATE', () => {
  it('is body-only and does not include YAML frontmatter', () => {
    expect(DEFAULT_IMPORT_TEMPLATE.trimStart().startsWith('---')).toBe(false);
  });

  it('renders annotation callouts with explicit comments', async () => {
    const rendered = await renderTemplate('', DEFAULT_IMPORT_TEMPLATE, {
      DOI: '10.123/example',
      abstractNote: 'This is\nthe abstract.',
      annotations: [
        {
          annotatedText: 'Highlighted\nannotation text.',
          colorCategory: 'Yellow',
          comment: 'Follow up on this.',
          desktopURI:
            'zotero://open-pdf/library/items/PDF123?page=4&annotation=A1',
          page: 4,
        },
        {
          annotatedText: 'This needs follow-up.',
          colorCategory: 'Gray',
          desktopURI:
            'zotero://open-pdf/library/items/PDF123?page=5&annotation=A2',
          page: 5,
        },
        {
          annotatedText: 'This is important.',
          colorCategory: 'Red',
          page: 6,
        },
        {
          comment: 'I do not understand this section.',
          colorCategory: 'Purple',
          page: 7,
        },
        {
          colorCategory: 'Blue',
          imageRelativePath: 'paper/image-1.png',
          page: 8,
        },
      ],
      authors: 'Jane Smith',
      bibliography: 'Smith, J. (2024). A useful paper.',
      citationKey: 'smith2024',
      collections: [{ name: 'Reading' }],
      date: moment('2024-03-15', 'YYYY-MM-DD'),
      dateAdded: moment('2024-03-16', 'YYYY-MM-DD'),
      desktopURI: 'zotero://select/library/items/ABC123',
      importDate: moment('2024-03-17', 'YYYY-MM-DD'),
      itemType: 'journalArticle',
      pdfLink: '[Paper.pdf](file:///tmp/Paper.pdf)',
      pdfZoteroLink: '[Paper.pdf](zotero://open-pdf/library/items/PDF123)',
      publicationTitle: 'Journal of Useful Papers',
      tags: [{ tag: 'climate' }, { tag: 'methods' }],
      title: 'A useful paper',
      url: 'https://example.com/paper',
    });

    expect(rendered).toContain('# A useful paper');
    expect(rendered).toContain('> [!quote] Reference');
    expect(rendered).toContain('> [!abstract] Abstract');
    expect(rendered).toContain('> This is the abstract.');
    expect(rendered).toContain('> [!summary] Automated Metadata');
    expect(rendered).toContain('> - Authors: Jane Smith');
    expect(rendered).toContain('> - Zotero tags: climate, methods');
    expect(rendered).toContain(
      '> - [zotero item](zotero://select/library/items/ABC123)'
    );
    expect(rendered).toContain(
      '> - [zotero reader](zotero://open-pdf/library/items/PDF123)'
    );
    expect(rendered).toContain('> - [weblink](https://example.com/paper)');
    expect(rendered).toContain('> - [Local pdf](file:///tmp/Paper.pdf)');
    expect(rendered).toContain('> - Date added: 2024-03-16');
    expect(rendered).toContain('> - Last import: 2024-03-17');
    expect(rendered).toContain('> - Citation key: smith2024');
    expect(rendered).toContain('> [!todo]+ Follow-up Annotations');
    expect(rendered).toContain('## Annotations');
    expect(rendered).not.toContain('## Review');
    expect(rendered).not.toContain('## Notes');
    expect(rendered).not.toContain('## All Annotations');
    expect(rendered).not.toContain('> [!warning]+ Important Highlights');
    expect(rendered).not.toContain('> [!question]+ Questions And Unclear Sections');
    expect(rendered).not.toContain('> [!quote]+ Images');
    expect(rendered).not.toContain('Annotation Color Guide');
    expect(rendered).toContain(
      '> [!annotation-yellow] Page 4 ([Ref](zotero://open-pdf/library/items/PDF123?page=4&annotation=A1))'
    );
    expect(rendered).toContain('> Highlighted<br>annotation text.');
    expect(rendered).toContain('> _Comment:_ Follow up on this.');
    expect(rendered).toContain('> ![[paper/image-1.png|500]]');

    [
      '[!summary] Automated Metadata',
      '[!todo]+ Follow-up Annotations',
      '[!annotation-yellow] Page 4',
    ].forEach((marker) => {
      const block = getRenderedCallout(rendered, marker);
      expect(block).not.toContain('');
      expect(block.every((line) => line.startsWith('>'))).toBe(true);
    });
  });
});
