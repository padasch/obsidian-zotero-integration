import type { ZoteroConnectorSettings } from './types';

export const DEFAULT_SCITE_REFRESH_INTERVAL_DAYS = 7;

export const SCITE_MANAGED_PROPERTY_KEYS = [
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

export interface SciteTallies {
  citingPublications?: number;
  contradicting?: number;
  doi: string;
  mentioning?: number;
  supporting?: number;
  total?: number;
  unclassified?: number;
}

export interface SciteManagedPropertiesResult {
  error?: Error;
  properties?: Record<string, any>;
  status: 'disabled' | 'error' | 'fresh' | 'no-doi' | 'ok';
}

const sciteSessionCache = new Map<string, Record<string, any>>();

function cleanString(value: any): string {
  return String(value || '').trim();
}

function getNumberValue(source: Record<string, any>, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = source[key];
    if (value === undefined || value === null || value === '') continue;

    const numericValue = Number(value);
    if (!Number.isNaN(numericValue)) return numericValue;
  }

  return undefined;
}

export function normalizeSciteDoi(value: any): string {
  return cleanString(value)
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, '')
    .replace(/^doi:\s*/i, '')
    .replace(/[.,;]+$/g, '')
    .trim();
}

export function getSciteReportUrl(doi: string): string {
  return `https://scite.ai/reports/${normalizeSciteDoi(doi)}`;
}

export function normalizeSciteTalliesResponse(
  response: any,
  fallbackDoi: string
): SciteTallies {
  const source = response?.tallies || response?.result || response || {};
  const doi = normalizeSciteDoi(source.doi || source.DOI || fallbackDoi);

  return {
    citingPublications: getNumberValue(source, [
      'citingPublications',
      'citingPublicationsValue',
      'citing_publications',
    ]),
    contradicting: getNumberValue(source, [
      'contradicting',
      'contradictingValue',
      'contrasting',
      'contrastingValue',
    ]),
    doi,
    mentioning: getNumberValue(source, ['mentioning', 'mentioningValue']),
    supporting: getNumberValue(source, ['supporting', 'supportingValue']),
    total: getNumberValue(source, ['total', 'totalValue']),
    unclassified: getNumberValue(source, [
      'unclassified',
      'unclassifiedValue',
    ]),
  };
}

export function buildSciteManagedProperties(
  tallies: SciteTallies,
  fetchedAt = new Date().toISOString()
): Record<string, any> {
  const doi = normalizeSciteDoi(tallies.doi);

  return {
    zoteroSciteCitingPublications: tallies.citingPublications,
    zoteroSciteContradicting: tallies.contradicting,
    zoteroSciteMentioning: tallies.mentioning,
    zoteroSciteStatus: 'ok',
    zoteroSciteSupporting: tallies.supporting,
    zoteroSciteTotalStatements: tallies.total,
    zoteroSciteUnclassified: tallies.unclassified,
    zoteroSciteUpdatedAt: fetchedAt,
    zoteroSciteURL: doi ? getSciteReportUrl(doi) : undefined,
  };
}

export function getExistingSciteManagedProperties(
  frontmatter?: Record<string, any>
): Record<string, any> | undefined {
  if (!frontmatter) return undefined;

  const properties: Record<string, any> = {};
  for (const key of SCITE_MANAGED_PROPERTY_KEYS) {
    if (Object.prototype.hasOwnProperty.call(frontmatter, key)) {
      properties[key] = frontmatter[key];
    }
  }

  return Object.keys(properties).length ? properties : undefined;
}

export function normalizeSciteSettings(
  settings: ZoteroConnectorSettings
): ZoteroConnectorSettings {
  const refreshIntervalDays = Number(settings.zoteroSciteRefreshIntervalDays);

  return {
    ...settings,
    zoteroSciteApiToken: cleanString(settings.zoteroSciteApiToken),
    zoteroSciteEnabled: Boolean(settings.zoteroSciteEnabled),
    zoteroSciteRefreshIntervalDays:
      Number.isFinite(refreshIntervalDays) && refreshIntervalDays >= 0
        ? refreshIntervalDays
        : DEFAULT_SCITE_REFRESH_INTERVAL_DAYS,
    zoteroSciteRefreshOnImport:
      settings.zoteroSciteRefreshOnImport === undefined
        ? true
        : Boolean(settings.zoteroSciteRefreshOnImport),
  };
}

export function isSciteMetadataFresh(
  frontmatter: Record<string, any> | undefined,
  settings: ZoteroConnectorSettings,
  now = Date.now()
): boolean {
  const intervalDays = Number(settings.zoteroSciteRefreshIntervalDays);
  if (!frontmatter || !Number.isFinite(intervalDays) || intervalDays <= 0) {
    return false;
  }

  const updatedAt = Date.parse(cleanString(frontmatter.zoteroSciteUpdatedAt));
  if (Number.isNaN(updatedAt)) return false;

  return now - updatedAt < intervalDays * 24 * 60 * 60 * 1000;
}

export async function fetchSciteTallies(
  doi: string,
  settings: ZoteroConnectorSettings
): Promise<SciteTallies> {
  const { request } = require('obsidian');
  const normalizedDoi = normalizeSciteDoi(doi);
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };
  const token = cleanString(settings.zoteroSciteApiToken);

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await request({
    method: 'GET',
    url: `https://api.scite.ai/tallies/${encodeURI(normalizedDoi)}`,
    headers,
  });

  return normalizeSciteTalliesResponse(JSON.parse(response), normalizedDoi);
}

export async function getSciteManagedPropertiesForDoi(
  doi: any,
  settings: ZoteroConnectorSettings,
  previousFrontmatter?: Record<string, any>,
  options: { force?: boolean } = {}
): Promise<SciteManagedPropertiesResult> {
  const normalizedDoi = normalizeSciteDoi(doi);

  if (!settings.zoteroSciteEnabled && !options.force) {
    return { status: 'disabled' };
  }

  if (!normalizedDoi) {
    return {
      properties: {
        zoteroSciteStatus: 'no DOI',
      },
      status: 'no-doi',
    };
  }

  if (
    !options.force &&
    (!settings.zoteroSciteRefreshOnImport ||
      isSciteMetadataFresh(previousFrontmatter, settings))
  ) {
    const existing = getExistingSciteManagedProperties(previousFrontmatter);
    if (existing) return { properties: existing, status: 'fresh' };
  }

  const cacheKey = normalizedDoi.toLocaleLowerCase();
  const cached = sciteSessionCache.get(cacheKey);
  if (cached && !options.force) {
    return { properties: cached, status: 'ok' };
  }

  try {
    const tallies = await fetchSciteTallies(normalizedDoi, settings);
    const properties = buildSciteManagedProperties(tallies);
    sciteSessionCache.set(cacheKey, properties);

    return { properties, status: 'ok' };
  } catch (error) {
    const existing = getExistingSciteManagedProperties(previousFrontmatter);
    return {
      error: error instanceof Error ? error : new Error(String(error)),
      properties: {
        ...(existing || {}),
        zoteroSciteStatus: 'error',
      },
      status: 'error',
    };
  }
}

export function clearSciteSessionCache() {
  sciteSessionCache.clear();
}
