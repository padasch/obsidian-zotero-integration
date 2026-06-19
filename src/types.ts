export type Format =
  | 'latex'
  | 'biblatex'
  | 'pandoc'
  | 'formatted-citation'
  | 'formatted-bibliography'
  | 'template';

export interface CitationFormat {
  name: string;
  format: Format;
  command?: string;
  brackets?: boolean;
  cslStyle?: string;
  template?: string;
}

export type Database = 'Zotero' | 'Juris-M' | 'Custom';
export type DatabaseWithPort = {
  database: Database;
  port?: string;
};

export type NotesToOpenAfterImport =
  | 'first-imported-note'
  | 'last-imported-note'
  | 'all-imported-notes';

export interface CalloutDef {
  type: string;
  prefix: string;
}

export enum GroupingOptions {
  Tag = 'tag',
  AnnotationDate = 'annotation-date',
  ExportDate = 'export-date',
  Color = 'color',
}

export enum SortingOptions {
  Color = 'color',
  Date = 'date',
  Location = 'location',
}

export interface ExportFormat {
  name: string;
  outputPathTemplate: string;
  imageOutputPathTemplate: string;
  imageBaseNameTemplate: string;

  templatePath?: string;
  cslStyle?: string;

  // Deprecated
  headerTemplatePath?: string;
  annotationTemplatePath?: string;
  footerTemplatePath?: string;
}

export interface ExportToMarkdownParams {
  settings: ZoteroConnectorSettings;
  database: DatabaseWithPort;
  exportFormat: ExportFormat;
  managedProperties?: ZoteroManagedUserProperties;
  forceOverwrite?: boolean;
  pathOverrides?: Record<string, string>;
  afterWrite?: (file: any, item: any, markdownPath: string) => void | Promise<void>;
}

export type ZoteroManagedUserStatus = string;

export interface ZoteroManagedUserProperties {
  zoteroProject: string[];
  zoteroTopic: string[];
  zoteroNote: string;
  zoteroSummary?: string;
  zoteroStatus: ZoteroManagedUserStatus;
}

export type ZoteroMonitorAutomaticAction = 'notice' | 'modal';
export type ZoteroItemTableColumn =
  | 'title'
  | 'citekey'
  | 'creators'
  | 'year'
  | 'date'
  | 'publication'
  | 'publisher'
  | 'itemType'
  | 'library'
  | 'dateModified'
  | 'dateAdded'
  | 'tags'
  | 'collections'
  | 'doi'
  | 'url';

export interface ZoteroMonitorScope {
  libraryScope: string[];
  collectionScope: string[];
  tagScope: string[];
}

export interface ZoteroMonitorItem {
  title: string;
  citekey: string;
  libraryID: number;
  libraryName?: string;
  itemKey?: string;
  dateModified?: string;
  dateAdded?: string;
  item: Record<string, unknown>;
}

export interface RenderCiteTemplateParams {
  database: DatabaseWithPort;
  format: CitationFormat;
}

export interface ZoteroConnectorSettings {
  citeFormats: CitationFormat[];
  citeSuggestTemplate?: string;
  database: Database;
  port?: string;
  exeVersion?: string;
  _exeInternalVersion?: number;
  exeOverridePath?: string;
  exportFormats: ExportFormat[];
  noteImportFolder: string;
  openNoteAfterImport: boolean;
  pdfExportImageDPI?: number;
  pdfExportImageFormat?: string;
  pdfExportImageOCR?: boolean;
  pdfExportImageOCRLang?: string;
  pdfExportImageQuality?: number;
  pdfExportImageTessDataDir?: string;
  pdfExportImageTesseractPath?: string;
  settingsVersion?: number;
  shouldConcat?: boolean;
  whichNotesToOpenAfterImport: NotesToOpenAfterImport;
  zoteroPreservedProperties?: string[];
  zoteroTaskAnnotationColors?: string[];
  zoteroMonitorEnabled?: boolean;
  zoteroMonitorCheckOnStartup?: boolean;
  zoteroMonitorIntervalMinutes?: number;
  zoteroMonitorAutomaticAction?: ZoteroMonitorAutomaticAction;
  zoteroMonitorRecentDays?: number | null;
  zoteroMonitorLibraryScope?: string[];
  zoteroMonitorCollectionScope?: string[];
  zoteroMonitorTagScope?: string[];
  zoteroMonitorImportFormat?: string;
  zoteroItemTableColumns?: string[];
  zoteroMonitorTableColumns?: string[];
  zoteroOrphanedProperty?: string;
  zoteroSciteApiToken?: string;
  zoteroSciteEnabled?: boolean;
  zoteroSciteRefreshIntervalDays?: number;
  zoteroSciteRefreshOnImport?: boolean;
}

export interface CiteKeyExport {
  libraryID: number;
  citekey: string;
  title: string;
}
