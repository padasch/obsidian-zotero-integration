export const KNOWN_ZOTERO_PROPERTY_KEYS = [
  'abstractNote',
  'allTags',
  'authors',
  'bibliography',
  'citation-key',
  'citationKey',
  'citationkey',
  'citekey',
  'collections',
  'date',
  'dateAdded',
  'dateModified',
  'doi',
  'DOI',
  'firstAttachmentLink',
  'firstAttachmentZoteroLink',
  'hashTags',
  'itemKey',
  'itemType',
  'key',
  'lastExportDate',
  'lastImportDate',
  'libraryID',
  'pdfLink',
  'pdfZoteroLink',
  'publicationTitle',
  'publisher',
  'tags',
  'title',
  'url',
  'zotero_key',
  'zoteroKey',
  'zoteroItemKey',
  'zoteroLibraryID',
  'zoteroCitekey',
  'zoteroCiteKey',
  'zoteroNote',
  'zoteroOrphaned',
  'zoteroOrphanedCheckedAt',
  'zoteroOrphanedReason',
  'zoteroProject',
  'zoteroSciteCitingPublications',
  'zoteroSciteContradicting',
  'zoteroSciteMentioning',
  'zoteroSciteStatus',
  'zoteroSciteSupporting',
  'zoteroSciteTotalStatements',
  'zoteroSciteUnclassified',
  'zoteroSciteUpdatedAt',
  'zoteroSciteURL',
  'zoteroStatus',
  'zoteroSummary',
  'zoteroTopic',
];

export function getInvalidPreservedProperties(
  properties: readonly string[] | undefined,
  availableProperties: Iterable<string> = []
): string[] {
  if (!properties?.length) return [];

  const valid = new Set<string>([
    ...KNOWN_ZOTERO_PROPERTY_KEYS,
    ...Array.from(availableProperties),
  ]);

  return properties.filter((property) => !!property && !valid.has(property));
}
