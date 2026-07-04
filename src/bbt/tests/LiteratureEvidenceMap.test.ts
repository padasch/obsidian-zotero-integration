import {
  buildLiteratureReportCorpus,
  buildLiteratureCompilationReportFilename,
  buildLiteratureSynthesisReportFilename,
  buildOllamaLiteratureSynthesisRequest,
  buildOllamaLiteratureTriageRequest,
  buildOllamaSynthesisPromptRequest,
  buildOllamaSynthesisPromptRevisionRequest,
  buildFallbackLiteratureTriage,
  frontmatterMatchesScope,
  renderLiteratureCompilationReport,
  renderLiteratureSynthesisReport,
  validateAiLiteratureSynthesis,
  validateAiLiteratureTriage,
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
  it('extracts abstract, annotation, publication, and scite metadata', () => {
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
            zoteroPublication: 'Journal of Tree Water',
            zoteroDOI: '10.1000/example',
            zoteroURL: '[weblink](https://example.com/paper)',
            zoteroURI: '[zotero item](zotero://select/library/items/ABC123)',
            zoteroReader:
              '[zotero reader](zotero://open-pdf/library/items/PDF123)',
            zoteroSciteCitingPublications: 42,
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
    expect(corpus.sources[0]).toMatchObject({
      publication: 'Journal of Tree Water',
      sciteCitingPublications: 42,
    });
    expect(corpus.evidence.map((item) => item.id)).toEqual([
      'S1-abstract',
      'S1-annotation-1',
    ]);
    expect(corpus.evidence[0]).toMatchObject({
      href: 'zotero://open-pdf/library/items/PDF123?page=1',
      text: 'This abstract includes a comma, and should remain intact.',
    });
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

describe('buildLiteratureSynthesisReportFilename()', () => {
  it('uses compact date, synthesis label, and sanitized descriptive text', () => {
    expect(
      buildLiteratureSynthesisReportFilename(
        'Drought: stress / forests?',
        '[[Project A]]',
        new Date('2026-07-04T10:00:00.000Z')
      )
    ).toBe('20260704 - Zotero Synthesis - Drought stress forests.md');
  });

  it('falls back to the plain source value when descriptive text is empty', () => {
    expect(
      buildLiteratureSynthesisReportFilename(
        '',
        '[[Project A|Forest Project]]',
        new Date('2026-07-04T10:00:00.000Z')
      )
    ).toBe('20260704 - Zotero Synthesis - Forest Project.md');
  });
});

describe('buildLiteratureCompilationReportFilename()', () => {
  it('uses compact date, collection label, and sanitized descriptive text', () => {
    expect(
      buildLiteratureCompilationReportFilename(
        'Drought: stress / forests?',
        '[[Project A]]',
        new Date('2026-07-04T10:00:00.000Z')
      )
    ).toBe('20260704 - Zotero Collection - Drought stress forests.md');
  });
});

describe('validateAiLiteratureTriage()', () => {
  it('applies relevance, evidence, and annotation caps', () => {
    const corpus = buildLiteratureReportCorpus(
      [
        {
          path: 'Literature/@smith2026.md',
          basename: '@smith2026',
          frontmatter: {
            zoteroProject: '[[Project A]]',
            zoteroTitle: 'Paper',
            zoteroSciteCitingPublications: 12,
            zoteroAbstract: 'Evidence text.',
          },
          markdown: [
            '## All Annotations',
            ...Array.from({ length: 7 }, (_, index) =>
              [
                `> [!annotation-yellow] Page ${index + 1} ([Ref](zotero://open-pdf/library/items/ABC123?page=${index + 1}&annotation=A${index + 1}))`,
                `> Annotation ${index + 1}.`,
              ].join('\n')
            ),
          ].join('\n'),
        },
      ],
      'zoteroProject',
      '[[Project A]]'
    );

    const result = validateAiLiteratureTriage(
      {
        selectedSources: [
          {
            sourceId: 'S1',
            relevanceScore: 0.9,
            reason: 'Relevant drought evidence.',
            theme: 'Drought',
            evidenceIds: corpus.evidence.map((item) => item.id),
          },
        ],
      },
      corpus,
      'standard'
    );

    expect(result.selectedEvidenceIds).toHaveLength(6);
    expect(result.selectedEvidenceIds).toContain('S1-abstract');
    expect(
      result.selectedEvidenceIds.filter((id) => id.includes('annotation'))
    ).toHaveLength(5);
  });
});

describe('validateAiLiteratureSynthesis()', () => {
  const corpus = buildLiteratureReportCorpus(
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
  );

  it('omits uncited claims and claims with unresolved evidence ids', () => {
    const result = validateAiLiteratureSynthesis(
      {
        title: 'Drought synthesis',
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
              {
                claim: 'This claim has no evidence.',
                evidenceIds: [],
              },
            ],
          },
        ],
      },
      corpus.evidence,
      corpus.sources,
      'standard'
    );

    expect(result.themes).toHaveLength(1);
    expect(result.themes[0].claims).toHaveLength(1);
    expect(result.omittedClaimCount).toBe(2);
  });
});

describe('renderLiteratureSynthesisReport()', () => {
  it('renders unified frontmatter, collapsed inputs, bullets, main papers, and footnotes', () => {
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
            zoteroPublication: 'Forest Ecology',
            zoteroURL: '[weblink](https://example.com/paper)',
            zoteroSciteCitingPublications: 88,
            zoteroAbstract: 'Drought abstract evidence.',
          },
          markdown: [
            '## All Annotations',
            '> [!annotation-yellow] Page 3 ([Ref](zotero://open-pdf/library/items/PDF123?page=3&annotation=XYZ))',
            '> Annotation evidence.',
          ].join('\n'),
        },
      ],
      'zoteroProject',
      '[[Project A]]'
    );
    const triage = validateAiLiteratureTriage(
      {
        selectedSources: [
          {
            sourceId: 'S1',
            relevanceScore: 0.9,
            reason: 'Central drought-response evidence.',
            theme: 'Drought response',
            evidenceIds: ['S1-abstract', 'S1-annotation-1'],
          },
        ],
      },
      corpus,
      'standard'
    );
    const synthesis = validateAiLiteratureSynthesis(
      {
        title: 'Evidence Map',
        mainPapers: [
          {
            sourceId: 'S1',
            reason: 'This paper is central for drought-response framing.',
            evidenceIds: ['S1-abstract'],
          },
        ],
        themes: [
          {
            title: 'Drought response',
            claims: [
              {
                claim: 'The source discusses drought responses.',
                evidenceIds: ['S1-abstract', 'S1-annotation-1'],
              },
            ],
          },
        ],
        gaps: [
          {
            claim: 'The selected evidence leaves management implications underdeveloped.',
            evidenceIds: ['S1-annotation-1'],
          },
        ],
      },
      corpus.evidence,
      corpus.sources,
      'standard'
    );
    const markdown = renderLiteratureSynthesisReport({
      corpus,
      synthesis,
      triage,
      generatedAt: new Date('2026-07-04T10:00:00.000Z'),
      model: 'llama3.2',
      language: 'English',
      mode: 'standard',
      synthesisPrompt: 'Focus on drought stress.',
      contextFilePath: 'Projects/Context.md',
      pastedContextUsed: true,
      reportTitle: 'Drought synthesis',
    });

    expect(markdown).toContain('zoteroReport: true');
    expect(markdown).toContain('zoteroReportType: "literature-synthesis"');
    expect(markdown).toContain('zoteroReportSourceProperty: "zoteroProject"');
    expect(markdown).toContain('zoteroReportSourceValue: "[[Project A]]"');
    expect(markdown).toContain('zoteroReportContextFile: "Projects/Context.md"');
    expect(markdown).toContain('zoteroReportPastedContextUsed: true');
    expect(markdown).not.toContain('zoteroLiteratureReport: true');
    expect(markdown).toContain('> [!info]- Inputs used');
    expect(markdown).toContain('# Literature Synthesis: Drought synthesis');
    expect(markdown).toContain('## Main papers to check in this context');
    expect(markdown).toContain('Forest Ecology');
    expect(markdown).toContain('scite citations: 88');
    expect(markdown).not.toContain('supporting');
    expect(markdown).toContain('## Key Synthesis');
    expect(markdown).toContain(
      '- The source discusses drought responses.[^E1][^E2]'
    );
    expect(markdown).toContain('## Gaps And Uncertainties');
    expect(markdown).toContain('## Source Footnotes');
    expect(markdown).toContain(
      '[^E1]: `@smith2026`: [URL](https://example.com/paper), [abstract]'
    );
    expect(markdown).toContain('[annotation p. 3]');
    expect(markdown).toContain('    Excerpt: Drought abstract evidence.');
    expect(markdown).not.toContain('## Evidence Index');
    expect(markdown).not.toContain('| ID |');
    expect(markdown).not.toContain('project context text');
  });
});

describe('renderLiteratureCompilationReport()', () => {
  it('renders a simple collection list with abstract and linked numbered annotations', () => {
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
            zoteroURL: 'https://example.com/paper',
            zoteroURI: 'zotero://select/library/items/ABC123',
            zoteroReader: 'zotero://open-pdf/library/items/PDF123',
            zoteroSciteCitingPublications: 88,
            zoteroSciteSupporting: 72,
            zoteroSciteContradicting: 9,
            zoteroSciteTotalStatements: 168,
          },
          markdown: [
            '## All Annotations',
            '> [!annotation-yellow] Page 3 ([Ref](zotero://open-pdf/library/items/PDF123?page=3&annotation=XYZ))',
            '> Annotation evidence one.',
            '> [!annotation-yellow] Page 4 ([Ref](zotero://open-pdf/library/items/PDF123?page=4&annotation=ABC))',
            '> Annotation evidence two.',
          ].join('\n'),
        },
        {
          path: 'Literature/@nopaper.md',
          basename: '@nopaper',
          frontmatter: {
            zoteroProject: '[[Project A]]',
            zoteroTitle: 'No info paper',
            citekey: 'nopaper2026',
          },
          markdown: '_No abstract, no annotations._',
        },
      ],
      'zoteroProject',
      '[[Project A]]'
    );

    const markdown = renderLiteratureCompilationReport({
      corpus,
      generatedAt: new Date('2026-07-04T10:00:00.000Z'),
      mode: 'standard',
      contextFilePath: 'Projects/Context.md',
      pastedContextUsed: true,
      reportTitle: 'Drought collection',
    });

    expect(markdown).toContain('zoteroReportType: "literature-compilation"');
    expect(markdown).toContain('# Drought collection');
    expect(markdown).toContain('> [!info]- Inputs used');
    expect(markdown).toContain('## @smith2026 - Drought paper');
    expect(markdown).toContain('- **Abstract:** Drought abstract evidence.');
    expect(markdown).toContain(
      '- **Scite Score:** 168 mentions [supporting: <span style="color: var(--text-success);">72</span>, contrasting: <span style="color: var(--text-error);">9</span>]'
    );
    expect(markdown).toContain(
      '- **Links:** [URL](https://example.com/paper), [Zotero Item](zotero://select/library/items/ABC123), [Zotero PDF](zotero://open-pdf/library/items/PDF123?page=1)'
    );
    expect(markdown).toContain(
      '1. [annotation p. 3](zotero://open-pdf/library/items/PDF123?page=3&annotation=XYZ): Annotation evidence one.'
    );
    expect(markdown).toContain(
      '2. [annotation p. 4](zotero://open-pdf/library/items/PDF123?page=4&annotation=ABC): Annotation evidence two.'
    );
    expect(markdown).toContain('## Sources with no extracted information');
    expect(markdown).toContain('- @nopaper2026 - No info paper');
    expect(markdown).not.toContain('No keywords available');
    expect(markdown).not.toContain('## Key Synthesis');
    expect(markdown).not.toContain('## Source Footnotes');
  });
});

describe('Ollama request builders', () => {
  const corpus = buildLiteratureReportCorpus(
    [
      {
        path: 'Literature/@smith2026.md',
        basename: '@smith2026',
        frontmatter: {
          zoteroTopic: 'hydraulics',
          zoteroTitle: 'Hydraulics paper',
          zoteroPublication: 'Tree Physiology',
          zoteroAbstract: 'Hydraulic evidence.',
        },
      },
    ],
    'zoteroTopic',
    'hydraulics'
  );

  it('builds prompt-generation and prompt-revision requests with context', () => {
    const researchQuestion = 'What do we know about drought effects on forest hydraulics?';
    const context = {
      filePath: 'Projects/Context.md',
      fileText: 'Project context text.',
      pastedText: 'Pasted context text.',
    };
    const generated = buildOllamaSynthesisPromptRequest({
      corpus,
      context,
      researchQuestion,
      language: 'English',
      model: 'llama3.2',
      mode: 'standard',
    });
    const revised = buildOllamaSynthesisPromptRevisionRequest({
      corpus,
      context,
      researchQuestion,
      language: 'English',
      model: 'llama3.2',
      mode: 'standard',
      currentPrompt: 'Current prompt.',
      revisionInstruction: 'Make it narrower.',
    });

    expect(generated.format).toHaveProperty('properties.prompt');
    expect(generated.messages[1].content).toContain('Research question:\nWhat do we know about drought effects on forest hydraulics?');
    expect(generated.messages[1].content).toContain('Project context:');
    expect(generated.messages[1].content).toContain('Project context text.');
    expect(revised.messages[1].content).toContain(researchQuestion);
    expect(revised.messages[1].content).toContain('Make it narrower.');
  });

  it('builds triage and synthesis requests with schemas and selected evidence', () => {
    const researchQuestion = 'Which mechanisms best explain drought-induced mortality in oaks?';
    const triageRequest = buildOllamaLiteratureTriageRequest({
      corpus,
      context: {},
      researchQuestion,
      synthesisPrompt: 'Focus on methods.',
      language: 'English',
      model: 'llama3.2',
      mode: 'standard',
    });
    const triage = validateAiLiteratureTriage(
      {
        selectedSources: [
          {
            sourceId: 'S1',
            relevanceScore: 0.8,
            reason: 'Relevant method evidence.',
            theme: 'Methods',
            evidenceIds: ['S1-abstract'],
          },
        ],
      },
      corpus,
      'standard'
    );
    const synthesisRequest = buildOllamaLiteratureSynthesisRequest({
      corpus,
      context: {},
      researchQuestion,
      synthesisPrompt: 'Focus on methods.',
      language: 'English',
      model: 'llama3.2',
      mode: 'standard',
      triage,
    });

    expect(triageRequest.format).toHaveProperty('properties.selectedSources');
    expect(triageRequest.messages[1].content).toContain('"id": "S1-abstract"');
    expect(triageRequest.messages[1].content).toContain(researchQuestion);
    expect(triageRequest.messages[1].content).toContain(
      'Prioritize directly relevant sources and evidence for the research question'
    );
    expect(synthesisRequest.format).toHaveProperty('properties.themes');
    expect(synthesisRequest.messages[1].content).toContain(
      'Use at most 5 bullets per theme'
    );
    expect(synthesisRequest.messages[1].content).toContain('"id": "S1-abstract"');
  });
});

describe('literature triage fallback', () => {
  it('returns deterministic fallback source/evidence selections when AI does not select anything', () => {
    const corpus = buildLiteratureReportCorpus(
      [
        {
          path: 'Literature/@high.md',
          basename: '@high',
          frontmatter: {
            zoteroProject: '[[Project A]]',
            zoteroTitle: 'High citation paper',
            zoteroSciteCitingPublications: 42,
            zoteroAbstract: 'High citation abstract.',
          },
        },
        {
          path: 'Literature/@low.md',
          basename: '@low',
          frontmatter: {
            zoteroProject: '[[Project A]]',
            zoteroTitle: 'Low citation paper',
            zoteroSciteCitingPublications: 4,
            zoteroAbstract: 'Lower citation abstract.',
          },
        },
      ],
      'zoteroProject',
      '[[Project A]]'
    );

    const fallback = buildFallbackLiteratureTriage(corpus, 'standard');

    expect(fallback.selectedSources[0].sourceId).toBe('S1');
    expect(fallback.selectedSources[0].evidenceIds[0]).toBe('S1-abstract');
    expect(fallback.selectedEvidenceIds[0]).toBe('S1-abstract');
    expect(fallback.selectedEvidenceIds).toContain('S2-abstract');
  });

  it('renders fallback-selected ids in synthesis validation', () => {
    const corpus = buildLiteratureReportCorpus(
      [
        {
          path: 'Literature/@high.md',
          basename: '@high',
          frontmatter: {
            zoteroProject: '[[Project A]]',
            zoteroTitle: 'High citation paper',
            zoteroSciteCitingPublications: 42,
            zoteroAbstract: 'High citation abstract.',
          },
        },
      ],
      'zoteroProject',
      '[[Project A]]'
    );
    const fallback = buildFallbackLiteratureTriage(corpus, 'standard');

    const synthesis = validateAiLiteratureSynthesis(
      {
        themes: [
          {
            title: 'Fallback coverage',
            claims: [
              {
                claim: 'Fallback keeps core evidence visible.',
                evidenceIds: fallback.selectedEvidenceIds,
              },
            ],
          },
        ],
      },
      corpus.evidence,
      corpus.sources,
      'standard'
    );

    expect(synthesis.themes[0].claims).toHaveLength(1);
    expect(synthesis.themes[0].claims[0].claim).toMatch(/Fallback keeps core evidence/);
    expect(synthesis.omittedClaimCount).toBe(0);
  });
});

describe('question-first pipeline rendering', () => {
  it('renders pipeline step log and fallback mode in the input callout', () => {
    const corpus = buildLiteratureReportCorpus(
      [
        {
          path: 'Literature/@paper.md',
          basename: '@paper',
          frontmatter: {
            zoteroProject: '[[Project A]]',
            zoteroTitle: 'Fallback drought paper',
            citekey: 'paper2026',
            zoteroYear: '2026',
            zoteroAbstract: 'Drought evidence.',
          },
        },
      ],
      'zoteroProject',
      '[[Project A]]'
    );
    const synthesis = validateAiLiteratureSynthesis(
      {
        title: 'Drought fallback synthesis',
        themes: [
          {
            title: 'Core theme',
            claims: [
              {
                claim: 'Fallback claims are still rendered.',
                evidenceIds: ['S1-abstract'],
              },
            ],
          },
        ],
      },
      corpus.evidence,
      corpus.sources,
      'standard'
    );

    const markdown = renderLiteratureSynthesisReport({
      corpus,
      synthesis,
      generatedAt: new Date('2026-07-04T10:00:00.000Z'),
      model: 'llama3.2',
      language: 'English',
      mode: 'standard',
      synthesisPrompt: 'Focus on drought.',
      contextFilePath: undefined,
      pastedContextUsed: false,
      reportTitle: 'Drought fallback',
      generationSteps: {
        scopeScanNotes: 1,
        evidenceRecords: 1,
        strictTriageSources: 0,
        strictTriageEvidence: 0,
        relaxedTriageSources: 0,
        relaxedTriageEvidence: 0,
        fallbackSelectedSources: 1,
        fallbackSelectedEvidence: 1,
        finalClaimsGenerated: 1,
        triageMode: 'fallback',
      },
    });

    expect(markdown).toContain('> - Report triage mode: `fallback`');
    expect(markdown).toContain('> - Triage strict: 0 sources, 0 evidence records');
    expect(markdown).toContain('> - Triage relaxed: 0 sources, 0 evidence records');
    expect(markdown).toContain('> - Triage fallback: 1 sources, 1 evidence records');
    expect(markdown).toContain('> - Final claims generated: 1');
  });
});
