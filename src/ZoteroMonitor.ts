import { App, Modal, Notice } from 'obsidian';

import type ZoteroConnector from './main';
import {
  CiteKeyExport,
  DatabaseWithPort,
  ZoteroManagedUserProperties,
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
type MonitorQuickSelect = 'none' | 'today' | 'all';
type MonitorSelectionMode = MonitorQuickSelect | 'custom';
type MonitorSortDirection = 'asc' | 'desc';
type MonitorSortKey =
  | 'title'
  | 'citekey'
  | 'library'
  | 'dateModified'
  | 'dateAdded'
  | 'scopes';

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

function splitBulkInput(value: string): string[] {
  return value
    .split(/[,\n]/g)
    .map((part) => part.trim())
    .filter((part) => !!part);
}

class ZoteroMissingItemsModal extends Modal {
  private selected = new Set<string>();
  private quickSelect: MonitorSelectionMode = 'today';
  private searchTerm = '';
  private sortKey: MonitorSortKey = 'dateModified';
  private sortDirection: MonitorSortDirection = 'desc';
  private managedProperties: ZoteroManagedUserProperties = {
    zoteroProject: [],
    zoteroTopic: [],
    zoteroNote: '',
    zoteroStatus: 'new',
  };
  private isImporting = false;
  private listEl: HTMLDivElement;
  private importButton: HTMLButtonElement;
  private importButtonContinue: HTMLButtonElement;
  private quickSelectButtons: { [key in MonitorQuickSelect]: HTMLButtonElement | null } = {
    none: null,
    today: null,
    all: null,
  };

  constructor(
    app: App,
    private items: ZoteroMonitorItem[],
    private filterSummary: string[],
    private onImport: (
      items: ZoteroMonitorItem[],
      properties: ZoteroManagedUserProperties
    ) => Promise<void>,
    private onFinished: () => void
  ) {
    super(app);

    for (const item of items) {
      if (this.isItemFromToday(item)) {
        this.selected.add(itemIdentity(item));
      }
    }

    if (!this.selected.size) {
      this.quickSelect = 'none';
    }
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    this.modalEl.addClass('zt-monitor-modal-shell');

    const container = contentEl.createDiv('zt-monitor-modal');
    const header = container.createDiv('zt-monitor-header');
    header.createEl('h2', { text: 'Missing Zotero literature notes' });
    header.createEl('p', {
      text: `${this.items.length} Zotero item${
        this.items.length === 1 ? '' : 's'
      } are not represented by Obsidian note properties.`,
    });
    const filters = header.createDiv('zt-monitor-filter-summary');
    for (const filter of this.filterSummary) {
      filters.createSpan({ cls: 'zt-monitor-filter-chip', text: filter });
    }

    const toolbar = container.createDiv('zt-monitor-toolbar');
    const search = toolbar.createEl('input');
    search.type = 'search';
    search.placeholder = 'Search title, citekey, tag, or collection';
    search.addClass('zt-monitor-search');
    search.addEventListener('input', () => {
      this.searchTerm = search.value.trim().toLocaleLowerCase();
      this.renderList();
    });

    const quickSelect = toolbar.createDiv('zt-monitor-quick-select');
    quickSelect.createSpan({ cls: 'zt-monitor-quick-select-label', text: 'Select:' });
    const quickSelectButtons = quickSelect.createDiv('zt-monitor-quick-select-buttons');

    const setQuickSelectMode = (mode: MonitorQuickSelect) => {
      this.applyQuickSelection(mode);
    };

    this.quickSelectButtons.none = quickSelectButtons.createEl('button', {
      text: 'None',
    });
    this.quickSelectButtons.none.type = 'button';
    this.quickSelectButtons.none.addEventListener('click', () => setQuickSelectMode('none'));

    this.quickSelectButtons.today = quickSelectButtons.createEl('button', {
      text: 'All today',
    });
    this.quickSelectButtons.today.type = 'button';
    this.quickSelectButtons.today.addEventListener('click', () =>
      setQuickSelectMode('today')
    );

    this.quickSelectButtons.all = quickSelectButtons.createEl('button', {
      text: 'All',
    });
    this.quickSelectButtons.all.type = 'button';
    this.quickSelectButtons.all.addEventListener('click', () => setQuickSelectMode('all'));

    this.renderBulkFields(container);

    const buttons = container.createDiv('zt-monitor-buttons');
    const cancelButton = buttons.createEl('button', { text: 'Cancel' });
    cancelButton.addEventListener('click', () => this.close());

    this.importButton = buttons.createEl('button', {
      text: `Import selected (${this.selected.size}) and close`,
    });
    this.importButton.addClass('mod-cta');
    this.importButton.addEventListener('click', async () => {
      const selectedItems = this.getSelectedItems();
      if (!selectedItems.length) return;

      await this.handleImport(selectedItems, false);
    });

    this.importButtonContinue = buttons.createEl('button', {
      text: `Import selected (${this.selected.size}) and continue`,
    });
    this.importButtonContinue.addEventListener('click', async () => {
      const selectedItems = this.getSelectedItems();
      if (!selectedItems.length) return;

      await this.handleImport(selectedItems, true);
    });

    this.listEl = container.createDiv('zt-monitor-list');
    this.renderList();
    search.focus();
  }

  onClose() {
    this.modalEl.removeClass('zt-monitor-modal-shell');
    this.contentEl.empty();
    this.onFinished();
  }

  private getFilteredItems(): ZoteroMonitorItem[] {
    if (!this.searchTerm) return this.items;

    return this.items.filter((item) =>
      getSearchText(item).includes(this.searchTerm)
    );
  }

  private getSortedItems(): ZoteroMonitorItem[] {
    return [...this.getFilteredItems()].sort((a, b) => {
      const comparison = this.compareItems(a, b);
      return this.sortDirection === 'asc' ? comparison : -comparison;
    });
  }

  private getSelectedItems(): ZoteroMonitorItem[] {
    return this.items.filter((item) => this.selected.has(itemIdentity(item)));
  }

  private getManagedProperties(): ZoteroManagedUserProperties {
    return {
      zoteroProject: this.managedProperties.zoteroProject || [],
      zoteroTopic: this.managedProperties.zoteroTopic || [],
      zoteroNote: this.managedProperties.zoteroNote || '',
      zoteroStatus: this.managedProperties.zoteroStatus || 'new',
    };
  }

  private async handleImport(
    selectedItems: ZoteroMonitorItem[],
    continueAfterImport: boolean
  ) {
    if (!selectedItems.length || this.isImporting) return;

    this.isImporting = true;
    this.setImportingState(true);

    try {
      await this.onImport(selectedItems, this.getManagedProperties());

      if (!continueAfterImport) {
        this.close();
        return;
      }

      const imported = new Set(selectedItems.map((item) => itemIdentity(item)));
      this.items = this.items.filter((item) => !imported.has(itemIdentity(item)));
      this.selected.clear();
      this.quickSelect = 'custom';
      this.renderList();

      if (!this.items.length) {
        this.close();
      }
    } catch (e) {
      new Notice('Failed to import selected Zotero references.', 10000);
      console.error(e);
    } finally {
      this.isImporting = false;
      this.setImportingState(false);
      this.updateImportButtons();
    }
  }

  private renderBulkFields(container: HTMLDivElement) {
    const fields = container.createDiv('zt-monitor-bulk-fields');
    fields.createDiv({
      cls: 'zt-monitor-bulk-title',
      text: 'Apply to selected imports',
    });

    const grid = fields.createDiv('zt-monitor-bulk-grid');
    const projectSuggestions = this.getProjectSuggestions();
    const topicSuggestions = this.getTopicSuggestions();
    this.renderBulkInput(
      grid,
      'Projects',
      '[[Project A]], [[Project B]]',
      (value) => {
        this.managedProperties.zoteroProject = splitBulkInput(value);
      },
      '',
      projectSuggestions
    );
    this.renderBulkInput(
      grid,
      'Topics',
      'photosynthesis, drought',
      (value) => {
        this.managedProperties.zoteroTopic = splitBulkInput(value);
      },
      '',
      topicSuggestions
    );
    this.renderBulkInput(grid, 'Status', 'new', (value) => {
      this.managedProperties.zoteroStatus = value.trim() || 'new';
    }, 'new');
    this.renderBulkTextarea(grid, 'Context note', 'Why this paper entered the queue', (value) => {
      this.managedProperties.zoteroNote = value.trim();
    });
  }

  private renderBulkInput(
    container: HTMLDivElement,
    labelText: string,
    placeholder: string,
    onChange: (value: string) => void,
    defaultValue = '',
    suggestions: string[] = []
  ) {
    const field = container.createDiv('zt-monitor-bulk-field');
    field.createEl('label', { text: labelText });
    const input = field.createEl('input');
    input.type = 'text';
    input.placeholder = placeholder;
    input.value = defaultValue;
    if (suggestions.length) {
      const datalistId = `zt-monitor-${labelText
        .toLocaleLowerCase()
        .replace(/\W+/g, '-')}-suggestions`;
      const datalist = field.createEl('datalist');
      datalist.id = datalistId;
      for (const suggestion of suggestions) {
        datalist.createEl('option', { value: suggestion });
      }
      input.setAttribute('list', datalistId);
    }
    input.addEventListener('input', () => onChange(input.value));
  }

  private renderBulkTextarea(
    container: HTMLDivElement,
    labelText: string,
    placeholder: string,
    onChange: (value: string) => void
  ) {
    const field = container.createDiv('zt-monitor-bulk-field');
    field.addClass('zt-monitor-bulk-field-wide');
    field.createEl('label', { text: labelText });
    const textarea = field.createEl('textarea');
    textarea.placeholder = placeholder;
    textarea.rows = 2;
    textarea.addEventListener('input', () => onChange(textarea.value));
  }

  private getProjectSuggestions(): string[] {
    return this.app.vault
      .getMarkdownFiles()
      .map((file) => `[[${file.basename}]]`)
      .sort((a, b) => a.localeCompare(b));
  }

  private getTopicSuggestions(): string[] {
    const topics = new Set<string>();

    for (const file of this.app.vault.getMarkdownFiles()) {
      const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
      const value = frontmatter?.zoteroTopic;
      const values = Array.isArray(value) ? value : value ? [value] : [];

      for (const topic of values) {
        const cleaned = String(topic || '').trim();
        if (cleaned) topics.add(cleaned);
      }
    }

    return Array.from(topics).sort((a, b) => a.localeCompare(b));
  }

  private getScopesText(item: ZoteroMonitorItem): string {
    const collections = getItemCollectionPaths(item.item);
    const tags = getItemTags(item.item);
    return [...collections, ...tags.map((tag) => `#${tag}`)].join(' ');
  }

  private getSortValue(item: ZoteroMonitorItem): string | number {
    switch (this.sortKey) {
      case 'title':
        return item.title || item.citekey;
      case 'citekey':
        return item.citekey;
      case 'library':
        return item.libraryName || `Library ${item.libraryID}`;
      case 'dateModified':
        return this.getDateSortValue(item.dateModified || item.dateAdded);
      case 'dateAdded':
        return this.getDateSortValue(item.dateAdded);
      case 'scopes':
        return this.getScopesText(item);
      default:
        return '';
    }
  }

  private getDateSortValue(value?: string): number {
    if (!value) return 0;

    const parsed = new Date(value).getTime();
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  private compareItems(a: ZoteroMonitorItem, b: ZoteroMonitorItem): number {
    const aValue = this.getSortValue(a);
    const bValue = this.getSortValue(b);

    if (typeof aValue === 'number' && typeof bValue === 'number') {
      if (aValue !== bValue) return aValue - bValue;
    } else {
      const comparison = String(aValue).localeCompare(String(bValue), undefined, {
        sensitivity: 'base',
      });
      if (comparison !== 0) return comparison;
    }

    return (a.title || a.citekey).localeCompare(b.title || b.citekey, undefined, {
      sensitivity: 'base',
    });
  }

  private setSort(key: MonitorSortKey) {
    if (this.sortKey === key) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortKey = key;
      this.sortDirection =
        key === 'dateAdded' || key === 'dateModified' ? 'desc' : 'asc';
    }

    this.renderList();
  }

  private isItemFromToday(item: ZoteroMonitorItem): boolean {
    if (!item.dateAdded) return false;

    const createdAt = new Date(item.dateAdded);
    if (Number.isNaN(createdAt.getTime())) return false;

    const today = new Date();
    const startOfToday = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate(),
      0,
      0,
      0,
      0
    );
    const startOfTomorrow = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);

    return createdAt >= startOfToday && createdAt < startOfTomorrow;
  }

  private setImportingState(isImporting: boolean) {
    if (this.importButton) {
      this.importButton.disabled = isImporting;
      this.importButton.setText(
        isImporting
          ? 'Importing...'
          : `Import selected (${this.getSelectedItems().length}) and close`
      );
    }

    if (this.importButtonContinue) {
      this.importButtonContinue.disabled = isImporting;
      this.importButtonContinue.setText(
        isImporting
          ? 'Importing...'
          : `Import selected (${this.getSelectedItems().length}) and continue`
      );
    }
  }

  private updateImportButtons() {
    const selectedCount = this.getSelectedItems().length;

    if (this.importButton) {
      this.importButton.setText(`Import selected (${selectedCount}) and close`);
      this.importButton.disabled = selectedCount === 0 || this.isImporting;
    }

    if (this.importButtonContinue) {
      this.importButtonContinue.setText(
        `Import selected (${selectedCount}) and continue`
      );
      this.importButtonContinue.disabled =
        selectedCount === 0 || this.isImporting;
    }
  }

  private updateQuickSelectButtons() {
    for (const [mode, button] of Object.entries(this.quickSelectButtons)) {
      if (!button) continue;

      const isActive = mode === this.quickSelect;
      button.toggleClass('is-active', isActive);
      button.toggleClass('mod-cta', isActive);
    }
  }

  private applyQuickSelection(mode: MonitorQuickSelect) {
    this.quickSelect = mode;
    this.selected.clear();

    for (const item of this.items) {
      const key = itemIdentity(item);
      if (
        mode === 'all' ||
        (mode === 'today' && this.isItemFromToday(item))
      ) {
        this.selected.add(key);
      }
    }

    this.renderList();
    this.updateQuickSelectButtons();
  }

  private renderList() {
    this.listEl.empty();

    const filtered = this.getSortedItems();
    if (!filtered.length) {
      this.listEl.createDiv({
        cls: 'zt-monitor-empty',
        text: 'No matching Zotero items.',
      });
      this.updateImportButtons();
      return;
    }

    this.updateQuickSelectButtons();

    const table = this.listEl.createEl('table', { cls: 'zt-monitor-table' });
    const header = table.createEl('thead').createEl('tr');
    [
      { text: '', cls: 'zt-monitor-table-check' },
      { text: 'Title', cls: 'zt-monitor-table-title-header', sortKey: 'title' },
      { text: 'Citekey', cls: 'zt-monitor-table-citekey', sortKey: 'citekey' },
      { text: 'Library', cls: 'zt-monitor-table-library', sortKey: 'library' },
      {
        text: 'Modified',
        cls: 'zt-monitor-table-date',
        sortKey: 'dateModified',
      },
      { text: 'Added', cls: 'zt-monitor-table-date', sortKey: 'dateAdded' },
      {
        text: 'Tags / collections',
        cls: 'zt-monitor-table-scopes',
        sortKey: 'scopes',
      },
    ].forEach((column) => {
      const cell = header.createEl('th', { cls: column.cls });
      if (!column.sortKey) return;

      const button = cell.createEl('button', {
        cls: 'zt-monitor-sort-button',
        text: column.text,
      });
      const isActive = this.sortKey === column.sortKey;
      button.toggleClass('is-active', isActive);
      button.setAttribute(
        'aria-sort',
        isActive ? (this.sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'
      );
      button.addEventListener('click', () =>
        this.setSort(column.sortKey as MonitorSortKey)
      );
      if (isActive) {
        button.createSpan({
          cls: 'zt-monitor-sort-indicator',
          text: this.sortDirection,
        });
      }
    });

    const body = table.createEl('tbody');

    for (const item of filtered) {
      const key = itemIdentity(item);
      const row = body.createEl('tr');
      row.toggleClass('is-selected', this.selected.has(key));

      const checkboxCell = row.createEl('td', {
        cls: 'zt-monitor-table-check',
      });
      const checkbox = checkboxCell.createEl('input');
      checkbox.type = 'checkbox';
      checkbox.checked = this.selected.has(key);
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) {
          this.selected.add(key);
        } else {
          this.selected.delete(key);
        }

        this.quickSelect = 'custom';
        row.toggleClass('is-selected', checkbox.checked);
        this.updateImportButtons();
        this.updateQuickSelectButtons();
      });

      const titleCell = row.createEl('td', {
        cls: 'zt-monitor-table-title-cell',
      });
      titleCell.createDiv({
        cls: 'zt-monitor-table-title',
        text: item.title || item.citekey,
      });

      row.createEl('td', {
        cls: 'zt-monitor-table-citekey',
        text: item.citekey,
      });
      row.createEl('td', {
        cls: 'zt-monitor-table-library',
        text: item.libraryName || `Library ${item.libraryID}`,
      });
      row.createEl('td', {
        cls: 'zt-monitor-table-date',
        text: getDisplayDate(item.dateModified || item.dateAdded),
      });
      row.createEl('td', {
        cls: 'zt-monitor-table-date',
        text: getDisplayDate(item.dateAdded),
      });

      const collections = getItemCollectionPaths(item.item);
      const tags = getItemTags(item.item);
      const scopes = [...collections, ...tags.map((tag) => `#${tag}`)];
      const scopesCell = row.createEl('td', {
        cls: 'zt-monitor-table-scopes',
      });
      if (scopes.length) {
        for (const scope of scopes) {
          scopesCell.createSpan({
            cls: 'zt-monitor-scope-chip',
            text: scope,
          });
        }
      } else {
        scopesCell.createSpan({
          cls: 'zt-monitor-empty-value',
          text: 'None',
        });
      }
    }

    this.updateImportButtons();
  }
}

export class ZoteroMonitor {
  private intervalId: number | null = null;
  private checkInProgress = false;
  private modalOpen = false;
  private lastNoticeKey = '';

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

      if (!manual && this.plugin.settings.zoteroMonitorAutomaticAction === 'notice') {
        this.showMissingItemsNotice(missing);
        return;
      }

      this.openMissingItemsModal(missing);
    } finally {
      this.checkInProgress = false;
    }
  }

  private showMissingItemsNotice(missing: ZoteroMonitorItem[]) {
    const noticeKey = `${missing.length}:${missing
      .map((item) => itemIdentity(item))
      .sort()
      .join('|')}`;

    if (noticeKey === this.lastNoticeKey) return;

    this.lastNoticeKey = noticeKey;
    const notice = new Notice('', 0);

    const recentDays = this.plugin.settings.zoteroMonitorRecentDays;
    const windowLabel =
      !recentDays || recentDays <= 0
        ? 'for all time'
        : `from the last ${recentDays} day${recentDays === 1 ? '' : 's'}`;

    notice.noticeEl.empty();
    notice.noticeEl.createDiv('zt-monitor-notice-message').setText(
      `${missing.length} new Zotero reference${
        missing.length === 1 ? '' : 's'
      } ${windowLabel}.`
    );

    const actions = notice.noticeEl.createDiv('zt-monitor-notice-actions');

    const openBtn = actions.createEl('button', {
      text: 'Open Import',
    });
    openBtn.type = 'button';
    openBtn.addClass('mod-cta');
    openBtn.addEventListener('click', () => {
      notice.hide();
      this.openMissingItemsModal(missing);
    });

    const backgroundBtn = actions.createEl('button', {
      text: 'Background Import',
    });
    backgroundBtn.type = 'button';

    const ignoreBtn = actions.createEl('button', {
      text: 'Ignore',
    });
    ignoreBtn.type = 'button';

    backgroundBtn.addEventListener('click', async () => {
      const managedProperties: ZoteroManagedUserProperties = {
        zoteroProject: [],
        zoteroTopic: [],
        zoteroNote: '',
        zoteroStatus: 'new',
      };

      openBtn.disabled = true;
      backgroundBtn.disabled = true;
      ignoreBtn.disabled = true;
      backgroundBtn.setText('Importing...');

      try {
        await this.importItems(missing, managedProperties);
        notice.hide();
      } catch (e) {
        openBtn.disabled = false;
        backgroundBtn.disabled = false;
        ignoreBtn.disabled = false;
        backgroundBtn.setText('Background Import');
        new Notice('Failed to import missing Zotero references.', 10000);
        console.error(e);
      }
    });

    ignoreBtn.addEventListener('click', () => {
      notice.hide();
    });
  }

  private openMissingItemsModal(missing: ZoteroMonitorItem[]) {
      this.modalOpen = true;
      new ZoteroMissingItemsModal(
        this.plugin.app,
        missing,
        this.getFilterSummary(),
        (items, properties) => this.importItems(items, properties),
        () => {
          this.modalOpen = false;
        }
      ).open();
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

  private getFilterSummary(): string[] {
    const settings = this.plugin.settings;
    const scope = this.getScope();
    const recentDays = settings.zoteroMonitorRecentDays;
    const exportFormatName =
      settings.zoteroMonitorImportFormat ||
      settings.exportFormats[0]?.name ||
      'first configured format';
    const describeScope = (label: string, values: string[]) =>
      values.length ? `${label}: ${values.join(', ')}` : `${label}: all`;

    return [
      recentDays === null || recentDays === undefined || recentDays <= 0
        ? 'Time window: all time'
        : `Time window: last ${recentDays} day${recentDays === 1 ? '' : 's'}`,
      describeScope('Libraries', scope.libraryScope),
      describeScope('Collections', scope.collectionScope),
      describeScope('Tags', scope.tagScope),
      `Import format: ${exportFormatName}`,
    ];
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
          libraryID
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
        database
      );

      if (collections) {
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

  private async importItems(
    items: ZoteroMonitorItem[],
    managedProperties: ZoteroManagedUserProperties
  ) {
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
          managedProperties,
        },
        libraryItems.map((item) => ({
          key: item.citekey,
          library: libraryID,
        }))
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
}
