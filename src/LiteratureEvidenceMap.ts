export type LiteratureReportScopeProperty = 'zoteroProject' | 'zoteroTopic';
export type LiteratureReportMode = 'brief' | 'standard' | 'detailed';
export type LiteratureTriageMode = 'strict' | 'relaxed' | 'fallback';

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
  publication: string;
  doi: string;
  url: string;
  zoteroUri: string;
  readerHref: string;
  sciteCitingPublications?: number;
  sciteSupporting?: number;
  sciteContradicting?: number;
  sciteMentioning?: number;
  sciteTotalStatements?: number;
  sciteUrl: string;
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

export interface LiteratureReportContext {
  filePath?: string;
  fileText?: string;
  pastedText?: string;
}

export interface LiteratureReportLimits {
  maxSources: number;
  maxEvidence: number;
  maxAnnotationsPerSource: number;
  maxBulletsPerTheme: number;
  maxEvidenceRefsPerBullet: number;
  maxThemes: number;
}

export interface AiEvidenceClaim {
  claim: string;
  evidenceIds: string[];
}

export interface AiEvidenceTheme {
  title: string;
  claims: AiEvidenceClaim[];
}

export interface AiLiteratureSynthesisMainPaper {
  sourceId: string;
  reason: string;
  evidenceIds: string[];
}

export interface AiLiteratureSynthesisWeakPaper {
  sourceId: string;
  reason?: string;
}

export interface AiLiteratureSynthesisResponse {
  title?: string;
  themes?: AiEvidenceTheme[];
  gaps?: AiEvidenceClaim[];
  mainPapers?: AiLiteratureSynthesisMainPaper[];
  influentialButWeak?: AiLiteratureSynthesisWeakPaper[];
}

export interface ValidatedLiteratureSynthesis {
  title: string;
  themes: AiEvidenceTheme[];
  gaps: AiEvidenceClaim[];
  mainPapers: AiLiteratureSynthesisMainPaper[];
  influentialButWeak: AiLiteratureSynthesisWeakPaper[];
  omittedClaimCount: number;
}

export interface AiLiteratureTriageSource {
  sourceId: string;
  relevanceScore: number;
  reason: string;
  theme: string;
  evidenceIds: string[];
}

export interface AiLiteratureTriageResponse {
  selectedSources?: AiLiteratureTriageSource[];
}

export interface ValidatedLiteratureTriage {
  selectedSources: AiLiteratureTriageSource[];
  selectedEvidenceIds: string[];
  omittedSelectionCount: number;
}

export interface RenderLiteratureSynthesisReportParams {
  corpus: LiteratureReportCorpus;
  synthesis: ValidatedLiteratureSynthesis;
  triage?: ValidatedLiteratureTriage;
  generationSteps?: LiteratureReportGenerationSteps;
  generatedAt: Date;
  model: string;
  language: string;
  mode: LiteratureReportMode;
  synthesisPrompt: string;
  contextFilePath?: string;
  pastedContextUsed: boolean;
  reportTitle?: string;
}

export interface RenderLiteratureCompilationReportParams {
  corpus: LiteratureReportCorpus;
  generatedAt: Date;
  mode: LiteratureReportMode;
  contextFilePath?: string;
  pastedContextUsed: boolean;
  reportTitle?: string;
}

export interface BuildOllamaSynthesisPromptRequestParams {
  corpus: LiteratureReportCorpus;
  context: LiteratureReportContext;
  researchQuestion: string;
  language: string;
  model: string;
  mode: LiteratureReportMode;
}

export interface BuildOllamaSynthesisPromptRevisionRequestParams
  extends BuildOllamaSynthesisPromptRequestParams {
  currentPrompt: string;
  revisionInstruction: string;
}

export interface BuildOllamaLiteratureTriageRequestParams {
  corpus: LiteratureReportCorpus;
  context: LiteratureReportContext;
  researchQuestion: string;
  synthesisPrompt: string;
  language: string;
  model: string;
  mode: LiteratureReportMode;
  triageMode?: LiteratureTriageMode;
}

export interface BuildOllamaLiteratureSynthesisRequestParams
  extends BuildOllamaLiteratureTriageRequestParams {
  researchQuestion: string;
  triage: ValidatedLiteratureTriage;
}

export const DEFAULT_LITERATURE_REPORT_FOLDER = 'Zotero Reports';
export const DEFAULT_LITERATURE_REPORT_OLLAMA_URL =
  'http://127.0.0.1:11434';
export const DEFAULT_LITERATURE_REPORT_MODEL = 'llama3.2';
export const DEFAULT_LITERATURE_REPORT_LANGUAGE = 'English';
export const DEFAULT_LITERATURE_REPORT_MODE: LiteratureReportMode = 'standard';

export const LITERATURE_REPORT_MODE_LIMITS: Record<
  LiteratureReportMode,
  LiteratureReportLimits
> = {
  brief: {
    maxSources: 15,
    maxEvidence: 60,
    maxAnnotationsPerSource: 3,
    maxBulletsPerTheme: 3,
    maxEvidenceRefsPerBullet: 2,
    maxThemes: 4,
  },
  standard: {
    maxSources: 30,
    maxEvidence: 120,
    maxAnnotationsPerSource: 5,
    maxBulletsPerTheme: 5,
    maxEvidenceRefsPerBullet: 3,
    maxThemes: 6,
  },
  detailed: {
    maxSources: 50,
    maxEvidence: 200,
    maxAnnotationsPerSource: 8,
    maxBulletsPerTheme: 8,
    maxEvidenceRefsPerBullet: 4,
    maxThemes: 9,
  },
};

export const DEFAULT_LITERATURE_REPORT_PROMPT = [
  'Create a project-centered literature synthesis from the supplied local Zotero evidence records.',
  'Use the project context only to decide relevance and structure; do not cite it as evidence.',
  'Consolidate findings into major themes rather than summarizing each paper.',
  'Prioritize cross-paper mechanisms, consistencies, tensions, and methods relevant to the prompt.',
  'Keep theme count deliberately small and only cover evidence with strong relevance.',
  'Do not summarize every paper. Select only evidence directly relevant to the synthesis prompt.',
  'Every rendered factual claim must cite one or more evidenceIds exactly as supplied.',
  'Return only JSON that matches the requested schema.',
].join('\n');

function buildReportFrontmatter(
  corpus: LiteratureReportCorpus,
  generatedAt: Date,
  reportType: string,
  mode: LiteratureReportMode,
  contextFilePath: string | undefined,
  pastedContextUsed: boolean,
  model?: string,
  language?: string,
  omittedClaimCount?: number,
  triageMode?: LiteratureTriageMode
): string {
  const frontmatter: string[] = [
    '---',
    'zoteroReport: true',
    `zoteroReportType: ${yamlString(reportType)}`,
    `zoteroReportSourceProperty: ${yamlString(corpus.scopeProperty)}`,
    `zoteroReportSourceValue: ${yamlString(corpus.scopeValue)}`,
    `zoteroReportSourceCount: ${corpus.sources.length}`,
    `zoteroReportEvidenceCount: ${corpus.evidence.length}`,
    `zoteroReportContextFile: ${yamlOptionalString(contextFilePath)}`,
    `zoteroReportPastedContextUsed: ${pastedContextUsed ? 'true' : 'false'}`,
    `zoteroReportGenerated: ${yamlString(formatDateTime(generatedAt))}`,
  ];

  if (model) {
    frontmatter.push(`zoteroReportModel: ${yamlString(model)}`);
  }

  if (language) {
    frontmatter.push(`zoteroReportLanguage: ${yamlString(language)}`);
  }

  frontmatter.push(`zoteroReportMode: ${yamlString(mode)}`);

  if (triageMode) {
    frontmatter.push(`zoteroReportTriageMode: ${yamlString(triageMode)}`);
  }

  if (typeof omittedClaimCount === 'number') {
    frontmatter.push(`zoteroReportOmittedClaimCount: ${omittedClaimCount}`);
  }

  frontmatter.push('---');
  return frontmatter.join('\n');
}

export interface LiteratureReportGenerationSteps {
  scopeScanNotes: number;
  evidenceRecords: number;
  strictTriageSources: number;
  strictTriageEvidence: number;
  relaxedTriageSources: number;
  relaxedTriageEvidence: number;
  fallbackSelectedSources: number;
  fallbackSelectedEvidence: number;
  finalClaimsGenerated: number;
  triageMode: LiteratureTriageMode;
}

export const OLLAMA_SYNTHESIS_PROMPT_SCHEMA = {
  type: 'object',
  properties: {
    prompt: { type: 'string' },
  },
  required: ['prompt'],
};

export const OLLAMA_LITERATURE_TRIAGE_SCHEMA = {
  type: 'object',
  properties: {
    selectedSources: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          sourceId: { type: 'string' },
          relevanceScore: { type: 'number' },
          reason: { type: 'string' },
          theme: { type: 'string' },
          evidenceIds: {
            type: 'array',
            items: { type: 'string' },
          },
        },
        required: [
          'sourceId',
          'relevanceScore',
          'reason',
          'theme',
          'evidenceIds',
        ],
      },
    },
  },
  required: ['selectedSources'],
};

export const OLLAMA_LITERATURE_SYNTHESIS_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    mainPapers: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          sourceId: { type: 'string' },
          reason: { type: 'string' },
          evidenceIds: {
            type: 'array',
            items: { type: 'string' },
          },
        },
        required: ['sourceId', 'reason', 'evidenceIds'],
      },
    },
    influentialButWeak: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          sourceId: { type: 'string' },
          reason: { type: 'string' },
        },
        required: ['sourceId'],
      },
    },
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

function firstFrontmatterNumber(
  frontmatter: Record<string, unknown>,
  keys: string[]
): number | undefined {
  for (const key of keys) {
    const raw = frontmatter[key];
    if (raw === null || raw === undefined || raw === '') continue;

    const value =
      typeof raw === 'number' ? raw : Number(frontmatterText(raw));
    if (Number.isFinite(value)) return value;
  }

  return undefined;
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

function cleanHref(value: string): string {
  const href = extractMarkdownLinkHref(value);
  if (!href || /^no\s+/i.test(href)) return '';
  return href;
}

function openPdfPageOne(href: string): string {
  if (!href.startsWith('zotero://open-pdf/')) return href;
  if (/[?&]page=/.test(href)) return href;
  return `${href}${href.includes('?') ? '&' : '?'}page=1`;
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

function truncateText(value: string, maxLength: number): string {
  const text = normalizeText(value);
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 3).trim()}...`;
}

function truncateEvidenceText(value: string): string {
  return truncateText(value, 1200);
}

function extractPlainScopeValue(value: string): string {
  const linkMatch = value.match(/^\[\[([^\]|]+)(?:\|([^\]]+))?\]\]$/);
  if (linkMatch) return linkMatch[2] || linkMatch[1];
  return value;
}

function yamlString(value: string): string {
  return JSON.stringify(value);
}

function yamlOptionalString(value: string | undefined): string {
  return value ? yamlString(value) : 'null';
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function formatDateCompact(date: Date): string {
  return formatDate(date).replace(/-/g, '');
}

function formatDateTime(date: Date): string {
  return date.toISOString();
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
  const readerHref = firstFrontmatterText(frontmatter, [
    'zoteroReader',
    'pdfZoteroLink',
    'firstAttachmentZoteroLink',
  ]);
  const doi = firstFrontmatterText(frontmatter, ['zoteroDOI', 'DOI', 'doi']);

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
    publication: firstFrontmatterText(frontmatter, [
      'zoteroPublication',
      'publicationTitle',
      'publication',
    ]),
    doi,
    url: zoteroUrl ? cleanHref(zoteroUrl) : doi ? `https://doi.org/${doi}` : '',
    zoteroUri: zoteroUri ? cleanHref(zoteroUri) : '',
    readerHref: readerHref ? openPdfPageOne(cleanHref(readerHref)) : '',
    sciteCitingPublications: firstFrontmatterNumber(frontmatter, [
      'zoteroSciteCitingPublications',
    ]),
    sciteSupporting: firstFrontmatterNumber(frontmatter, [
      'zoteroSciteSupporting',
    ]),
    sciteContradicting: firstFrontmatterNumber(frontmatter, [
      'zoteroSciteContradicting',
    ]),
    sciteMentioning: firstFrontmatterNumber(frontmatter, [
      'zoteroSciteMentioning',
    ]),
    sciteTotalStatements: firstFrontmatterNumber(frontmatter, [
      'zoteroSciteTotalStatements',
    ]),
    sciteUrl: cleanHref(firstFrontmatterText(frontmatter, ['zoteroSciteURL'])),
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
      href: source.readerHref || source.zoteroUri || '',
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
      href: block.href || source.zoteroUri || '',
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

export function getLiteratureReportLimits(
  mode: LiteratureReportMode = DEFAULT_LITERATURE_REPORT_MODE
): LiteratureReportLimits {
  return LITERATURE_REPORT_MODE_LIMITS[mode] || LITERATURE_REPORT_MODE_LIMITS.standard;
}

function sourceById(corpus: LiteratureReportCorpus) {
  return new Map(corpus.sources.map((source) => [source.id, source]));
}

function evidenceById(evidence: LiteratureEvidence[]) {
  return new Map(evidence.map((item) => [item.id, item]));
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

function sourceForPrompt(source: LiteratureReportSource) {
  return {
    id: source.id,
    citekey: source.citekey ? `@${source.citekey}` : '',
    title: source.title,
    year: source.year,
    publication: source.publication,
    sciteCitingPublications: source.sciteCitingPublications,
  };
}

function capPromptEvidence(
  corpus: LiteratureReportCorpus,
  limits: LiteratureReportLimits,
  selectedEvidenceIds?: string[]
): LiteratureEvidence[] {
  const selected = selectedEvidenceIds ? new Set(selectedEvidenceIds) : null;
  const countsBySource = new Map<string, number>();
  const output: LiteratureEvidence[] = [];

  for (const item of corpus.evidence) {
    if (selected && !selected.has(item.id)) continue;

    if (item.kind === 'annotation') {
      const count = countsBySource.get(item.sourceId) || 0;
      if (count >= limits.maxAnnotationsPerSource) continue;
      countsBySource.set(item.sourceId, count + 1);
    }

    output.push(item);
    if (output.length >= limits.maxEvidence) break;
  }

  return output;
}

function contextForPrompt(context: LiteratureReportContext): string {
  const blocks: string[] = [];
  if (context.filePath && context.fileText) {
    blocks.push(
      `Context from file ${context.filePath}:\n${truncateText(
        context.fileText,
        6000
      )}`
    );
  }
  if (context.pastedText) {
    blocks.push(
      `Additional pasted context:\n${truncateText(context.pastedText, 6000)}`
    );
  }

  return blocks.length
    ? blocks.join('\n\n')
    : 'No project context was supplied.';
}

function requestMessages(system: string, prompt: string) {
  return [
    {
      role: 'system',
      content: system,
    },
    {
      role: 'user',
      content: prompt,
    },
  ];
}

function buildResearchQuestionSection(question: string): string {
  return `Research question:\n${normalizeText(question) || 'No specific research question provided.'}`;
}

export function buildOllamaSynthesisPromptRequest({
  corpus,
  context,
  researchQuestion,
  language,
  model,
  mode,
}: BuildOllamaSynthesisPromptRequestParams) {
  const limits = getLiteratureReportLimits(mode);
  const prompt = [
    'Create a concise, project-specific synthesis prompt for a local literature synthesis report.',
    'The prompt must tell the synthesis model what information is relevant for this project/topic.',
    buildResearchQuestionSection(researchQuestion),
    'Prioritize broad concept-level themes over paper-by-paper descriptions.',
    'It must also require cited claims using evidence IDs and must discourage summarizing every paper.',
    `Output language: ${language || DEFAULT_LITERATURE_REPORT_LANGUAGE}`,
    `Report mode: ${mode}`,
    `Theme cap: ${limits.maxThemes} themes`,
    `Scope: ${corpus.scopeProperty} = ${corpus.scopeValue}`,
    `Default caps: ${limits.maxSources} papers, ${limits.maxEvidence} evidence records, ${limits.maxBulletsPerTheme} bullets per theme.`,
    'Project context:',
    contextForPrompt(context),
    'Available source summary:',
    JSON.stringify(corpus.sources.map(sourceForPrompt).slice(0, 120), null, 2),
  ].join('\n\n');

  return {
    model: model || DEFAULT_LITERATURE_REPORT_MODEL,
    stream: false,
    format: OLLAMA_SYNTHESIS_PROMPT_SCHEMA,
    messages: requestMessages(
      'You produce strict JSON with one field: prompt.',
      prompt
    ),
  };
}

export function buildOllamaSynthesisPromptRevisionRequest({
  corpus,
  context,
  researchQuestion,
  language,
  model,
  mode,
  currentPrompt,
  revisionInstruction,
}: BuildOllamaSynthesisPromptRevisionRequestParams) {
  const prompt = [
    'Revise the current synthesis prompt according to the user instruction.',
    'Keep the result project-specific, concise, and compatible with evidence-ID citation guardrails.',
    buildResearchQuestionSection(researchQuestion),
    `Output language: ${language || DEFAULT_LITERATURE_REPORT_LANGUAGE}`,
    `Report mode: ${mode}`,
    `Scope: ${corpus.scopeProperty} = ${corpus.scopeValue}`,
    'Project context:',
    contextForPrompt(context),
    'Current synthesis prompt:',
    currentPrompt || DEFAULT_LITERATURE_REPORT_PROMPT,
    'User revision instruction:',
    revisionInstruction,
  ].join('\n\n');

  return {
    model: model || DEFAULT_LITERATURE_REPORT_MODEL,
    stream: false,
    format: OLLAMA_SYNTHESIS_PROMPT_SCHEMA,
    messages: requestMessages(
      'You produce strict JSON with one field: prompt.',
      prompt
    ),
  };
}

export function buildOllamaLiteratureTriageRequest({
  corpus,
  context,
  researchQuestion,
  synthesisPrompt,
  language,
  model,
  mode,
  triageMode = 'strict',
}: BuildOllamaLiteratureTriageRequestParams) {
  const limits = getLiteratureReportLimits(mode);
  const promptEvidence = capPromptEvidence(corpus, {
    ...limits,
    maxEvidence: Math.max(limits.maxEvidence * 2, limits.maxEvidence),
  });
  const prompt = [
    buildResearchQuestionSection(researchQuestion),
    synthesisPrompt || DEFAULT_LITERATURE_REPORT_PROMPT,
    triageMode === 'strict'
      ? 'First triage the corpus. Prioritize directly relevant sources and evidence for the research question and project context.'
      : 'Relevance is uncertain; still return the top context-overlap sources and evidence for this research question, even if confidence is low.',
    'If relevance is weak, include additional fallback candidates (mark them as lower relevance in the reason text) rather than returning none.',
    'Output at most one theme label per source, and favor themes that appear across multiple sources.',
    `Output language: ${language || DEFAULT_LITERATURE_REPORT_LANGUAGE}`,
    `Report mode: ${mode}`,
    `Theme cap: ${limits.maxThemes}`,
    `Select at most ${limits.maxSources} sources and ${limits.maxEvidence} evidence records.`,
    `Use at most ${limits.maxAnnotationsPerSource} annotations per source.`,
    'Your output example shape should include evidence IDs like ["S1-abstract", "S1-annotation-1"] when they exist.',
    `Scope: ${corpus.scopeProperty} = ${corpus.scopeValue}`,
    'Project context:',
    contextForPrompt(context),
    'Sources:',
    JSON.stringify(corpus.sources.map(sourceForPrompt), null, 2),
    'Evidence records:',
    JSON.stringify(evidenceForPrompt(promptEvidence), null, 2),
  ].join('\n\n');

  return {
    model: model || DEFAULT_LITERATURE_REPORT_MODEL,
    stream: false,
    format: OLLAMA_LITERATURE_TRIAGE_SCHEMA,
    messages: requestMessages(
      `You produce strict JSON literature relevance triage. Use only supplied source and evidence IDs. For this step return at most ${limits.maxSources} sources and ${limits.maxEvidence} evidence records, preferring those most relevant to the research question.`,
      prompt
    ),
  };
}

export function buildOllamaLiteratureSynthesisRequest({
  corpus,
  context,
  researchQuestion,
  synthesisPrompt,
  language,
  model,
  mode,
  triage,
}: BuildOllamaLiteratureSynthesisRequestParams) {
  const limits = getLiteratureReportLimits(mode);
  const selectedEvidence = capPromptEvidence(
    corpus,
    limits,
    triage.selectedEvidenceIds
  );
  const selectedSourceIds = new Set(selectedEvidence.map((item) => item.sourceId));
  const selectedSources = corpus.sources.filter((source) =>
    selectedSourceIds.has(source.id)
  );
  const prompt = [
    buildResearchQuestionSection(researchQuestion),
    synthesisPrompt || DEFAULT_LITERATURE_REPORT_PROMPT,
    'Write a project-centered literature synthesis, not a paper-by-paper summary.',
    'Return thematic bullet claims. Every claim must cite evidenceIds exactly as supplied.',
    `Return no more than ${limits.maxThemes} named themes.`,
    'Themes should be high-level and each theme should combine insights from multiple sources where possible.',
    'Prefer synthesis statements, then tensions and open questions, rather than isolated findings.',
    'Also return mainPapers when a paper is important in this context. Main-paper reasons must cite evidenceIds.',
    `Output language: ${language || DEFAULT_LITERATURE_REPORT_LANGUAGE}`,
    `Report mode: ${mode}`,
    `Use at most ${limits.maxBulletsPerTheme} bullets per theme and ${limits.maxEvidenceRefsPerBullet} evidence IDs per bullet.`,
    `Scope: ${corpus.scopeProperty} = ${corpus.scopeValue}`,
    'Project context:',
    contextForPrompt(context),
    'Selected sources:',
    JSON.stringify(selectedSources.map(sourceForPrompt), null, 2),
    'Selected evidence records:',
    JSON.stringify(evidenceForPrompt(selectedEvidence), null, 2),
  ].join('\n\n');

  return {
    model: model || DEFAULT_LITERATURE_REPORT_MODEL,
    stream: false,
    format: OLLAMA_LITERATURE_SYNTHESIS_SCHEMA,
    messages: requestMessages(
      'You produce strict JSON literature synthesis. Use only supplied evidence IDs.',
      prompt
    ),
  };
}

function asClaim(
  value: unknown,
  validEvidenceIds: Set<string>,
  limits: LiteratureReportLimits
): AiEvidenceClaim | null {
  if (!value || typeof value !== 'object') return null;

  const source = value as Record<string, unknown>;
  const claim = normalizeText(source.claim);
  const evidenceIds = Array.isArray(source.evidenceIds)
    ? uniqueValues(source.evidenceIds.map((entry) => normalizeText(entry)))
    : [];

  if (!claim || !evidenceIds.length) return null;
  if (evidenceIds.some((id) => !validEvidenceIds.has(id))) return null;

  return {
    claim,
    evidenceIds: evidenceIds.slice(0, limits.maxEvidenceRefsPerBullet),
  };
}

export function parseAiLiteratureTriageContent(
  content: string
): AiLiteratureTriageResponse {
  const parsed = JSON.parse(content);
  return parsed && typeof parsed === 'object' ? parsed : {};
}

export function parseAiLiteratureSynthesisContent(
  content: string
): AiLiteratureSynthesisResponse {
  const parsed = JSON.parse(content);
  return parsed && typeof parsed === 'object' ? parsed : {};
}

export function parseAiSynthesisPromptContent(content: string): string {
  const parsed = JSON.parse(content);
  return normalizeText(parsed?.prompt);
}

function sciteCitationCount(source?: LiteratureReportSource): number {
  return source?.sciteCitingPublications || 0;
}

export function validateAiLiteratureTriage(
  raw: AiLiteratureTriageResponse,
  corpus: LiteratureReportCorpus,
  mode: LiteratureReportMode = DEFAULT_LITERATURE_REPORT_MODE
): ValidatedLiteratureTriage {
  const limits = getLiteratureReportLimits(mode);
  const validEvidenceIds = new Set(corpus.evidence.map((item) => item.id));
  const sourceMap = sourceById(corpus);
  let omittedSelectionCount = 0;

  const selectedSources = Array.isArray(raw.selectedSources)
    ? raw.selectedSources.flatMap((entry) => {
        if (!entry || typeof entry !== 'object') return [];
        const source = entry as unknown as Record<string, unknown>;
        const sourceId = normalizeText(source.sourceId);
        if (!sourceId || !sourceMap.has(sourceId)) {
          omittedSelectionCount += 1;
          return [];
        }

        const evidenceIds = Array.isArray(source.evidenceIds)
          ? uniqueValues(source.evidenceIds.map((id) => normalizeText(id)))
          : [];
        const validIds = evidenceIds.filter((id) => validEvidenceIds.has(id));
        if (!validIds.length) {
          omittedSelectionCount += 1;
          return [];
        }

        return [
          {
            sourceId,
            relevanceScore: Number(source.relevanceScore) || 0,
            reason: normalizeText(source.reason),
            theme: normalizeText(source.theme) || 'Relevant evidence',
            evidenceIds: validIds,
          },
        ];
      })
    : [];

  const sortedSources = selectedSources
    .sort((a, b) => {
      const scoreDiff = b.relevanceScore - a.relevanceScore;
      if (scoreDiff) return scoreDiff;
      return sciteCitationCount(sourceMap.get(b.sourceId)) -
        sciteCitationCount(sourceMap.get(a.sourceId));
    })
    .slice(0, limits.maxSources);

  const selectedEvidenceIds: string[] = [];
  const evidenceSeen = new Set<string>();
  const annotationCounts = new Map<string, number>();
  const evidenceMap = evidenceById(corpus.evidence);
  const cappedSources: AiLiteratureTriageSource[] = [];

  for (const source of sortedSources) {
    const cappedIds: string[] = [];
    for (const id of source.evidenceIds) {
      if (evidenceSeen.has(id)) continue;
      const item = evidenceMap.get(id);
      if (!item) continue;

      if (item.kind === 'annotation') {
        const count = annotationCounts.get(item.sourceId) || 0;
        if (count >= limits.maxAnnotationsPerSource) continue;
        annotationCounts.set(item.sourceId, count + 1);
      }

      evidenceSeen.add(id);
      selectedEvidenceIds.push(id);
      cappedIds.push(id);
      if (selectedEvidenceIds.length >= limits.maxEvidence) break;
    }
    if (cappedIds.length) {
      cappedSources.push({
        ...source,
        evidenceIds: cappedIds,
      });
    }
    if (selectedEvidenceIds.length >= limits.maxEvidence) break;
  }

  return {
    selectedSources: cappedSources,
    selectedEvidenceIds,
    omittedSelectionCount,
  };
}

export function buildFallbackLiteratureTriage(
  corpus: LiteratureReportCorpus,
  mode: LiteratureReportMode = DEFAULT_LITERATURE_REPORT_MODE
): ValidatedLiteratureTriage {
  const limits = getLiteratureReportLimits(mode);
  const evidenceBySource = new Map<string, LiteratureEvidence[]>();

  for (const item of corpus.evidence) {
    const list = evidenceBySource.get(item.sourceId) || [];
    list.push(item);
    evidenceBySource.set(item.sourceId, list);
  }

  const sortedSources = [...corpus.sources].sort((a, b) => {
    const score = sciteCitationCount(b) - sciteCitationCount(a);
    if (score) return score;
    return a.title.localeCompare(b.title);
  });

  const selectedSources: AiLiteratureTriageSource[] = [];
  const selectedEvidenceIds: string[] = [];
  const evidenceSeen = new Set<string>();
  const annotationCounts = new Map<string, number>();

  for (const source of sortedSources.slice(0, limits.maxSources)) {
    const sourceEvidence = evidenceBySource.get(source.id) || [];
    if (!sourceEvidence.length) continue;

    const cappedIds: string[] = [];
    for (const item of sourceEvidence) {
      if (evidenceSeen.has(item.id)) continue;
      if (item.kind === 'annotation') {
        const count = annotationCounts.get(item.sourceId) || 0;
        if (count >= limits.maxAnnotationsPerSource) continue;
        annotationCounts.set(item.sourceId, count + 1);
      }

      evidenceSeen.add(item.id);
      selectedEvidenceIds.push(item.id);
      cappedIds.push(item.id);

      if (selectedEvidenceIds.length >= limits.maxEvidence) break;
    }

    if (cappedIds.length) {
      selectedSources.push({
        sourceId: source.id,
        relevanceScore: 0.1,
        reason: 'Deterministic fallback for report continuity.',
        theme: 'Relevance fallback',
        evidenceIds: cappedIds,
      });
    }

    if (selectedEvidenceIds.length >= limits.maxEvidence) break;
  }

  return {
    selectedSources,
    selectedEvidenceIds,
    omittedSelectionCount: 0,
  };
}

export function validateAiLiteratureSynthesis(
  raw: AiLiteratureSynthesisResponse,
  evidence: LiteratureEvidence[],
  sources: LiteratureReportSource[],
  mode: LiteratureReportMode = DEFAULT_LITERATURE_REPORT_MODE
): ValidatedLiteratureSynthesis {
  const limits = getLiteratureReportLimits(mode);
  const validEvidenceIds = new Set(evidence.map((item) => item.id));
  const validSourceIds = new Set(sources.map((source) => source.id));
  let omittedClaimCount = 0;

  const validateClaims = (claims: unknown): AiEvidenceClaim[] => {
    if (!Array.isArray(claims)) return [];

    return claims.flatMap((entry) => {
      const claim = asClaim(entry, validEvidenceIds, limits);
      if (!claim) {
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
        const claims = validateClaims(theme.claims).slice(
          0,
          limits.maxBulletsPerTheme
        );
        if (!claims.length) return [];

        return [
          {
            title: normalizeText(theme.title) || 'Synthesis theme',
            claims,
          },
        ];
      })
    .slice(0, limits.maxThemes)
    : [];

  const mainPapers = Array.isArray(raw.mainPapers)
    ? raw.mainPapers.flatMap((entry) => {
        if (!entry || typeof entry !== 'object') return [];
        const paper = entry as unknown as Record<string, unknown>;
        const sourceId = normalizeText(paper.sourceId);
        const reason = normalizeText(paper.reason);
        const claim = asClaim(
          { claim: reason, evidenceIds: paper.evidenceIds },
          validEvidenceIds,
          limits
        );
        if (!sourceId || !validSourceIds.has(sourceId) || !claim) {
          omittedClaimCount += 1;
          return [];
        }

        return [
          {
            sourceId,
            reason: claim.claim,
            evidenceIds: claim.evidenceIds,
          },
        ];
      })
    : [];

  const influentialButWeak = Array.isArray(raw.influentialButWeak)
    ? raw.influentialButWeak.flatMap((entry) => {
        if (!entry || typeof entry !== 'object') return [];
        const paper = entry as unknown as Record<string, unknown>;
        const sourceId = normalizeText(paper.sourceId);
        if (!sourceId || !validSourceIds.has(sourceId)) return [];
        return [
          {
            sourceId,
            reason: normalizeText(paper.reason),
          },
        ];
      })
    : [];

  return {
    title: normalizeText(raw.title) || 'Literature Synthesis',
    themes,
    gaps: validateClaims(raw.gaps),
    mainPapers: mainPapers.slice(0, 8),
    influentialButWeak: influentialButWeak.slice(0, 5),
    omittedClaimCount,
  };
}

function markdownEscape(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\|/g, '\\|');
}

function markdownLink(label: string, href: string): string {
  return `[${markdownEscape(label)}](${href})`;
}

function sourceNoteLink(path: string, label: string): string {
  return markdownLink(label, path);
}

function evidenceSourceLink(item: LiteratureEvidence): string {
  const label =
    item.kind === 'abstract'
      ? 'abstract'
      : item.locator && /^Page\s+/i.test(item.locator)
        ? `annotation p. ${item.locator.replace(/^Page\s+/i, '')}`
        : 'annotation';

  if (item.href) return markdownLink(label, item.href);
  if (item.kind === 'abstract') return sourceNoteLink(item.sourcePath, label);
  return item.url ? markdownLink(label, item.url) : sourceNoteLink(item.sourcePath, label);
}

function paperUrlLink(item: LiteratureEvidence): string {
  if (item.url) return markdownLink('URL', item.url);
  if (item.doi) return markdownLink('URL', `https://doi.org/${item.doi}`);
  return '';
}

function citekeyLabel(source: LiteratureReportSource): string {
  return source.citekey ? `@${source.citekey}` : source.title;
}

function evidenceCitekeyLabel(item: LiteratureEvidence): string {
  return item.citekey ? `@${item.citekey}` : item.sourceTitle;
}

function buildFootnoteLabelMap(evidenceIds: string[]): Map<string, string> {
  const labels = new Map<string, string>();
  uniqueValues(evidenceIds).forEach((id, index) => {
    labels.set(id, `E${index + 1}`);
  });
  return labels;
}

function footnoteRefs(
  evidenceIds: string[],
  labels: Map<string, string>
): string {
  return evidenceIds
    .map((id) => labels.get(id))
    .filter((label): label is string => !!label)
    .map((label) => `[^${label}]`)
    .join('');
}

function collectRenderedEvidenceIds(
  synthesis: ValidatedLiteratureSynthesis
): string[] {
  return [
    ...synthesis.mainPapers.flatMap((paper) => paper.evidenceIds),
    ...synthesis.themes.flatMap((theme) =>
      theme.claims.flatMap((claim) => claim.evidenceIds)
    ),
    ...synthesis.gaps.flatMap((gap) => gap.evidenceIds),
  ];
}

function compileSourceEvidenceMap(
  evidence: LiteratureEvidence[]
): Map<string, LiteratureEvidence[]> {
  const map = new Map<string, LiteratureEvidence[]>();
  for (const item of evidence) {
    const list = map.get(item.sourceId) || [];
    list.push(item);
    map.set(item.sourceId, list);
  }
  return map;
}

function renderInputsCalloutCommon(
  corpus: LiteratureReportCorpus,
  contextFilePath: string | undefined,
  pastedContextUsed: boolean
): string {
  return [
    '> [!info]+ Inputs used',
    `> - Source property: \`${corpus.scopeProperty}\``,
    `> - Source value: \`${corpus.scopeValue}\``,
    `> - Source notes scanned: ${corpus.sources.length}`,
    `> - Evidence records extracted: ${corpus.evidence.length}`,
    `> - Context file: ${contextFilePath ? `\`${contextFilePath}\`` : 'none'}`,
    `> - Pasted context: ${pastedContextUsed ? 'yes' : 'no'}`,
  ].join('\n');
}

function renderInputsCallout({
  corpus,
  model,
  language,
  mode,
  generationSteps,
  synthesisPrompt,
  contextFilePath,
  pastedContextUsed,
}: RenderLiteratureSynthesisReportParams): string {
  const promptLines = (synthesisPrompt || DEFAULT_LITERATURE_REPORT_PROMPT)
    .split(/\r?\n/)
    .map((line) => `> ${line}`)
    .join('\n');

  return [
    renderInputsCalloutCommon(corpus, contextFilePath, pastedContextUsed),
    `> - Model: \`${model}\``,
    `> - Language: \`${language}\``,
    `> - Report mode: \`${mode}\``,
    `> - Report triage mode: \`${generationSteps?.triageMode || 'strict'}\``,
    '>',
    '> **Generation steps**',
    `> - Scope scan: ${generationSteps?.scopeScanNotes ?? corpus.sources.length} notes, ${generationSteps?.evidenceRecords ?? corpus.evidence.length} evidence records`,
    `> - Triage strict: ${generationSteps?.strictTriageSources ?? 0} sources, ${generationSteps?.strictTriageEvidence ?? 0} evidence records`,
    `> - Triage relaxed: ${generationSteps?.relaxedTriageSources ?? 0} sources, ${generationSteps?.relaxedTriageEvidence ?? 0} evidence records`,
    `> - Triage fallback: ${generationSteps?.fallbackSelectedSources ?? 0} sources, ${generationSteps?.fallbackSelectedEvidence ?? 0} evidence records`,
    `> - Final claims generated: ${generationSteps?.finalClaimsGenerated ?? 0}`,
    '>',
    '> **Synthesis prompt**',
    '>',
    promptLines,
  ].join('\n');
}

function renderMainPaperLine(
  paper: AiLiteratureSynthesisMainPaper,
  source: LiteratureReportSource,
  labels: Map<string, string>
): string {
  const parts = [
    `\`${citekeyLabel(source)}\``,
    source.title,
    source.year ? `(${source.year})` : '',
    source.publication ? `- ${source.publication}` : '',
    source.sciteCitingPublications !== undefined
      ? `- scite citations: ${source.sciteCitingPublications}`
      : '',
  ].filter(Boolean);

  return `- ${parts.join(' ')}. ${paper.reason}${footnoteRefs(
    paper.evidenceIds,
    labels
  )}`;
}

function deriveMainPapers(
  synthesis: ValidatedLiteratureSynthesis,
  triage: ValidatedLiteratureTriage | undefined
): AiLiteratureSynthesisMainPaper[] {
  if (synthesis.mainPapers.length) return synthesis.mainPapers;
  if (!triage?.selectedSources.length) return [];

  return triage.selectedSources.slice(0, 5).flatMap((source) => {
    if (!source.reason || !source.evidenceIds.length) return [];
    return [
      {
        sourceId: source.sourceId,
        reason: source.reason,
        evidenceIds: source.evidenceIds.slice(0, 2),
      },
    ];
  });
}

function deriveInfluentialButWeakPapers(
  synthesis: ValidatedLiteratureSynthesis,
  triage: ValidatedLiteratureTriage | undefined,
  corpus: LiteratureReportCorpus
): AiLiteratureSynthesisWeakPaper[] {
  const selectedSourceIds = new Set(
    triage?.selectedSources.map((source) => source.sourceId) || []
  );
  const renderedSourceIds = new Set([
    ...synthesis.mainPapers.map((paper) => paper.sourceId),
    ...synthesis.influentialButWeak.map((paper) => paper.sourceId),
  ]);
  const deterministic = corpus.sources
    .filter((source) => {
      const count = source.sciteCitingPublications || 0;
      return count > 0 && !selectedSourceIds.has(source.id);
    })
    .sort(
      (a, b) =>
        (b.sciteCitingPublications || 0) - (a.sciteCitingPublications || 0)
    )
    .slice(0, 3)
    .map((source) => ({
      sourceId: source.id,
      reason:
        'High scite citation count, but no context-relevant evidence was selected for the synthesis.',
    }));

  return [...synthesis.influentialButWeak, ...deterministic]
    .filter((paper) => {
      if (renderedSourceIds.has(paper.sourceId)) return false;
      renderedSourceIds.add(paper.sourceId);
      return true;
    })
    .slice(0, 5);
}

function renderMainPapersSection(
  synthesis: ValidatedLiteratureSynthesis,
  triage: ValidatedLiteratureTriage | undefined,
  corpus: LiteratureReportCorpus,
  labels: Map<string, string>
): string {
  const sourceMap = sourceById(corpus);
  const mainPapers = deriveMainPapers(synthesis, triage)
    .map((paper) => {
      const source = sourceMap.get(paper.sourceId);
      return source ? renderMainPaperLine(paper, source, labels) : '';
    })
    .filter(Boolean);

  const weakPapers = deriveInfluentialButWeakPapers(synthesis, triage, corpus)
    .map((paper) => {
      const source = sourceMap.get(paper.sourceId);
      if (!source) return '';
      const parts = [
        `\`${citekeyLabel(source)}\``,
        source.title,
        source.year ? `(${source.year})` : '',
        source.publication ? `- ${source.publication}` : '',
        source.sciteCitingPublications !== undefined
          ? `- scite citations: ${source.sciteCitingPublications}`
          : '',
      ].filter(Boolean);
      return `- ${parts.join(' ')}. ${
        paper.reason ||
        'Influential paper in this scope, but not central to the generated synthesis.'
      }`;
    })
    .filter(Boolean);

  if (!mainPapers.length && !weakPapers.length) return '';

  return [
    '## Main papers to check in this context',
    '',
    ...mainPapers,
    weakPapers.length ? '' : '',
    weakPapers.length
      ? '### Influential but weakly represented in the synthesis'
      : '',
    ...weakPapers,
  ]
    .filter((line) => line !== '')
    .join('\n');
}

function renderThemeSections(
  synthesis: ValidatedLiteratureSynthesis,
  labels: Map<string, string>
): string {
  if (!synthesis.themes.length) {
    return '_No AI claims with resolvable evidence IDs were returned._';
  }

  return synthesis.themes
    .map((theme) =>
      [
        `### ${theme.title}`,
        ...theme.claims.map(
          (claim) => `- ${claim.claim}${footnoteRefs(claim.evidenceIds, labels)}`
        ),
      ].join('\n')
    )
    .join('\n\n');
}

function renderGapSection(
  synthesis: ValidatedLiteratureSynthesis,
  labels: Map<string, string>
): string {
  if (!synthesis.gaps.length) return '';

  return [
    '## Gaps And Uncertainties',
    '',
    ...synthesis.gaps.map(
      (claim) => `- ${claim.claim}${footnoteRefs(claim.evidenceIds, labels)}`
    ),
  ].join('\n');
}

function renderFootnotes(
  evidence: LiteratureEvidence[],
  labels: Map<string, string>
): string {
  const evidenceMap = evidenceById(evidence);
  const rows = Array.from(labels.entries()).flatMap(([id, label]) => {
    const item = evidenceMap.get(id);
    if (!item) return [];

    const links = [paperUrlLink(item), evidenceSourceLink(item)]
      .filter(Boolean)
      .join(', ');
    const citation = `\`${evidenceCitekeyLabel(item)}\``;
    const prefix = links ? `${citation}: ${links}` : `${citation}:`;

    return [
      `[^${label}]: ${prefix}`,
      `    Excerpt: ${markdownEscape(item.text)}`,
    ];
  });

  return rows.length ? ['## Source Footnotes', '', ...rows].join('\n') : '';
}

function renderCompilationInputsCallout(
  params: RenderLiteratureCompilationReportParams
): string {
  return renderInputsCalloutCommon(
    params.corpus,
    params.contextFilePath,
    params.pastedContextUsed
  );
}

function annotationLink(item: LiteratureEvidence): string {
  if (item.locator && /^Page\s+/i.test(item.locator)) {
    return markdownLink(
      `annotation p. ${item.locator.replace(/^Page\s+/i, '')}`,
      item.href || item.sourcePath
    );
  }

  return markdownLink('annotation', item.href || item.sourcePath);
}

function styleSciteMetric(value: number, color: string): string {
  return `<span style="color: ${color};">${value}</span>`;
}

function renderSciteScoreLine(source: LiteratureReportSource): string | null {
  const totalMentions =
    source.sciteTotalStatements ??
    source.sciteMentioning ??
    source.sciteCitingPublications ??
    null;

  if (totalMentions === null) {
    return null;
  }

  const details = [
    source.sciteSupporting !== undefined
      ? `supporting: ${styleSciteMetric(source.sciteSupporting, 'var(--text-success)')}`
      : '',
    source.sciteContradicting !== undefined
      ? `contrasting: ${styleSciteMetric(source.sciteContradicting, 'var(--text-error)')}`
      : '',
  ].filter(Boolean);

  return `- **Scite Score:** ${totalMentions} mentions${
    details.length ? ` [${details.join(', ')}]` : ''
  }`;
}

function renderSourceLinksLine(source: LiteratureReportSource): string | null {
  const links: string[] = [];
  if (source.url) links.push(markdownLink('URL', source.url));
  if (source.zoteroUri) links.push(markdownLink('Zotero Item', source.zoteroUri));
  if (source.readerHref) links.push(markdownLink('Zotero PDF', source.readerHref));

  if (!links.length) return null;
  return `- **Links:** ${links.join(', ')}`;
}

function sourceCollectionLabel(
  source: LiteratureReportSource,
  index: number
): string {
  return `${source.citekey ? `@${source.citekey}` : `Paper ${index + 1}`} - ${
    source.title
  }`;
}

function renderSourceCompilationSection(
  source: LiteratureReportSource,
  sourceEvidence: Map<string, LiteratureEvidence[]>,
  index: number
): string {
  const sourceLabel = sourceCollectionLabel(source, index);
  const annotations = (sourceEvidence.get(source.id) || []).filter(
    (item) => item.kind === 'annotation'
  );

  const annotationLines = annotations.length
    ? annotations.map(
        (item, annotationIndex) =>
          `    ${annotationIndex + 1}. ${annotationLink(item)}: ${markdownEscape(
            item.text
          )}`
      )
    : ['    1. No annotations extracted.'];
  const sciteLine = renderSciteScoreLine(source);
  const linksLine = renderSourceLinksLine(source);

    return [
    `## ${sourceLabel}`,
    `- **Abstract:** ${source.abstractText || 'No abstract available.'}`,
    ...(sciteLine ? [sciteLine] : []),
    ...(linksLine ? [linksLine] : []),
    '- **Annotations:**',
    ...annotationLines,
  ].join('\n');
}

function renderCompilationNoInformationSection(
  corpus: LiteratureReportCorpus
): string {
  const sourceEvidence = compileSourceEvidenceMap(corpus.evidence);
  const noInformationSources = corpus.sources
    .map((source, index) => ({ source, index }))
    .filter(({ source }) => {
      const items = sourceEvidence.get(source.id) || [];
      const hasAbstract = normalizeText(source.abstractText).length > 0;
      const hasAnnotations = items.some((item) => item.kind === 'annotation');
      return !hasAbstract && !hasAnnotations;
    });

  if (!noInformationSources.length) return '';

  return [
    '## Sources with no extracted information',
    '',
    ...noInformationSources.map(
      ({ source, index }) => `- ${sourceCollectionLabel(source, index)}`
    ),
  ].join('\n');
}

function renderLiteratureCompilationSections(
  corpus: LiteratureReportCorpus
): string {
  const sourceEvidence = compileSourceEvidenceMap(corpus.evidence);

  return corpus.sources
    .map((source, index) =>
      renderSourceCompilationSection(source, sourceEvidence, index)
    )
    .join('\n\n');
}

export function renderLiteratureCompilationReport({
  corpus,
  generatedAt,
  mode,
  contextFilePath,
  pastedContextUsed,
  reportTitle,
}: RenderLiteratureCompilationReportParams): string {
  const titleText = normalizeText(reportTitle) || 'Collection';

  const frontmatter = buildReportFrontmatter(
    corpus,
    generatedAt,
    'literature-compilation',
    mode,
    contextFilePath,
    pastedContextUsed
  );

  return [
    frontmatter,
    '',
    `# ${titleText}`,
    '',
    renderCompilationNoInformationSection(corpus),
    '',
    renderCompilationInputsCallout({
      corpus,
      generatedAt,
      mode,
      contextFilePath,
      pastedContextUsed,
      reportTitle,
    }),
    renderLiteratureCompilationSections(corpus),
    '',
  ]
    .filter((section) => section !== '')
    .join('\n');
}

export function renderLiteratureSynthesisReport({
  corpus,
  synthesis,
  triage,
  generationSteps,
  generatedAt,
  model,
  language,
  mode,
  synthesisPrompt,
  contextFilePath,
  pastedContextUsed,
  reportTitle,
}: RenderLiteratureSynthesisReportParams): string {
  const titleText =
    normalizeText(reportTitle) ||
    `${synthesis.title}: ${extractPlainScopeValue(corpus.scopeValue)}`;
  const renderedEvidenceIds = collectRenderedEvidenceIds({
    ...synthesis,
    mainPapers: deriveMainPapers(synthesis, triage),
  });
  const labels = buildFootnoteLabelMap(renderedEvidenceIds);
  const frontmatter = buildReportFrontmatter(
    corpus,
    generatedAt,
    'literature-synthesis',
    mode,
    contextFilePath,
    pastedContextUsed,
    model,
    language,
    synthesis.omittedClaimCount,
    generationSteps?.triageMode || 'strict'
  );

  return [
    frontmatter,
    '',
    `# Literature Synthesis: ${titleText}`,
    '',
    renderInputsCallout({
      corpus,
      synthesis,
      triage,
      generatedAt,
      model,
      language,
      mode,
      synthesisPrompt,
      contextFilePath,
      pastedContextUsed,
      generationSteps,
    }),
    '',
    renderMainPapersSection(synthesis, triage, corpus, labels),
    '',
    '## Key Synthesis',
    '',
    renderThemeSections(synthesis, labels),
    '',
    renderGapSection(synthesis, labels),
    '',
    renderFootnotes(corpus.evidence, labels),
    '',
  ]
    .filter((section) => section !== '')
    .join('\n');
}

function sanitizeFilenamePart(value: string): string {
  return normalizeText(extractPlainScopeValue(value))
    .replace(/[<>:"/\\|?*]/g, ' ')
    .split('')
    .filter((char) => char.charCodeAt(0) >= 32)
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

export function buildLiteratureSynthesisReportFilename(
  descriptiveText: string,
  scopeValue: string,
  generatedAt: Date
): string {
  const text = sanitizeFilenamePart(descriptiveText) ||
    sanitizeFilenamePart(scopeValue) ||
    'Literature Synthesis';
  return `${formatDateCompact(generatedAt)} - Zotero Synthesis - ${text}.md`;
}

export function buildLiteratureCompilationReportFilename(
  descriptiveText: string,
  scopeValue: string,
  generatedAt: Date
): string {
  const text = sanitizeFilenamePart(descriptiveText) ||
    sanitizeFilenamePart(scopeValue) ||
    'Literature Collection';
  return `${formatDateCompact(generatedAt)} - Zotero Collection - ${text}.md`;
}

export function renderLiteratureEvidenceMapReport(
  params: RenderLiteratureSynthesisReportParams
): string {
  return renderLiteratureSynthesisReport(params);
}
