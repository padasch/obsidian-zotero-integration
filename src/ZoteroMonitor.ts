import { App, Modal, Notice, TFile } from 'obsidian';

import type ZoteroConnector from './main';
import {
  CiteKeyExport,
  DatabaseWithPort,
  ExportFormat,
  ZoteroManagedUserProperties,
  ZoteroMonitorItem,
  ZoteroMonitorScope,
  ZoteroOrphanedNote,
  ZoteroVaultNote,
} from './types';
import {
  ZOTERO_ORPHANED_CHECKED_AT_PROPERTY,
  ZOTERO_ORPHANED_DEFAULT_PROPERTY,
  ZOTERO_ORPHANED_REASON_PROPERTY,
  filterDirectCitekeySuggestions,
  filterOrphanedZoteroNotes,
  filterDelimitedSuggestions,
  formatDirectCitekeyInput,
  filterItemsByRecentDays,
  filterItemsByScope,
  filterMissingZoteroItems,
  getDelimitedTokenBounds,
  getItemCollectionPaths,
  getItemTags,
  getZoteroItemCitekey,
  groupItemsByLibrary,
  hasZoteroIdentity,
  isZoteroItemInFrontmatter,
  normalizeMonitorItem,
  parseDirectCitekeyInput,
  replaceDelimitedToken,
} from './ZoteroMonitor.helpers';
import { ConfirmationModal } from './bbt/ConfirmationModal';
import { exportToMarkdown } from './bbt/export';
import { isZoteroRunning } from './bbt/cayw';
import { writeSciteManagedFrontmatter } from './ZoteroManagedProperties';
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
type OrphanQuickSelect = 'none' | 'all';
type OrphanSelectionMode = OrphanQuickSelect | 'custom';
type OrphanSortKey = 'note' | 'citekey' | 'library' | 'itemKey' | 'reason';
type UpdateQuickSelect = 'none' | 'all';
type UpdateSelectionMode = UpdateQuickSelect | 'custom';
type UpdateSortKey = 'note' | 'title' | 'citekey' | 'library' | 'dateModified';
type ZoteroUpdatableNote = ZoteroVaultNote & {
  citekey: string;
  dateModified?: string;
  item: ZoteroMonitorItem;
  itemKey?: string;
  libraryID: number;
  libraryName?: string;
  title: string;
};
type ZoteroDirectImportStatus = 'missing' | 'present' | 'not-found';
type ZoteroDirectImportRow = {
  citekey: string;
  existingNote?: ZoteroVaultNote;
  item?: ZoteroMonitorItem;
  libraryID?: number;
  libraryName?: string;
  status: ZoteroDirectImportStatus;
  title: string;
};
type ImportItemsOptions = {
  openNotes?: boolean;
};

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

function noteIdentity(note: { path: string }): string {
  return note.path;
}

function getOrphanSearchText(note: ZoteroOrphanedNote): string {
  return [
    note.basename,
    note.path,
    note.citekey,
    note.libraryID,
    note.itemKey,
    note.reason,
  ]
    .join(' ')
    .toLocaleLowerCase();
}

function getUpdateSearchText(note: ZoteroUpdatableNote): string {
  return [
    note.basename,
    note.path,
    note.title,
    note.citekey,
    note.libraryName,
    note.libraryID,
    note.itemKey,
  ]
    .join(' ')
    .toLocaleLowerCase();
}

function directImportRowIdentity(row: ZoteroDirectImportRow): string {
  return `${row.libraryID || 'unresolved'}:${row.citekey}`;
}

function getDirectImportSearchText(row: ZoteroDirectImportRow): string {
  return [
    row.title,
    row.citekey,
    row.libraryName,
    row.libraryID,
    row.existingNote?.path,
    row.status,
  ]
    .join(' ')
    .toLocaleLowerCase();
}

function getDirectImportStatusText(status: ZoteroDirectImportStatus): string {
  switch (status) {
    case 'present':
      return 'Already in Obsidian';
    case 'missing':
      return 'Not represented yet';
    case 'not-found':
      return 'Not found in Zotero';
  }
}

function getNoteDoi(frontmatter: Record<string, any>): string {
  return String(
    frontmatter.zoteroDOI || frontmatter.DOI || frontmatter.doi || ''
  ).trim();
}

function sortFrontmatterProperties(frontmatter: Record<string, any>) {
  const sorted = Object.entries(frontmatter).sort(([a], [b]) =>
    a.localeCompare(b, undefined, { sensitivity: 'base' })
  );

  for (const key of Object.keys(frontmatter)) {
    delete frontmatter[key];
  }

  for (const [key, value] of sorted) {
    frontmatter[key] = value;
  }
}

function getDefaultManagedProperties(): ZoteroManagedUserProperties {
  return {
    zoteroProject: [],
    zoteroTopic: [],
    zoteroNote: '',
    zoteroStatus: 'new',
  };
}

class ZoteroMissingItemsModal extends Modal {
  private selected = new Set<string>();
  private quickSelect: MonitorSelectionMode = 'today';
  private searchTerm = '';
  private sortKey: MonitorSortKey = 'dateModified';
  private sortDirection: MonitorSortDirection = 'desc';
  private managedProperties = getDefaultManagedProperties();
  private listEl: HTMLDivElement;
  private importButton: HTMLButtonElement;
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
      await this.onImport(selectedItems, this.getManagedProperties());
      this.close();
    });

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
      const suggestionsEl = field.createDiv('zt-monitor-token-suggestions');
      let activeIndex = 0;
      let visibleSuggestions: string[] = [];

      const hideSuggestions = () => {
        suggestionsEl.empty();
        suggestionsEl.style.display = 'none';
        visibleSuggestions = [];
        activeIndex = 0;
      };

      const insertSuggestion = (suggestion: string) => {
        const replaced = replaceDelimitedToken(
          input.value,
          input.selectionStart ?? input.value.length,
          suggestion
        );
        input.value = replaced.value;
        input.focus();
        input.setSelectionRange(replaced.cursor, replaced.cursor);
        onChange(input.value);
        hideSuggestions();
      };

      const renderSuggestions = () => {
        const bounds = getDelimitedTokenBounds(
          input.value,
          input.selectionStart ?? input.value.length
        );
        visibleSuggestions = filterDelimitedSuggestions(
          suggestions,
          bounds.query,
          10
        );

        suggestionsEl.empty();
        if (!visibleSuggestions.length) {
          hideSuggestions();
          return;
        }

        activeIndex = Math.min(activeIndex, visibleSuggestions.length - 1);
        suggestionsEl.style.display = 'block';

        visibleSuggestions.forEach((suggestion, index) => {
          const option = suggestionsEl.createEl('button', {
            cls: 'zt-monitor-token-suggestion',
            text: suggestion,
          });
          option.type = 'button';
          option.toggleClass('is-active', index === activeIndex);
          option.addEventListener('mousedown', (event) => {
            event.preventDefault();
            insertSuggestion(suggestion);
          });
        });
      };

      input.addEventListener('focus', renderSuggestions);
      input.addEventListener('click', renderSuggestions);
      input.addEventListener('input', () => {
        activeIndex = 0;
        renderSuggestions();
      });
      input.addEventListener('keydown', (event) => {
        if (!visibleSuggestions.length) return;

        if (event.key === 'ArrowDown') {
          event.preventDefault();
          activeIndex = (activeIndex + 1) % visibleSuggestions.length;
          renderSuggestions();
        } else if (event.key === 'ArrowUp') {
          event.preventDefault();
          activeIndex =
            (activeIndex - 1 + visibleSuggestions.length) %
            visibleSuggestions.length;
          renderSuggestions();
        } else if (event.key === 'Enter' || event.key === 'Tab') {
          event.preventDefault();
          insertSuggestion(visibleSuggestions[activeIndex]);
        } else if (event.key === 'Escape') {
          hideSuggestions();
        }
      });
      input.addEventListener('blur', () => {
        window.setTimeout(hideSuggestions, 120);
      });
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

  private updateImportButton() {
    if (!this.importButton) return;

    this.importButton.setText(`Import selected (${this.selected.size})`);
    this.importButton.disabled = this.selected.size === 0;
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
      this.updateImportButton();
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
        this.updateImportButton();
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

    this.updateImportButton();
  }
}

class ZoteroOrphanedNotesModal extends Modal {
  private selected = new Set<string>();
  private quickSelect: OrphanSelectionMode = 'all';
  private searchTerm = '';
  private sortKey: OrphanSortKey = 'note';
  private sortDirection: MonitorSortDirection = 'asc';
  private listEl: HTMLDivElement;
  private flagButton: HTMLButtonElement;
  private quickSelectButtons: {
    [key in OrphanQuickSelect]: HTMLButtonElement | null;
  } = {
    none: null,
    all: null,
  };

  constructor(
    app: App,
    private notes: ZoteroOrphanedNote[],
    private orphanedProperty: string,
    private clearedCount: number,
    private onFlag: (notes: ZoteroOrphanedNote[]) => Promise<void>,
    private onFinished: () => void
  ) {
    super(app);

    for (const note of notes) {
      this.selected.add(noteIdentity(note));
    }
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    this.modalEl.addClass('zt-monitor-modal-shell');

    const container = contentEl.createDiv('zt-monitor-modal');
    const header = container.createDiv('zt-monitor-header');
    header.createEl('h2', { text: 'Orphaned Zotero literature notes' });
    header.createEl('p', {
      text: `${this.notes.length} Obsidian note${
        this.notes.length === 1 ? '' : 's'
      } have Zotero identity properties but were not found in Zotero.`,
    });

    const summary = header.createDiv('zt-monitor-filter-summary');
    summary.createSpan({
      cls: 'zt-monitor-filter-chip',
      text: `Flag property: ${this.orphanedProperty}`,
    });
    summary.createSpan({
      cls: 'zt-monitor-filter-chip',
      text: `Stale flags cleared: ${this.clearedCount}`,
    });

    const toolbar = container.createDiv('zt-monitor-toolbar');
    const search = toolbar.createEl('input');
    search.type = 'search';
    search.placeholder = 'Search note, citekey, library, item key, or reason';
    search.addClass('zt-monitor-search');
    search.addEventListener('input', () => {
      this.searchTerm = search.value.trim().toLocaleLowerCase();
      this.renderList();
    });

    const quickSelect = toolbar.createDiv('zt-monitor-quick-select');
    quickSelect.createSpan({
      cls: 'zt-monitor-quick-select-label',
      text: 'Select:',
    });
    const quickSelectButtons = quickSelect.createDiv(
      'zt-monitor-quick-select-buttons'
    );

    this.quickSelectButtons.none = quickSelectButtons.createEl('button', {
      text: 'None',
    });
    this.quickSelectButtons.none.type = 'button';
    this.quickSelectButtons.none.addEventListener('click', () =>
      this.applyQuickSelection('none')
    );

    this.quickSelectButtons.all = quickSelectButtons.createEl('button', {
      text: 'All',
    });
    this.quickSelectButtons.all.type = 'button';
    this.quickSelectButtons.all.addEventListener('click', () =>
      this.applyQuickSelection('all')
    );

    this.listEl = container.createDiv('zt-monitor-list');

    const buttons = container.createDiv('zt-monitor-buttons');
    const dismissButton = buttons.createEl('button', { text: 'Dismiss' });
    dismissButton.addEventListener('click', () => this.close());

    this.flagButton = buttons.createEl('button', {
      text: `Flag selected (${this.selected.size})`,
    });
    this.flagButton.addClass('mod-cta');
    this.flagButton.addEventListener('click', async () => {
      const selectedNotes = this.getSelectedNotes();
      if (!selectedNotes.length) return;

      this.flagButton.disabled = true;
      this.flagButton.setText('Flagging...');
      await this.onFlag(selectedNotes);
      this.close();
    });

    this.renderList();
    search.focus();
  }

  onClose() {
    this.modalEl.removeClass('zt-monitor-modal-shell');
    this.contentEl.empty();
    this.onFinished();
  }

  private getFilteredNotes(): ZoteroOrphanedNote[] {
    if (!this.searchTerm) return this.notes;

    return this.notes.filter((note) =>
      getOrphanSearchText(note).includes(this.searchTerm)
    );
  }

  private getSortedNotes(): ZoteroOrphanedNote[] {
    return [...this.getFilteredNotes()].sort((a, b) => {
      const comparison = this.compareNotes(a, b);
      return this.sortDirection === 'asc' ? comparison : -comparison;
    });
  }

  private getSelectedNotes(): ZoteroOrphanedNote[] {
    return this.notes.filter((note) => this.selected.has(noteIdentity(note)));
  }

  private getSortValue(note: ZoteroOrphanedNote): string {
    switch (this.sortKey) {
      case 'note':
        return note.basename || note.path;
      case 'citekey':
        return note.citekey || '';
      case 'library':
        return note.libraryID || '';
      case 'itemKey':
        return note.itemKey || '';
      case 'reason':
        return note.reason || '';
      default:
        return '';
    }
  }

  private compareNotes(a: ZoteroOrphanedNote, b: ZoteroOrphanedNote): number {
    const comparison = this.getSortValue(a).localeCompare(
      this.getSortValue(b),
      undefined,
      { sensitivity: 'base' }
    );
    if (comparison !== 0) return comparison;

    return a.path.localeCompare(b.path, undefined, { sensitivity: 'base' });
  }

  private setSort(key: OrphanSortKey) {
    if (this.sortKey === key) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortKey = key;
      this.sortDirection = 'asc';
    }

    this.renderList();
  }

  private updateFlagButton() {
    if (!this.flagButton) return;

    this.flagButton.setText(`Flag selected (${this.selected.size})`);
    this.flagButton.disabled = this.selected.size === 0;
  }

  private updateQuickSelectButtons() {
    for (const [mode, button] of Object.entries(this.quickSelectButtons)) {
      if (!button) continue;

      const isActive = mode === this.quickSelect;
      button.toggleClass('is-active', isActive);
      button.toggleClass('mod-cta', isActive);
    }
  }

  private applyQuickSelection(mode: OrphanQuickSelect) {
    this.quickSelect = mode;
    this.selected.clear();

    if (mode === 'all') {
      for (const note of this.notes) {
        this.selected.add(noteIdentity(note));
      }
    }

    this.renderList();
    this.updateQuickSelectButtons();
  }

  private renderList() {
    this.listEl.empty();
    const filtered = this.getSortedNotes();

    if (!filtered.length) {
      this.listEl.createDiv({
        cls: 'zt-monitor-empty',
        text: 'No matching Obsidian notes.',
      });
      this.updateFlagButton();
      return;
    }

    this.updateQuickSelectButtons();

    const table = this.listEl.createEl('table', {
      cls: 'zt-monitor-table zt-orphan-table',
    });
    const header = table.createEl('thead').createEl('tr');
    [
      { text: '', cls: 'zt-monitor-table-check' },
      { text: 'Note', cls: 'zt-monitor-table-title-header', sortKey: 'note' },
      { text: 'Citekey', cls: 'zt-monitor-table-citekey', sortKey: 'citekey' },
      { text: 'Library', cls: 'zt-monitor-table-library', sortKey: 'library' },
      { text: 'Item key', cls: 'zt-monitor-table-date', sortKey: 'itemKey' },
      { text: 'Reason', cls: 'zt-monitor-table-scopes', sortKey: 'reason' },
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
        isActive
          ? this.sortDirection === 'asc'
            ? 'ascending'
            : 'descending'
          : 'none'
      );
      button.addEventListener('click', () =>
        this.setSort(column.sortKey as OrphanSortKey)
      );
      if (isActive) {
        button.createSpan({
          cls: 'zt-monitor-sort-indicator',
          text: this.sortDirection,
        });
      }
    });

    const body = table.createEl('tbody');

    for (const note of filtered) {
      const key = noteIdentity(note);
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
        this.updateFlagButton();
        this.updateQuickSelectButtons();
      });

      const titleCell = row.createEl('td', {
        cls: 'zt-monitor-table-title-cell',
      });
      titleCell.createDiv({
        cls: 'zt-monitor-table-title',
        text: note.basename || note.path,
      });
      titleCell.createDiv({
        cls: 'zt-orphan-note-path',
        text: note.path,
      });

      row.createEl('td', {
        cls: 'zt-monitor-table-citekey',
        text: note.citekey || '',
      });
      row.createEl('td', {
        cls: 'zt-monitor-table-library',
        text: note.libraryID || '',
      });
      row.createEl('td', {
        cls: 'zt-monitor-table-date',
        text: note.itemKey || '',
      });
      row.createEl('td', {
        cls: 'zt-monitor-table-scopes zt-orphan-reason',
        text: note.reason,
      });
    }

    this.updateFlagButton();
  }
}

class ZoteroDirectImportModal extends Modal {
  private citekeyPickerListEl: HTMLDivElement;
  private citekeyPickerSearch: HTMLInputElement;
  private citekeyPickerStatusEl: HTMLDivElement;
  private citekeySuggestions: CiteKeyExport[] = [];
  private citekeySuggestionSearchTerm = '';
  private rows: ZoteroDirectImportRow[] = [];
  private selected = new Set<string>();
  private searchTerm = '';
  private managedProperties = getDefaultManagedProperties();
  private citekeyInput: HTMLTextAreaElement;
  private importButton: HTMLButtonElement;
  private listEl: HTMLDivElement;
  private loadCitekeysButton: HTMLButtonElement;
  private resolveButton: HTMLButtonElement;

  constructor(
    app: App,
    private exportFormatName: string,
    private onLoadCitekeys: () => Promise<CiteKeyExport[]>,
    private onResolve: (input: string) => Promise<ZoteroDirectImportRow[]>,
    private onImport: (
      rows: ZoteroDirectImportRow[],
      properties: ZoteroManagedUserProperties
    ) => Promise<void>,
    private onFinished: () => void
  ) {
    super(app);
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    this.modalEl.addClass('zt-monitor-modal-shell');

    const container = contentEl.createDiv('zt-monitor-modal');
    const header = container.createDiv('zt-monitor-header');
    header.createEl('h2', { text: 'Import specific Zotero items' });
    header.createEl('p', {
      text: 'Search Zotero citekeys or paste them manually. Fetching item data happens only for the selected citekeys.',
    });

    const summary = header.createDiv('zt-monitor-filter-summary');
    summary.createSpan({
      cls: 'zt-monitor-filter-chip',
      text: `Import format: ${this.exportFormatName}`,
    });
    summary.createSpan({
      cls: 'zt-monitor-filter-chip',
      text: 'Accepted input: citekey, @citekey, or libraryID:citekey',
    });
    summary.createSpan({
      cls: 'zt-monitor-filter-chip',
      text: 'Picker loads the Better BibTeX citekey index only',
    });

    this.renderCitekeyPicker(container);

    const inputBlock = container.createDiv('zt-monitor-bulk-fields');
    inputBlock.createDiv({
      cls: 'zt-monitor-bulk-title',
      text: 'Citekeys to import',
    });
    this.citekeyInput = inputBlock.createEl('textarea');
    this.citekeyInput.rows = 4;
    this.citekeyInput.placeholder = 'smith2024\n@jones2020\n1:garcia2022';
    this.citekeyInput.spellcheck = false;
    this.citekeyInput.addEventListener('input', () =>
      this.renderCitekeySuggestions()
    );

    const inputButtons = inputBlock.createDiv('zt-monitor-inline-actions');
    this.resolveButton = inputButtons.createEl('button', {
      text: 'Fetch items',
    });
    this.resolveButton.addClass('mod-cta');
    this.resolveButton.addEventListener('click', () => this.resolveRows());

    this.renderBulkFields(container);

    const toolbar = container.createDiv('zt-monitor-toolbar');
    const search = toolbar.createEl('input');
    search.type = 'search';
    search.placeholder = 'Search fetched title, citekey, status, or note path';
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
      text: 'Import selected (0)',
    });
    this.importButton.addClass('mod-cta');
    this.importButton.disabled = true;
    this.importButton.addEventListener('click', async () => {
      const selectedRows = this.getSelectedRows();
      if (!selectedRows.length) return;

      this.importButton.disabled = true;
      this.importButton.setText('Importing...');
      await this.onImport(selectedRows, this.getManagedProperties());
      this.close();
    });

    this.renderList();
    this.citekeyPickerSearch.focus();
  }

  onClose() {
    this.modalEl.removeClass('zt-monitor-modal-shell');
    this.contentEl.empty();
    this.onFinished();
  }

  private async resolveRows() {
    const input = this.citekeyInput.value.trim();
    if (!input) {
      new Notice('Enter at least one Zotero citekey.');
      return;
    }

    this.resolveButton.disabled = true;
    this.resolveButton.setText('Fetching...');
    try {
      this.rows = await this.onResolve(input);
      this.selected.clear();

      for (const row of this.rows) {
        if (row.item) {
          this.selected.add(directImportRowIdentity(row));
        }
      }

      this.renderList();
    } finally {
      this.resolveButton.disabled = false;
      this.resolveButton.setText('Fetch items');
    }
  }

  private renderCitekeyPicker(container: HTMLDivElement) {
    const picker = container.createDiv('zt-monitor-bulk-fields zt-direct-picker');
    picker.createDiv({
      cls: 'zt-monitor-bulk-title',
      text: 'Find Zotero citekeys',
    });

    const controls = picker.createDiv('zt-direct-picker-controls');
    this.citekeyPickerSearch = controls.createEl('input');
    this.citekeyPickerSearch.type = 'search';
    this.citekeyPickerSearch.placeholder =
      'Load citekeys, then search title, citekey, or library';
    this.citekeyPickerSearch.disabled = true;
    this.citekeyPickerSearch.addClass('zt-monitor-search');
    this.citekeyPickerSearch.addEventListener('input', () => {
      this.citekeySuggestionSearchTerm =
        this.citekeyPickerSearch.value.trim().toLocaleLowerCase();
      this.renderCitekeySuggestions();
    });

    this.loadCitekeysButton = controls.createEl('button', {
      text: 'Load citekeys',
    });
    this.loadCitekeysButton.type = 'button';
    this.loadCitekeysButton.addEventListener('click', () =>
      this.loadCitekeySuggestions()
    );

    this.citekeyPickerStatusEl = picker.createDiv({
      cls: 'zt-direct-picker-status',
      text: 'This lists Better BibTeX citekeys and titles. Full Zotero items are fetched after you click Fetch items.',
    });
    this.citekeyPickerListEl = picker.createDiv('zt-direct-picker-results');
  }

  private async loadCitekeySuggestions() {
    this.loadCitekeysButton.disabled = true;
    this.loadCitekeysButton.setText('Loading...');
    this.citekeyPickerStatusEl.setText('Loading Zotero citekeys...');

    try {
      this.citekeySuggestions = await this.onLoadCitekeys();
      this.citekeyPickerSearch.disabled = false;
      this.loadCitekeysButton.setText('Refresh citekeys');
      this.citekeyPickerStatusEl.setText(
        `${this.citekeySuggestions.length} citekey${
          this.citekeySuggestions.length === 1 ? '' : 's'
        } available. Search and click a result to add it to the import list.`
      );
      this.renderCitekeySuggestions();
      this.citekeyPickerSearch.focus();
    } finally {
      this.loadCitekeysButton.disabled = false;
      if (!this.citekeySuggestions.length) {
        this.loadCitekeysButton.setText('Load citekeys');
      }
    }
  }

  private appendCitekeySuggestion(candidate: CiteKeyExport) {
    const value = formatDirectCitekeyInput(candidate);
    const current = this.citekeyInput.value.trim();

    this.citekeyInput.value = current ? `${current}\n${value}` : value;
    this.citekeyInput.focus();
    this.renderCitekeySuggestions();
  }

  private renderCitekeySuggestions() {
    if (!this.citekeyPickerListEl) return;

    this.citekeyPickerListEl.empty();
    if (!this.citekeySuggestions.length) return;

    const suggestions = filterDirectCitekeySuggestions(
      this.citekeySuggestions,
      this.citekeySuggestionSearchTerm,
      parseDirectCitekeyInput(this.citekeyInput.value),
      12
    );

    if (!suggestions.length) {
      this.citekeyPickerListEl.createDiv({
        cls: 'zt-direct-picker-empty',
        text: 'No matching unselected citekeys.',
      });
      return;
    }

    for (const suggestion of suggestions) {
      const option = this.citekeyPickerListEl.createEl('button', {
        cls: 'zt-direct-picker-option',
      });
      option.type = 'button';
      option.addEventListener('click', () =>
        this.appendCitekeySuggestion(suggestion)
      );

      const title = option.createDiv('zt-direct-picker-option-title');
      title.createSpan({
        cls: 'zt-direct-picker-option-citekey',
        text: `@${suggestion.citekey}`,
      });
      title.createSpan({
        cls: 'zt-direct-picker-option-library',
        text:
          suggestion.libraryName || `Library ${String(suggestion.libraryID)}`,
      });
      option.createDiv({
        cls: 'zt-direct-picker-option-subtitle',
        text: suggestion.title,
      });
    }
  }

  private getFilteredRows(): ZoteroDirectImportRow[] {
    if (!this.searchTerm) return this.rows;

    return this.rows.filter((row) =>
      getDirectImportSearchText(row).includes(this.searchTerm)
    );
  }

  private getSelectedRows(): ZoteroDirectImportRow[] {
    return this.rows.filter(
      (row) => row.item && this.selected.has(directImportRowIdentity(row))
    );
  }

  private getManagedProperties(): ZoteroManagedUserProperties {
    return {
      zoteroProject: this.managedProperties.zoteroProject || [],
      zoteroTopic: this.managedProperties.zoteroTopic || [],
      zoteroNote: this.managedProperties.zoteroNote || '',
      zoteroStatus: this.managedProperties.zoteroStatus || 'new',
    };
  }

  private renderBulkFields(container: HTMLDivElement) {
    const fields = container.createDiv('zt-monitor-bulk-fields');
    fields.createDiv({
      cls: 'zt-monitor-bulk-title',
      text: 'Apply to selected imports',
    });

    const grid = fields.createDiv('zt-monitor-bulk-grid');
    this.renderBulkInput(
      grid,
      'Projects',
      '[[Project A]], [[Project B]]',
      (value) => {
        this.managedProperties.zoteroProject = splitBulkInput(value);
      },
      '',
      this.getProjectSuggestions()
    );
    this.renderBulkInput(
      grid,
      'Topics',
      'photosynthesis, drought',
      (value) => {
        this.managedProperties.zoteroTopic = splitBulkInput(value);
      },
      '',
      this.getTopicSuggestions()
    );
    this.renderBulkInput(grid, 'Status', 'new', (value) => {
      this.managedProperties.zoteroStatus = value.trim() || 'new';
    }, 'new');
    this.renderBulkTextarea(
      grid,
      'Context note',
      'Why this paper entered the queue',
      (value) => {
        this.managedProperties.zoteroNote = value.trim();
      }
    );
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
      const suggestionsEl = field.createDiv('zt-monitor-token-suggestions');
      let activeIndex = 0;
      let visibleSuggestions: string[] = [];

      const hideSuggestions = () => {
        suggestionsEl.empty();
        suggestionsEl.style.display = 'none';
        visibleSuggestions = [];
        activeIndex = 0;
      };

      const insertSuggestion = (suggestion: string) => {
        const replaced = replaceDelimitedToken(
          input.value,
          input.selectionStart ?? input.value.length,
          suggestion
        );
        input.value = replaced.value;
        input.focus();
        input.setSelectionRange(replaced.cursor, replaced.cursor);
        onChange(input.value);
        hideSuggestions();
      };

      const renderSuggestions = () => {
        const bounds = getDelimitedTokenBounds(
          input.value,
          input.selectionStart ?? input.value.length
        );
        visibleSuggestions = filterDelimitedSuggestions(
          suggestions,
          bounds.query,
          10
        );

        suggestionsEl.empty();
        if (!visibleSuggestions.length) {
          hideSuggestions();
          return;
        }

        activeIndex = Math.min(activeIndex, visibleSuggestions.length - 1);
        suggestionsEl.style.display = 'block';

        visibleSuggestions.forEach((suggestion, index) => {
          const option = suggestionsEl.createEl('button', {
            cls: 'zt-monitor-token-suggestion',
            text: suggestion,
          });
          option.type = 'button';
          option.toggleClass('is-active', index === activeIndex);
          option.addEventListener('mousedown', (event) => {
            event.preventDefault();
            insertSuggestion(suggestion);
          });
        });
      };

      input.addEventListener('focus', renderSuggestions);
      input.addEventListener('click', renderSuggestions);
      input.addEventListener('input', () => {
        activeIndex = 0;
        renderSuggestions();
      });
      input.addEventListener('keydown', (event) => {
        if (!visibleSuggestions.length) return;

        if (event.key === 'ArrowDown') {
          event.preventDefault();
          activeIndex = (activeIndex + 1) % visibleSuggestions.length;
          renderSuggestions();
        } else if (event.key === 'ArrowUp') {
          event.preventDefault();
          activeIndex =
            (activeIndex - 1 + visibleSuggestions.length) %
            visibleSuggestions.length;
          renderSuggestions();
        } else if (event.key === 'Enter' || event.key === 'Tab') {
          event.preventDefault();
          insertSuggestion(visibleSuggestions[activeIndex]);
        } else if (event.key === 'Escape') {
          hideSuggestions();
        }
      });
      input.addEventListener('blur', () => {
        window.setTimeout(hideSuggestions, 120);
      });
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

  private updateImportButton() {
    if (!this.importButton) return;

    const count = this.getSelectedRows().length;
    this.importButton.setText(`Import selected (${count})`);
    this.importButton.disabled = count === 0;
  }

  private renderList() {
    this.listEl.empty();

    if (!this.rows.length) {
      this.listEl.createDiv({
        cls: 'zt-monitor-empty',
        text: 'Fetch citekeys to review specific Zotero items.',
      });
      this.updateImportButton();
      return;
    }

    const filtered = this.getFilteredRows();
    if (!filtered.length) {
      this.listEl.createDiv({
        cls: 'zt-monitor-empty',
        text: 'No matching fetched items.',
      });
      this.updateImportButton();
      return;
    }

    const table = this.listEl.createEl('table', {
      cls: 'zt-monitor-table zt-direct-import-table',
    });
    const header = table.createEl('thead').createEl('tr');
    [
      { text: '', cls: 'zt-monitor-table-check' },
      { text: 'Title', cls: 'zt-monitor-table-title-header' },
      { text: 'Citekey', cls: 'zt-monitor-table-citekey' },
      { text: 'Library', cls: 'zt-monitor-table-library' },
      { text: 'Status', cls: 'zt-monitor-table-date' },
      { text: 'Obsidian note', cls: 'zt-monitor-table-scopes' },
    ].forEach((column) => {
      header.createEl('th', { cls: column.cls, text: column.text });
    });

    const body = table.createEl('tbody');

    for (const rowData of filtered) {
      const key = directImportRowIdentity(rowData);
      const row = body.createEl('tr');
      row.toggleClass('is-selected', this.selected.has(key));

      const checkboxCell = row.createEl('td', {
        cls: 'zt-monitor-table-check',
      });
      const checkbox = checkboxCell.createEl('input');
      checkbox.type = 'checkbox';
      checkbox.disabled = !rowData.item;
      checkbox.checked = rowData.item ? this.selected.has(key) : false;
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) {
          this.selected.add(key);
        } else {
          this.selected.delete(key);
        }

        row.toggleClass('is-selected', checkbox.checked);
        this.updateImportButton();
      });

      const titleCell = row.createEl('td', {
        cls: 'zt-monitor-table-title-cell',
      });
      titleCell.createDiv({
        cls: 'zt-monitor-table-title',
        text: rowData.title,
      });

      row.createEl('td', {
        cls: 'zt-monitor-table-citekey',
        text: rowData.citekey,
      });
      row.createEl('td', {
        cls: 'zt-monitor-table-library',
        text:
          rowData.libraryName ||
          (rowData.libraryID ? `Library ${rowData.libraryID}` : ''),
      });
      row.createEl('td', {
        cls: 'zt-monitor-table-date',
        text: getDirectImportStatusText(rowData.status),
      });
      row.createEl('td', {
        cls: 'zt-monitor-table-scopes',
        text: rowData.existingNote?.path || '',
      });
    }

    this.updateImportButton();
  }
}

class ZoteroUpdateNotesModal extends Modal {
  private selected = new Set<string>();
  private quickSelect: UpdateSelectionMode = 'all';
  private searchTerm = '';
  private sortKey: UpdateSortKey = 'note';
  private sortDirection: MonitorSortDirection = 'asc';
  private listEl: HTMLDivElement;
  private updateButton: HTMLButtonElement;
  private quickSelectButtons: {
    [key in UpdateQuickSelect]: HTMLButtonElement | null;
  } = {
    none: null,
    all: null,
  };

  constructor(
    app: App,
    private notes: ZoteroUpdatableNote[],
    private exportFormatName: string,
    private preservedProperties: string[],
    private onUpdate: (notes: ZoteroUpdatableNote[]) => Promise<void>,
    private onFinished: () => void
  ) {
    super(app);

    for (const note of notes) {
      this.selected.add(noteIdentity(note));
    }
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    this.modalEl.addClass('zt-monitor-modal-shell');

    const container = contentEl.createDiv('zt-monitor-modal');
    const header = container.createDiv('zt-monitor-header');
    header.createEl('h2', { text: 'Update Zotero literature notes' });
    header.createEl('p', {
      text: `${this.notes.length} Obsidian literature note${
        this.notes.length === 1 ? '' : 's'
      } can be refreshed from Zotero. Note content and Zotero-owned properties will be overwritten.`,
    });

    const summary = header.createDiv('zt-monitor-filter-summary');
    summary.createSpan({
      cls: 'zt-monitor-filter-chip',
      text: `Import format: ${this.exportFormatName}`,
    });
    summary.createSpan({
      cls: 'zt-monitor-filter-chip',
      text: `Preserved: ${
        this.preservedProperties.length
          ? this.preservedProperties.join(', ')
          : 'none'
      }`,
    });

    const toolbar = container.createDiv('zt-monitor-toolbar');
    const search = toolbar.createEl('input');
    search.type = 'search';
    search.placeholder = 'Search note, title, citekey, library, or item key';
    search.addClass('zt-monitor-search');
    search.addEventListener('input', () => {
      this.searchTerm = search.value.trim().toLocaleLowerCase();
      this.renderList();
    });

    const quickSelect = toolbar.createDiv('zt-monitor-quick-select');
    quickSelect.createSpan({
      cls: 'zt-monitor-quick-select-label',
      text: 'Select:',
    });
    const quickSelectButtons = quickSelect.createDiv(
      'zt-monitor-quick-select-buttons'
    );

    this.quickSelectButtons.none = quickSelectButtons.createEl('button', {
      text: 'None',
    });
    this.quickSelectButtons.none.type = 'button';
    this.quickSelectButtons.none.addEventListener('click', () =>
      this.applyQuickSelection('none')
    );

    this.quickSelectButtons.all = quickSelectButtons.createEl('button', {
      text: 'All',
    });
    this.quickSelectButtons.all.type = 'button';
    this.quickSelectButtons.all.addEventListener('click', () =>
      this.applyQuickSelection('all')
    );

    this.listEl = container.createDiv('zt-monitor-list');

    const buttons = container.createDiv('zt-monitor-buttons');
    const dismissButton = buttons.createEl('button', { text: 'Dismiss' });
    dismissButton.addEventListener('click', () => this.close());

    this.updateButton = buttons.createEl('button', {
      text: `Update selected (${this.selected.size})`,
    });
    this.updateButton.addClass('mod-cta');
    this.updateButton.addEventListener('click', async () => {
      const selectedNotes = this.getSelectedNotes();
      if (!selectedNotes.length) return;

      this.updateButton.disabled = true;
      this.updateButton.setText('Updating...');
      await this.onUpdate(selectedNotes);
      this.close();
    });

    this.renderList();
    search.focus();
  }

  onClose() {
    this.modalEl.removeClass('zt-monitor-modal-shell');
    this.contentEl.empty();
    this.onFinished();
  }

  private getFilteredNotes(): ZoteroUpdatableNote[] {
    if (!this.searchTerm) return this.notes;

    return this.notes.filter((note) =>
      getUpdateSearchText(note).includes(this.searchTerm)
    );
  }

  private getSortedNotes(): ZoteroUpdatableNote[] {
    return [...this.getFilteredNotes()].sort((a, b) => {
      const comparison = this.compareNotes(a, b);
      return this.sortDirection === 'asc' ? comparison : -comparison;
    });
  }

  private getSelectedNotes(): ZoteroUpdatableNote[] {
    return this.notes.filter((note) => this.selected.has(noteIdentity(note)));
  }

  private getSortValue(note: ZoteroUpdatableNote): string | number {
    switch (this.sortKey) {
      case 'note':
        return note.basename || note.path;
      case 'title':
        return note.title || '';
      case 'citekey':
        return note.citekey || '';
      case 'library':
        return note.libraryName || String(note.libraryID || '');
      case 'dateModified': {
        const parsed = new Date(note.dateModified || '').getTime();
        return Number.isNaN(parsed) ? 0 : parsed;
      }
      default:
        return '';
    }
  }

  private compareNotes(a: ZoteroUpdatableNote, b: ZoteroUpdatableNote): number {
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

    return a.path.localeCompare(b.path, undefined, { sensitivity: 'base' });
  }

  private setSort(key: UpdateSortKey) {
    if (this.sortKey === key) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortKey = key;
      this.sortDirection = key === 'dateModified' ? 'desc' : 'asc';
    }

    this.renderList();
  }

  private updateUpdateButton() {
    if (!this.updateButton) return;

    this.updateButton.setText(`Update selected (${this.selected.size})`);
    this.updateButton.disabled = this.selected.size === 0;
  }

  private updateQuickSelectButtons() {
    for (const [mode, button] of Object.entries(this.quickSelectButtons)) {
      if (!button) continue;

      const isActive = mode === this.quickSelect;
      button.toggleClass('is-active', isActive);
      button.toggleClass('mod-cta', isActive);
    }
  }

  private applyQuickSelection(mode: UpdateQuickSelect) {
    this.quickSelect = mode;
    this.selected.clear();

    if (mode === 'all') {
      for (const note of this.notes) {
        this.selected.add(noteIdentity(note));
      }
    }

    this.renderList();
    this.updateQuickSelectButtons();
  }

  private renderList() {
    this.listEl.empty();
    const filtered = this.getSortedNotes();

    if (!filtered.length) {
      this.listEl.createDiv({
        cls: 'zt-monitor-empty',
        text: 'No matching Obsidian notes.',
      });
      this.updateUpdateButton();
      return;
    }

    this.updateQuickSelectButtons();

    const table = this.listEl.createEl('table', {
      cls: 'zt-monitor-table zt-update-table',
    });
    const header = table.createEl('thead').createEl('tr');
    [
      { text: '', cls: 'zt-monitor-table-check' },
      { text: 'Note', cls: 'zt-monitor-table-title-header', sortKey: 'note' },
      { text: 'Zotero title', cls: 'zt-monitor-table-title-header', sortKey: 'title' },
      { text: 'Citekey', cls: 'zt-monitor-table-citekey', sortKey: 'citekey' },
      { text: 'Library', cls: 'zt-monitor-table-library', sortKey: 'library' },
      {
        text: 'Modified',
        cls: 'zt-monitor-table-date',
        sortKey: 'dateModified',
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
        isActive
          ? this.sortDirection === 'asc'
            ? 'ascending'
            : 'descending'
          : 'none'
      );
      button.addEventListener('click', () =>
        this.setSort(column.sortKey as UpdateSortKey)
      );
      if (isActive) {
        button.createSpan({
          cls: 'zt-monitor-sort-indicator',
          text: this.sortDirection,
        });
      }
    });

    const body = table.createEl('tbody');

    for (const note of filtered) {
      const key = noteIdentity(note);
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
        this.updateUpdateButton();
        this.updateQuickSelectButtons();
      });

      const noteCell = row.createEl('td', {
        cls: 'zt-monitor-table-title-cell',
      });
      noteCell.createDiv({
        cls: 'zt-monitor-table-title',
        text: note.basename || note.path,
      });
      noteCell.createDiv({
        cls: 'zt-orphan-note-path',
        text: note.path,
      });

      const titleCell = row.createEl('td', {
        cls: 'zt-monitor-table-title-cell',
      });
      titleCell.createDiv({
        cls: 'zt-monitor-table-title',
        text: note.title || note.citekey,
      });

      row.createEl('td', {
        cls: 'zt-monitor-table-citekey',
        text: note.citekey,
      });
      row.createEl('td', {
        cls: 'zt-monitor-table-library',
        text: note.libraryName || `Library ${note.libraryID}`,
      });
      row.createEl('td', {
        cls: 'zt-monitor-table-date',
        text: getDisplayDate(note.dateModified),
      });
    }

    this.updateUpdateButton();
  }
}

export class ZoteroMonitor {
  private intervalId: number | null = null;
  private checkInProgress = false;
  private modalOpen = false;
  private lastNoticeKey = '';
  private missingItemsNotice: Notice | null = null;

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

  runDirectImport() {
    if (this.modalOpen) return;

    this.openDirectImportModal();
  }

  async runSciteMetadataRefresh() {
    if (this.checkInProgress) return;

    if (!this.plugin.settings.zoteroSciteEnabled) {
      new Notice('Enable scite citation metadata in settings first.');
      return;
    }

    this.checkInProgress = true;
    try {
      const notes = this.getVaultZoteroNotes();
      let updated = 0;
      let failed = 0;
      let noDoi = 0;

      for (const note of notes) {
        if (!(note.file instanceof TFile)) continue;

        if (!getNoteDoi(note.frontmatter)) {
          noDoi += 1;
          continue;
        }

        const result = await writeSciteManagedFrontmatter(
          this.plugin.app,
          note.file,
          this.plugin.settings,
          note.frontmatter,
          { force: true }
        );

        if (result.status === 'error') {
          failed += 1;
        } else if (result.status === 'ok') {
          updated += 1;
        }
      }

      new Notice(
        `Refreshed scite metadata for ${updated} Zotero literature note${
          updated === 1 ? '' : 's'
        }.${noDoi ? ` Skipped ${noDoi} without DOI.` : ''}${
          failed ? ` ${failed} failed.` : ''
        }`,
        10000
      );
    } finally {
      this.checkInProgress = false;
    }
  }

  async runOrphanedNotesCheck() {
    if (this.checkInProgress || this.modalOpen) return;

    this.checkInProgress = true;
    try {
      const zoteroItems = await this.getAllMonitorItems(true);
      if (zoteroItems === null) return;
      if (!zoteroItems.length) {
        new Notice('No Better BibTeX-citekeyed Zotero items found.');
        return;
      }

      const vaultNotes = this.getVaultZoteroNotes();

      if (!vaultNotes.length) {
        new Notice('No Obsidian notes with Zotero identity properties found.');
        return;
      }

      const orphaned = filterOrphanedZoteroNotes(vaultNotes, zoteroItems);
      const orphanedPaths = new Set(orphaned.map((note) => note.path));
      const matchedNotes = vaultNotes.filter(
        (note) => !orphanedPaths.has(note.path)
      );
      const clearedCount = await this.clearOrphanFlags(matchedNotes);

      if (!orphaned.length) {
        new Notice(
          `No orphaned Zotero literature notes found.${
            clearedCount
              ? ` Cleared stale orphan flags from ${clearedCount} note${
                  clearedCount === 1 ? '' : 's'
                }.`
              : ''
          }`
        );
        return;
      }

      this.openOrphanedNotesModal(orphaned, clearedCount);
    } finally {
      this.checkInProgress = false;
    }
  }

  async runUpdateNotesCheck() {
    if (this.checkInProgress || this.modalOpen) return;

    this.checkInProgress = true;
    try {
      const zoteroItems = await this.getAllMonitorItems(true);
      if (zoteroItems === null) return;
      if (!zoteroItems.length) {
        new Notice('No Better BibTeX-citekeyed Zotero items found.');
        return;
      }

      const updatable = this.getUpdatableNotes(zoteroItems);

      if (!updatable.length) {
        new Notice('No Obsidian literature notes matched current Zotero items.');
        return;
      }

      this.openUpdateNotesModal(updatable);
    } finally {
      this.checkInProgress = false;
    }
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
    this.dismissMissingItemsNotice();

    let notice: Notice;
    const fragment = document.createDocumentFragment();
    const container = document.createElement('div');
    container.addClass('zt-monitor-notice-content');
    fragment.appendChild(container);

    container.createDiv({
      cls: 'zt-monitor-notice-title',
      text: `${missing.length} new Zotero reference${
        missing.length === 1 ? '' : 's'
      } found${this.getRecentWindowNoticeText()}`,
    });
    container.createDiv({
      cls: 'zt-monitor-notice-message',
      text: `${missing.length === 1 ? 'It is' : 'They are'} not imported yet.`,
    });

    const actions = container.createDiv('zt-monitor-notice-actions');
    const openButton = actions.createEl('button', { text: 'Open Import' });
    openButton.type = 'button';
    openButton.addClass('mod-cta');
    const backgroundButton = actions.createEl('button', {
      text: 'Background Import',
    });
    backgroundButton.type = 'button';
    const ignoreButton = actions.createEl('button', { text: 'Ignore' });
    ignoreButton.type = 'button';

    openButton.addEventListener('click', () => {
      this.dismissMissingItemsNotice(notice);
      this.openMissingItemsModal(missing);
    });

    backgroundButton.addEventListener('click', async () => {
      if (!this.getMonitorImportFormat()) {
        new Notice('No Zotero import format selected for the monitor.', 10000);
        return;
      }

      const buttons = [openButton, backgroundButton, ignoreButton];
      for (const button of buttons) {
        button.disabled = true;
      }

      backgroundButton.setText('Importing...');

      try {
        await this.importItems(missing, getDefaultManagedProperties(), {
          openNotes: false,
        });
        this.dismissMissingItemsNotice(notice);
      } catch (error) {
        console.error('Background Zotero import failed', error);
        const message = error instanceof Error ? error.message : String(error);
        new Notice(`Background import failed: ${message}`, 10000);

        for (const button of buttons) {
          button.disabled = false;
        }
        backgroundButton.setText('Background Import');
      }
    });

    ignoreButton.addEventListener('click', () => {
      this.dismissMissingItemsNotice(notice);
    });

    notice = new Notice(fragment, 0);
    notice.noticeEl.addClass('zt-monitor-missing-notice');
    this.missingItemsNotice = notice;
  }

  private getRecentWindowNoticeText(): string {
    const recentDays = Number(this.plugin.settings.zoteroMonitorRecentDays);

    if (!Number.isFinite(recentDays) || recentDays <= 0) {
      return '';
    }

    if (recentDays === 1) {
      return ' within the past day';
    }

    if (recentDays === 30) {
      return ' within the past month';
    }

    return ` within the past ${recentDays} days`;
  }

  private dismissMissingItemsNotice(notice = this.missingItemsNotice) {
    if (!notice) return;

    notice.hide();
    if (this.missingItemsNotice === notice) {
      this.missingItemsNotice = null;
    }
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

  private openOrphanedNotesModal(
    orphaned: ZoteroOrphanedNote[],
    clearedCount: number
  ) {
    this.modalOpen = true;
    new ZoteroOrphanedNotesModal(
      this.plugin.app,
      orphaned,
      this.getOrphanedProperty(),
      clearedCount,
      (notes) => this.flagOrphanedNotes(notes),
      () => {
        this.modalOpen = false;
      }
    ).open();
  }

  private openUpdateNotesModal(updatable: ZoteroUpdatableNote[]) {
    this.modalOpen = true;
    new ZoteroUpdateNotesModal(
      this.plugin.app,
      updatable,
      this.getMonitorExportFormatName(),
      this.plugin.settings.zoteroPreservedProperties || [],
      (notes) => this.updateExistingNotes(notes),
      () => {
        this.modalOpen = false;
      }
    ).open();
  }

  private openDirectImportModal() {
    this.modalOpen = true;
    new ZoteroDirectImportModal(
      this.plugin.app,
      this.getMonitorExportFormatName(),
      () => this.getDirectImportCitekeySuggestions(),
      (input) => this.resolveDirectImportRows(input),
      (rows, properties) => this.importDirectRows(rows, properties),
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
    const exportFormatName = this.getMonitorExportFormatName();
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

  private getMonitorExportFormatName(): string {
    return (
      this.plugin.settings.zoteroMonitorImportFormat ||
      this.plugin.settings.exportFormats[0]?.name ||
      'first configured format'
    );
  }

  private getMonitorImportFormat(): ExportFormat | undefined {
    const exportFormatName =
      this.plugin.settings.zoteroMonitorImportFormat ||
      this.plugin.settings.exportFormats[0]?.name;

    return this.plugin.settings.exportFormats.find(
      (format) => format.name === exportFormatName
    );
  }

  private async getAllMonitorItems(
    manual: boolean
  ): Promise<ZoteroMonitorItem[] | null> {
    const database = this.getDatabase();

    if (!(await isZoteroRunning(database, true))) {
      if (manual) {
        new Notice(
          'Cannot connect to Zotero. Please ensure it is running and Better BibTeX is installed.',
          10000
        );
      }
      return null;
    }

    const { citekeys } = await getAllCiteKeys(database, true);
    if (!citekeys.length) return [];

    return this.fetchMonitorItems(uniqueCandidates(citekeys));
  }

  private async resolveDirectImportRows(
    input: string
  ): Promise<ZoteroDirectImportRow[]> {
    const refs = parseDirectCitekeyInput(input);
    if (!refs.length) return [];

    const database = this.getDatabase();
    if (!(await isZoteroRunning(database, true))) {
      new Notice(
        'Cannot connect to Zotero. Please ensure it is running and Better BibTeX is installed.',
        10000
      );
      return [];
    }

    const candidates: CiteKeyExport[] = [];
    const unresolvedRows: ZoteroDirectImportRow[] = [];
    const plainRefs = refs.filter((ref) => !ref.libraryID);
    const libraryRefs = refs.filter((ref) => ref.libraryID);

    if (plainRefs.length) {
      const { citekeys } = await getAllCiteKeys(database, true);
      const byCitekey = new Map<string, CiteKeyExport[]>();

      for (const candidate of uniqueCandidates(citekeys || [])) {
        const key = candidate.citekey.toLocaleLowerCase();
        const matches = byCitekey.get(key) || [];
        matches.push(candidate);
        byCitekey.set(key, matches);
      }

      for (const ref of plainRefs) {
        const matches = byCitekey.get(ref.citekey.toLocaleLowerCase()) || [];
        if (!matches.length) {
          unresolvedRows.push({
            citekey: ref.citekey,
            status: 'not-found',
            title: ref.citekey,
          });
          continue;
        }

        candidates.push(...matches);
      }
    }

    for (const ref of libraryRefs) {
      candidates.push({
        citekey: ref.citekey,
        libraryID: ref.libraryID!,
        title: ref.citekey,
      });
    }

    const uniqueResolvedCandidates = uniqueCandidates(candidates);
    const items = uniqueResolvedCandidates.length
      ? await this.fetchMonitorItems(uniqueResolvedCandidates)
      : [];
    const itemByIdentity = new Map<string, ZoteroMonitorItem>();

    for (const item of items) {
      itemByIdentity.set(itemIdentity(item).toLocaleLowerCase(), item);
    }

    const vaultNotes = this.getVaultZoteroNotes();
    const rows: ZoteroDirectImportRow[] = [];

    for (const candidate of uniqueResolvedCandidates) {
      const key = `${candidate.libraryID}:${candidate.citekey}`.toLocaleLowerCase();
      const item = itemByIdentity.get(key);

      if (!item) {
        rows.push({
          citekey: candidate.citekey,
          libraryID: candidate.libraryID,
          libraryName: candidate.libraryName,
          status: 'not-found',
          title: candidate.title || candidate.citekey,
        });
        continue;
      }

      const existingNote = vaultNotes.find((note) =>
        isZoteroItemInFrontmatter(item, note.frontmatter)
      );

      rows.push({
        citekey: item.citekey,
        existingNote,
        item,
        libraryID: item.libraryID,
        libraryName: item.libraryName,
        status: existingNote ? 'present' : 'missing',
        title: item.title || item.citekey,
      });
    }

    rows.push(...unresolvedRows);
    return rows;
  }

  private async getDirectImportCitekeySuggestions(): Promise<CiteKeyExport[]> {
    const database = this.getDatabase();
    if (!(await isZoteroRunning(database, true))) {
      new Notice(
        'Cannot connect to Zotero. Please ensure it is running and Better BibTeX is installed.',
        10000
      );
      return [];
    }

    const { citekeys } = await getAllCiteKeys(database, true);
    return uniqueCandidates(citekeys || []);
  }

  private async getMissingItems(manual: boolean): Promise<ZoteroMonitorItem[]> {
    const items = await this.getAllMonitorItems(manual);
    if (!items?.length) return [];

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

  private getVaultZoteroNotes(): ZoteroVaultNote[] {
    const notes: ZoteroVaultNote[] = [];

    for (const file of this.plugin.app.vault.getMarkdownFiles()) {
      const frontmatter =
        this.plugin.app.metadataCache.getFileCache(file)?.frontmatter;
      if (!frontmatter || !hasZoteroIdentity(frontmatter)) continue;

      notes.push({
        file,
        path: file.path,
        basename: file.basename,
        frontmatter: frontmatter as Record<string, any>,
      });
    }

    return notes;
  }

  private getUpdatableNotes(
    zoteroItems: ZoteroMonitorItem[]
  ): ZoteroUpdatableNote[] {
    const updatable: ZoteroUpdatableNote[] = [];

    for (const note of this.getVaultZoteroNotes()) {
      const item = zoteroItems.find((candidate) =>
        isZoteroItemInFrontmatter(candidate, note.frontmatter)
      );
      if (!item) continue;

      updatable.push({
        ...note,
        citekey: item.citekey,
        dateModified: item.dateModified,
        item,
        itemKey: item.itemKey,
        libraryID: item.libraryID,
        libraryName: item.libraryName,
        title: item.title,
      });
    }

    return updatable;
  }

  private getOrphanedProperty(): string {
    return (
      this.plugin.settings.zoteroOrphanedProperty?.trim() ||
      ZOTERO_ORPHANED_DEFAULT_PROPERTY
    );
  }

  private getOrphanMetadataProperties(): string[] {
    return [
      this.getOrphanedProperty(),
      ZOTERO_ORPHANED_CHECKED_AT_PROPERTY,
      ZOTERO_ORPHANED_REASON_PROPERTY,
    ];
  }

  private hasOrphanFlag(frontmatter: Record<string, any>): boolean {
    return this.getOrphanMetadataProperties().some((property) =>
      Object.prototype.hasOwnProperty.call(frontmatter, property)
    );
  }

  private async clearOrphanFlags(notes: ZoteroVaultNote[]): Promise<number> {
    let cleared = 0;
    const properties = this.getOrphanMetadataProperties();

    for (const note of notes) {
      if (!(note.file instanceof TFile)) continue;
      if (!this.hasOrphanFlag(note.frontmatter)) continue;

      await this.plugin.app.fileManager.processFrontMatter(
        note.file,
        (frontmatter) => {
          for (const property of properties) {
            delete frontmatter[property];
          }
          sortFrontmatterProperties(frontmatter);
        }
      );
      cleared += 1;
    }

    return cleared;
  }

  private async flagOrphanedNotes(notes: ZoteroOrphanedNote[]) {
    const property = this.getOrphanedProperty();
    const checkedAt = new Date().toISOString();
    let updated = 0;

    for (const note of notes) {
      if (!(note.file instanceof TFile)) continue;

      await this.plugin.app.fileManager.processFrontMatter(
        note.file,
        (frontmatter) => {
          frontmatter[property] = true;
          frontmatter[ZOTERO_ORPHANED_CHECKED_AT_PROPERTY] = checkedAt;
          frontmatter[ZOTERO_ORPHANED_REASON_PROPERTY] = note.reason;
          sortFrontmatterProperties(frontmatter);
        }
      );
      updated += 1;
    }

    new Notice(
      `Flagged ${updated} orphaned Zotero literature note${
        updated === 1 ? '' : 's'
      }.`
    );
  }

  private async updateExistingNotes(notes: ZoteroUpdatableNote[]) {
    const exportFormatName =
      this.plugin.settings.zoteroMonitorImportFormat ||
      this.plugin.settings.exportFormats[0]?.name;
    const exportFormat = this.plugin.settings.exportFormats.find(
      (format) => format.name === exportFormatName
    );

    if (!exportFormat) {
      new Notice('No Zotero import format selected for updates.', 10000);
      return;
    }

    const modal = new ConfirmationModal(
      this.plugin.app,
      'Update literature notes from Zotero',
      `This will overwrite note content and refresh Zotero-owned properties for ${
        notes.length
      } selected literature note${notes.length === 1 ? '' : 's'}. Configured preserved properties will be kept. Continue?`
    );
    modal.open();

    const shouldUpdate = await modal.waitForResult();
    if (!shouldUpdate) return;

    const database = this.getDatabase();
    const pathOverrides: Record<string, string> = {};
    const createdOrUpdatedPaths: string[] = [];

    for (const note of notes) {
      pathOverrides[`${note.libraryID}:${note.citekey.toLocaleLowerCase()}`] =
        note.path;
    }

    for (const [libraryID, libraryItems] of groupItemsByLibrary(
      notes.map((note) => note.item)
    ).entries()) {
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
          forceOverwrite: true,
          pathOverrides,
        }
      );

      createdOrUpdatedPaths.push(...paths);
    }

    await this.plugin.openNotes(createdOrUpdatedPaths);

    if (createdOrUpdatedPaths.length) {
      new Notice(
        `Updated ${createdOrUpdatedPaths.length} Zotero literature note${
          createdOrUpdatedPaths.length === 1 ? '' : 's'
        }.`
      );
    }
  }

  private async importDirectRows(
    rows: ZoteroDirectImportRow[],
    managedProperties: ZoteroManagedUserProperties
  ) {
    const importableRows = rows.filter((row) => row.item) as Array<
      ZoteroDirectImportRow & { item: ZoteroMonitorItem }
    >;

    if (!importableRows.length) {
      new Notice('No resolved Zotero items selected for import.');
      return;
    }

    const exportFormatName =
      this.plugin.settings.zoteroMonitorImportFormat ||
      this.plugin.settings.exportFormats[0]?.name;
    const exportFormat = this.plugin.settings.exportFormats.find(
      (format) => format.name === exportFormatName
    );

    if (!exportFormat) {
      new Notice('No Zotero import format selected.', 10000);
      return;
    }

    const database = this.getDatabase();
    const pathOverrides: Record<string, string> = {};
    const createdOrUpdatedPaths: string[] = [];

    for (const row of importableRows) {
      if (!row.existingNote) continue;

      pathOverrides[`${row.item.libraryID}:${row.item.citekey.toLocaleLowerCase()}`] =
        row.existingNote.path;
    }

    for (const [libraryID, libraryItems] of groupItemsByLibrary(
      importableRows.map((row) => row.item)
    ).entries()) {
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
          managedProperties,
          pathOverrides,
        }
      );

      createdOrUpdatedPaths.push(...paths);
    }

    await this.plugin.openNotes(createdOrUpdatedPaths);

    if (createdOrUpdatedPaths.length) {
      new Notice(
        `Imported or updated ${createdOrUpdatedPaths.length} Zotero literature note${
          createdOrUpdatedPaths.length === 1 ? '' : 's'
        }.`
      );
    }
  }

  private async importItems(
    items: ZoteroMonitorItem[],
    managedProperties: ZoteroManagedUserProperties,
    options: ImportItemsOptions = {}
  ) {
    const exportFormat = this.getMonitorImportFormat();

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
          managedProperties,
        }
      );

      createdOrUpdatedPaths.push(...paths);
    }

    if (options.openNotes !== false) {
      await this.plugin.openNotes(createdOrUpdatedPaths);
    }

    if (createdOrUpdatedPaths.length) {
      new Notice(
        `Imported ${createdOrUpdatedPaths.length} Zotero literature note${
          createdOrUpdatedPaths.length === 1 ? '' : 's'
        }.`
      );
    }
  }
}
