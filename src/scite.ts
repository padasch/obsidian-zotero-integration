import { TFile, request } from 'obsidian';

export const SCITE_PROPERTIES = [
  'zoteroSciteCitingPublications',
  'zoteroSciteContradicting',
  'zoteroSciteMentioning',
  'zoteroSciteStatus',
  'zoteroSciteSupporting',
  'zoteroSciteTotalStatements',
  'zoteroSciteUnclassified',
  'zoteroSciteUpdatedAt',
  'zoteroSciteURL',
];

type SciteTallies = {
  citingPublications?: number;
  contradicting?: number;
  doi: string;
  mentioning?: number;
  supporting?: number;
  total?: number;
  unclassified?: number;
};

export function normalizeDoi(value: unknown): string {
  return String(value || '')
    .trim()
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, '')
    .replace(/^doi:\s*/i, '')
    .trim();
}

function frontmatterValues(value: unknown): string[] {
  if (value === null || value === undefined) return [];

  if (Array.isArray(value)) {
    return value
      .flatMap((entry) => frontmatterValues(entry))
      .filter((entry) => !!entry);
  }

  if (typeof value === 'object') {
    const source = value as Record<string, unknown>;
    return [
      source.key,
      source.citekey,
      source.citationKey,
      source.itemKey,
    ]
      .map((entry) => String(entry || '').trim())
      .filter(Boolean);
  }

  return String(value || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function firstFrontmatterValue(
  frontmatter: Record<string, unknown>,
  keys: string[]
): string {
  for (const key of keys) {
    const value = frontmatterValues(frontmatter[key])[0];
    if (value) return value;
  }

  return '';
}

export function getNoteDoi(frontmatter: Record<string, unknown>): string {
  return normalizeDoi(
    firstFrontmatterValue(frontmatter, ['zoteroDOI', 'DOI', 'doi'])
  );
}

export function getItemDoi(item: Record<string, unknown>): string {
  return normalizeDoi(item.DOI || item.doi);
}

function normalizeSciteNumber(source: Record<string, any>, keys: string[]) {
  for (const key of keys) {
    const value = source[key];
    if (value === null || value === undefined || value === '') continue;

    const parsed = Number(value);
    if (!Number.isNaN(parsed)) return parsed;
  }

  return undefined;
}

function sciteReportUrl(doi: string): string {
  return `https://scite.ai/reports/${encodeURI(normalizeDoi(doi))}`;
}

function normalizeSciteTallies(payload: any, doi: string): SciteTallies {
  const source = payload?.tallies || payload?.result || payload || {};

  return {
    citingPublications: normalizeSciteNumber(source, [
      'citingPublications',
      'citingPublicationsValue',
      'citing_publications',
    ]),
    contradicting: normalizeSciteNumber(source, [
      'contradicting',
      'contradictingValue',
      'contrasting',
      'contrastingValue',
    ]),
    doi: normalizeDoi(source.doi || source.DOI || doi),
    mentioning: normalizeSciteNumber(source, ['mentioning', 'mentioningValue']),
    supporting: normalizeSciteNumber(source, ['supporting', 'supportingValue']),
    total: normalizeSciteNumber(source, ['total', 'totalValue']),
    unclassified: normalizeSciteNumber(source, [
      'unclassified',
      'unclassifiedValue',
    ]),
  };
}

function scitePropertiesFromTallies(
  tallies: SciteTallies,
  updatedAt = new Date().toISOString()
): Record<string, unknown> {
  const doi = normalizeDoi(tallies.doi);

  return {
    zoteroSciteCitingPublications: tallies.citingPublications,
    zoteroSciteContradicting: tallies.contradicting,
    zoteroSciteMentioning: tallies.mentioning,
    zoteroSciteStatus: 'ok',
    zoteroSciteSupporting: tallies.supporting,
    zoteroSciteTotalStatements: tallies.total,
    zoteroSciteUnclassified: tallies.unclassified,
    zoteroSciteUpdatedAt: updatedAt,
    zoteroSciteURL: doi ? sciteReportUrl(doi) : undefined,
  };
}

export async function fetchSciteTallies(
  doi: string,
  apiToken?: string
): Promise<Record<string, unknown>> {
  const normalizedDoi = normalizeDoi(doi);
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };
  const token = String(apiToken || '').trim();

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await request({
    method: 'GET',
    url: `https://api.scite.ai/tallies/${encodeURI(normalizedDoi)}`,
    headers,
  });

  return scitePropertiesFromTallies(
    normalizeSciteTallies(JSON.parse(response), normalizedDoi)
  );
}

export function applyScitePropertiesToFrontmatter(
  frontmatter: Record<string, unknown>,
  properties: Record<string, unknown>
) {
  for (const key of SCITE_PROPERTIES) {
    delete frontmatter[key];
  }

  for (const [key, value] of Object.entries(properties)) {
    if (value !== undefined) {
      frontmatter[key] = value;
    }
  }
}

export async function writeScitePropertiesForFile(
  file: TFile,
  doi: string,
  apiToken?: string
): Promise<boolean> {
  const normalizedDoi = normalizeDoi(doi);
  if (!normalizedDoi) return false;

  const properties = await fetchSciteTallies(normalizedDoi, apiToken);
  await app.fileManager.processFrontMatter(file, (frontmatter) => {
    applyScitePropertiesToFrontmatter(frontmatter, properties);
  });

  return true;
}
