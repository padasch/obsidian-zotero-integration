import {
  buildLiteratureReportCorpus,
  buildOllamaEvidenceMapRequest,
  frontmatterMatchesScope,
  renderLiteratureEvidenceMapReport,
  validateAiEvidenceMap,
} from '../../LiteratureEvidenceMap';

describe('frontmatterMatchesScope()', () => {
  it('matches string and array project/topic values', () => {
    expect(
      frontmatterMatchesScope(
        { zoteroProject: '[[Project A]], [[Project B]]' },
        'zoteroProject',
        '[[Project A]]'
      )
    ).toBe(true);
    expect(
      frontmatterMatchesScope(
        { zoteroTopic: ['drought', 'hydraulics'] },
        'zoteroTopic',
        'Hydraulics'
      )
    ).toBe(true);
    expect(
      frontmatterMatchesScope(
        { zoteroTopic: ['drought'] },
        'zoteroTopic',
        'photosynthesis'
      )
    ).toBe(false);
  });
});

describe('buildLiteratureReportCorpus()', () => {
  it('extracts abstract and default annotation evidence from matching notes', () => {
    const corpus = buildLiteratureReportCorpus(
      [
        {
          path: 'Literature/@smith2026.md',
          basename: '@smith2026',
          frontmatter: {
            zoteroProject: ['[[Project A]]'],
            zoteroTitle: 'Canopy drought response, with commas',
            zoteroCitekey: 'smith2026',
            zoteroYear: '2026',
            zoteroAuthors: ['Smith, Jane'],
            zoteroDOI: '10.1000/example',
            zoteroURL: '[weblink](https://example.com/paper)',
            zoteroURI: '[zotero item](zotero://select/library/items/ABC123)',
            zoteroAbstract:
              'This abstract includes a comma, and should remain intact.',
          },
          markdown: [
            '# Canopy drought response',
            '',
            '## All Annotations',
            '',
            '> [!annotation-yellow] Page 3 ([Ref](zotero://open-pdf/library/items/ABC123?page=3&annotation=XYZ))',
            '> Leaf water potential declined under drought.',
            '>',
            '> _Comment:_ Relevant methods detail.',
          ].join('\n'),
        },
        {
          path: 'Literature/@doe2025.md',
          basename: '@doe2025',
          frontmatter: {
            zoteroProject: ['[[Other Project]]'],
            zoteroTitle: 'Other paper',
            zoteroAbstract: 'Not in scope.',
          },
          markdown: '',
        },
      ],
      'zoteroProject',
      '[[Project A]]'
    );

    expect(corpus.sources).toHaveLength(1);
    expect(corpus.evidence.map((item) => item.id)).toEqual([
      'S1-abstract',
      'S1-annotation-1',
    ]);
    expect(corpus.evidence[0].text).toContain(
      'This abstract includes a comma, and should remain intact.'
    );
    expect(corpus.evidence[1]).toMatchObject({
      href: 'zotero://open-pdf/library/items/ABC123?page=3&annotation=XYZ',
      locator: 'Page 3',
      text: 'Leaf water potential declined under drought. Comment: Relevant methods detail.',
    });
  });

  it('still builds evidence when annotations are missing', () => {
    const corpus = buildLiteratureReportCorpus(
      [
        {
          path: 'Literature/@paper.md',
          basename: '@paper',
          frontmatter: {
            zoteroTopic: 'photosynthesis',
            zoteroTitle: 'Photosynthesis paper',
            zoteroAbstract: 'Abstract-only evidence.',
          },
          markdown: '_No annotations imported._',
        },
      ],
      'zoteroTopic',
      'photosynthesis'
    );

    expect(corpus.evidence).toHaveLength(1);
    expect(corpus.evidence[0]).toMatchObject({
      id: 'S1-abstract',
      kind: 'abstract',
      text: 'Abstract-only evidence.',
    });
  });
});

describe('validateAiEvidenceMap()', () => {
  const evidence = buildLiteratureReportCorpus(
    [
      {
        path: 'Literature/@smith2026.md',
        basename: '@smith2026',
        frontmatter: {
          zoteroProject: '[[Project A]]',
          zoteroTitle: 'Paper',
          zoteroAbstract: 'Evidence text.',
        },
      },
    ],
    'zoteroProject',
    '[[Project A]]'
  ).evidence;

  it('omits claims with unresolved evidence ids', () => {
    const result = validateAiEvidenceMap(
      {
        title: 'Drought Map',
        themes: [
          {
            title: 'Water stress',
            claims: [
              {
                claim: 'The paper reports water-stress evidence.',
                evidenceIds: ['S1-abstract'],
              },
              {
                claim: 'This claim cites a missing record.',
                evidenceIds: ['missing-id'],
              },
            ],
          },
        ],
      },
      evidence
    );

    expect(result.themes).toHaveLength(1);
    expect(result.themes[0].claims).toHaveLength(1);
    expect(result.omittedClaimCount).toBe(1);
  });
});

describe('renderLiteratureEvidenceMapReport()', () => {
  it('renders report frontmatter, cited claims, sources, and evidence index', () => {
    const corpus = buildLiteratureReportCorpus(
      [
        {
          path: 'Literature/@smith2026.md',
          basename: '@smith2026',
          frontmatter: {
            zoteroProject: '[[Project A]]',
            zoteroTitle: 'Drought paper',
            citekey: 'smith2026',
            zoteroYear: '2026',
            zoteroAbstract: 'Drought abstract evidence.',
          },
        },
      ],
      'zoteroProject',
      '[[Project A]]'
    );
    const aiMap = validateAiEvidenceMap(
      {
        title: 'Evidence Map',
        themes: [
          {
            title: 'Drought response',
            claims: [
              {
                claim: 'The source discusses drought responses.',
                evidenceIds: ['S1-abstract'],
              },
            ],
          },
        ],
      },
      corpus.evidence
    );
    const markdown = renderLiteratureEvidenceMapReport({
      corpus,
      aiMap,
      generatedAt: new Date('2026-07-04T10:00:00.000Z'),
      model: 'llama3.2',
      language: 'English',
    });

    expect(markdown).toContain('zoteroLiteratureReport: true');
    expect(markdown).toContain('zoteroReportSourceCount: 1');
    expect(markdown).toContain('# Evidence Map: Project A');
    expect(markdown).toContain(
      '- The source discusses drought responses. Evidence:'
    );
    expect(markdown).toContain('S1-abstract');
    expect(markdown).toContain('## Sources');
    expect(markdown).toContain('## Evidence Index');
    expect(markdown).toContain('Drought abstract evidence.');
  });
});

describe('buildOllamaEvidenceMapRequest()', () => {
  it('includes structured-output schema and compact evidence records', () => {
    const corpus = buildLiteratureReportCorpus(
      [
        {
          path: 'Literature/@smith2026.md',
          basename: '@smith2026',
          frontmatter: {
            zoteroTopic: 'hydraulics',
            zoteroTitle: 'Hydraulics paper',
            zoteroAbstract: 'Hydraulic evidence.',
          },
        },
      ],
      'zoteroTopic',
      'hydraulics'
    );
    const body = buildOllamaEvidenceMapRequest({
      corpus,
      basePrompt: 'Use evidence only.',
      additionalPrompt: 'Focus on methods.',
      language: 'English',
      model: 'llama3.2',
    });

    expect(body).toMatchObject({
      model: 'llama3.2',
      stream: false,
    });
    expect(body.format).toHaveProperty('properties.themes');
    expect(body.messages[1].content).toContain('"id": "S1-abstract"');
    expect(body.messages[1].content).toContain('Focus on methods.');
  });
});
