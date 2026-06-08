import { App, Modal, Notice, TFile } from 'obsidian';

import type ZoteroConnector from './main';
import {
  CiteKeyExport,
  DatabaseWithPort,
  ZoteroMonitorItem,
  ZoteroMonitorScope,
} from './types';
import {
  filterItemsByRecentDays,
  filterItemsByScope,
  filterMissingZoteroItems,
  getItemCollectionPaths,
  getItemTags,
  getZoteroItemCitekey,
  getZoteroItemKey,
  groupItemsByLibrary,
  normalizeMonitorItem,
} from './ZoteroMonitor.helpers';
import { exportToMarkdown } from './bbt/export';
import { isZoteroRunning } from './bbt/cayw';
import {
  getAllCiteKeys,
  getCollectionFromCiteKey,
  getItemJSONFromCiteKeys,
} from './bbt/jsonRPC';

const BATCH_SIZE = 50;

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function itemIdentity(item: ZoteroMonitorItem): string {
  return `${item.libraryID}:${item.citekey}`;
}

function getDisplayDate(value?: string): string {
  if (!value) return '';

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;

  return parsed.toISOString().slice(0, 10);
}

function getSearchText(item: ZoteroMonitorItem): string {
  return [
    item.title,
    item.citekey,
    item.libraryName,
    item.libraryID,
    item.itemKey,
    getItemTags(item.item).join(' '),
    getItemCollectionPaths(item.item).join(' '),
  ]
    .join(' ')
    .toLocaleLowerCase();
}

function uniqueCandidates(candidates: CiteKeyExport[]): CiteKeyExport[] {
  const byKey = new Map<string, CiteKeyExport>();

  for (const candidate of candidates) {
    byKey.set(`${candidate.libraryID}:${candidate.citekey}`, candidate);
  }

  return Array.from(byKey.values());
}

class ZoteroMissingItemsModal extends Modal {
  private selected = new Set<string>();
  private searchTerm = '';
  private listEl: HTMLDivElement;
  private importButton: HTMLButtonElement;

  constructor(
    app: App,
    private items: ZoteroMonitorItem[],
    private onImport: (items: ZoteroMonitorItem[]) => Promise<void>,
    private onFinished: () => void
  ) {
    super(app);

    for (const item of items) {
      this.selected.add(itemIdentity(item));
    }
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    const container = contentEl.createDiv('zt-monitor-modal');
    container.createEl('h2', { text: 'Missing Zotero literature notes' });
    container.createEl('p', {
      text: `${this.items.length} Zotero item${
        this.items.length === 1 ? '' : 's'
      } are not represented by Obsidian note properties.`,
    });

    const search = container.createEl('input');
    search.type = 'search';
    search.placeholder = 'Search title, citekey, tag, or collection';
    search.addClass('zt-monitor-search');
    search.addEventListener('input', () => {
      this.searchTerm = search.value.trim().toLocaleLowerCase();
      this.renderList();
    });

    this.listEl = container.createDiv('zt-monitor-list');

    const buttons = container.createDiv('zt-monitor-buttons');
    const dismissButton = buttons.createEl('button', { text: 'Dismiss' });
    dismissButton.addEventListener('click', () => this.close());

    this.importButton = buttons.createEl('button', {
      text: `Import selected (${this.selected.size})`,
    });
    this.importButton.addClass('mod-cta');
    this.importButton.addEventListener('click', async () => {
      const selectedItems = this.getSelectedItems();
      if (!selectedItems.length) return;

      this.importButton.disabled = true;
      this.importButton.setText('Importing...');
      await this.onImport(selectedItems);
      this.close();
    });

    this.renderList();
    search.focus();
  }

  onClose() {
    this.contentEl.empty();
    this.onFinished();
  }

  private getFilteredItems(): ZoteroMonitorItem[] {
    if (!this.searchTerm) return this.items;

    return this.items.filter((item) =>
      getSearchText(item).includes(this.searchTerm)
    );
  }

  private getSelectedItems(): ZoteroMonitorItem[] {
    return this.items.filter((item) => this.selected.has(itemIdentity(item)));
  }

  private updateImportButton() {
    if (!this.importButton) return;

    this.importButton.setText(`Import selected (${this.selected.size})`);
    this.importButton.disabled = this.selected.size === 0;
  }

  private renderList() {
    this.listEl.empty();

    const filtered = this.getFilteredItems();
    if (!filtered.length) {
      this.listEl.createDiv({
        cls: 'zt-monitor-empty',
        text: 'No matching Zotero items.',
      });
      this.updateImportButton();
      return;
    }

    for (const item of filtered) {
      const key = itemIdentity(item);
      const row = this.listEl.createDiv('zt-monitor-row');
      const checkbox = row.createEl('input');
      checkbox.type = 'checkbox';
      checkbox.checked = this.selected.has(key);
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) {
          this.selected.add(key);
        } else {
          this.selected.delete(key);
        }
        this.updateImportButton();
      });

      const details = row.createDiv('zt-monitor-row-details');
      details.createDiv({
        cls: 'zt-monitor-row-title',
        text: item.title || item.citekey,
      });

      const meta = [
        item.citekey,
        item.libraryName || `Library ${item.libraryID}`,
        getDisplayDate(item.dateAdded),
      ].filter((value) => !!value);

      details.createDiv({
        cls: 'zt-monitor-row-meta',
        text: meta.join(' | '),
      });

      const collections = getItemCollectionPaths(item.item);
      const tags = getItemTags(item.item);
      const scopes = [...collections, ...tags.map((tag) => `#${tag}`)];
      if (scopes.length) {
        details.createDiv({
          cls: 'zt-monitor-row-meta',
          text: scopes.join(' | '),
        });
      }
    }

    this.updateImportButton();
  }
}

export class ZoteroMonitor {
  private intervalId: number | null = null;
  private checkInProgress = false;
  private modalOpen = false;

  constructor(private plugin: ZoteroConnector) {}

  schedule() {
    this.clear();

    if (!this.plugin.settings.zoteroMonitorEnabled) return;

    const intervalMinutes = Number(
      this.plugin.settings.zoteroMonitorIntervalMinutes || 0
    );

    if (!Number.isFinite(intervalMinutes) || intervalMinutes <= 0) return;

    this.intervalId = window.setInterval(() => {
      this.runAutomaticCheck();
    }, intervalMinutes * 60 * 1000);
    this.plugin.registerInterval(this.intervalId);
  }

  clear() {
    if (this.intervalId !== null) {
      window.clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  async runManualCheck() {
    await this.runCheck(true);
  }

  async runAutomaticCheck() {
    if (!this.plugin.settings.zoteroMonitorEnabled) return;
    await this.runCheck(false);
  }

  async runCheck(manual: boolean) {
    if (this.checkInProgress || this.modalOpen) return;

    this.checkInProgress = true;
    try {
      const missing = await this.getMissingItems(manual);

      if (!missing.length) {
        if (manual) {
          new Notice('No missing Zotero literature notes found.');
        }
        return;
      }

      this.modalOpen = true;
      new ZoteroMissingItemsModal(
        this.plugin.app,
        missing,
        (items) => this.importItems(items),
        () => {
          this.modalOpen = false;
        }
      ).open();
    } finally {
      this.checkInProgress = false;
    }
  }

  private getDatabase(): DatabaseWithPort {
    return {
      database: this.plugin.settings.database,
      port: this.plugin.settings.port,
    };
  }

  private getScope(): ZoteroMonitorScope {
    return {
      libraryScope: this.plugin.settings.zoteroMonitorLibraryScope || [],
      collectionScope: this.plugin.settings.zoteroMonitorCollectionScope || [],
      tagScope: this.plugin.settings.zoteroMonitorTagScope || [],
    };
  }

  private async getMissingItems(manual: boolean): Promise<ZoteroMonitorItem[]> {
    const database = this.getDatabase();

    if (!(await isZoteroRunning(database, true))) {
      if (manual) {
        new Notice(
          'Cannot connect to Zotero. Please ensure it is running and Better BibTeX is installed.',
          10000
        );
      }
      return [];
    }

    const { citekeys } = await getAllCiteKeys(database, true);
    if (!citekeys.length) return [];

    const items = await this.fetchMonitorItems(uniqueCandidates(citekeys));
    const recent = filterItemsByRecentDays(
      items,
      this.plugin.settings.zoteroMonitorRecentDays
    );

    const scope = this.getScope();
    let scoped = filterItemsByScope(recent, {
      libraryScope: scope.libraryScope,
      collectionScope: [],
      tagScope: scope.tagScope,
    });

    if (scope.collectionScope.length) {
      await this.hydrateCollections(scoped);
      scoped = filterItemsByScope(scoped, {
        libraryScope: [],
        collectionScope: scope.collectionScope,
        tagScope: [],
      });
    }

    const frontmatters = this.getVaultFrontmatters();
    return filterMissingZoteroItems(scoped, frontmatters);
  }

  private async fetchMonitorItems(
    candidates: CiteKeyExport[]
  ): Promise<ZoteroMonitorItem[]> {
    const database = this.getDatabase();
    const byLibrary = new Map<number, CiteKeyExport[]>();
    const monitorItems: ZoteroMonitorItem[] = [];

    for (const candidate of candidates) {
      const group = byLibrary.get(candidate.libraryID) || [];
      group.push(candidate);
      byLibrary.set(candidate.libraryID, group);
    }

    for (const [libraryID, libraryCandidates] of byLibrary.entries()) {
      const candidateByCitekey = new Map<string, CiteKeyExport>();
      for (const candidate of libraryCandidates) {
        candidateByCitekey.set(candidate.citekey.toLocaleLowerCase(), candidate);
      }

      for (const batch of chunk(libraryCandidates, BATCH_SIZE)) {
        const itemData = await getItemJSONFromCiteKeys(
          batch.map((candidate) => ({
            key: candidate.citekey,
            library: libraryID,
          })),
          database,
          libraryID,
          true
        );

        if (!Array.isArray(itemData)) continue;

        for (const item of itemData) {
          const citekey = getZoteroItemCitekey(item);
          const candidate = citekey
            ? candidateByCitekey.get(citekey.toLocaleLowerCase())
            : null;
          if (!candidate) continue;

          const monitorItem = normalizeMonitorItem(item, candidate);
          if (monitorItem) monitorItems.push(monitorItem);
        }
      }
    }

    return monitorItems;
  }

  private async hydrateCollections(items: ZoteroMonitorItem[]) {
    const database = this.getDatabase();

    for (const item of items) {
      if (getItemCollectionPaths(item.item).length) continue;

      const collections = await getCollectionFromCiteKey(
        {
          key: item.citekey,
          library: item.libraryID,
        },
        database,
        true
      );

      if (collections) {
        item.collections = collections;
        item.item.collections = collections;
      }
    }
  }

  private getVaultFrontmatters(): Array<Record<string, any>> {
    const frontmatters: Array<Record<string, any>> = [];

    for (const file of this.plugin.app.vault.getMarkdownFiles()) {
      const frontmatter =
        this.plugin.app.metadataCache.getFileCache(file)?.frontmatter;

      if (frontmatter) {
        frontmatters.push(frontmatter as Record<string, any>);
      }
    }

    return frontmatters;
  }

  private async importItems(items: ZoteroMonitorItem[]) {
    const exportFormatName =
      this.plugin.settings.zoteroMonitorImportFormat ||
      this.plugin.settings.exportFormats[0]?.name;
    const exportFormat = this.plugin.settings.exportFormats.find(
      (format) => format.name === exportFormatName
    );

    if (!exportFormat) {
      new Notice('No Zotero import format selected for the monitor.', 10000);
      return;
    }

    const createdOrUpdatedPaths: string[] = [];
    const database = this.getDatabase();

    for (const [libraryID, libraryItems] of groupItemsByLibrary(items).entries()) {
      const paths = await exportToMarkdown(
        {
          settings: this.plugin.settings,
          database,
          exportFormat,
        },
        libraryItems.map((item) => ({
          key: item.citekey,
          library: libraryID,
        })),
        {
          afterWrite: async (file, item) => {
            await this.writeMonitorProperties(file, item);
          },
        }
      );

      createdOrUpdatedPaths.push(...paths);
    }

    await this.plugin.openNotes(createdOrUpdatedPaths);

    if (createdOrUpdatedPaths.length) {
      new Notice(
        `Imported ${createdOrUpdatedPaths.length} Zotero literature note${
          createdOrUpdatedPaths.length === 1 ? '' : 's'
        }.`
      );
    }
  }

  private async writeMonitorProperties(file: TFile, item: any) {
    const fileManager = (this.plugin.app as any).fileManager;
    if (!fileManager?.processFrontMatter) {
      new Notice(
        'Cannot write Zotero monitor properties because this Obsidian version does not support processFrontMatter.',
        10000
      );
      return;
    }

    const citekey = getZoteroItemCitekey(item);
    const libraryID = item?.libraryID;
    const itemKey = getZoteroItemKey(item);
    const statusProperty =
      this.plugin.settings.zoteroMonitorReadingStatusProperty?.trim();
    const statusValue =
      this.plugin.settings.zoteroMonitorReadingStatusValue?.trim();

    await fileManager.processFrontMatter(
      file,
      (frontmatter: Record<string, any>) => {
        if (citekey) frontmatter.citekey = citekey;
        if (libraryID) frontmatter.zoteroLibraryID = libraryID;
        if (itemKey) frontmatter.zoteroItemKey = itemKey;

        if (
          statusProperty &&
          statusValue &&
          frontmatter[statusProperty] === undefined
        ) {
          frontmatter[statusProperty] = statusValue;
        }
      }
    );
  }
}
