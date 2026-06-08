import type { TFile } from 'obsidian';

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
}

export interface ExportToMarkdownOptions {
  afterWrite?: (file: TFile, item: any, markdownPath: string) => Promise<void>;
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
  zoteroMonitorCheckOnStartup: boolean;
  zoteroMonitorCollectionScope: string[];
  zoteroMonitorEnabled: boolean;
  zoteroMonitorImportFormat: string;
  zoteroMonitorIntervalMinutes: number;
  zoteroMonitorLibraryScope: string[];
  zoteroMonitorReadingStatusProperty: string;
  zoteroMonitorReadingStatusValue: string;
  zoteroMonitorRecentDays: number | null;
  zoteroMonitorTagScope: string[];
}

export interface CiteKeyExport {
  libraryID: number;
  libraryName?: string;
  citekey: string;
  title: string;
}

export interface ZoteroMonitorScope {
  libraryScope: string[];
  collectionScope: string[];
  tagScope: string[];
}

export interface ZoteroMonitorMetadataSettings {
  readingStatusProperty: string;
  readingStatusValue: string;
}

export interface ZoteroMonitorItem {
  citekey: string;
  libraryID: number;
  libraryName?: string;
  itemKey?: string;
  title: string;
  dateAdded?: string;
  dateModified?: string;
  collections?: any[];
  tags?: any[];
  item: any;
}
