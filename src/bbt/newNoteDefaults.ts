import { ZoteroManagedUserProperties } from '../types';
import { normalizeZoteroRelevance } from '../ZoteroManagedProperties';

function isEmptyFrontmatterValue(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    value === '' ||
    (Array.isArray(value) && value.length === 0)
  );
}

export function applyNewNoteDefaults(
  frontmatter: Record<string, unknown>,
  managedProperties?: ZoteroManagedUserProperties
) {
  if (
    !managedProperties?.zoteroStatus &&
    isEmptyFrontmatterValue(frontmatter.zoteroStatus)
  ) {
    frontmatter.zoteroStatus = 'new';
  }

  if (
    !managedProperties?.zoteroRelevance &&
    isEmptyFrontmatterValue(frontmatter.zoteroRelevance)
  ) {
    frontmatter.zoteroRelevance = normalizeZoteroRelevance(undefined);
  }
}
