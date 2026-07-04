import {
  App,
  Modal,
  Notice,
  TFile,
  normalizePath,
  request,
  setIcon,
} from 'obsidian';

import {
  DEFAULT_LITERATURE_REPORT_FOLDER,
  DEFAULT_LITERATURE_REPORT_LANGUAGE,
  DEFAULT_LITERATURE_REPORT_MODE,
  DEFAULT_LITERATURE_REPORT_MODEL,
  DEFAULT_LITERATURE_REPORT_OLLAMA_URL,
  DEFAULT_LITERATURE_REPORT_PROMPT,
  LiteratureReportContext,
  LiteratureReportCorpus,
  LiteratureReportMode,
  LiteratureReportNoteRecord,
  LiteratureReportScopeProperty,
  buildLiteratureReportCorpus,
  buildLiteratureSynthesisReportFilename,
  buildOllamaLiteratureSynthesisRequest,
  buildOllamaLiteratureTriageRequest,
  buildOllamaSynthesisPromptRequest,
  buildOllamaSynthesisPromptRevisionRequest,
  collectLiteratureScopeValues,
  parseAiLiteratureSynthesisContent,
  parseAiLiteratureTriageContent,
  parseAiSynthesisPromptContent,
  renderLiteratureSynthesisReport,
  validateAiLiteratureSynthesis,
  validateAiLiteratureTriage,
} from './LiteratureEvidenceMap';
import { mkMDDir, sanitizeFilePath } from './bbt/helpers';
import { removeStartingSlash } from './bbt/template.helpers';
import type ZoteroConnector from './main';
import { openMarkdownOrBaseFilePicker } from './settings/select.helpers';

type ScopeValuesByProperty = Record<LiteratureReportScopeProperty, string[]>;
type PromptPreset = {
  id: string;
  name: string;
  description: string;
  prompt: string;
};

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

function corpusPreview(corpus: LiteratureReportCorpus): string {
  const abstracts = corpus.evidence.filter(
    (item) => item.kind === 'abstract'
  ).length;
  const annotations = corpus.evidence.filter(
    (item) => item.kind === 'annotation'
  ).length;
  const sciteSources = corpus.sources.filter(
    (source) => source.sciteCitingPublications !== undefined
  ).length;

  return `${corpus.sources.length} notes, ${abstracts} abstracts, ${annotations} annotations, ${sciteSources} with scite citation counts`;
}

const PROMPT_PRESETS: PromptPreset[] = [
  {
    id: 'theme-first',
    name: 'Theme-first synthesis',
    description: 'Prioritize cross-paper themes and conceptual integration.',
    prompt:
      'Create a project-centered synthesis around 4-6 major themes. Synthesize findings across papers and compare patterns, methods, and mechanisms rather than describing papers one by one.',
  },
  {
    id: 'mechanistic',
    name: 'Mechanistic focus',
    description: 'Emphasize causal pathways and process explanations.',
    prompt:
      'Prioritize mechanistic or causal explanations and how evidence converges on shared processes. Output themes that explicitly connect evidence to causal mechanisms relevant to the project context.',
  },
  {
    id: 'methods',
    name: 'Methods and evidence quality',
    description:
      'Surface methodological patterns and strengths/limitations behind claims.',
    prompt:
      'Group findings by methodological pattern and claim type. Prefer synthesis statements that compare methods and indicate where uncertainty and caveats are shared across papers.',
  },
  {
    id: 'gaps',
    name: 'Knowledge gaps',
    description:
      'Highlight open questions and under-represented aspects for this topic.',
    prompt:
      'After major synthesis themes, add a dedicated gap section with likely next questions and missing evidence types. Keep claims evidence-linked and avoid listing papers.',
  },
];

async function getUniqueReportPath(
  app: App,
  folder: string,
  descriptiveText: string,
  scopeValue: string,
  generatedAt: Date
): Promise<string> {
  const baseFolder = folder || DEFAULT_LITERATURE_REPORT_FOLDER;
  const filename = buildLiteratureSynthesisReportFilename(
    descriptiveText,
    scopeValue,
    generatedAt
  );
  const basePath = normalizePath(
    sanitizeFilePath(removeStartingSlash(`${baseFolder}/${filename}`))
  );
  let path = basePath;
  let index = 2;
  while (await app.vault.adapter.exists(path)) {
    path = normalizePath(
      sanitizeFilePath(
        removeStartingSlash(
          `${baseFolder}/${filename.replace(/\.md$/i, ` ${index}.md`)}`
        )
      )
    );
    index += 1;
  }

  return path;
}

async function requestOllamaContent(
  settings: ZoteroConnector['settings'],
  requestBody: Record<string, unknown>,
  emptyMessage: string
): Promise<string> {
  const baseUrl = normalizeOllamaBaseUrl(
    settings.zoteroLiteratureReportOllamaUrl ||
      DEFAULT_LITERATURE_REPORT_OLLAMA_URL
  );

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
    throw new Error(emptyMessage);
  }

  return content;
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
  private contextFileEl: HTMLInputElement;
  private generateButton: HTMLButtonElement;
  private generatePromptButton: HTMLButtonElement;
  private modeSelectEl: HTMLSelectElement;
  private pastedContextEl: HTMLTextAreaElement;
  private previewEl: HTMLTextAreaElement;
  private reportMarkdown = '';
  private revisePromptButton: HTMLButtonElement;
  private revisionInstructionEl: HTMLTextAreaElement;
  private saveButton: HTMLButtonElement;
  private statusEl: HTMLDivElement;
  private synthesisPromptEl: HTMLTextAreaElement;
  private titleInputEl: HTMLInputElement;
  private valueSelectEl: HTMLSelectElement;
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
    header.createEl('h2', { text: 'Generate literature synthesis report' });
    header.createEl('p', {
      text: 'Create a local Ollama synthesis from imported Zotero literature notes. Context guides relevance; only Zotero evidence IDs can support rendered claims.',
    });

    const controls = container.createDiv('zt-literature-report-controls');
    this.renderScopeControls(controls);
    this.renderTitleControl(controls);
    this.renderContextControls(controls);
    this.renderPromptControls(controls);

    const previewField = container.createDiv('zt-literature-report-preview');
    previewField.createEl('label', { text: 'Markdown preview' });
    this.previewEl = previewField.createEl('textarea');
    this.previewEl.rows = 18;
    this.previewEl.placeholder = 'Generate a preview before saving the report.';
    this.previewEl.addEventListener('input', () => {
      this.reportMarkdown = this.previewEl.value;
      this.saveButton.disabled = !this.reportMarkdown.trim();
    });

    const actionBar = container.createDiv('zt-literature-report-action-bar');
    this.statusEl = actionBar.createDiv('zt-literature-report-status');
    const buttons = actionBar.createDiv('zt-literature-report-buttons');

    const cancelButton = buttons.createEl('button', { text: 'Cancel' });
    cancelButton.type = 'button';
    cancelButton.addEventListener('click', () => this.close());

    this.generateButton = buttons.createEl('button', {
      text: 'Generate synthesis report',
    });
    this.generateButton.type = 'button';
    this.generateButton.addClass('mod-cta');
    this.generateButton.addEventListener('click', () => {
      void this.generatePreview();
    });

    this.saveButton = buttons.createEl('button', { text: 'Save report' });
    this.saveButton.type = 'button';
    this.saveButton.disabled = true;
    this.saveButton.addEventListener('click', () => {
      void this.saveReport();
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

    const modeField = container.createDiv('zt-literature-report-field');
    modeField.createEl('label', { text: 'Report detail' });
    this.modeSelectEl = modeField.createEl('select');
    this.modeSelectEl.addClass('dropdown');
    for (const mode of ['brief', 'standard', 'detailed'] as const) {
      this.modeSelectEl.createEl('option', {
        text: mode[0].toUpperCase() + mode.slice(1),
        value: mode,
      });
    }
    this.modeSelectEl.value = DEFAULT_LITERATURE_REPORT_MODE;
    this.modeSelectEl.addEventListener('change', () => this.clearPreview());
  }

  private renderTitleControl(container: HTMLDivElement) {
    const titleField = container.createDiv('zt-literature-report-field');
    titleField.createEl('label', { text: 'Short filename text' });
    this.titleInputEl = titleField.createEl('input');
    this.titleInputEl.type = 'text';
    this.titleInputEl.placeholder = 'Drought stress context';
    this.titleInputEl.addEventListener('input', () => this.clearPreview());
  }

  private renderContextControls(container: HTMLDivElement) {
    const contextFileField = container.createDiv(
      'zt-literature-report-field-wide'
    );
    contextFileField.createEl('label', { text: 'Reference context file' });
    const picker = contextFileField.createDiv('zt-picker-field');
    this.contextFileEl = picker.createEl('input');
    this.contextFileEl.type = 'text';
    this.contextFileEl.placeholder =
      'Optional project note, proposal, manuscript draft, or research question note';
    this.contextFileEl.addEventListener('input', () => this.clearPreview());
    const chooseButton = picker.createEl('button');
    chooseButton.type = 'button';
    chooseButton.addClass(
      'clickable-icon',
      'setting-editor-extra-setting-button',
      'zt-picker-button'
    );
    chooseButton.setAttribute('aria-label', 'Choose reference context file');
    const icon = chooseButton.createSpan();
    setIcon(icon, 'lucide-file-search');
    chooseButton.addEventListener('click', () => {
      openMarkdownOrBaseFilePicker((value) => {
        this.contextFileEl.value = value;
        this.clearPreview();
      });
    });

    const pastedField = container.createDiv('zt-literature-report-field-wide');
    pastedField.createEl('label', { text: 'Pasted reference context' });
    this.pastedContextEl = pastedField.createEl('textarea');
    this.pastedContextEl.rows = 4;
    this.pastedContextEl.placeholder =
      'Optional pasted project context. This guides relevance but is not cited as evidence.';
    this.pastedContextEl.addEventListener('input', () => this.clearPreview());
  }

  private renderPromptControls(container: HTMLDivElement) {
    const presetField = container.createDiv(
      'zt-literature-report-field-wide zt-literature-report-prompt-presets'
    );
    presetField.createEl('label', { text: 'Prompt builder kit' });
    const presetDescription = presetField.createEl('p');
    presetDescription.textContent =
      'Pick a starter template, then edit the prompt text as needed.';
    presetDescription.addClass('zt-literature-report-prompt-presets-help');
    const presetActions = presetField.createDiv('zt-literature-report-prompt-kit');
    for (const preset of PROMPT_PRESETS) {
      const presetButton = presetActions.createEl('button');
      presetButton.type = 'button';
      presetButton.textContent = preset.name;
      presetButton.title = preset.description;
      presetButton.addEventListener('click', () => {
        this.applyPromptPreset(preset);
      });
    }

    const promptField = container.createDiv('zt-literature-report-field-wide');
    promptField.createEl('label', { text: 'Synthesis prompt' });
    this.synthesisPromptEl = promptField.createEl('textarea');
    this.synthesisPromptEl.rows = 6;
    this.synthesisPromptEl.value =
      this.plugin.settings.zoteroLiteratureReportPrompt ||
      DEFAULT_LITERATURE_REPORT_PROMPT;
    this.synthesisPromptEl.addEventListener('input', () => this.clearPreview());

    const revisionField = container.createDiv(
      'zt-literature-report-field-wide'
    );
    revisionField.createEl('label', { text: 'Prompt revision instruction' });
    this.revisionInstructionEl = revisionField.createEl('textarea');
    this.revisionInstructionEl.rows = 2;
    this.revisionInstructionEl.placeholder =
      'Optional: explain how the synthesis prompt should be revised.';

    const promptActions = container.createDiv(
      'zt-literature-report-prompt-actions'
    );
    this.generatePromptButton = promptActions.createEl('button', {
      text: 'Generate synthesis prompt',
    });
    this.generatePromptButton.type = 'button';
    this.generatePromptButton.addEventListener('click', () => {
      void this.generateSynthesisPrompt();
    });

    this.revisePromptButton = promptActions.createEl('button', {
      text: 'Revise synthesis prompt',
    });
    this.revisePromptButton.type = 'button';
    this.revisePromptButton.addEventListener('click', () => {
      void this.reviseSynthesisPrompt();
    });
  }

  private applyPromptPreset(preset: PromptPreset) {
    const promptText = `${preset.prompt}\n\n${DEFAULT_LITERATURE_REPORT_PROMPT}`;
    this.synthesisPromptEl.value = promptText;
    this.clearPreview();
    this.setStatus(`Applied prompt preset: ${preset.name}.`);
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

  private getMode(): LiteratureReportMode {
    return (
      (this.modeSelectEl?.value as LiteratureReportMode) ||
      DEFAULT_LITERATURE_REPORT_MODE
    );
  }

  private async loadCorpus(): Promise<LiteratureReportCorpus> {
    const files = this.app.vault.getMarkdownFiles();
    const records: LiteratureReportNoteRecord[] = [];

    for (const file of files) {
      const frontmatter =
        this.app.metadataCache.getFileCache(file)?.frontmatter;
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

  private async getContext(): Promise<LiteratureReportContext> {
    const filePath = this.contextFileEl.value.trim();
    let fileText = '';
    if (filePath) {
      const file = this.app.vault.getAbstractFileByPath(filePath);
      if (!(file instanceof TFile)) {
        throw new Error(`Reference context file not found: ${filePath}`);
      }
      fileText = await this.app.vault.cachedRead(file);
    }

    return {
      filePath,
      fileText,
      pastedText: this.pastedContextEl.value.trim(),
    };
  }

  private model() {
    return (
      this.plugin.settings.zoteroLiteratureReportModel ||
      DEFAULT_LITERATURE_REPORT_MODEL
    );
  }

  private language() {
    return (
      this.plugin.settings.zoteroLiteratureReportLanguage ||
      DEFAULT_LITERATURE_REPORT_LANGUAGE
    );
  }

  private async yieldToUi(): Promise<void> {
    await new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => resolve());
    });
  }

  private async generateSynthesisPrompt() {
    if (!this.scopeValue) {
      this.setStatus('Choose a project or topic value first.');
      return;
    }

    this.setBusy(true);
    this.generatePromptButton.textContent = 'Generating prompt...';
    this.setStatus('Reading literature notes and context...');

    try {
      await this.yieldToUi();
      const corpus = await this.loadCorpus();
      if (!corpus.sources.length) {
        this.setStatus('No matching Zotero literature notes found.');
        return;
      }

      const context = await this.getContext();
      const requestBody = buildOllamaSynthesisPromptRequest({
        corpus,
        context,
        language: this.language(),
        model: this.model(),
        mode: this.getMode(),
      });
      this.setStatus(
        `Generating synthesis prompt from ${corpusPreview(corpus)}...`
      );
      const content = await requestOllamaContent(
        this.plugin.settings,
        requestBody,
        'Ollama returned an empty synthesis-prompt response.'
      );
      const prompt = parseAiSynthesisPromptContent(content);
      if (!prompt)
        throw new Error('Ollama returned an empty synthesis prompt.');

      this.synthesisPromptEl.value = prompt;
      this.clearPreview();
      this.setStatus(
        'Synthesis prompt generated. Review or revise it before generating the report.'
      );
    } catch (error) {
      console.error(error);
      this.setStatus(
        error instanceof Error
          ? error.message
          : 'Failed to generate synthesis prompt.'
      );
      new Notice('Failed to generate synthesis prompt.', 10000);
    } finally {
      this.generatePromptButton.textContent = 'Generate synthesis prompt';
      this.setBusy(false);
    }
  }

  private async reviseSynthesisPrompt() {
    const instruction = this.revisionInstructionEl.value.trim();
    if (!instruction) {
      this.setStatus('Add a prompt revision instruction first.');
      return;
    }

    this.setBusy(true);
    this.revisePromptButton.textContent = 'Revising prompt...';
    this.setStatus('Revising synthesis prompt...');

    try {
      await this.yieldToUi();
      const corpus = await this.loadCorpus();
      if (!corpus.sources.length) {
        this.setStatus('No matching Zotero literature notes found.');
        return;
      }

      const context = await this.getContext();
      const requestBody = buildOllamaSynthesisPromptRevisionRequest({
        corpus,
        context,
        language: this.language(),
        model: this.model(),
        mode: this.getMode(),
        currentPrompt:
          this.synthesisPromptEl.value.trim() ||
          DEFAULT_LITERATURE_REPORT_PROMPT,
        revisionInstruction: instruction,
      });
      const content = await requestOllamaContent(
        this.plugin.settings,
        requestBody,
        'Ollama returned an empty synthesis-prompt revision response.'
      );
      const prompt = parseAiSynthesisPromptContent(content);
      if (!prompt) {
        throw new Error('Ollama returned an empty revised synthesis prompt.');
      }

      this.synthesisPromptEl.value = prompt;
      this.clearPreview();
      this.setStatus(
        'Synthesis prompt revised. Review it before generating the report.'
      );
    } catch (error) {
      console.error(error);
      this.setStatus(
        error instanceof Error
          ? error.message
          : 'Failed to revise synthesis prompt.'
      );
      new Notice('Failed to revise synthesis prompt.', 10000);
    } finally {
      this.revisePromptButton.textContent = 'Revise synthesis prompt';
      this.setBusy(false);
    }
  }

  private async generatePreview() {
    if (!this.scopeValue) {
      this.setStatus('Choose a project or topic value first.');
      return;
    }

    this.setBusy(true);
    this.generateButton.textContent = 'Generating report...';
    this.setStatus('Reading literature notes...');

    try {
      await this.yieldToUi();
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

      const context = await this.getContext();
      const mode = this.getMode();
      const synthesisPrompt =
        this.synthesisPromptEl.value.trim() || DEFAULT_LITERATURE_REPORT_PROMPT;

      this.setStatus(
        `Scope preview: ${corpusPreview(corpus)}. Running relevance triage...`
      );
      const triageContent = await requestOllamaContent(
        this.plugin.settings,
        buildOllamaLiteratureTriageRequest({
          corpus,
          context,
          synthesisPrompt,
          language: this.language(),
          model: this.model(),
          mode,
        }),
        'Ollama returned an empty relevance-triage response.'
      );
      const triage = validateAiLiteratureTriage(
        parseAiLiteratureTriageContent(triageContent),
        corpus,
        mode
      );
      if (!triage.selectedEvidenceIds.length) {
        this.setStatus(
          'Relevance triage did not select any evidence records for this scope and context.'
        );
        return;
      }

      this.setStatus(
        `Generating synthesis from ${triage.selectedSources.length} selected papers and ${triage.selectedEvidenceIds.length} evidence records...`
      );
      const synthesisContent = await requestOllamaContent(
        this.plugin.settings,
        buildOllamaLiteratureSynthesisRequest({
          corpus,
          context,
          synthesisPrompt,
          language: this.language(),
          model: this.model(),
          mode,
          triage,
        }),
        'Ollama returned an empty literature-synthesis response.'
      );
      const selectedEvidence = corpus.evidence.filter((item) =>
        triage.selectedEvidenceIds.includes(item.id)
      );
      const synthesis = validateAiLiteratureSynthesis(
        parseAiLiteratureSynthesisContent(synthesisContent),
        selectedEvidence,
        corpus.sources,
        mode
      );

      this.generatedAt = new Date();
      this.reportMarkdown = renderLiteratureSynthesisReport({
        corpus,
        synthesis,
        triage,
        generatedAt: this.generatedAt,
        model: this.model(),
        language: this.language(),
        mode,
        synthesisPrompt,
        contextFilePath: context.filePath,
        pastedContextUsed: !!context.pastedText,
        reportTitle: this.titleInputEl.value.trim(),
      });
      this.previewEl.value = this.reportMarkdown;
      this.saveButton.disabled = false;
      this.setStatus(
        `Preview generated from ${corpus.sources.length} notes; ${triage.selectedEvidenceIds.length} evidence records were used after triage.`
      );
    } catch (error) {
      console.error(error);
      this.setStatus(
        error instanceof Error
          ? error.message
          : 'Failed to generate literature synthesis report.'
      );
      new Notice('Failed to generate literature synthesis report.', 10000);
    } finally {
      this.generateButton.textContent = 'Generate synthesis report';
      this.setBusy(false);
    }
  }

  private async saveReport() {
    const markdown = this.reportMarkdown.trim();
    if (!markdown) return;

    this.setBusy(true);
    this.saveButton.textContent = 'Saving report...';
    this.setStatus('Saving report...');

    try {
      await this.yieldToUi();
      const path = await getUniqueReportPath(
        this.app,
        this.plugin.settings.zoteroLiteratureReportFolder ||
          DEFAULT_LITERATURE_REPORT_FOLDER,
        this.titleInputEl.value.trim(),
        this.scopeValue,
        this.generatedAt || new Date()
      );

      await mkMDDir(path);
      const file = await this.app.vault.create(path, `${markdown}\n`);
      if (file instanceof TFile) {
        await this.app.workspace.getLeaf(true).openFile(file);
      }
      new Notice(`Created literature synthesis report: ${path}`);
      this.close();
    } catch (error) {
      console.error(error);
      this.setStatus(
        error instanceof Error ? error.message : 'Failed to save report.'
      );
      new Notice('Failed to save literature synthesis report.', 10000);
    } finally {
      this.saveButton.textContent = 'Save report';
      this.setBusy(false);
    }
  }

  private clearPreview() {
    this.reportMarkdown = '';
    if (this.previewEl) this.previewEl.value = '';
    if (this.saveButton) this.saveButton.disabled = true;
  }

  private setBusy(isBusy: boolean) {
    for (const button of [
      this.generateButton,
      this.generatePromptButton,
      this.revisePromptButton,
      this.saveButton,
    ]) {
      if (button) button.disabled = isBusy;
    }
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
      this.setStatus(
        `No ${this.scopeProperty} values found in literature notes.`
      );
      return;
    }

    this.setStatus(
      `Ready to generate a synthesis report for ${this.scopeProperty} = ${this.scopeValue}.`
    );
  }

  private setStatus(message: string) {
    if (this.statusEl) this.statusEl.setText(message);
  }
}
