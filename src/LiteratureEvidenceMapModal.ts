import { App, Modal, Notice, TFile, normalizePath, request } from 'obsidian';

import type ZoteroConnector from './main';
import {
  DEFAULT_LITERATURE_REPORT_FOLDER,
  DEFAULT_LITERATURE_REPORT_LANGUAGE,
  DEFAULT_LITERATURE_REPORT_MODEL,
  DEFAULT_LITERATURE_REPORT_OLLAMA_URL,
  DEFAULT_LITERATURE_REPORT_PROMPT,
  LiteratureReportCorpus,
  LiteratureReportNoteRecord,
  LiteratureReportScopeProperty,
  buildLiteratureReportCorpus,
  buildOllamaEvidenceMapRequest,
  collectLiteratureScopeValues,
  parseAiEvidenceMapContent,
  renderLiteratureEvidenceMapReport,
  validateAiEvidenceMap,
} from './LiteratureEvidenceMap';
import { mkMDDir, sanitizeFilePath } from './bbt/helpers';
import { removeStartingSlash } from './bbt/template.helpers';

type ScopeValuesByProperty = Record<LiteratureReportScopeProperty, string[]>;

function getMarkdownRecords(app: App): LiteratureReportNoteRecord[] {
  return app.vault.getMarkdownFiles().flatMap((file) => {
    const frontmatter = app.metadataCache.getFileCache(file)?.frontmatter;
    if (!frontmatter) return [];

    return [
      {
        path: file.path,
        basename: file.basename,
        frontmatter: frontmatter as Record<string, unknown>,
      },
    ];
  });
}

function normalizeOllamaBaseUrl(value: string): string {
  return (value || DEFAULT_LITERATURE_REPORT_OLLAMA_URL).replace(/\/+$/, '');
}

function plainScopeValue(value: string): string {
  const linkMatch = value.match(/^\[\[([^\]|]+)(?:\|([^\]]+))?\]\]$/);
  return (linkMatch ? linkMatch[2] || linkMatch[1] : value)
    .replace(/[\\/]+/g, ' ')
    .trim();
}

function reportDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

async function getUniqueReportPath(
  folder: string,
  scopeValue: string,
  generatedAt: Date
): Promise<string> {
  const baseFolder = folder || DEFAULT_LITERATURE_REPORT_FOLDER;
  const baseName = `${plainScopeValue(
    scopeValue
  )} literature evidence map ${reportDate(generatedAt)}`;
  const basePath = normalizePath(
    sanitizeFilePath(removeStartingSlash(`${baseFolder}/${baseName}.md`))
  );
  let path = basePath;
  let index = 2;
  while (await app.vault.adapter.exists(path)) {
    path = normalizePath(
      sanitizeFilePath(
        removeStartingSlash(`${baseFolder}/${baseName} ${index}.md`)
      )
    );
    index += 1;
  }

  return path;
}

async function requestOllamaEvidenceMap(
  settings: ZoteroConnector['settings'],
  corpus: LiteratureReportCorpus,
  additionalPrompt: string
) {
  const model = settings.zoteroLiteratureReportModel ||
    DEFAULT_LITERATURE_REPORT_MODEL;
  const baseUrl = normalizeOllamaBaseUrl(
    settings.zoteroLiteratureReportOllamaUrl ||
      DEFAULT_LITERATURE_REPORT_OLLAMA_URL
  );
  const requestBody = buildOllamaEvidenceMapRequest({
    corpus,
    basePrompt:
      settings.zoteroLiteratureReportPrompt ||
      DEFAULT_LITERATURE_REPORT_PROMPT,
    additionalPrompt,
    language:
      settings.zoteroLiteratureReportLanguage ||
      DEFAULT_LITERATURE_REPORT_LANGUAGE,
    model,
  });

  let responseText: string;
  try {
    responseText = await request({
      method: 'POST',
      url: `${baseUrl}/api/chat`,
      body: JSON.stringify(requestBody),
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    });
  } catch (error) {
    throw new Error(
      error instanceof Error
        ? `Could not reach local Ollama: ${error.message}`
        : 'Could not reach local Ollama.'
    );
  }

  let response: Record<string, any>;
  try {
    response = JSON.parse(responseText);
  } catch {
    throw new Error('Ollama returned a response that was not valid JSON.');
  }

  const content = response.message?.content || response.response;
  if (!content || typeof content !== 'string') {
    throw new Error('Ollama returned an empty evidence-map response.');
  }

  try {
    return validateAiEvidenceMap(
      parseAiEvidenceMapContent(content),
      corpus.evidence
    );
  } catch (error) {
    throw new Error(
      error instanceof Error
        ? `Ollama returned invalid evidence-map JSON: ${error.message}`
        : 'Ollama returned invalid evidence-map JSON.'
    );
  }
}

export function openLiteratureEvidenceMapModal(plugin: ZoteroConnector) {
  new LiteratureEvidenceMapModal(plugin).open();
}

class LiteratureEvidenceMapModal extends Modal {
  private scopeProperty: LiteratureReportScopeProperty = 'zoteroProject';
  private scopeValue = '';
  private scopeValues: ScopeValuesByProperty = {
    zoteroProject: [],
    zoteroTopic: [],
  };
  private additionalPromptEl: HTMLTextAreaElement;
  private previewEl: HTMLTextAreaElement;
  private statusEl: HTMLDivElement;
  private valueSelectEl: HTMLSelectElement;
  private generateButton: HTMLButtonElement;
  private saveButton: HTMLButtonElement;
  private reportMarkdown = '';
  private generatedAt: Date | null = null;

  constructor(private plugin: ZoteroConnector) {
    super(plugin.app);
  }

  onOpen() {
    this.contentEl.empty();
    this.modalEl.addClass('zt-literature-report-modal-shell');

    const records = getMarkdownRecords(this.app);
    this.scopeValues = {
      zoteroProject: collectLiteratureScopeValues(records, 'zoteroProject'),
      zoteroTopic: collectLiteratureScopeValues(records, 'zoteroTopic'),
    };
    this.scopeValue = this.scopeValues[this.scopeProperty][0] || '';

    const container = this.contentEl.createDiv('zt-literature-report-modal');
    const header = container.createDiv('zt-literature-report-header');
    header.createEl('h2', { text: 'Generate literature evidence map' });
    header.createEl('p', {
      text: 'Create a local Ollama draft from imported Zotero literature notes. Only claims with resolvable evidence IDs are rendered.',
    });

    const controls = container.createDiv('zt-literature-report-controls');
    this.renderScopeControls(controls);

    const promptField = controls.createDiv('zt-literature-report-field-wide');
    promptField.createEl('label', { text: 'Additional prompt' });
    this.additionalPromptEl = promptField.createEl('textarea');
    this.additionalPromptEl.rows = 3;
    this.additionalPromptEl.placeholder =
      'Optional focus, comparison, or report angle for this evidence map';

    const actionBar = container.createDiv('zt-literature-report-action-bar');
    this.statusEl = actionBar.createDiv('zt-literature-report-status');
    const buttons = actionBar.createDiv('zt-literature-report-buttons');

    const cancelButton = buttons.createEl('button', { text: 'Cancel' });
    cancelButton.type = 'button';
    cancelButton.addEventListener('click', () => this.close());

    this.generateButton = buttons.createEl('button', {
      text: 'Generate preview',
    });
    this.generateButton.type = 'button';
    this.generateButton.addClass('mod-cta');
    this.generateButton.addEventListener('click', () => {
      this.generatePreview();
    });

    this.saveButton = buttons.createEl('button', { text: 'Save report' });
    this.saveButton.type = 'button';
    this.saveButton.disabled = true;
    this.saveButton.addEventListener('click', () => {
      this.saveReport();
    });

    const previewField = container.createDiv('zt-literature-report-preview');
    previewField.createEl('label', { text: 'Markdown preview' });
    this.previewEl = previewField.createEl('textarea');
    this.previewEl.rows = 18;
    this.previewEl.placeholder = 'Generate a preview before saving the report.';
    this.previewEl.addEventListener('input', () => {
      this.reportMarkdown = this.previewEl.value;
      this.saveButton.disabled = !this.reportMarkdown.trim();
    });

    this.updateStatus();
  }

  onClose() {
    this.modalEl.removeClass('zt-literature-report-modal-shell');
    this.contentEl.empty();
  }

  private renderScopeControls(container: HTMLDivElement) {
    const propertyField = container.createDiv('zt-literature-report-field');
    propertyField.createEl('label', { text: 'Source property' });
    const propertySelect = propertyField.createEl('select');
    propertySelect.addClass('dropdown');

    for (const property of ['zoteroProject', 'zoteroTopic'] as const) {
      propertySelect.createEl('option', {
        text: property,
        value: property,
      });
    }

    propertySelect.value = this.scopeProperty;
    propertySelect.addEventListener('change', () => {
      this.scopeProperty =
        propertySelect.value as LiteratureReportScopeProperty;
      this.scopeValue = this.scopeValues[this.scopeProperty][0] || '';
      this.renderScopeValueOptions();
      this.clearPreview();
      this.updateStatus();
    });

    const valueField = container.createDiv('zt-literature-report-field');
    valueField.createEl('label', { text: 'Value' });
    this.valueSelectEl = valueField.createEl('select');
    this.valueSelectEl.addClass('dropdown');
    this.valueSelectEl.addEventListener('change', () => {
      this.scopeValue = this.valueSelectEl.value;
      this.clearPreview();
      this.updateStatus();
    });
    this.renderScopeValueOptions();
  }

  private renderScopeValueOptions() {
    if (!this.valueSelectEl) return;

    this.valueSelectEl.empty();
    const values = this.scopeValues[this.scopeProperty];

    if (!values.length) {
      this.valueSelectEl.createEl('option', {
        text: 'No values found',
        value: '',
      });
      this.valueSelectEl.disabled = true;
      return;
    }

    this.valueSelectEl.disabled = false;
    for (const value of values) {
      this.valueSelectEl.createEl('option', {
        text: value,
        value,
      });
    }
    this.valueSelectEl.value = this.scopeValue;
  }

  private async loadCorpus(): Promise<LiteratureReportCorpus> {
    const files = this.app.vault.getMarkdownFiles();
    const records: LiteratureReportNoteRecord[] = [];

    for (const file of files) {
      const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
      if (!frontmatter) continue;

      const markdown = await this.app.vault.cachedRead(file);
      records.push({
        path: file.path,
        basename: file.basename,
        frontmatter: frontmatter as Record<string, unknown>,
        markdown,
      });
    }

    return buildLiteratureReportCorpus(
      records,
      this.scopeProperty,
      this.scopeValue
    );
  }

  private async generatePreview() {
    if (!this.scopeValue) {
      this.setStatus('Choose a project or topic value first.');
      return;
    }

    this.setBusy(true);
    this.setStatus('Reading literature notes...');

    try {
      const corpus = await this.loadCorpus();
      if (!corpus.sources.length) {
        this.setStatus('No matching Zotero literature notes found.');
        return;
      }

      if (!corpus.evidence.length) {
        this.setStatus(
          'Matching notes did not contain abstracts or extractable annotation evidence.'
        );
        return;
      }

      this.setStatus(
        `Generating local evidence map from ${corpus.evidence.length} evidence records...`
      );
      const aiMap = await requestOllamaEvidenceMap(
        this.plugin.settings,
        corpus,
        this.additionalPromptEl.value.trim()
      );
      this.generatedAt = new Date();
      this.reportMarkdown = renderLiteratureEvidenceMapReport({
        corpus,
        aiMap,
        generatedAt: this.generatedAt,
        model:
          this.plugin.settings.zoteroLiteratureReportModel ||
          DEFAULT_LITERATURE_REPORT_MODEL,
        language:
          this.plugin.settings.zoteroLiteratureReportLanguage ||
          DEFAULT_LITERATURE_REPORT_LANGUAGE,
      });
      this.previewEl.value = this.reportMarkdown;
      this.saveButton.disabled = false;
      this.setStatus(
        `Preview generated from ${corpus.sources.length} source notes and ${corpus.evidence.length} evidence records.`
      );
    } catch (error) {
      console.error(error);
      this.setStatus(
        error instanceof Error
          ? error.message
          : 'Failed to generate literature evidence map.'
      );
      new Notice('Failed to generate literature evidence map.', 10000);
    } finally {
      this.setBusy(false);
    }
  }

  private async saveReport() {
    const markdown = this.reportMarkdown.trim();
    if (!markdown) return;

    this.setBusy(true);
    this.setStatus('Saving report...');

    try {
      const path = await getUniqueReportPath(
        this.plugin.settings.zoteroLiteratureReportFolder ||
          DEFAULT_LITERATURE_REPORT_FOLDER,
        this.scopeValue,
        this.generatedAt || new Date()
      );

      await mkMDDir(path);
      const file = await this.app.vault.create(path, `${markdown}\n`);
      if (file instanceof TFile) {
        await this.app.workspace.getLeaf(true).openFile(file);
      }
      new Notice(`Created literature evidence map: ${path}`);
      this.close();
    } catch (error) {
      console.error(error);
      this.setStatus(
        error instanceof Error ? error.message : 'Failed to save report.'
      );
      new Notice('Failed to save literature evidence map.', 10000);
    } finally {
      this.setBusy(false);
    }
  }

  private clearPreview() {
    this.reportMarkdown = '';
    if (this.previewEl) this.previewEl.value = '';
    if (this.saveButton) this.saveButton.disabled = true;
  }

  private setBusy(isBusy: boolean) {
    if (this.generateButton) this.generateButton.disabled = isBusy;
    if (this.saveButton) {
      this.saveButton.disabled = isBusy || !this.reportMarkdown.trim();
    }
    if (this.valueSelectEl) {
      this.valueSelectEl.disabled =
        isBusy || !this.scopeValues[this.scopeProperty].length;
    }
  }

  private updateStatus() {
    const values = this.scopeValues[this.scopeProperty] || [];
    if (!values.length) {
      this.setStatus(`No ${this.scopeProperty} values found in literature notes.`);
      return;
    }

    this.setStatus(
      `Ready to generate a report for ${this.scopeProperty} = ${this.scopeValue}.`
    );
  }

  private setStatus(message: string) {
    if (this.statusEl) this.statusEl.setText(message);
  }
}
