import Fuse from 'fuse.js';
import { EditableFileView, Events, Plugin, TFile } from 'obsidian';
import { shellPath } from 'shell-path';

import { DataExplorerView, viewType } from './DataExplorerView';
import {
  DEFAULT_ZOTERO_IMAGE_BASE_NAME_TEMPLATE,
  DEFAULT_ZOTERO_IMAGE_OUTPUT_PATH_TEMPLATE,
  DEFAULT_ZOTERO_PRESERVED_PROPERTIES,
  DEFAULT_ZOTERO_TASK_ANNOTATION_COLORS,
  normalizeManagedImportSettings,
} from './ZoteroManagedProperties';
import { ZoteroMonitor } from './ZoteroMonitor';
import { LoadingModal } from './bbt/LoadingModal';
import { getCAYW } from './bbt/cayw';
import { exportToMarkdown, renderCiteTemplate } from './bbt/export';
import './bbt/template.helpers';
import {
  currentVersion,
  downloadAndExtract,
  internalVersion,
} from './settings/AssetDownloader';
import { ZoteroConnectorSettingsTab } from './settings/settings';
import {
  CitationFormat,
  CiteKeyExport,
  ExportFormat,
  ZoteroConnectorSettings,
} from './types';
import { ZOTERO_ORPHANED_DEFAULT_PROPERTY } from './ZoteroMonitor.helpers';

const commandPrefix = 'obsidian-zotero-desktop-connector:';
const citationCommandIDPrefix = 'zdc-';
const exportCommandIDPrefix = 'zdc-exp-';
const DEFAULT_CSL_STYLE = 'harvard-cite-them-right';
const DEFAULT_CITE_FORMATS: CitationFormat[] = [
  {
    name: 'Citation',
    format: 'formatted-citation',
    cslStyle: DEFAULT_CSL_STYLE,
  },
  {
    name: 'Bibliography',
    format: 'formatted-bibliography',
    cslStyle: DEFAULT_CSL_STYLE,
  },
];
const DEFAULT_EXPORT_FORMATS: ExportFormat[] = [
  {
    name: 'Literature Note',
    outputPathTemplate: '@{{citekey}}.md',
    imageOutputPathTemplate: DEFAULT_ZOTERO_IMAGE_OUTPUT_PATH_TEMPLATE,
    imageBaseNameTemplate: DEFAULT_ZOTERO_IMAGE_BASE_NAME_TEMPLATE,
    cslStyle: DEFAULT_CSL_STYLE,
  },
];
const DEFAULT_SETTINGS: ZoteroConnectorSettings = {
  database: 'Zotero',
  noteImportFolder: '',
  pdfExportImageDPI: 120,
  pdfExportImageFormat: 'jpg',
  pdfExportImageQuality: 90,
  citeFormats: DEFAULT_CITE_FORMATS,
  exportFormats: DEFAULT_EXPORT_FORMATS,
  citeSuggestTemplate: '[[{{citekey}}]]',
  openNoteAfterImport: false,
  whichNotesToOpenAfterImport: 'first-imported-note',
  zoteroMonitorAutomaticAction: 'notice',
  zoteroMonitorCheckOnStartup: false,
  zoteroMonitorCollectionScope: [],
  zoteroMonitorEnabled: false,
  zoteroMonitorImportFormat: '',
  zoteroMonitorIntervalMinutes: 0,
  zoteroMonitorLibraryScope: [],
  zoteroMonitorReadingStatusProperty: 'readingStatus',
  zoteroMonitorReadingStatusValue: 'unread',
  zoteroMonitorRecentDays: 30,
  zoteroMonitorTagScope: [],
  zoteroOrphanedProperty: ZOTERO_ORPHANED_DEFAULT_PROPERTY,
  zoteroPreservedProperties: DEFAULT_ZOTERO_PRESERVED_PROPERTIES,
  zoteroSciteApiToken: '',
  zoteroSciteEnabled: false,
  zoteroSciteRefreshIntervalDays: 7,
  zoteroSciteRefreshOnImport: true,
  zoteroTaskAnnotationColors: DEFAULT_ZOTERO_TASK_ANNOTATION_COLORS,
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
      name: 'Test import template with Zotero item',
      callback: () => {
        this.activateDataExplorer();
      },
    });

    this.addCommand({
      id: 'zdc-check-missing-literature',
      name: 'Find missing Zotero literature notes',
      callback: () => {
        this.zoteroMonitor.runManualCheck();
      },
    });

    this.addCommand({
      id: 'zdc-import-specific-literature',
      name: 'Batch import selected literature notes',
      callback: () => {
        this.zoteroMonitor.runDirectImport();
      },
    });

    this.addCommand({
      id: 'zdc-check-orphaned-literature',
      name: 'Find orphaned Obsidian literature notes',
      callback: () => {
        this.zoteroMonitor.runOrphanedNotesCheck();
      },
    });

    this.addCommand({
      id: 'zdc-update-literature-notes',
      name: 'Update existing literature notes from Zotero',
      callback: () => {
        this.zoteroMonitor.runUpdateNotesCheck();
      },
    });

    this.addCommand({
      id: 'zdc-refresh-scite-metadata',
      name: 'Refresh scite metadata for literature notes',
      callback: () => {
        this.zoteroMonitor.runSciteMetadataRefresh();
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
    if (
      this.settings.zoteroMonitorEnabled &&
      this.settings.zoteroMonitorCheckOnStartup
    ) {
      this.app.workspace.onLayoutReady(() => {
        this.zoteroMonitor.runAutomaticCheck();
      });
    }

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
    this.addCommand({
      id: `${citationCommandIDPrefix}${format.name}`,
      name:
        format.format === 'formatted-bibliography'
          ? `Insert bibliography: ${format.name}`
          : `Insert citation: ${format.name}`,
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
      name: `Quick import from Zotero picker: ${format.name}`,
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
    const pathOfNotesToOpen: string[] = [];
    if (this.settings.openNoteAfterImport) {
      // Depending on the choice, retreive the paths of the first, the last or all imported notes
      switch (this.settings.whichNotesToOpenAfterImport) {
        case 'first-imported-note': {
          pathOfNotesToOpen.push(createdOrUpdatedMarkdownFilesPaths[0]);
          break;
        }
        case 'last-imported-note': {
          pathOfNotesToOpen.push(
            createdOrUpdatedMarkdownFilesPaths[
              createdOrUpdatedMarkdownFilesPaths.length - 1
            ]
          );
          break;
        }
        case 'all-imported-notes': {
          pathOfNotesToOpen.push(...createdOrUpdatedMarkdownFilesPaths);
          break;
        }
      }
    }

    // Force a 1s delay after importing the files to make sure that notes are created before attempting to open them.
    // A better solution could surely be found to refresh the vault, but I am not sure how to proceed!
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const leaves = this.app.workspace.getLeavesOfType('markdown');
    for (const path of pathOfNotesToOpen) {
      const note = this.app.vault.getAbstractFileByPath(path);
      const open = leaves.find(
        (leaf) => (leaf.view as EditableFileView).file === note
      );
      if (open) {
        app.workspace.revealLeaf(open);
      } else if (note instanceof TFile) {
        await this.app.workspace.getLeaf(true).openFile(note);
      }
    }
  }

  async loadSettings() {
    const loadedSettings = await this.loadData();

    this.settings = normalizeManagedImportSettings({
      ...DEFAULT_SETTINGS,
      ...loadedSettings,
      citeFormats: loadedSettings?.citeFormats?.length
        ? loadedSettings.citeFormats
        : DEFAULT_CITE_FORMATS,
      exportFormats: loadedSettings?.exportFormats?.length
        ? loadedSettings.exportFormats
        : DEFAULT_EXPORT_FORMATS,
    });
  }

  async saveSettings() {
    this.emitter.trigger('settingsUpdated');
    this.zoteroMonitor?.schedule();
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
