import { TFolder } from 'obsidian';
import React from 'react';

import { cslList, cslListRaw } from './cslList';

export type FinderOption = {
  value: string;
  label: string;
};

export function normalizeFinderQuery(query: string): string {
  return (query || '').trim();
}

function uniqueByValue(options: FinderOption[]): FinderOption[] {
  const seen = new Set<string>();
  const out: FinderOption[] = [];

  for (const option of options) {
    if (!option.value || seen.has(option.value)) {
      continue;
    }

    seen.add(option.value);
    out.push(option);
  }

  return out;
}

export function filterFinderOptions(
  query: string,
  options: FinderOption[],
  limit = 50
): FinderOption[] {
  const normalized = normalizeFinderQuery(query).toLocaleLowerCase();
  if (!normalized) {
    return uniqueByValue(options).slice(0, limit);
  }

  const startsWith: FinderOption[] = [];
  const contains: FinderOption[] = [];

  for (const option of uniqueByValue(options)) {
    const lowerLabel = option.label.toLocaleLowerCase();
    const lowerValue = option.value.toLocaleLowerCase();

    if (lowerLabel.startsWith(normalized) || lowerValue.startsWith(normalized)) {
      startsWith.push(option);
    } else if (
      lowerLabel.includes(normalized) ||
      lowerValue.includes(normalized)
    ) {
      contains.push(option);
    }
  }

  const matched = [...startsWith, ...contains];
  const values = new Set<string>();

  const unique = matched.filter((option) => {
    if (values.has(option.value)) return false;
    values.add(option.value);
    return true;
  });

  if (
    !values.has(query) &&
    !values.has(normalized) &&
    !unique.some((option) => option.value === query)
  ) {
    unique.unshift({
      value: query,
      label: query,
    });
  }

  return unique.slice(0, limit);
}

export function getMarkdownFileOptions(): FinderOption[] {
  return app.vault
    .getMarkdownFiles()
    .map((file) => ({ value: file.path, label: file.path }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function getFolderOptions(): FinderOption[] {
  return app.vault
    .getAllLoadedFiles()
    .filter((file): file is TFolder => file instanceof TFolder)
    .filter((folder) => folder.path !== '/')
    .map((folder) => ({ value: folder.path, label: folder.path }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

function searchCSLByText(query: string) {
  const normalized = normalizeFinderQuery(query);
  if (!normalized) return cslListRaw;

  if (normalized.length < 3) {
    return cslListRaw.filter((item) => {
      const haystack = `${item.value} ${item.label}`.toLocaleLowerCase();
      return haystack.includes(normalized.toLocaleLowerCase());
    });
  }

  return cslList.search(normalized).map((entry) => entry.item);
}

export function searchCSLOptions(query: string, limit = 50): FinderOption[] {
  const matches = searchCSLByText(query);
  return filterFinderOptions(
    normalizeFinderQuery(query),
    matches.map((entry) => ({
      value: entry.value,
      label: entry.label,
    })),
    limit
  );
}

export function useStableDatalistId(prefix: string) {
  return React.useMemo(() => `${prefix}-${Math.random().toString(36).slice(2)}`, [
    prefix,
  ]);
}
