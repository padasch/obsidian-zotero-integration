export type LiteratureReportScopeProperty = 'zoteroProject' | 'zoteroTopic';

export interface LiteratureReportNoteRecord {
  path: string;
  basename: string;
  frontmatter: Record<string, unknown>;
  markdown?: string;
}

export interface LiteratureReportSource {
  id: string;
  path: string;
  basename: string;
  title: string;
  citekey: string;
  authors: string[];
  year: string;
  doi: string;
  url: string;
  zoteroUri: string;
  abstractText: string;
  scopeValues: string[];
}

export type LiteratureEvidenceKind = 'abstract' | 'annotation';

export interface LiteratureEvidence {
  id: string;
  sourceId: string;
  kind: LiteratureEvidenceKind;
  sourcePath: string;
  sourceTitle: string;
  citekey: string;
  year: string;
  text: string;
  locator: string;
  href: string;
  doi: string;
  url: string;
}

export interface LiteratureReportCorpus {
  scopeProperty: LiteratureReportScopeProperty;
  scopeValue: string;
  sources: LiteratureReportSource[];
  evidence: LiteratureEvidence[];
}

export interface AiEvidenceClaim {
  claim: string;
  evidenceIds: string[];
}

export interface AiEvidenceTheme {
  title: string;
  claims: AiEvidenceClaim[];
}

export interface AiEvidenceMapResponse {
  title?: string;
  themes?: AiEvidenceTheme[];
  gaps?: AiEvidenceClaim[];
}

export interface ValidatedEvidenceMap {
  title: string;
  themes: AiEvidenceTheme[];
  gaps: AiEvidenceClaim[];
  omittedClaimCount: number;
}

export interface RenderLiteratureEvidenceMapParams {
  corpus: LiteratureReportCorpus;
  aiMap: ValidatedEvidenceMap;
  generatedAt: Date;
  model: string;
  language: string;
}

export interface BuildOllamaRequestParams {
  corpus: LiteratureReportCorpus;
  basePrompt: string;
  additionalPrompt: string;
  language: string;
  model: string;
}

export const DEFAULT_LITERATURE_REPORT_FOLDER = 'Zotero Reports';
export const DEFAULT_LITERATURE_REPORT_OLLAMA_URL =
  'http://127.0.0.1:11434';
export const DEFAULT_LITERATURE_REPORT_MODEL = 'llama3.2';
export const DEFAULT_LITERATURE_REPORT_LANGUAGE = 'English';

export const DEFAULT_LITERATURE_REPORT_PROMPT = [
  'Create a fact-checkable literature evidence map from the provided evidence records.',
  'Use only the supplied evidence records. Do not use outside knowledge.',
  'Every claim must cite one or more evidenceIds exactly as provided.',
  'Prefer concise claims grouped by theme.',
  'Return only JSON that matches the requested schema.',
].join('\n');

export const OLLAMA_EVIDENCE_MAP_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    themes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          claims: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                claim: { type: 'string' },
                evidenceIds: {
                  type: 'array',
                  items: { type: 'string' },
                },
              },
              required: ['claim', 'evidenceIds'],
            },
          },
        },
        required: ['title', 'claims'],
      },
    },
    gaps: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          claim: { type: 'string' },
          evidenceIds: {
            type: 'array',
            items: { type: 'string' },
          },
        },
        required: ['claim', 'evidenceIds'],
      },
    },
  },
  required: ['themes'],
};

function normalizeText(value: unknown): string {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeIdentifier(value: string): string {
  return normalizeText(value).toLocaleLowerCase();
}

function uniqueValues(values: string[]): string[] {
  const output: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    const normalized = normalizeIdentifier(value);
    if (!normalized || seen.has(normalized)) continue;

    seen.add(normalized);
    output.push(value);
  }

  return output;
}

export function frontmatterValues(value: unknown): string[] {
  if (value === null || value === undefined) return [];

  if (Array.isArray(value)) {
    return uniqueValues(value.flatMap((entry) => frontmatterValues(entry)));
  }

  if (typeof value === 'object') {
    const source = value as Record<string, unknown>;
    return uniqueValues(
      [source.key, source.citekey, source.citationKey, source.itemKey]
        .map((entry) => normalizeText(entry))
        .filter(Boolean)
    );
  }

  return uniqueValues(
    String(value || '')
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
  );
}

export function firstFrontmatterValue(
  frontmatter: Record<string, unknown>,
  keys: string[]
): string {
  for (const key of keys) {
    const value = frontmatterValues(frontmatter[key])[0];
    if (value) return value;
  }

  return '';
}

function frontmatterText(value: unknown): string {
  if (value === null || value === undefined) return '';

  if (Array.isArray(value)) {
    return value.map((entry) => frontmatterText(entry)).filter(Boolean).join(', ');
  }

  if (typeof value === 'object') {
    const source = value as Record<string, unknown>;
    return normalizeText(
      source.name ||
        [source.firstName, source.lastName].filter(Boolean).join(' ') ||
        source.title ||
        source.key ||
        ''
    );
  }

  return String(value || '').trim();
}

function firstFrontmatterText(
  frontmatter: Record<string, unknown>,
  keys: string[]
): string {
  for (const key of keys) {
    const value = frontmatterText(frontmatter[key]);
    if (value) return value;
  }

  return '';
}

export function frontmatterMatchesScope(
  frontmatter: Record<string, unknown>,
  property: LiteratureReportScopeProperty,
  value: string
): boolean {
  const target = normalizeIdentifier(value);
  if (!target) return false;

  return frontmatterValues(frontmatter[property]).some(
    (candidate) => normalizeIdentifier(candidate) === target
  );
}

export function collectLiteratureScopeValues(
  records: LiteratureReportNoteRecord[],
  property: LiteratureReportScopeProperty
): string[] {
  return uniqueValues(
    records.flatMap((record) => frontmatterValues(record.frontmatter[property]))
  ).sort((a, b) => a.localeCompare(b));
}

function extractMarkdownLinkHref(value: string): string {
  const match = value.match(/\[[^\]]+\]\(([^)]+)\)/);
  return match?.[1]?.trim() || value.trim();
}

function cleanTitle(frontmatter: Record<string, unknown>, fallback: string) {
  return (
    firstFrontmatterText(frontmatter, ['zoteroTitle', 'title']) ||
    fallback ||
    'Untitled'
  );
}

function cleanAuthors(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((entry) => frontmatterText(entry)).filter(Boolean);
  }

  const text = frontmatterText(value);
  return text ? [text] : [];
}

function truncateEvidenceText(value: string): string {
  const text = normalizeText(value);
  if (text.length <= 1200) return text;
  return `${text.slice(0, 1197).trim()}...`;
}

function extractPlainScopeValue(value: string): string {
  const linkMatch = value.match(/^\[\[([^\]|]+)(?:\|([^\]]+))?\]\]$/);
  if (linkMatch) return linkMatch[2] || linkMatch[1];
  return value;
}

export function buildLiteratureReportSource(
  record: LiteratureReportNoteRecord,
  sourceIndex: number,
  scopeProperty: LiteratureReportScopeProperty
): LiteratureReportSource {
  const frontmatter = record.frontmatter;
  const zoteroUrl = firstFrontmatterText(frontmatter, ['zoteroURL', 'url']);
  const zoteroUri = firstFrontmatterText(frontmatter, [
    'zoteroURI',
    'desktopURI',
  ]);

  return {
    id: `S${sourceIndex + 1}`,
    path: record.path,
    basename: record.basename,
    title: cleanTitle(frontmatter, record.basename),
    citekey: firstFrontmatterText(frontmatter, [
      'citekey',
      'zoteroCitekey',
      'zoteroCiteKey',
      'citationKey',
      'citationkey',
      'citation-key',
    ]),
    authors: cleanAuthors(frontmatter.zoteroAuthors || frontmatter.authors),
    year: firstFrontmatterText(frontmatter, ['zoteroYear', 'year', 'date']),
    doi: firstFrontmatterText(frontmatter, ['zoteroDOI', 'DOI', 'doi']),
    url: zoteroUrl ? extractMarkdownLinkHref(zoteroUrl) : '',
    zoteroUri: zoteroUri ? extractMarkdownLinkHref(zoteroUri) : '',
    abstractText: firstFrontmatterText(frontmatter, [
      'zoteroAbstract',
      'abstractNote',
    ]),
    scopeValues: frontmatterValues(frontmatter[scopeProperty]),
  };
}

function cleanAnnotationLine(line: string): string {
  return line
    .replace(/^>\s?/, '')
    .replace(/\[!annotation-[^\]]+\]\s*/i, '')
    .replace(/!\[\[[^\]]+\]\]/g, '')
    .replace(/\(\[Ref\]\([^)]+\)\)/g, '')
    .replace(/^_Comment:_\s*/i, 'Comment: ')
    .trim();
}

function parseAnnotationHeader(header: string): {
  href: string;
  locator: string;
} {
  const href = extractMarkdownLinkHref(header).startsWith('zotero://')
    ? extractMarkdownLinkHref(header)
    : '';
  const pageMatch = header.match(/Page\s+([^(\]]+)/i);

  return {
    href,
    locator: pageMatch ? `Page ${normalizeText(pageMatch[1])}` : '',
  };
}

function getAnnotationSection(markdown: string): string {
  const allAnnotations = markdown.search(/^## All Annotations\s*$/m);
  if (allAnnotations < 0) return markdown;

  const section = markdown.slice(allAnnotations);
  const nextHeading = section.slice(1).search(/^##\s+/m);
  if (nextHeading < 0) return section;

  return section.slice(0, nextHeading + 1);
}

function extractDefaultAnnotationBlocks(markdown: string): Array<{
  href: string;
  locator: string;
  text: string;
}> {
  const blocks: Array<{ href: string; locator: string; text: string }> = [];
  const lines = getAnnotationSection(markdown).split(/\r?\n/);
  let current:
    | {
        header: string;
        lines: string[];
      }
    | null = null;

  const flush = () => {
    if (!current) return;

    const header = parseAnnotationHeader(current.header);
    const text = truncateEvidenceText(
      current.lines.map(cleanAnnotationLine).filter(Boolean).join(' ')
    );

    if (text) {
      blocks.push({
        href: header.href,
        locator: header.locator,
        text,
      });
    }

    current = null;
  };

  for (const line of lines) {
    if (/^>\s*\[!annotation-[^\]]+\]/i.test(line)) {
      flush();
      current = {
        header: line,
        lines: [],
      };
      continue;
    }

    if (current) {
      if (/^>\s?/.test(line) || !line.trim()) {
        current.lines.push(line);
        continue;
      }

      flush();
    }
  }

  flush();
  return blocks;
}

function extractFallbackRefBullets(markdown: string): Array<{
  href: string;
  locator: string;
  text: string;
}> {
  const blocks: Array<{ href: string; locator: string; text: string }> = [];

  for (const line of markdown.split(/\r?\n/)) {
    const match = line.match(/^>\s*-\s+(.+?)\s*(?:\(\[Ref\]\(([^)]+)\)\))?\s*$/);
    if (!match || !match[2]) continue;

    const text = truncateEvidenceText(
      match[1].replace(/\(\[Ref\]\([^)]+\)\)/g, '')
    );
    if (!text) continue;

    blocks.push({
      href: match[2] || '',
      locator: '',
      text,
    });
  }

  return blocks;
}

export function extractEvidenceFromSource(
  source: LiteratureReportSource,
  markdown = ''
): LiteratureEvidence[] {
  const evidence: LiteratureEvidence[] = [];

  if (source.abstractText) {
    evidence.push({
      id: `${source.id}-abstract`,
      sourceId: source.id,
      kind: 'abstract',
      sourcePath: source.path,
      sourceTitle: source.title,
      citekey: source.citekey,
      year: source.year,
      text: truncateEvidenceText(source.abstractText),
      locator: 'Abstract',
      href: source.zoteroUri || source.url,
      doi: source.doi,
      url: source.url,
    });
  }

  const annotationBlocks = extractDefaultAnnotationBlocks(markdown);
  const blocks = annotationBlocks.length
    ? annotationBlocks
    : extractFallbackRefBullets(markdown);

  blocks.forEach((block, index) => {
    evidence.push({
      id: `${source.id}-annotation-${index + 1}`,
      sourceId: source.id,
      kind: 'annotation',
      sourcePath: source.path,
      sourceTitle: source.title,
      citekey: source.citekey,
      year: source.year,
      text: block.text,
      locator: block.locator || 'Annotation',
      href: block.href || source.zoteroUri || source.url,
      doi: source.doi,
      url: source.url,
    });
  });

  return evidence;
}

export function buildLiteratureReportCorpus(
  records: LiteratureReportNoteRecord[],
  scopeProperty: LiteratureReportScopeProperty,
  scopeValue: string
): LiteratureReportCorpus {
  const matchingRecords = records.filter((record) =>
    frontmatterMatchesScope(record.frontmatter, scopeProperty, scopeValue)
  );
  const sources = matchingRecords.map((record, index) =>
    buildLiteratureReportSource(record, index, scopeProperty)
  );
  const evidence = sources.flatMap((source, index) =>
    extractEvidenceFromSource(source, matchingRecords[index].markdown || '')
  );

  return {
    scopeProperty,
    scopeValue,
    sources,
    evidence,
  };
}

function evidenceForPrompt(evidence: LiteratureEvidence[]) {
  return evidence.map((item) => ({
    id: item.id,
    sourceId: item.sourceId,
    type: item.kind,
    citation: item.citekey
      ? `@${item.citekey}${item.year ? ` (${item.year})` : ''}`
      : item.sourceTitle,
    title: item.sourceTitle,
    locator: item.locator,
    text: item.text,
  }));
}

export function buildOllamaEvidenceMapRequest({
  corpus,
  basePrompt,
  additionalPrompt,
  language,
  model,
}: BuildOllamaRequestParams) {
  const prompt = [
    basePrompt || DEFAULT_LITERATURE_REPORT_PROMPT,
    additionalPrompt ? `Additional user instructions:\n${additionalPrompt}` : '',
    `Output language: ${language || DEFAULT_LITERATURE_REPORT_LANGUAGE}`,
    `Scope: ${corpus.scopeProperty} = ${corpus.scopeValue}`,
    'Evidence records:',
    JSON.stringify(evidenceForPrompt(corpus.evidence), null, 2),
  ]
    .filter(Boolean)
    .join('\n\n');

  return {
    model: model || DEFAULT_LITERATURE_REPORT_MODEL,
    stream: false,
    format: OLLAMA_EVIDENCE_MAP_SCHEMA,
    messages: [
      {
        role: 'system',
        content:
          'You produce strict JSON literature evidence maps. Use only supplied evidence IDs.',
      },
      {
        role: 'user',
        content: prompt,
      },
    ],
  };
}

function asClaim(value: unknown): AiEvidenceClaim | null {
  if (!value || typeof value !== 'object') return null;

  const source = value as Record<string, unknown>;
  const claim = normalizeText(source.claim);
  const evidenceIds = Array.isArray(source.evidenceIds)
    ? source.evidenceIds.map((entry) => normalizeText(entry)).filter(Boolean)
    : [];

  if (!claim || !evidenceIds.length) return null;

  return {
    claim,
    evidenceIds: uniqueValues(evidenceIds),
  };
}

export function parseAiEvidenceMapContent(content: string): AiEvidenceMapResponse {
  const parsed = JSON.parse(content);
  return parsed && typeof parsed === 'object' ? parsed : {};
}

export function validateAiEvidenceMap(
  raw: AiEvidenceMapResponse,
  evidence: LiteratureEvidence[]
): ValidatedEvidenceMap {
  const validEvidenceIds = new Set(evidence.map((item) => item.id));
  let omittedClaimCount = 0;

  const validateClaims = (claims: unknown): AiEvidenceClaim[] => {
    if (!Array.isArray(claims)) return [];

    return claims.flatMap((entry) => {
      const claim = asClaim(entry);
      if (
        !claim ||
        claim.evidenceIds.some((id) => !validEvidenceIds.has(id))
      ) {
        omittedClaimCount += 1;
        return [];
      }

      return [claim];
    });
  };

  const themes = Array.isArray(raw.themes)
    ? raw.themes.flatMap((entry) => {
        if (!entry || typeof entry !== 'object') return [];
        const theme = entry as unknown as Record<string, unknown>;
        const claims = validateClaims(theme.claims);
        if (!claims.length) return [];

        return [
          {
            title: normalizeText(theme.title) || 'Evidence theme',
            claims,
          },
        ];
      })
    : [];

  return {
    title: normalizeText(raw.title) || 'Literature Evidence Map',
    themes,
    gaps: validateClaims(raw.gaps),
    omittedClaimCount,
  };
}

function markdownEscape(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\|/g, '\\|');
}

function yamlString(value: string): string {
  return JSON.stringify(value);
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function formatDateTime(date: Date): string {
  return date.toISOString();
}

function evidenceLink(item: LiteratureEvidence): string {
  const label = markdownEscape(item.id);
  if (item.href) return `[${label}](${item.href})`;
  return `[[${item.sourcePath}|${label}]]`;
}

function citationLabel(item: LiteratureEvidence): string {
  const cite = item.citekey ? `@${item.citekey}` : item.sourceTitle;
  return item.year ? `${cite}, ${item.year}` : cite;
}

function formatClaimEvidence(
  claim: AiEvidenceClaim,
  evidenceById: Map<string, LiteratureEvidence>
): string {
  return claim.evidenceIds
    .map((id) => evidenceById.get(id))
    .filter((item): item is LiteratureEvidence => !!item)
    .map(
      (item) =>
        `${evidenceLink(item)} (${markdownEscape(citationLabel(item))}, ${markdownEscape(
          item.locator
        )})`
    )
    .join('; ');
}

function sourceLink(source: LiteratureReportSource): string {
  return `[[${source.path}|${markdownEscape(source.title)}]]`;
}

function renderSourcesTable(sources: LiteratureReportSource[]): string {
  const rows = sources.map((source) => {
    const citekey = source.citekey ? `@${source.citekey}` : '';
    const authors = source.authors.slice(0, 3).join(', ');
    const links = [
      source.zoteroUri ? `[Zotero](${source.zoteroUri})` : '',
      source.doi ? `[DOI](https://doi.org/${source.doi})` : '',
      source.url ? `[URL](${source.url})` : '',
    ]
      .filter(Boolean)
      .join(' ');

    return `| ${source.id} | ${sourceLink(source)} | ${markdownEscape(
      citekey
    )} | ${markdownEscape(source.year)} | ${markdownEscape(
      authors
    )} | ${links} |`;
  });

  return [
    '| ID | Source note | Citekey | Year | Authors | Links |',
    '| --- | --- | --- | --- | --- | --- |',
    ...rows,
  ].join('\n');
}

function renderEvidenceTable(evidence: LiteratureEvidence[]): string {
  const rows = evidence.map((item) => {
    const links = [
      item.href ? `[Ref](${item.href})` : '',
      item.doi ? `[DOI](https://doi.org/${item.doi})` : '',
      item.url ? `[URL](${item.url})` : '',
    ]
      .filter(Boolean)
      .join(' ');

    return `| ${item.id} | [[${item.sourcePath}|${markdownEscape(
      item.sourceTitle
    )}]] | ${item.kind} | ${markdownEscape(item.locator)} | ${markdownEscape(
      item.text
    )} | ${links} |`;
  });

  return [
    '| ID | Source | Type | Location | Evidence excerpt | Links |',
    '| --- | --- | --- | --- | --- | --- |',
    ...rows,
  ].join('\n');
}

export function renderLiteratureEvidenceMapReport({
  corpus,
  aiMap,
  generatedAt,
  model,
  language,
}: RenderLiteratureEvidenceMapParams): string {
  const evidenceById = new Map(corpus.evidence.map((item) => [item.id, item]));
  const title = `${aiMap.title}: ${extractPlainScopeValue(corpus.scopeValue)}`;
  const frontmatter = [
    '---',
    'zoteroLiteratureReport: true',
    `zoteroReportScopeProperty: ${yamlString(corpus.scopeProperty)}`,
    `zoteroReportScopeValue: ${yamlString(corpus.scopeValue)}`,
    `zoteroReportGenerated: ${yamlString(formatDateTime(generatedAt))}`,
    `zoteroReportModel: ${yamlString(model)}`,
    `zoteroReportLanguage: ${yamlString(language)}`,
    `zoteroReportSourceCount: ${corpus.sources.length}`,
    `zoteroReportEvidenceCount: ${corpus.evidence.length}`,
    `zoteroReportOmittedClaimCount: ${aiMap.omittedClaimCount}`,
    '---',
  ].join('\n');

  const themeSections = aiMap.themes.length
    ? aiMap.themes
        .map((theme) =>
          [
            `### ${theme.title}`,
            ...theme.claims.map(
              (claim) =>
                `- ${claim.claim} Evidence: ${formatClaimEvidence(
                  claim,
                  evidenceById
                )}.`
            ),
          ].join('\n')
        )
        .join('\n\n')
    : '_No AI claims with resolvable evidence IDs were returned._';

  const gapSection = aiMap.gaps.length
    ? [
        '## Evidence-Backed Gaps And Uncertainties',
        ...aiMap.gaps.map(
          (claim) =>
            `- ${claim.claim} Evidence: ${formatClaimEvidence(
              claim,
              evidenceById
            )}.`
        ),
      ].join('\n')
    : '';

  return [
    frontmatter,
    '',
    `# ${title}`,
    '',
    `Generated ${formatDate(generatedAt)} from ${corpus.sources.length} Obsidian Zotero note${
      corpus.sources.length === 1 ? '' : 's'
    } with \`${corpus.scopeProperty}\` = \`${corpus.scopeValue}\`.`,
    `Local AI model: \`${model}\`. Claims without resolvable evidence IDs were omitted before this report was rendered.`,
    '',
    '## Evidence Map',
    '',
    themeSections,
    '',
    gapSection,
    '',
    '## Sources',
    '',
    renderSourcesTable(corpus.sources),
    '',
    '## Evidence Index',
    '',
    renderEvidenceTable(corpus.evidence),
    '',
  ]
    .filter((section) => section !== '')
    .join('\n');
}
