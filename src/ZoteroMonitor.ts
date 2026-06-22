import { App, Modal, Notice, TFile } from 'obsidian';

import type ZoteroConnector from './main';
import {
  CiteKeyExport,
  DatabaseWithPort,
  ZoteroItemTableColumn,
  ZoteroManagedUserProperties,
  ZoteroMonitorItem,
  ZoteroMonitorScope,
} from './types';
import {
  getZoteroItemTableCellText,
  getZoteroItemTableChipValues,
  getZoteroItemTableSortValue,
  isZoteroItemTableChipColumn,
  normalizeZoteroItemTableColumns,
  ZOTERO_ITEM_TABLE_COLUMN_BY_KEY,
} from './ZoteroItemTable.columns';
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
import type { CiteKey } from './bbt/cayw';
import {
  getAllCiteKeys,
  getCollectionFromCiteKey,
  getItemJSONFromCiteKeys,
} from './bbt/jsonRPC';
import {
  applyScitePropertiesToFrontmatter,
  fetchSciteTallies,
  getNoteDoi,
  normalizeDoi,
} from './scite';

const BATCH_SIZE = 50;
const MONITOR_ITEM_CACHE_TTL_MS = 10 * 60 * 1000;
const MONITOR_PRELOAD_DELAY_MS = 1500;
const DEFAULT_ORPHANED_PROPERTY = 'zoteroOrphaned';
const ORPHANED_CHECKED_AT_PROPERTY = 'zoteroOrphanedCheckedAt';
const ORPHANED_REASON_PROPERTY = 'zoteroOrphanedReason';
type MonitorQuickSelect = 'none' | 'today' | 'all';
type MonitorSelectionMode = MonitorQuickSelect | 'custom';
type MonitorSortDirection = 'asc' | 'desc';
type MonitorSortKey = ZoteroItemTableColumn;
type MonitorItemCache = {
  databaseKey: string;
  fetchedAt: number;
  items: ZoteroMonitorItem[];
};
type PaperLink = {
  href: string;
  label: string;
  title: string;
};
type ExistingLiteratureNote = {
  file: TFile;
  frontmatter: Record<string, any>;
  citekey: string;
  libraryID?: number;
  itemKey?: string;
};
type MatchedLiteratureNote = ExistingLiteratureNote & {
  item: ZoteroMonitorItem;
};
type OrphanedLiteratureNote = ExistingLiteratureNote & {
  reason: string;
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

function getItemString(
  item: ZoteroMonitorItem,
  keys: string[]
): string {
  const source = item.item as Record<string, unknown>;

  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return '';
}

function getBestPaperLink(item: ZoteroMonitorItem): PaperLink {
  const doi = normalizeDoi(getItemString(item, ['DOI', 'doi']));
  if (doi) {
    return {
      href: `https://doi.org/${encodeURI(doi)}`,
      label: 'DOI',
      title: 'Open DOI',
    };
  }

  const url = getItemString(item, ['url', 'URL']);
  if (/^https?:\/\//i.test(url)) {
    return {
      href: url,
      label: 'Web',
      title: 'Open publisher page',
    };
  }

  const query = item.title || item.citekey;
  return {
    href: `https://scholar.google.com/scholar?q=${encodeURIComponent(query)}`,
    label: 'Search',
    title: 'Search online',
  };
}

function shouldIgnoreRowSelectionClick(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    !!target.closest('a, button, input, label, select, textarea')
  );
}

function normalizeIdentityValue(value: unknown): string {
  return String(value || '').trim().toLocaleLowerCase();
}

function normalizeOptionalNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function frontmatterValues(value: unknown): string[] {
  if (value === null || value === undefined) return [];

  if (Array.isArray(value)) {
    return value
      .flatMap((entry) => frontmatterValues(entry))
      .filter((entry) => !!entry);
  }

  if (typeof value === 'object') {
    const source = value as Record<string, unknown>;
    return [
      source.key,
      source.citekey,
      source.citationKey,
      source.itemKey,
    ]
      .map((entry) => String(entry || '').trim())
      .filter(Boolean);
  }

  return String(value || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function firstFrontmatterValue(
  frontmatter: Record<string, any>,
  keys: string[]
): string {
  for (const key of keys) {
    const value = frontmatterValues(frontmatter[key])[0];
    if (value) return value;
  }

  return '';
}

function getNoteCitekey(frontmatter: Record<string, any>): string {
  return firstFrontmatterValue(frontmatter, [
    'zoteroCitekey',
    'zoteroCiteKey',
    'citekey',
    'citationKey',
    'citationkey',
    'citation-key',
  ]).replace(/^@/, '');
}

function getNoteItemKey(frontmatter: Record<string, any>): string {
  return firstFrontmatterValue(frontmatter, [
    'zoteroItemKey',
    'itemKey',
    'zoteroKey',
    'zotero_key',
  ]);
}

function getNoteLibraryID(frontmatter: Record<string, any>): number | undefined {
  return normalizeOptionalNumber(
    firstFrontmatterValue(frontmatter, ['zoteroLibraryID', 'libraryID'])
  );
}

function getExistingNoteIdentity(
  file: TFile,
  frontmatter: Record<string, any>
): ExistingLiteratureNote | null {
  const citekey = getNoteCitekey(frontmatter);
  const itemKey = getNoteItemKey(frontmatter);

  if (!citekey && !itemKey) return null;

  return {
    file,
    frontmatter,
    citekey,
    itemKey,
    libraryID: getNoteLibraryID(frontmatter),
  };
}

function itemPathOverrideKey(item: ZoteroMonitorItem): string {
  return `${item.libraryID}:${item.citekey.toLocaleLowerCase()}`;
}

function matchesExistingNote(
  item: ZoteroMonitorItem,
  note: ExistingLiteratureNote
): boolean {
  const noteLibraryID = note.libraryID;
  const sameLibrary =
    noteLibraryID === undefined || Number(noteLibraryID) === item.libraryID;

  if (note.itemKey && item.itemKey && sameLibrary) {
    return (
      normalizeIdentityValue(note.itemKey) === normalizeIdentityValue(item.itemKey)
    );
  }

  if (note.citekey) {
    return (
      sameLibrary &&
      normalizeIdentityValue(note.citekey) === normalizeIdentityValue(item.citekey)
    );
  }

  return false;
}

function getMatchedItem(
  note: ExistingLiteratureNote,
  items: ZoteroMonitorItem[]
): ZoteroMonitorItem | null {
  return items.find((item) => matchesExistingNote(item, note)) || null;
}

function getOrphanReason(note: ExistingLiteratureNote): string {
  if (note.libraryID && note.itemKey) {
    return `No Zotero item with library ${note.libraryID} and item key ${note.itemKey}`;
  }

  if (note.libraryID && note.citekey) {
    return `No Zotero item with library ${note.libraryID} and citekey ${note.citekey}`;
  }

  if (note.citekey) {
    return `No Zotero item with citekey ${note.citekey}`;
  }

  return 'No matching Zotero item found';
}

function parseRequestedCitekeys(value: string): Array<{
  citekey: string;
  libraryID?: number;
}> {
  const seen = new Set<string>();
  const parsed: Array<{ citekey: string; libraryID?: number }> = [];

  for (const rawEntry of value.split(/[,\s;]+/g)) {
    const raw = rawEntry.trim().replace(/^@/, '');
    if (!raw) continue;

    const match = raw.match(/^(\d+)[/:](.+)$/);
    const libraryID = match ? Number(match[1]) : undefined;
    const citekey = (match ? match[2] : raw).trim().replace(/^@/, '');
    if (!citekey) continue;

    const key = `${libraryID || ''}:${citekey.toLocaleLowerCase()}`;
    if (seen.has(key)) continue;

    seen.add(key);
    parsed.push({ citekey, libraryID });
  }

  return parsed;
}

function candidateMatchesRequest(
  candidate: CiteKeyExport,
  requested: { citekey: string; libraryID?: number }
): boolean {
  if (
    requested.citekey.toLocaleLowerCase() !== candidate.citekey.toLocaleLowerCase()
  ) {
    return false;
  }

  return (
    requested.libraryID === undefined ||
    Number(requested.libraryID) === Number(candidate.libraryID)
  );
}

function renderLinkedTitleCell(
  row: HTMLTableRowElement,
  item: ZoteroMonitorItem,
  className: string
) {
  const titleCell = row.createEl('td', {
    cls: className,
  });
  const paperLink = getBestPaperLink(item);
  const titleText = item.title || item.citekey;
  const titleLink = titleCell.createEl('a', {
    cls: 'zt-monitor-table-title zt-monitor-paper-link',
    text: titleText,
  });
  titleLink.href = paperLink.href;
  titleLink.target = '_blank';
  titleLink.rel = 'noopener noreferrer';
  titleLink.setAttribute('aria-label', `${paperLink.title}: ${titleText}`);
  const linkRow = titleCell.createDiv('zt-monitor-paper-links');
  const sourceLink = linkRow.createEl('a', {
    cls: 'zt-monitor-paper-source-link',
    text: paperLink.label,
  });
  sourceLink.href = paperLink.href;
  sourceLink.target = '_blank';
  sourceLink.rel = 'noopener noreferrer';
}

function renderItemChipCell(
  row: HTMLTableRowElement,
  className: string,
  values: string[]
) {
  const cell = row.createEl('td', {
    cls: className,
  });

  if (values.length) {
    for (const value of values) {
      cell.createSpan({
        cls: 'zt-monitor-scope-chip',
        text: value,
      });
    }
    return;
  }

  cell.createSpan({
    cls: 'zt-monitor-empty-value',
    text: 'None',
  });
}

function renderConfiguredItemCell(
  row: HTMLTableRowElement,
  item: ZoteroMonitorItem,
  columnKey: ZoteroItemTableColumn
) {
  const column = ZOTERO_ITEM_TABLE_COLUMN_BY_KEY[columnKey];

  if (column.key === 'title') {
    renderLinkedTitleCell(row, item, column.className);
    return;
  }

  if (isZoteroItemTableChipColumn(column.key)) {
    renderItemChipCell(
      row,
      column.className,
      getZoteroItemTableChipValues(item, column.key)
    );
    return;
  }

  row.createEl('td', {
    cls: column.className,
    text: getZoteroItemTableCellText(item, column.key),
  });
}

class ZoteroDirectImportRequestModal extends Modal {
  private inputEl: HTMLTextAreaElement;
  private statusEl: HTMLDivElement;
  private submitButton: HTMLButtonElement;

  constructor(
    app: App,
    private onSubmit: (value: string) => Promise<void>
  ) {
    super(app);
  }

  onOpen() {
    this.contentEl.empty();
    this.modalEl.addClass('zt-monitor-modal-shell');

    const container = this.contentEl.createDiv('zt-monitor-modal');
    const header = container.createDiv('zt-monitor-header');
    header.createEl('h2', { text: 'Import specific Zotero notes' });
    header.createEl('p', {
      text: 'Enter one or more citekeys. Use library prefixes such as 1:smith2024 when needed.',
    });

    const field = container.createDiv('zt-monitor-bulk-fields');
    const inputWrapper = field.createDiv('zt-monitor-bulk-field');
    inputWrapper.addClass('zt-monitor-bulk-field-wide');
    inputWrapper.createEl('label', { text: 'Citekeys' });
    this.inputEl = inputWrapper.createEl('textarea');
    this.inputEl.rows = 5;
    this.inputEl.placeholder = '@smith2024, 1:doe2025';

    this.statusEl = container.createDiv('zt-monitor-action-summary');
    const buttons = container.createDiv('zt-monitor-buttons');
    const cancelButton = buttons.createEl('button', { text: 'Cancel' });
    cancelButton.type = 'button';
    cancelButton.addEventListener('click', () => this.close());

    this.submitButton = buttons.createEl('button', {
      text: 'Fetch items',
    });
    this.submitButton.type = 'button';
    this.submitButton.addClass('mod-cta');
    this.submitButton.addEventListener('click', async () => {
      const value = this.inputEl.value.trim();
      if (!value) {
        this.statusEl.setText('Enter at least one citekey.');
        return;
      }

      this.submitButton.disabled = true;
      this.submitButton.setText('Fetching...');
      this.statusEl.setText('');

      try {
        await this.onSubmit(value);
        this.close();
      } catch (error) {
        this.statusEl.setText(
          error instanceof Error ? error.message : String(error)
        );
      } finally {
        this.submitButton.disabled = false;
        this.submitButton.setText('Fetch items');
      }
    });

    this.inputEl.focus();
  }

  onClose() {
    this.modalEl.removeClass('zt-monitor-modal-shell');
    this.contentEl.empty();
  }
}

class ZoteroItemImportModal extends Modal {
  private selected = new Set<string>();
  private selectionAnchorKey: string | null = null;
  private quickSelect: MonitorSelectionMode;
  private searchTerm = '';
  private sortKey: MonitorSortKey = 'dateAdded';
  private sortDirection: MonitorSortDirection = 'desc';
  private tableColumns: ZoteroItemTableColumn[];
  private managedProperties: ZoteroManagedUserProperties = {
    zoteroProject: [],
    zoteroTopic: [],
    zoteroNote: '',
    zoteroStatus: 'new',
  };
  private isImporting = false;
  private listEl: HTMLDivElement;
  private selectionSummaryEl: HTMLDivElement;
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
    tableColumns: string[],
    private title: string,
    private description: string,
    private filterSummary: string[],
    private onImport: (
      items: ZoteroMonitorItem[],
      properties: ZoteroManagedUserProperties
    ) => Promise<string[]>,
    private onFinished: () => void,
    initialSelection: MonitorQuickSelect = 'today'
  ) {
    super(app);
    this.quickSelect = initialSelection;
    this.tableColumns = normalizeZoteroItemTableColumns(tableColumns);

    if (!this.tableColumns.includes(this.sortKey)) {
      this.sortKey = this.tableColumns.includes('dateAdded')
        ? 'dateAdded'
        : this.tableColumns[0];
      this.sortDirection = this.getDefaultSortDirection(this.sortKey);
    }

    for (const item of items) {
      if (
        initialSelection === 'all' ||
        (initialSelection === 'today' && this.isItemFromToday(item))
      ) {
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
    header.createEl('h2', { text: this.title });
    header.createEl('p', { text: this.description });
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

    const actionBar = container.createDiv('zt-monitor-action-bar');
    this.selectionSummaryEl = actionBar.createDiv('zt-monitor-action-summary');
    const buttons = actionBar.createDiv('zt-monitor-buttons');
    const cancelButton = buttons.createEl('button', { text: 'Cancel' });
    cancelButton.type = 'button';
    cancelButton.addEventListener('click', () => this.close());

    this.importButton = buttons.createEl('button', {
      text: 'Import & close',
    });
    this.importButton.type = 'button';
    this.importButton.addClass('mod-cta');
    this.importButton.addEventListener('click', async () => {
      const selectedItems = this.getSelectedItems();
      if (!selectedItems.length) return;

      await this.handleImport(selectedItems, false);
    });

    this.importButtonContinue = buttons.createEl('button', {
      text: 'Import & continue',
    });
    this.importButtonContinue.type = 'button';
    this.importButtonContinue.addEventListener('click', async () => {
      const selectedItems = this.getSelectedItems();
      if (!selectedItems.length) return;

      await this.handleImport(selectedItems, true);
    });

    this.renderBulkFields(container);

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
      const createdOrUpdatedPaths = await this.onImport(
        selectedItems,
        this.getManagedProperties()
      );

      if (!createdOrUpdatedPaths.length) {
        new Notice('No Zotero literature notes were imported.', 5000);
        return;
      }

      if (!continueAfterImport) {
        this.close();
        return;
      }

      const imported = new Set(selectedItems.map((item) => itemIdentity(item)));
      this.items = this.items.filter((item) => !imported.has(itemIdentity(item)));
      this.selected.clear();
      this.selectionAnchorKey = null;
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

  private getDefaultSortDirection(key: MonitorSortKey): MonitorSortDirection {
    return key === 'dateAdded' ||
      key === 'dateModified' ||
      key === 'date' ||
      key === 'year'
      ? 'desc'
      : 'asc';
  }

  private getSortValue(item: ZoteroMonitorItem): string | number {
    return getZoteroItemTableSortValue(item, this.sortKey);
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
      this.sortDirection = this.getDefaultSortDirection(key);
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
    this.importButton.disabled = isImporting;
    this.importButton.setText(isImporting ? 'Importing...' : 'Import & close');

    this.importButtonContinue.disabled = isImporting;
    this.importButtonContinue.setText(
      isImporting ? 'Importing...' : 'Import & continue'
    );
  }

  private updateImportButtons() {
    const selectedCount = this.getSelectedItems().length;
    const itemCount = this.items.length;

    this.selectionSummaryEl.setText(
      `${selectedCount} of ${itemCount} selected`
    );

    this.importButton.disabled = selectedCount === 0 || this.isImporting;
    this.importButtonContinue.disabled =
      selectedCount === 0 || this.isImporting;
    this.importButton.setAttribute(
      'aria-label',
      `Import ${selectedCount} selected Zotero items and close`
    );
    this.importButtonContinue.setAttribute(
      'aria-label',
      `Import ${selectedCount} selected Zotero items and continue`
    );
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
    this.selectionAnchorKey = null;

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

  private selectRangeTo(
    targetKey: string,
    visibleItems: ZoteroMonitorItem[]
  ): boolean {
    if (!this.selectionAnchorKey) return false;

    const anchorIndex = visibleItems.findIndex(
      (item) => itemIdentity(item) === this.selectionAnchorKey
    );
    const targetIndex = visibleItems.findIndex(
      (item) => itemIdentity(item) === targetKey
    );

    if (anchorIndex === -1 || targetIndex === -1) return false;

    const start = Math.min(anchorIndex, targetIndex);
    const end = Math.max(anchorIndex, targetIndex);

    for (const item of visibleItems.slice(start, end + 1)) {
      this.selected.add(itemIdentity(item));
    }

    this.quickSelect = 'custom';
    this.renderList();
    return true;
  }

  private renderColumnHeader(
    header: HTMLTableRowElement,
    columnKey: ZoteroItemTableColumn
  ) {
    const column = ZOTERO_ITEM_TABLE_COLUMN_BY_KEY[columnKey];
    const cell = header.createEl('th', { cls: column.className });
    const button = cell.createEl('button', {
      cls: 'zt-monitor-sort-button',
      text: column.label,
    });
    const isActive = this.sortKey === column.key;
    button.toggleClass('is-active', isActive);
    button.setAttribute(
      'aria-sort',
      isActive ? (this.sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'
    );
    button.addEventListener('click', () => this.setSort(column.key));
    if (isActive) {
      button.createSpan({
        cls: 'zt-monitor-sort-indicator',
        text: this.sortDirection,
      });
    }
  }

  private renderTitleCell(
    row: HTMLTableRowElement,
    item: ZoteroMonitorItem,
    className: string
  ) {
    const titleCell = row.createEl('td', {
      cls: className,
    });
    const paperLink = getBestPaperLink(item);
    const titleText = item.title || item.citekey;
    const titleLink = titleCell.createEl('a', {
      cls: 'zt-monitor-table-title zt-monitor-paper-link',
      text: titleText,
    });
    titleLink.href = paperLink.href;
    titleLink.target = '_blank';
    titleLink.rel = 'noopener noreferrer';
    titleLink.setAttribute('aria-label', `${paperLink.title}: ${titleText}`);
    const linkRow = titleCell.createDiv('zt-monitor-paper-links');
    const sourceLink = linkRow.createEl('a', {
      cls: 'zt-monitor-paper-source-link',
      text: paperLink.label,
    });
    sourceLink.href = paperLink.href;
    sourceLink.target = '_blank';
    sourceLink.rel = 'noopener noreferrer';
  }

  private renderChipCell(
    row: HTMLTableRowElement,
    className: string,
    values: string[]
  ) {
    const cell = row.createEl('td', {
      cls: className,
    });

    if (values.length) {
      for (const value of values) {
        cell.createSpan({
          cls: 'zt-monitor-scope-chip',
          text: value,
        });
      }
      return;
    }

    cell.createSpan({
      cls: 'zt-monitor-empty-value',
      text: 'None',
    });
  }

  private renderItemCell(
    row: HTMLTableRowElement,
    item: ZoteroMonitorItem,
    columnKey: ZoteroItemTableColumn
  ) {
    const column = ZOTERO_ITEM_TABLE_COLUMN_BY_KEY[columnKey];

    if (column.key === 'title') {
      this.renderTitleCell(row, item, column.className);
      return;
    }

    if (isZoteroItemTableChipColumn(column.key)) {
      this.renderChipCell(
        row,
        column.className,
        getZoteroItemTableChipValues(item, column.key)
      );
      return;
    }

    row.createEl('td', {
      cls: column.className,
      text: getZoteroItemTableCellText(item, column.key),
    });
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
    header.createEl('th', { cls: 'zt-monitor-table-check' });
    for (const column of this.tableColumns) {
      this.renderColumnHeader(header, column);
    }

    const body = table.createEl('tbody');

    for (const item of filtered) {
      const key = itemIdentity(item);
      const row = body.createEl('tr');
      row.toggleClass('is-selected', this.selected.has(key));
      row.tabIndex = 0;

      const checkboxCell = row.createEl('td', {
        cls: 'zt-monitor-table-check',
      });
      const checkbox = checkboxCell.createEl('input');
      checkbox.type = 'checkbox';
      checkbox.checked = this.selected.has(key);
      const setSelected = (selected: boolean, updateAnchor = true) => {
        checkbox.checked = selected;

        if (selected) {
          this.selected.add(key);
        } else {
          this.selected.delete(key);
        }

        if (updateAnchor) {
          this.selectionAnchorKey = key;
        }

        this.quickSelect = 'custom';
        row.toggleClass('is-selected', selected);
        this.updateImportButtons();
        this.updateQuickSelectButtons();
      };

      checkbox.addEventListener('click', (event) => {
        if (!event.shiftKey) return;

        event.preventDefault();
        event.stopPropagation();
        if (!this.selectRangeTo(key, filtered)) {
          setSelected(true);
        }
      });
      checkbox.addEventListener('change', () => {
        setSelected(checkbox.checked);
      });
      row.addEventListener('click', (event) => {
        if (shouldIgnoreRowSelectionClick(event.target)) return;

        if (event.shiftKey && this.selectRangeTo(key, filtered)) {
          return;
        }

        setSelected(!checkbox.checked);
      });
      row.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        if (shouldIgnoreRowSelectionClick(event.target)) return;

        event.preventDefault();

        if (event.shiftKey && this.selectRangeTo(key, filtered)) {
          return;
        }

        setSelected(!checkbox.checked);
      });

      for (const column of this.tableColumns) {
        this.renderItemCell(row, item, column);
      }
    }

    this.updateImportButtons();
  }
}

class ZoteroUpdateNotesModal extends Modal {
  private selected = new Set<string>();
  private listEl: HTMLDivElement;
  private updateButton: HTMLButtonElement;
  private summaryEl: HTMLDivElement;
  private tableColumns: ZoteroItemTableColumn[];

  constructor(
    app: App,
    private notes: MatchedLiteratureNote[],
    tableColumns: string[],
    private onUpdate: (notes: MatchedLiteratureNote[]) => Promise<void>,
    private onFinished: () => void
  ) {
    super(app);
    this.tableColumns = normalizeZoteroItemTableColumns(tableColumns);

    for (const note of notes) {
      this.selected.add(note.file.path);
    }
  }

  onOpen() {
    this.contentEl.empty();
    this.modalEl.addClass('zt-monitor-modal-shell');

    const container = this.contentEl.createDiv('zt-monitor-modal');
    const header = container.createDiv('zt-monitor-header');
    header.createEl('h2', { text: 'Update existing Zotero notes' });
    header.createEl('p', {
      text: `${this.notes.length} Obsidian literature note${
        this.notes.length === 1 ? '' : 's'
      } can be refreshed from Zotero.`,
    });

    const actionBar = container.createDiv('zt-monitor-action-bar');
    this.summaryEl = actionBar.createDiv('zt-monitor-action-summary');
    const buttons = actionBar.createDiv('zt-monitor-buttons');
    const cancelButton = buttons.createEl('button', { text: 'Cancel' });
    cancelButton.type = 'button';
    cancelButton.addEventListener('click', () => this.close());

    this.updateButton = buttons.createEl('button', {
      text: 'Update selected',
    });
    this.updateButton.type = 'button';
    this.updateButton.addClass('mod-cta');
    this.updateButton.addEventListener('click', async () => {
      const selectedNotes = this.getSelectedNotes();
      if (!selectedNotes.length) return;

      this.updateButton.disabled = true;
      this.updateButton.setText('Updating...');

      try {
        await this.onUpdate(selectedNotes);
        this.close();
      } catch (error) {
        new Notice('Failed to update selected Zotero notes.', 10000);
        console.error(error);
        this.updateButton.disabled = false;
        this.updateButton.setText('Update selected');
      }
    });

    this.listEl = container.createDiv('zt-monitor-list');
    this.renderList();
  }

  onClose() {
    this.modalEl.removeClass('zt-monitor-modal-shell');
    this.contentEl.empty();
    this.onFinished();
  }

  private getSelectedNotes(): MatchedLiteratureNote[] {
    return this.notes.filter((note) => this.selected.has(note.file.path));
  }

  private updateSummary() {
    const selectedCount = this.getSelectedNotes().length;
    this.summaryEl.setText(`${selectedCount} of ${this.notes.length} selected`);
    this.updateButton.disabled = selectedCount === 0;
    this.updateButton.setText(`Update selected (${selectedCount})`);
  }

  private renderList() {
    this.listEl.empty();

    const table = this.listEl.createEl('table', {
      cls: 'zt-monitor-table zt-update-notes-table',
    });
    const header = table.createEl('thead').createEl('tr');
    header.createEl('th', { cls: 'zt-monitor-table-check' });
    header.createEl('th', { text: 'Note', cls: 'zt-monitor-table-note' });

    for (const column of this.tableColumns) {
      header.createEl('th', {
        text: ZOTERO_ITEM_TABLE_COLUMN_BY_KEY[column].label,
        cls: ZOTERO_ITEM_TABLE_COLUMN_BY_KEY[column].className,
      });
    }

    const body = table.createEl('tbody');
    for (const note of this.notes) {
      const row = body.createEl('tr');
      row.toggleClass('is-selected', this.selected.has(note.file.path));

      const checkbox = row
        .createEl('td', { cls: 'zt-monitor-table-check' })
        .createEl('input');
      checkbox.type = 'checkbox';
      checkbox.checked = this.selected.has(note.file.path);

      const setSelected = (selected: boolean) => {
        checkbox.checked = selected;
        if (selected) {
          this.selected.add(note.file.path);
        } else {
          this.selected.delete(note.file.path);
        }
        row.toggleClass('is-selected', selected);
        this.updateSummary();
      };

      checkbox.addEventListener('change', () => setSelected(checkbox.checked));
      row.addEventListener('click', (event) => {
        if (shouldIgnoreRowSelectionClick(event.target)) return;
        setSelected(!checkbox.checked);
      });

      row.createEl('td', {
        cls: 'zt-monitor-table-note',
        text: note.file.path,
      });

      for (const column of this.tableColumns) {
        renderConfiguredItemCell(row, note.item, column);
      }
    }

    this.updateSummary();
  }
}

class ZoteroOrphanedNotesModal extends Modal {
  private selected = new Set<string>();
  private listEl: HTMLDivElement;
  private flagButton: HTMLButtonElement;
  private summaryEl: HTMLDivElement;

  constructor(
    app: App,
    private notes: OrphanedLiteratureNote[],
    private orphanedProperty: string,
    private onFlag: (notes: OrphanedLiteratureNote[]) => Promise<void>,
    private onFinished: () => void
  ) {
    super(app);

    for (const note of notes) {
      this.selected.add(note.file.path);
    }
  }

  onOpen() {
    this.contentEl.empty();
    this.modalEl.addClass('zt-monitor-modal-shell');

    const container = this.contentEl.createDiv('zt-monitor-modal');
    const header = container.createDiv('zt-monitor-header');
    header.createEl('h2', { text: 'Notes without Zotero item' });
    header.createEl('p', {
      text: `${this.notes.length} Obsidian literature note${
        this.notes.length === 1 ? '' : 's'
      } have Zotero identity metadata but no matching Zotero item.`,
    });

    const actionBar = container.createDiv('zt-monitor-action-bar');
    this.summaryEl = actionBar.createDiv('zt-monitor-action-summary');
    const buttons = actionBar.createDiv('zt-monitor-buttons');
    const cancelButton = buttons.createEl('button', { text: 'Cancel' });
    cancelButton.type = 'button';
    cancelButton.addEventListener('click', () => this.close());

    this.flagButton = buttons.createEl('button', {
      text: 'Flag selected',
    });
    this.flagButton.type = 'button';
    this.flagButton.addClass('mod-cta');
    this.flagButton.addEventListener('click', async () => {
      const selectedNotes = this.getSelectedNotes();
      if (!selectedNotes.length) return;

      this.flagButton.disabled = true;
      this.flagButton.setText('Flagging...');

      try {
        await this.onFlag(selectedNotes);
        this.close();
      } catch (error) {
        new Notice('Failed to flag selected orphaned notes.', 10000);
        console.error(error);
        this.flagButton.disabled = false;
        this.flagButton.setText('Flag selected');
      }
    });

    this.listEl = container.createDiv('zt-monitor-list');
    this.renderList();
  }

  onClose() {
    this.modalEl.removeClass('zt-monitor-modal-shell');
    this.contentEl.empty();
    this.onFinished();
  }

  private getSelectedNotes(): OrphanedLiteratureNote[] {
    return this.notes.filter((note) => this.selected.has(note.file.path));
  }

  private updateSummary() {
    const selectedCount = this.getSelectedNotes().length;
    this.summaryEl.setText(
      `${selectedCount} of ${this.notes.length} selected. Flag property: ${this.orphanedProperty}`
    );
    this.flagButton.disabled = selectedCount === 0;
    this.flagButton.setText(`Flag selected (${selectedCount})`);
  }

  private renderList() {
    this.listEl.empty();

    const table = this.listEl.createEl('table', {
      cls: 'zt-monitor-table zt-orphaned-notes-table',
    });
    const header = table.createEl('thead').createEl('tr');
    header.createEl('th', { cls: 'zt-monitor-table-check' });
    header.createEl('th', { text: 'Note', cls: 'zt-monitor-table-note' });
    header.createEl('th', { text: 'Citekey', cls: 'zt-monitor-table-citekey' });
    header.createEl('th', { text: 'Library', cls: 'zt-monitor-table-library' });
    header.createEl('th', { text: 'Reason', cls: 'zt-monitor-table-scopes' });

    const body = table.createEl('tbody');
    for (const note of this.notes) {
      const row = body.createEl('tr');
      row.toggleClass('is-selected', this.selected.has(note.file.path));

      const checkbox = row
        .createEl('td', { cls: 'zt-monitor-table-check' })
        .createEl('input');
      checkbox.type = 'checkbox';
      checkbox.checked = this.selected.has(note.file.path);

      const setSelected = (selected: boolean) => {
        checkbox.checked = selected;
        if (selected) {
          this.selected.add(note.file.path);
        } else {
          this.selected.delete(note.file.path);
        }
        row.toggleClass('is-selected', selected);
        this.updateSummary();
      };

      checkbox.addEventListener('change', () => setSelected(checkbox.checked));
      row.addEventListener('click', (event) => {
        if (shouldIgnoreRowSelectionClick(event.target)) return;
        setSelected(!checkbox.checked);
      });

      row.createEl('td', {
        cls: 'zt-monitor-table-note',
        text: note.file.path,
      });
      row.createEl('td', {
        cls: 'zt-monitor-table-citekey',
        text: note.citekey || '',
      });
      row.createEl('td', {
        cls: 'zt-monitor-table-library',
        text: note.libraryID ? String(note.libraryID) : '',
      });
      row.createEl('td', {
        cls: 'zt-monitor-table-scopes',
        text: note.reason,
      });
    }

    this.updateSummary();
  }
}

export class ZoteroMonitor {
  private intervalId: number | null = null;
  private preloadTimeoutId: number | null = null;
  private checkInProgress = false;
  private modalOpen = false;
  private lastNoticeKey = '';
  private itemCache: MonitorItemCache | null = null;
  private itemCachePromise: Promise<ZoteroMonitorItem[]> | null = null;

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

    if (this.preloadTimeoutId !== null) {
      window.clearTimeout(this.preloadTimeoutId);
      this.preloadTimeoutId = null;
    }
  }

  preload(delayMs = MONITOR_PRELOAD_DELAY_MS) {
    if (this.preloadTimeoutId !== null) {
      window.clearTimeout(this.preloadTimeoutId);
    }

    const timeoutId = window.setTimeout(() => {
      this.preloadTimeoutId = null;
      this.refreshItemCache(false).catch((error) => {
        console.error('Failed to preload Zotero monitor cache', error);
      });
    }, delayMs);

    this.preloadTimeoutId = timeoutId;
  }

  invalidateCache() {
    this.itemCache = null;
    this.itemCachePromise = null;
    this.lastNoticeKey = '';
  }

  async runManualCheck() {
    await this.runCheck(true);
  }

  async runDirectImport() {
    new ZoteroDirectImportRequestModal(this.plugin.app, async (value) => {
      const items = await this.getRequestedImportItems(value);

      if (!items.length) {
        throw new Error('No matching Zotero items found for those citekeys.');
      }

      this.openImportItemsModal(
        items,
        'Import specific Zotero notes',
        `${items.length} Zotero item${
          items.length === 1 ? '' : 's'
        } matched the requested citekeys.`,
        ['Source: selected citekeys', ...this.getImportFormatSummary()],
        'all'
      );
    }).open();
  }

  async runUpdateNotesCheck() {
    if (this.modalOpen) return;

    this.modalOpen = true;
    try {
      const items = await this.getMonitorItems(true);
      const notes = this.getExistingLiteratureNotes();
      const matched = notes
        .map((note) => {
          const item = getMatchedItem(note, items);
          return item ? ({ ...note, item } as MatchedLiteratureNote) : null;
        })
        .filter((note): note is MatchedLiteratureNote => !!note);

      if (!matched.length) {
        this.modalOpen = false;
        new Notice('No existing Zotero literature notes found to update.');
        return;
      }

      new ZoteroUpdateNotesModal(
        this.plugin.app,
        matched,
        this.plugin.settings.zoteroItemTableColumns ||
          this.plugin.settings.zoteroMonitorTableColumns ||
          [],
        (selectedNotes) => this.updateExistingNotes(selectedNotes),
        () => {
          this.modalOpen = false;
        }
      ).open();
    } catch (error) {
      this.modalOpen = false;
      new Notice('Failed to check existing Zotero notes.', 10000);
      console.error(error);
    }
  }

  async runOrphanedNotesCheck() {
    if (this.modalOpen) return;

    this.modalOpen = true;
    try {
      const items = await this.getMonitorItems(true);
      const orphaned = this.getExistingLiteratureNotes()
        .filter((note) => !getMatchedItem(note, items))
        .map((note) => ({
          ...note,
          reason: getOrphanReason(note),
        }));

      if (!orphaned.length) {
        this.modalOpen = false;
        new Notice('No Obsidian literature notes without Zotero items found.');
        return;
      }

      new ZoteroOrphanedNotesModal(
        this.plugin.app,
        orphaned,
        this.getOrphanedProperty(),
        (selectedNotes) => this.flagOrphanedNotes(selectedNotes),
        () => {
          this.modalOpen = false;
        }
      ).open();
    } catch (error) {
      this.modalOpen = false;
      new Notice('Failed to check for notes without Zotero items.', 10000);
      console.error(error);
    }
  }

  async runSciteMetadataRefresh() {
    const files = this.plugin.app.vault.getMarkdownFiles();
    let refreshed = 0;
    let skipped = 0;
    let failed = 0;

    const notice = new Notice('Refreshing scite metadata...', 0);

    for (const file of files) {
      const frontmatter =
        this.plugin.app.metadataCache.getFileCache(file)?.frontmatter;
      if (!frontmatter) {
        skipped += 1;
        continue;
      }

      const doi = getNoteDoi(frontmatter as Record<string, any>);
      if (!doi) {
        skipped += 1;
        continue;
      }

      try {
        const properties = await fetchSciteTallies(
          doi,
          this.plugin.settings.zoteroSciteApiToken
        );
        await this.plugin.app.fileManager.processFrontMatter(
          file,
          (targetFrontmatter) => {
            applyScitePropertiesToFrontmatter(targetFrontmatter, properties);
          }
        );
        refreshed += 1;
      } catch (error) {
        failed += 1;
        console.error(error);
      }
    }

    notice.hide();
    new Notice(
      `Refreshed scite metadata for ${refreshed} note${
        refreshed === 1 ? '' : 's'
      }. ${skipped} skipped, ${failed} failed.`,
      10000
    );
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
    this.openImportItemsModal(
      missing,
      'Missing Zotero literature notes',
      `${missing.length} Zotero item${
        missing.length === 1 ? '' : 's'
      } are not represented by Obsidian note properties.`,
      this.getFilterSummary(),
      'today'
    );
  }

  private getDatabase(): DatabaseWithPort {
    return {
      database: this.plugin.settings.database,
      port: this.plugin.settings.port,
    };
  }

  private getDatabaseCacheKey(): string {
    const database = this.getDatabase();
    return `${database.database}:${database.port || ''}`;
  }

  private getCachedMonitorItems(): ZoteroMonitorItem[] | null {
    if (!this.itemCache) return null;
    if (this.itemCache.databaseKey !== this.getDatabaseCacheKey()) return null;
    if (Date.now() - this.itemCache.fetchedAt > MONITOR_ITEM_CACHE_TTL_MS) {
      return null;
    }

    return this.itemCache.items;
  }

  private async getMonitorItems(showConnectionNotice: boolean) {
    const cached = this.getCachedMonitorItems();
    if (cached) {
      return cached;
    }

    return this.refreshItemCache(showConnectionNotice);
  }

  private async refreshItemCache(
    showConnectionNotice: boolean
  ): Promise<ZoteroMonitorItem[]> {
    if (this.itemCachePromise) {
      return this.itemCachePromise;
    }

    const databaseKey = this.getDatabaseCacheKey();
    const database = this.getDatabase();

    this.itemCachePromise = (async () => {
      if (!(await isZoteroRunning(database, true))) {
        if (showConnectionNotice) {
          new Notice(
            'Cannot connect to Zotero. Please ensure it is running and Better BibTeX is installed.',
            10000
          );
        }

        return this.itemCache?.databaseKey === databaseKey
          ? this.itemCache.items
          : [];
      }

      const { citekeys } = await getAllCiteKeys(database, true);
      const items = citekeys.length
        ? await this.fetchMonitorItems(uniqueCandidates(citekeys), true)
        : [];

      this.itemCache = {
        databaseKey,
        fetchedAt: Date.now(),
        items,
      };

      return items;
    })();

    try {
      return await this.itemCachePromise;
    } finally {
      this.itemCachePromise = null;
    }
  }

  private removeItemsFromCache(items: ZoteroMonitorItem[]) {
    if (!this.itemCache) return;

    const imported = new Set(items.map((item) => itemIdentity(item)));
    this.itemCache = {
      ...this.itemCache,
      items: this.itemCache.items.filter(
        (item) => !imported.has(itemIdentity(item))
      ),
    };
    this.lastNoticeKey = '';
  }

  private getImportFormatSummary(): string[] {
    const exportFormatName =
      this.plugin.settings.zoteroMonitorImportFormat ||
      this.plugin.settings.exportFormats[0]?.name ||
      'first configured format';

    return [`Import format: ${exportFormatName}`];
  }

  private getMonitorExportFormat() {
    const exportFormatName =
      this.plugin.settings.zoteroMonitorImportFormat ||
      this.plugin.settings.exportFormats[0]?.name;

    return this.plugin.settings.exportFormats.find(
      (format) => format.name === exportFormatName
    );
  }

  private getOrphanedProperty(): string {
    return (
      this.plugin.settings.zoteroOrphanedProperty ||
      DEFAULT_ORPHANED_PROPERTY
    );
  }

  private openImportItemsModal(
    items: ZoteroMonitorItem[],
    title: string,
    description: string,
    filterSummary: string[],
    initialSelection: MonitorQuickSelect = 'today'
  ) {
    this.modalOpen = true;
    new ZoteroItemImportModal(
      this.plugin.app,
      items,
      this.plugin.settings.zoteroItemTableColumns ||
        this.plugin.settings.zoteroMonitorTableColumns ||
        [],
      title,
      description,
      filterSummary,
      (selectedItems, properties) => this.importItems(selectedItems, properties),
      () => {
        this.modalOpen = false;
      },
      initialSelection
    ).open();
  }

  private async getRequestedImportItems(
    value: string
  ): Promise<ZoteroMonitorItem[]> {
    const requested = parseRequestedCitekeys(value);
    if (!requested.length) return [];

    const items = await this.getMonitorItems(true);
    const selected = new Map<string, ZoteroMonitorItem>();

    for (const request of requested) {
      for (const item of items) {
        if (
          candidateMatchesRequest(
            {
              citekey: item.citekey,
              libraryID: item.libraryID,
              title: item.title,
            },
            request
          )
        ) {
          selected.set(itemIdentity(item), item);
        }
      }
    }

    return Array.from(selected.values());
  }

  private getExistingLiteratureNotes(): ExistingLiteratureNote[] {
    const notes: ExistingLiteratureNote[] = [];

    for (const file of this.plugin.app.vault.getMarkdownFiles()) {
      const frontmatter =
        this.plugin.app.metadataCache.getFileCache(file)?.frontmatter;
      if (!frontmatter) continue;

      const note = getExistingNoteIdentity(
        file,
        frontmatter as Record<string, any>
      );

      if (note) notes.push(note);
    }

    return notes;
  }

  private async updateExistingNotes(notes: MatchedLiteratureNote[]) {
    const exportFormat = this.getMonitorExportFormat();
    if (!exportFormat) {
      new Notice('No Zotero import format selected for updates.', 10000);
      return;
    }

    const database = this.getDatabase();
    const updatedPaths: string[] = [];
    const byLibrary = new Map<number, MatchedLiteratureNote[]>();

    for (const note of notes) {
      const libraryNotes = byLibrary.get(note.item.libraryID) || [];
      libraryNotes.push(note);
      byLibrary.set(note.item.libraryID, libraryNotes);
    }

    for (const libraryNotes of byLibrary.values()) {
      const pathOverrides: Record<string, string> = {};
      const citekeys: CiteKey[] = [];

      for (const note of libraryNotes) {
        pathOverrides[itemPathOverrideKey(note.item)] = note.file.path;
        citekeys.push({
          key: note.item.citekey,
          library: note.item.libraryID,
        });
      }

      const paths = await exportToMarkdown(
        {
          settings: this.plugin.settings,
          database,
          exportFormat,
          forceOverwrite: true,
          pathOverrides,
        },
        citekeys
      );
      updatedPaths.push(...paths);
    }

    await this.plugin.openNotes(updatedPaths);
    new Notice(
      `Updated ${updatedPaths.length} Zotero literature note${
        updatedPaths.length === 1 ? '' : 's'
      }.`
    );
  }

  private async flagOrphanedNotes(notes: OrphanedLiteratureNote[]) {
    const property = this.getOrphanedProperty();
    const checkedAt = new Date().toISOString();

    for (const note of notes) {
      await this.plugin.app.fileManager.processFrontMatter(
        note.file,
        (frontmatter) => {
          frontmatter[property] = true;
          frontmatter[ORPHANED_CHECKED_AT_PROPERTY] = checkedAt;
          frontmatter[ORPHANED_REASON_PROPERTY] = note.reason;
        }
      );
    }

    new Notice(
      `Flagged ${notes.length} Obsidian literature note${
        notes.length === 1 ? '' : 's'
      } without Zotero items.`
    );
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
    const items = await this.getMonitorItems(manual);
    if (!items.length) return [];

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
      await this.hydrateCollections(scoped, true);
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
    candidates: CiteKeyExport[],
    silent = false
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
          silent
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

  private async hydrateCollections(items: ZoteroMonitorItem[], silent = false) {
    const database = this.getDatabase();

    for (const item of items) {
      if (getItemCollectionPaths(item.item).length) continue;

      const collections = await getCollectionFromCiteKey(
        {
          key: item.citekey,
          library: item.libraryID,
        },
        database,
        silent
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
  ): Promise<string[]> {
    const exportFormat = this.getMonitorExportFormat();

    if (!exportFormat) {
      new Notice('No Zotero import format selected for the monitor.', 10000);
      return [];
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
      this.removeItemsFromCache(items);
    }

    if (createdOrUpdatedPaths.length) {
      new Notice(
        `Imported ${createdOrUpdatedPaths.length} Zotero literature note${
          createdOrUpdatedPaths.length === 1 ? '' : 's'
        }.`
      );
    }

    return createdOrUpdatedPaths;
  }
}
