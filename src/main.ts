import Fuse from 'fuse.js';
import {
  EditableFileView,
  Events,
  Notice,
  Plugin,
  TFile,
  WorkspaceLeaf,
} from 'obsidian';
import { shellPath } from 'shell-path';

import { DataExplorerView, viewType } from './DataExplorerView';
import { LoadingModal } from './bbt/LoadingModal';
import { getCAYW } from './bbt/cayw';
import { exportToMarkdown, renderCiteTemplate } from './bbt/export';
import './bbt/template.helpers';
import {
  currentVersion,
  downloadAndExtract,
  internalVersion,
} from './settings/AssetDownloader';
import { ZoteroMonitor } from './ZoteroMonitor';
import {
  DEFAULT_ZOTERO_ITEM_TABLE_COLUMNS,
  normalizeZoteroItemTableColumns,
} from './ZoteroItemTable.columns';
import { ZoteroConnectorSettingsTab } from './settings/settings';
import {
  CitationFormat,
  CiteKeyExport,
  ExportFormat,
  ZoteroConnectorSettings,
} from './types';

const commandPrefix = 'obsidian-zotero-desktop-connector:';
const citationCommandIDPrefix = 'zdc-';
const exportCommandIDPrefix = 'zdc-exp-';
const DEFAULT_CSL_STYLE = 'harvard-cite-them-right';
const DEFAULT_IMAGE_OUTPUT_PATH = 'images/';
const DEFAULT_IMAGE_BASE_NAME = '@{{citekey}}-image';
const DEFAULT_EXPORT_FORMATS: ExportFormat[] = [
  {
    name: 'Literature Note',
    outputPathTemplate: '@{{citekey}}.md',
    imageOutputPathTemplate: DEFAULT_IMAGE_OUTPUT_PATH,
    imageBaseNameTemplate: DEFAULT_IMAGE_BASE_NAME,
    cslStyle: DEFAULT_CSL_STYLE,
  },
];

function cloneDefaultExportFormats(): ExportFormat[] {
  return DEFAULT_EXPORT_FORMATS.map((format) => ({ ...format }));
}

function normalizeExportFormats(formats: ExportFormat[]): ExportFormat[] {
  return formats.map((format) => {
    const normalized = { ...format };

    if (normalized.outputPathTemplate?.trim() === '{{citekey}}.md') {
      normalized.outputPathTemplate = '@{{citekey}}.md';
    }

    if (
      ['{{citekey}}/', 'images/{{citekey}}/'].includes(
        normalized.imageOutputPathTemplate?.trim()
      )
    ) {
      normalized.imageOutputPathTemplate = DEFAULT_IMAGE_OUTPUT_PATH;
    }

    if (
      !normalized.imageBaseNameTemplate ||
      normalized.imageBaseNameTemplate.trim() === 'image'
    ) {
      normalized.imageBaseNameTemplate = DEFAULT_IMAGE_BASE_NAME;
    }

    return normalized;
  });
}

function getLeafFile(leaf: WorkspaceLeaf): TFile | null {
  const file = (leaf.view as Partial<EditableFileView> | undefined)?.file;
  return file instanceof TFile ? file : null;
}

const DEFAULT_SETTINGS: ZoteroConnectorSettings = {
  database: 'Zotero',
  noteImportFolder: '',
  pdfExportImageDPI: 120,
  pdfExportImageFormat: 'jpg',
  pdfExportImageQuality: 90,
  citeFormats: [],
  exportFormats: cloneDefaultExportFormats(),
  citeSuggestTemplate: '[[{{citekey}}]]',
  openFileAfterImportPath: '',
  openNoteAfterImport: false,
  whichNotesToOpenAfterImport: 'first-imported-note',
  zoteroPreservedProperties: [],
  zoteroTaskAnnotationColors: ['Purple', 'Magenta', 'Gray'],
  zoteroMonitorEnabled: false,
  zoteroMonitorCheckOnStartup: false,
  zoteroMonitorIntervalMinutes: 0,
  zoteroMonitorAutomaticAction: 'notice',
  zoteroMonitorRecentDays: 30,
  zoteroMonitorLibraryScope: [],
  zoteroMonitorCollectionScope: [],
  zoteroMonitorTagScope: [],
  zoteroMonitorImportFormat: '',
  zoteroItemTableColumns: DEFAULT_ZOTERO_ITEM_TABLE_COLUMNS.slice(),
  zoteroOrphanedProperty: 'zoteroOrphaned',
  zoteroSciteApiToken: '',
  zoteroSciteEnabled: false,
  zoteroSciteRefreshIntervalDays: 7,
  zoteroSciteRefreshOnImport: true,
};

async function fixPath() {
  if (process.platform === 'win32') {
    return;
  }

  try {
    const path = await shellPath();

    process.env.PATH =
      path ||
      [
        './node_modules/.bin',
        '/.nodebrew/current/bin',
        '/usr/local/bin',
        process.env.PATH,
      ].join(':');
  } catch (e) {
    console.error(e);
  }
}

function isLegacyDefaultCitationCommand(format: CitationFormat): boolean {
  return (
    (format.name === 'Citation' && format.format === 'formatted-citation') ||
    (format.name === 'Bibliography' && format.format === 'formatted-bibliography')
  );
}

export default class ZoteroConnector extends Plugin {
  settings: ZoteroConnectorSettings;
  emitter: Events;
  fuse: Fuse<CiteKeyExport>;
  zoteroMonitor: ZoteroMonitor;

  async onload() {
    await this.loadSettings();
    this.emitter = new Events();
    this.zoteroMonitor = new ZoteroMonitor(this);

    this.updatePDFUtility();
    this.addSettingTab(new ZoteroConnectorSettingsTab(this.app, this));
    this.registerView(viewType, (leaf) => new DataExplorerView(this, leaf));

    this.settings.citeFormats.forEach((f) => {
      this.addFormatCommand(f);
    });

    this.settings.exportFormats.forEach((f) => {
      this.addExportCommand(f);
    });

    this.addCommand({
      id: 'show-zotero-debug-view',
      name: 'Test import template',
      callback: () => {
        this.activateDataExplorer();
      },
    });

    this.addCommand({
      id: 'zdc-check-missing-literature',
      name: 'Import missing notes (batch import)',
      callback: () => {
        this.zoteroMonitor.runManualCheck();
      },
    });

    this.addCommand({
      id: 'zdc-import-specific-literature',
      name: 'Import specific notes',
      callback: () => {
        this.zoteroMonitor.runDirectImport();
      },
    });

    this.addCommand({
      id: 'zdc-check-orphaned-literature',
      name: 'Find notes without Zotero item',
      callback: () => {
        this.zoteroMonitor.runOrphanedNotesCheck();
      },
    });

    this.addCommand({
      id: 'zdc-refresh-scite-metadata',
      name: 'Refresh scite metadata',
      callback: () => {
        this.zoteroMonitor.runSciteMetadataRefresh();
      },
    });

    this.addCommand({
      id: 'zdc-update-literature-notes',
      name: 'Update existing notes',
      callback: () => {
        this.zoteroMonitor.runUpdateNotesCheck();
      },
    });

    this.registerEvent(
      this.app.vault.on('modify', (file) => {
        if (file instanceof TFile) {
          this.emitter.trigger('fileUpdated', file);
        }
      })
    );

    app.workspace.trigger('parse-style-settings');
    this.zoteroMonitor.schedule();

    this.app.workspace.onLayoutReady(() => {
      this.zoteroMonitor.preload();

      if (
        this.settings.zoteroMonitorEnabled &&
        this.settings.zoteroMonitorCheckOnStartup
      ) {
        this.zoteroMonitor.runAutomaticCheck();
      }
    });

    fixPath();
  }

  onunload() {
    this.zoteroMonitor.clear();
    this.settings.citeFormats.forEach((f) => {
      this.removeFormatCommand(f);
    });

    this.settings.exportFormats.forEach((f) => {
      this.removeExportCommand(f);
    });

    this.app.workspace.detachLeavesOfType(viewType);
  }

  addFormatCommand(format: CitationFormat) {
    if (isLegacyDefaultCitationCommand(format)) return;

    this.addCommand({
      id: `${citationCommandIDPrefix}${format.name}`,
      name: format.name,
      editorCallback: (editor) => {
        const database = {
          database: this.settings.database,
          port: this.settings.port,
        };
        if (format.format === 'template' && format.template.trim()) {
          renderCiteTemplate({
            database,
            format,
          }).then((res) => {
            if (typeof res === 'string') {
              editor.replaceSelection(res);
            }
          });
        } else {
          getCAYW(format, database).then((res) => {
            if (typeof res === 'string') {
              editor.replaceSelection(res);
            }
          });
        }
      },
    });
  }

  removeFormatCommand(format: CitationFormat) {
    (this.app as any).commands.removeCommand(
      `${commandPrefix}${citationCommandIDPrefix}${format.name}`
    );
  }

  addExportCommand(format: ExportFormat) {
    this.addCommand({
      id: `${exportCommandIDPrefix}${format.name}`,
      name:
        format.name === 'Literature Note'
          ? 'Import/update via Zotero picker'
          : `Import/update via Zotero picker: ${format.name}`,
      callback: async () => {
        const database = {
          database: this.settings.database,
          port: this.settings.port,
        };
        this.openNotes(
          await exportToMarkdown({
            settings: this.settings,
            database,
            exportFormat: format,
          })
        );
      },
    });
  }

  removeExportCommand(format: ExportFormat) {
    (this.app as any).commands.removeCommand(
      `${commandPrefix}${exportCommandIDPrefix}${format.name}`
    );
  }

  async runImport(name: string, citekey: string, library: number = 1) {
    const format = this.settings.exportFormats.find((f) => f.name === name);

    if (!format) {
      throw new Error(`Error: Import format "${name}" not found`);
    }

    const database = {
      database: this.settings.database,
      port: this.settings.port,
    };

    if (citekey.startsWith('@')) citekey = citekey.substring(1);

    await exportToMarkdown(
      {
        settings: this.settings,
        database,
        exportFormat: format,
      },
      [{ key: citekey, library }]
    );
  }

  async openNotes(createdOrUpdatedMarkdownFilesPaths: string[]) {
    const importedPaths = createdOrUpdatedMarkdownFilesPaths.filter(Boolean);
    const pathOfNotesToOpen: string[] = [];
    const addPath = (path?: string) => {
      const cleaned = String(path || '').trim();
      if (cleaned && !pathOfNotesToOpen.includes(cleaned)) {
        pathOfNotesToOpen.push(cleaned);
      }
    };

    if (this.settings.openNoteAfterImport) {
      // Depending on the choice, retreive the paths of the first, the last or all imported notes
      switch (this.settings.whichNotesToOpenAfterImport) {
        case 'first-imported-note': {
          addPath(importedPaths[0]);
          break;
        }
        case 'last-imported-note': {
          addPath(importedPaths[importedPaths.length - 1]);
          break;
        }
        case 'all-imported-notes': {
          importedPaths.forEach(addPath);
          break;
        }
      }
    }

    if (importedPaths.length && this.settings.openFileAfterImportPath) {
      addPath(this.settings.openFileAfterImportPath);
    }

    if (!pathOfNotesToOpen.length) return;

    // Force a 1s delay after importing the files to make sure that notes are created before attempting to open them.
    // A better solution could surely be found to refresh the vault, but I am not sure how to proceed!
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const leaves: WorkspaceLeaf[] = [];
    this.app.workspace.iterateAllLeaves((leaf) => leaves.push(leaf));
    for (const path of pathOfNotesToOpen) {
      const note = this.app.vault.getAbstractFileByPath(path);
      const open = leaves.find((leaf) => getLeafFile(leaf) === note);
      if (open) {
        app.workspace.revealLeaf(open);
      } else if (note instanceof TFile) {
        await this.app.workspace.getLeaf(true).openFile(note);
      } else {
        new Notice(`Post-import file not found: ${path}`, 7000);
      }
    }
  }

  async loadSettings() {
    const loadedSettings = (await this.loadData()) || {};
    const mergedSettings = {
      ...DEFAULT_SETTINGS,
      ...loadedSettings,
    };
    const loadedExportFormats = Array.isArray(loadedSettings.exportFormats)
      ? loadedSettings.exportFormats
      : [];

    mergedSettings.exportFormats = loadedExportFormats.length
      ? normalizeExportFormats(loadedExportFormats)
      : cloneDefaultExportFormats();

    mergedSettings.zoteroItemTableColumns = normalizeZoteroItemTableColumns(
      mergedSettings.zoteroItemTableColumns ||
        mergedSettings.zoteroMonitorTableColumns
    );
    delete mergedSettings.zoteroMonitorTableColumns;

    this.settings = mergedSettings;
  }

  async saveSettings() {
    this.emitter.trigger('settingsUpdated');
    this.zoteroMonitor.schedule();
    this.zoteroMonitor.preload();
    await this.saveData(this.settings);
  }

  deactivateDataExplorer() {
    this.app.workspace.detachLeavesOfType(viewType);
  }

  async activateDataExplorer() {
    this.deactivateDataExplorer();
    const leaf = this.app.workspace.createLeafBySplit(
      this.app.workspace.activeLeaf,
      'vertical'
    );

    await leaf.setViewState({
      type: viewType,
    });
  }

  async updatePDFUtility() {
    const { exeOverridePath, _exeInternalVersion, exeVersion } = this.settings;
    if (exeOverridePath || !exeVersion) return;

    if (
      exeVersion !== currentVersion ||
      !_exeInternalVersion ||
      _exeInternalVersion !== internalVersion
    ) {
      const modal = new LoadingModal(
        app,
        'Updating Obsidian Zotero Integration PDF Utility...'
      );
      modal.open();

      try {
        const success = await downloadAndExtract();

        if (success) {
          this.settings.exeVersion = currentVersion;
          this.settings._exeInternalVersion = internalVersion;
          this.saveSettings();
        }
      } catch {
        //
      }

      modal.close();
    }
  }
}
