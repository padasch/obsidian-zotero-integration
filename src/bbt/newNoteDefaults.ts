import { ZoteroManagedUserProperties } from '../types';

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
  if (managedProperties?.zoteroStatus) return;

  if (isEmptyFrontmatterValue(frontmatter.zoteroStatus)) {
    frontmatter.zoteroStatus = 'new';
  }
}
