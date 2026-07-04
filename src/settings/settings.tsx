import {
  App,
  FuzzySuggestModal,
  Notice,
  PluginSettingTab,
  debounce,
  request,
} from 'obsidian';
import React from 'react';
import ReactDOM from 'react-dom';
import which from 'which';

import {
  DEFAULT_LITERATURE_REPORT_FOLDER,
  DEFAULT_LITERATURE_REPORT_LANGUAGE,
  DEFAULT_LITERATURE_REPORT_MODEL,
  DEFAULT_LITERATURE_REPORT_OLLAMA_URL,
  DEFAULT_LITERATURE_REPORT_PROMPT,
} from '../LiteratureEvidenceMap';
import {
  getInvalidZoteroItemTableColumns,
  getZoteroItemTableColumnHelp,
  normalizeZoteroItemTableColumns,
} from '../ZoteroItemTable.columns';
import {
  ZOTERO_ANNOTATION_COLORS,
  ZOTERO_ANNOTATION_COLOR_HEX,
} from '../ZoteroManagedProperties';
import { formatScopeInput, splitScopeInput } from '../ZoteroMonitor.helpers';
import ZoteroConnector from '../main';
import {
  CitationFormat,
  ExportFormat,
  ZoteroConnectorSettings,
} from '../types';
import { AssetDownloader } from './AssetDownloader';
import { CiteFormatSettings } from './CiteFormatSettings';
import { ExportFormatSettings } from './ExportFormatSettings';
import { Icon } from './Icon';
import { SettingItem } from './SettingItem';
import {
  openFolderPicker,
  openMarkdownOrBaseFilePicker,
} from './select.helpers';
import { getInvalidPreservedProperties } from './validation';

interface SettingsComponentProps {
  app: App;
  settings: ZoteroConnectorSettings;
  addCiteFormat: (format: CitationFormat) => CitationFormat[];
  updateCiteFormat: (index: number, format: CitationFormat) => CitationFormat[];
  removeCiteFormat: (index: number) => CitationFormat[];
  addExportFormat: (format: ExportFormat) => ExportFormat[];
  updateExportFormat: (index: number, format: ExportFormat) => ExportFormat[];
  removeExportFormat: (index: number) => ExportFormat[];
  updateSetting: (key: keyof ZoteroConnectorSettings, value: any) => void;
  runZoteroMonitorCheck: () => void;
}

function splitLineInput(value: string): string[] {
  return value
    .split(/\n/g)
    .map((v) => v.trim())
    .filter((v) => !!v);
}

function formatLineInput(value?: string[]): string {
  return (value || []).join('\n');
}

function getVaultPropertyKeys(app: App): Set<string> {
  const keys = new Set<string>();

  for (const file of app.vault.getMarkdownFiles()) {
    const frontmatter = app.metadataCache.getFileCache(file)?.frontmatter;
    if (!frontmatter) continue;

    for (const key of Object.keys(frontmatter)) {
      keys.add(key);
    }
  }

  return keys;
}

function normalizeLiteratureReportOllamaBaseUrl(value: string): string {
  return (value || DEFAULT_LITERATURE_REPORT_OLLAMA_URL).replace(/\/+$/, '');
}

function normalizeOllamaModelName(value: string): string {
  return value.trim().replace(/:latest$/i, '');
}

function getOllamaModelNames(value: unknown): string[] {
  if (!value || typeof value !== 'object') return [];

  const models = (value as { models?: unknown }).models;
  if (!Array.isArray(models)) return [];

  const names = models.flatMap((model) => {
    if (!model || typeof model !== 'object') return [];

    const record = model as { name?: unknown; model?: unknown };
    return [record.name, record.model]
      .filter((entry): entry is string => typeof entry === 'string')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  });

  return Array.from(new Set(names)).sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: 'base' })
  );
}

async function requestOllamaModelNames(baseUrl: string): Promise<string[]> {
  const responseText = await request({
    method: 'GET',
    url: `${normalizeLiteratureReportOllamaBaseUrl(baseUrl)}/api/tags`,
    headers: {
      Accept: 'application/json',
    },
  });

  let response: unknown;
  try {
    response = JSON.parse(responseText);
  } catch {
    throw new Error('Ollama returned a response that was not valid JSON.');
  }

  return getOllamaModelNames(response);
}

class OllamaModelSelectModal extends FuzzySuggestModal<string> {
  constructor(
    app: App,
    private models: string[],
    private onChooseModel: (model: string) => void | Promise<void>
  ) {
    super(app);
    this.emptyStateText = 'No installed Ollama models found.';
    this.setPlaceholder('Choose an installed Ollama model');
  }

  getItems(): string[] {
    return this.models;
  }

  getItemText(model: string): string {
    return model;
  }

  onChooseItem(model: string): void {
    void this.onChooseModel(model);
    this.close();
  }
}

function SettingsDivider() {
  return <hr className="zt-settings-divider" />;
}

function SettingsSubheading({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="zt-settings-subheading">
      <div className="zt-settings-subheading-title">{title}</div>
      {description ? (
        <p className="zt-settings-subheading-description">{description}</p>
      ) : null}
    </div>
  );
}

function SettingsSection({
  title,
  description,
  children,
  collapsible = true,
  defaultOpen = true,
  level = 2,
}: React.PropsWithChildren<{
  title: string;
  description?: string;
  collapsible?: boolean;
  defaultOpen?: boolean;
  level?: 2 | 3;
}>) {
  const heading =
    level === 3 ? (
      <h3 className="zt-settings-section-title">{title}</h3>
    ) : (
      <h2 className="zt-settings-section-title">{title}</h2>
    );

  const body = (
    <>
      <div className="zt-settings-section-heading">
        {heading}
        {description ? (
          <p className="zt-settings-section-description">{description}</p>
        ) : null}
      </div>
      <div className="zt-settings-section-body">{children}</div>
    </>
  );

  if (collapsible) {
    return (
      <details
        className="zt-settings-section zt-settings-section-collapsible"
        open={defaultOpen}
      >
        <summary>
          <span>{title}</span>
          {description ? <small>{description}</small> : null}
        </summary>
        <div className="zt-settings-section-body">{children}</div>
      </details>
    );
  }

  return <section className="zt-settings-section">{body}</section>;
}

function ValidationWarning({
  label,
  values,
}: {
  label: string;
  values: string[];
}) {
  if (!values.length) return null;

  return (
    <div className="zt-settings-warning">
      {label}:{' '}
      {values.map((value) => (
        <code key={value}>{value}</code>
      ))}
    </div>
  );
}

function SettingsComponent({
  app,
  settings,
  addCiteFormat,
  updateCiteFormat,
  removeCiteFormat,
  addExportFormat,
  updateExportFormat,
  removeExportFormat,
  updateSetting,
  runZoteroMonitorCheck,
}: SettingsComponentProps) {
  const [citeFormatState, setCiteFormatState] = React.useState(
    settings.citeFormats
  );
  const [exportFormatState, setExportFormatState] = React.useState(
    settings.exportFormats
  );

  const [openNoteAfterImportState, setOpenNoteAfterImport] = React.useState(
    !!settings.openNoteAfterImport
  );

  const [ocrState, setOCRState] = React.useState(settings.pdfExportImageOCR);

  const [concat, setConcat] = React.useState(!!settings.shouldConcat);

  const [zoteroMonitorEnabled, setZoteroMonitorEnabled] = React.useState(
    !!settings.zoteroMonitorEnabled
  );

  const [zoteroMonitorStartup, setZoteroMonitorStartup] = React.useState(
    !!settings.zoteroMonitorCheckOnStartup
  );

  const [zoteroSciteEnabled, setZoteroSciteEnabled] = React.useState(
    !!settings.zoteroSciteEnabled
  );

  const [zoteroSciteRefreshOnImport, setZoteroSciteRefreshOnImport] =
    React.useState(settings.zoteroSciteRefreshOnImport !== false);

  const [zoteroItemTableColumnsText, setZoteroItemTableColumnsText] =
    React.useState(() =>
      formatLineInput(
        normalizeZoteroItemTableColumns(
          settings.zoteroItemTableColumns || settings.zoteroMonitorTableColumns
        )
      )
    );

  const [preservedPropertiesText, setPreservedPropertiesText] = React.useState(
    () => formatLineInput(settings.zoteroPreservedProperties)
  );
  const [literatureReportFolder, setLiteratureReportFolder] = React.useState(
    settings.zoteroLiteratureReportFolder || DEFAULT_LITERATURE_REPORT_FOLDER
  );
  const [literatureReportPrompt, setLiteratureReportPrompt] = React.useState(
    settings.zoteroLiteratureReportPrompt || DEFAULT_LITERATURE_REPORT_PROMPT
  );
  const [literatureReportOllamaUrl, setLiteratureReportOllamaUrl] =
    React.useState(
      settings.zoteroLiteratureReportOllamaUrl ||
        DEFAULT_LITERATURE_REPORT_OLLAMA_URL
    );
  const [literatureReportModel, setLiteratureReportModel] = React.useState(
    settings.zoteroLiteratureReportModel || DEFAULT_LITERATURE_REPORT_MODEL
  );
  const [ollamaModels, setOllamaModels] = React.useState<string[]>([]);
  const [ollamaModelStatus, setOllamaModelStatus] = React.useState(
    'Refresh models to list installed local Ollama models.'
  );
  const [isRefreshingOllamaModels, setIsRefreshingOllamaModels] =
    React.useState(false);

  const [taskAnnotationColors, setTaskAnnotationColors] = React.useState(
    settings.zoteroTaskAnnotationColors || []
  );

  const updateCite = React.useCallback(
    debounce(
      (index: number, format: CitationFormat) => {
        setCiteFormatState(updateCiteFormat(index, format));
      },
      200,
      true
    ),
    [updateCiteFormat]
  );

  const addCite = React.useCallback(() => {
    setCiteFormatState(
      addCiteFormat({
        name: `Format #${citeFormatState.length + 1}`,
        format: 'formatted-citation',
      })
    );
  }, [addCiteFormat, citeFormatState]);

  const removeCite = React.useCallback(
    (index: number) => {
      setCiteFormatState(removeCiteFormat(index));
    },
    [removeCiteFormat]
  );

  const updateExport = React.useCallback(
    debounce(
      (index: number, format: ExportFormat) => {
        setExportFormatState(updateExportFormat(index, format));
      },
      200,
      true
    ),
    [updateExportFormat]
  );

  const addExport = React.useCallback(() => {
    setExportFormatState(
      addExportFormat({
        name: `Import #${exportFormatState.length + 1}`,
        outputPathTemplate: '@{{citekey}}.md',
        imageOutputPathTemplate: 'images/',
        imageBaseNameTemplate: '@{{citekey}}-image',
      })
    );
  }, [addExportFormat, exportFormatState]);

  const removeExport = React.useCallback(
    (index: number) => {
      setExportFormatState(removeExportFormat(index));
    },
    [removeExportFormat]
  );

  const tessPathRef = React.useRef<HTMLInputElement>(null);
  const tessDataPathRef = React.useRef<HTMLInputElement>(null);

  const [useCustomPort, setUseCustomPort] = React.useState(
    settings.database === 'Custom'
  );

  const [noteImportFolder, setNoteImportFolder] = React.useState(
    settings.noteImportFolder
  );
  const [openFileAfterImportPath, setOpenFileAfterImportPath] = React.useState(
    settings.openFileAfterImportPath || ''
  );

  React.useEffect(() => {
    setNoteImportFolder(settings.noteImportFolder);
    setOpenFileAfterImportPath(settings.openFileAfterImportPath || '');
  }, [settings.noteImportFolder, settings.openFileAfterImportPath]);

  const onChangeNoteImportFolder = React.useCallback(
    (value: string) => {
      setNoteImportFolder(value);
      updateSetting('noteImportFolder', value);
    },
    [updateSetting]
  );
  const onChangeOpenFileAfterImportPath = React.useCallback(
    (value: string) => {
      setOpenFileAfterImportPath(value);
      updateSetting('openFileAfterImportPath', value.trim());
    },
    [updateSetting]
  );

  const zoteroItemTableColumns = React.useMemo(
    () => splitLineInput(zoteroItemTableColumnsText),
    [zoteroItemTableColumnsText]
  );
  const invalidZoteroItemTableColumns = React.useMemo(
    () => getInvalidZoteroItemTableColumns(zoteroItemTableColumns),
    [zoteroItemTableColumns]
  );
  const preservedProperties = React.useMemo(
    () => splitLineInput(preservedPropertiesText),
    [preservedPropertiesText]
  );
  const availablePropertyKeys = React.useMemo(
    () => getVaultPropertyKeys(app),
    [app]
  );
  const invalidPreservedProperties = React.useMemo(
    () =>
      getInvalidPreservedProperties(preservedProperties, availablePropertyKeys),
    [availablePropertyKeys, preservedProperties]
  );
  const onChangeLiteratureReportFolder = React.useCallback(
    (value: string) => {
      setLiteratureReportFolder(value);
      updateSetting('zoteroLiteratureReportFolder', value);
    },
    [updateSetting]
  );
  const onChangeLiteratureReportOllamaUrl = React.useCallback(
    (value: string) => {
      const next = value.trim();
      setLiteratureReportOllamaUrl(next);
      setOllamaModels([]);
      setOllamaModelStatus(
        'Refresh models to list installed local Ollama models.'
      );
      updateSetting('zoteroLiteratureReportOllamaUrl', next);
    },
    [updateSetting]
  );
  const onChangeLiteratureReportModel = React.useCallback(
    (value: string) => {
      const next = value.trim();
      setLiteratureReportModel(next);
      updateSetting('zoteroLiteratureReportModel', next);
    },
    [updateSetting]
  );
  const refreshLiteratureReportModels = React.useCallback(
    async (showNotice = true): Promise<string[]> => {
      setIsRefreshingOllamaModels(true);
      setOllamaModelStatus('Scanning installed local Ollama models...');

      try {
        const models = await requestOllamaModelNames(literatureReportOllamaUrl);
        setOllamaModels(models);

        if (!models.length) {
          setOllamaModelStatus('No installed Ollama models were returned.');
          if (showNotice) new Notice('No local Ollama models were found.');
          return [];
        }

        const hasSelectedModel = models.some(
          (model) =>
            normalizeOllamaModelName(model) ===
            normalizeOllamaModelName(literatureReportModel)
        );
        const selectedText = hasSelectedModel
          ? `Selected model is installed: ${literatureReportModel}.`
          : `Selected model is not in the detected list: ${literatureReportModel}.`;
        setOllamaModelStatus(
          `${selectedText} Detected ${models.length}: ${models.join(', ')}`
        );
        if (showNotice) new Notice('Local Ollama models refreshed.');
        return models;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Could not reach Ollama.';
        setOllamaModels([]);
        setOllamaModelStatus(`Could not read local Ollama models: ${message}`);
        if (showNotice)
          new Notice(`Could not read local Ollama models: ${message}`);
        return [];
      } finally {
        setIsRefreshingOllamaModels(false);
      }
    },
    [literatureReportModel, literatureReportOllamaUrl]
  );
  const chooseLiteratureReportModel = React.useCallback(async () => {
    const models = ollamaModels.length
      ? ollamaModels
      : await refreshLiteratureReportModels(false);

    if (!models.length) {
      new Notice('Refresh local Ollama models before choosing one.');
      return;
    }

    new OllamaModelSelectModal(
      app,
      models,
      onChangeLiteratureReportModel
    ).open();
  }, [
    app,
    ollamaModels,
    onChangeLiteratureReportModel,
    refreshLiteratureReportModels,
  ]);

  return (
    <div className="zt-settings-root">
      <SettingsSection
        title="Import basics"
        description="Connection and default behavior for importing Zotero notes."
      >
        <SettingsSubheading
          title="Zotero connection and PDF utility"
          description="Connection settings and the optional helper used to extract PDF annotations."
        />
        <AssetDownloader settings={settings} updateSetting={updateSetting} />
        <SettingItem
          name="Database"
          description="Supports Zotero and Juris-M. Use Custom only when Zotero is configured with a non-default port."
        >
          <select
            className="dropdown"
            defaultValue={settings.database}
            onChange={(e) => {
              const value = (e.target as HTMLSelectElement).value;
              updateSetting('database', value);
              setUseCustomPort(value === 'Custom');
            }}
          >
            <option value="Zotero">Zotero</option>
            <option value="Juris-M">Juris-M</option>
            <option value="Custom">Custom</option>
          </select>
        </SettingItem>
        {useCustomPort ? (
          <SettingItem
            name="Port number"
            description="If a custom port number has been set in Zotero, enter it here."
          >
            <input
              onChange={(e) =>
                updateSetting('port', (e.target as HTMLInputElement).value)
              }
              type="number"
              placeholder="Example: 23119"
              defaultValue={settings.port}
            />
          </SettingItem>
        ) : null}
        <SettingsSubheading
          title="Import behavior"
          description="Where imported notes go and what Obsidian opens after an import finishes."
        />
        <SettingItem
          name="Note Import Location"
          description="Default folder for new notes when an import format output path is only a file name. Output paths that already include folders are used as written."
        >
          <div className="zt-picker-field">
            <input
              type="text"
              value={noteImportFolder}
              placeholder="Type a folder path or choose one"
              onInput={(e) =>
                onChangeNoteImportFolder((e.target as HTMLInputElement).value)
              }
            />
            <button
              type="button"
              className="clickable-icon setting-editor-extra-setting-button zt-picker-button"
              aria-label="Choose note import folder"
              onClick={() => openFolderPicker(onChangeNoteImportFolder)}
            >
              <Icon name="lucide-folder-search" />
            </button>
          </div>
        </SettingItem>
        <SettingItem
          name="Open notes after import"
          description="Automatically open markdown files created or updated by imports."
        >
          <div
            onClick={() => {
              setOpenNoteAfterImport((state) => {
                updateSetting('openNoteAfterImport', !state);
                return !state;
              });
            }}
            className={`checkbox-container${
              openNoteAfterImportState ? ' is-enabled' : ''
            }`}
          />
        </SettingItem>
        <SettingItem
          name="Which notes to open"
          description="Open either the first note imported, the last note imported, or all notes in new tabs."
        >
          <select
            className="dropdown"
            defaultValue={settings.whichNotesToOpenAfterImport}
            disabled={!openNoteAfterImportState}
            onChange={(e) =>
              updateSetting(
                'whichNotesToOpenAfterImport',
                (e.target as HTMLSelectElement).value
              )
            }
          >
            <option value="first-imported-note">First imported note</option>
            <option value="last-imported-note">Last imported note</option>
            <option value="all-imported-notes">All imported notes</option>
          </select>
        </SettingItem>
        <SettingItem
          name="Open specific file after import"
          description="Optional. Open this markdown or base file after a successful import or update, for example a Bases literature overview."
        >
          <div className="zt-picker-field">
            <input
              type="text"
              value={openFileAfterImportPath}
              placeholder="Type a note or base path, or choose one"
              onInput={(e) =>
                onChangeOpenFileAfterImportPath(
                  (e.target as HTMLInputElement).value
                )
              }
            />
            <button
              type="button"
              className="clickable-icon setting-editor-extra-setting-button zt-picker-button"
              aria-label="Choose file to open after import"
              onClick={() =>
                openMarkdownOrBaseFilePicker(onChangeOpenFileAfterImportPath)
              }
            >
              <Icon name="lucide-file-search" />
            </button>
          </div>
        </SettingItem>
        <SettingItem
          name="Annotation concatenation"
          description="Annotations extracted from PDFs that begin with '+' will be appended to the previous annotation."
        >
          <div
            onClick={() => {
              setConcat((state) => {
                updateSetting('shouldConcat', !state);
                return !state;
              });
            }}
            className={`checkbox-container${concat ? ' is-enabled' : ''}`}
          />
        </SettingItem>
      </SettingsSection>

      <SettingsDivider />

      <SettingsSection
        title="Metadata and properties"
        description="Frontmatter behavior and shared Zotero item table display."
      >
        <SettingsSubheading
          title="Frontmatter preservation"
          description="Metadata that should survive note updates and re-imports."
        />
        <SettingItem
          name="Preserved properties"
          description="Existing frontmatter properties copied back after an update or re-import. Use one property per line."
          className="zt-setting-item-wide"
        >
          <div className="zt-settings-textarea-field">
            <textarea
              spellCheck={false}
              rows={6}
              value={preservedPropertiesText}
              onChange={(e) => {
                const value = (e.target as HTMLTextAreaElement).value;
                setPreservedPropertiesText(value);
                updateSetting(
                  'zoteroPreservedProperties',
                  splitLineInput(value)
                );
              }}
            />
            <p className="zt-settings-field-note">
              This applies when an existing note is overwritten. Known
              Zotero/frontmatter keys and properties already present in this
              vault are accepted.
            </p>
            <ValidationWarning
              label="Unknown preserved properties"
              values={invalidPreservedProperties}
            />
          </div>
        </SettingItem>
        <SettingsSubheading
          title="Review table and annotations"
          description="Display fields used in Zotero item lists and colors that indicate follow-up annotations."
        />
        <SettingItem
          name="Zotero item table columns"
          description="Columns shown by Zotero item import/review tables. Use one key per line; order controls table order."
          className="zt-setting-item-wide"
        >
          <div className="zt-settings-textarea-field">
            <textarea
              spellCheck={false}
              rows={8}
              value={zoteroItemTableColumnsText}
              onChange={(e) => {
                const value = (e.target as HTMLTextAreaElement).value;
                setZoteroItemTableColumnsText(value);
                updateSetting('zoteroItemTableColumns', splitLineInput(value));
              }}
            />
            <p className="zt-settings-field-note">
              Supported keys: {getZoteroItemTableColumnHelp()}. Aliases: journal
              uses publication, type uses itemType.
            </p>
            <ValidationWarning
              label="Unknown table columns"
              values={invalidZoteroItemTableColumns}
            />
          </div>
        </SettingItem>
        <SettingItem
          name="Annotation task colors"
          description="Zotero annotation colors that should mark a paper as having follow-up work."
        >
          <div className="zt-managed-color-list">
            {ZOTERO_ANNOTATION_COLORS.map((color) => {
              const isEnabled = taskAnnotationColors.includes(color);

              return (
                <button
                  key={color}
                  type="button"
                  className={`zt-managed-color-button${
                    isEnabled ? ' is-active' : ''
                  }`}
                  onClick={() => {
                    setTaskAnnotationColors((state) => {
                      const next = state.includes(color)
                        ? state.filter((item) => item !== color)
                        : [...state, color];
                      updateSetting('zoteroTaskAnnotationColors', next);
                      return next;
                    });
                  }}
                >
                  <span
                    className="zt-managed-color-chip"
                    style={{
                      backgroundColor: ZOTERO_ANNOTATION_COLOR_HEX[color],
                    }}
                  />
                  {color}
                </button>
              );
            })}
          </div>
        </SettingItem>
      </SettingsSection>

      <SettingsDivider />

      <SettingsSection
        title="scite metadata"
        description="Optional citation-statement tallies for imported literature notes."
        collapsible
        defaultOpen={!!settings.zoteroSciteEnabled}
      >
        <SettingItem
          name="Enable scite metadata"
          description="Allow imports to request scite metadata for notes with a DOI. The refresh command can still be run manually."
        >
          <div
            onClick={() => {
              setZoteroSciteEnabled((state) => {
                updateSetting('zoteroSciteEnabled', !state);
                return !state;
              });
            }}
            className={`checkbox-container${
              zoteroSciteEnabled ? ' is-enabled' : ''
            }`}
          />
        </SettingItem>
        <SettingItem
          name="Refresh scite on import"
          description="When scite metadata is enabled, add or update scite frontmatter after each successful import."
        >
          <div
            onClick={() => {
              setZoteroSciteRefreshOnImport((state) => {
                updateSetting('zoteroSciteRefreshOnImport', !state);
                return !state;
              });
            }}
            className={`checkbox-container${
              zoteroSciteRefreshOnImport ? ' is-enabled' : ''
            }`}
          />
        </SettingItem>
        <SettingItem
          name="scite API token"
          description="Optional. Leave blank for unauthenticated requests; add a token if your scite account requires one."
        >
          <input
            type="password"
            spellCheck={false}
            defaultValue={settings.zoteroSciteApiToken || ''}
            onChange={(e) =>
              updateSetting(
                'zoteroSciteApiToken',
                (e.target as HTMLInputElement).value.trim()
              )
            }
          />
        </SettingItem>
      </SettingsSection>

      <SettingsDivider />

      <SettingsSection
        title="Missing references and monitor"
        description="Find recent Zotero items that do not yet have Obsidian literature-note properties."
      >
        <SettingsSubheading
          title="Review workflow"
          description="Manual review and import behavior for Zotero items not yet represented by Obsidian notes."
        />
        <SettingItem
          name="Enable Zotero monitor"
          description="Check Zotero for recently added citekeyed items that are missing Obsidian literature-note properties."
        >
          <div
            onClick={() => {
              setZoteroMonitorEnabled((state) => {
                updateSetting('zoteroMonitorEnabled', !state);
                return !state;
              });
            }}
            className={`checkbox-container${
              zoteroMonitorEnabled ? ' is-enabled' : ''
            }`}
          />
        </SettingItem>
        <SettingItem
          name="Automatic check behavior"
          description="Choose what happens when a background check finds missing Zotero references."
        >
          <select
            className="dropdown"
            defaultValue={settings.zoteroMonitorAutomaticAction}
            onChange={(e) =>
              updateSetting(
                'zoteroMonitorAutomaticAction',
                (e.target as HTMLSelectElement).value as any
              )
            }
          >
            <option value="notice">Show notice</option>
            <option value="modal">Open import modal</option>
          </select>
        </SettingItem>
        <SettingItem
          name="Monitor import format"
          description="Import format used by missing-note imports and updates. Leave blank to use the first import format."
        >
          <select
            className="dropdown"
            defaultValue={settings.zoteroMonitorImportFormat || ''}
            onChange={(e) =>
              updateSetting(
                'zoteroMonitorImportFormat',
                (e.target as HTMLSelectElement).value
              )
            }
          >
            <option value="">First import format</option>
            {exportFormatState.map((format, index) => (
              <option key={index} value={format.name}>
                {format.name}
              </option>
            ))}
          </select>
        </SettingItem>
        <SettingItem
          name="Check Zotero now"
          description="Run a manual missing-reference check using the monitor settings above."
        >
          <button onClick={runZoteroMonitorCheck}>Check now</button>
        </SettingItem>
      </SettingsSection>

      <SettingsDivider />

      <SettingsSection
        title="Monitor filters and schedule"
        description="Optional background checks and filters for missing-reference detection."
        collapsible
        defaultOpen={false}
      >
        <SettingItem
          name="Check when Obsidian starts"
          description="Run the monitor after the workspace loads. The monitor must also be enabled."
        >
          <div
            onClick={() => {
              setZoteroMonitorStartup((state) => {
                updateSetting('zoteroMonitorCheckOnStartup', !state);
                return !state;
              });
            }}
            className={`checkbox-container${
              zoteroMonitorStartup ? ' is-enabled' : ''
            }`}
          />
        </SettingItem>
        <SettingItem
          name="Check interval"
          description="Minutes between automatic checks. Use 0 to disable recurring checks."
        >
          <input
            min="0"
            type="number"
            defaultValue={settings.zoteroMonitorIntervalMinutes.toString()}
            onChange={(e) =>
              updateSetting(
                'zoteroMonitorIntervalMinutes',
                Number((e.target as HTMLInputElement).value)
              )
            }
          />
        </SettingItem>
        <SettingItem
          name="Recent Zotero items"
          description="Only consider items added to Zotero within this many days. Leave blank for all time."
        >
          <input
            min="0"
            type="number"
            placeholder="30"
            defaultValue={settings.zoteroMonitorRecentDays?.toString() || ''}
            onChange={(e) => {
              const value = (e.target as HTMLInputElement).value;
              updateSetting(
                'zoteroMonitorRecentDays',
                value === '' ? null : Number(value)
              );
            }}
          />
        </SettingItem>
        <SettingItem
          name="Libraries or groups"
          description="Optional comma-separated Zotero library IDs or library/group names. Leave blank for all libraries."
        >
          <input
            type="text"
            spellCheck={false}
            placeholder="1, My Group Library"
            defaultValue={formatScopeInput(settings.zoteroMonitorLibraryScope)}
            onChange={(e) =>
              updateSetting(
                'zoteroMonitorLibraryScope',
                splitScopeInput((e.target as HTMLInputElement).value)
              )
            }
          />
        </SettingItem>
        <SettingItem
          name="Collection paths"
          description="Optional comma-separated exact Zotero collection paths, such as Reading/Queue."
        >
          <input
            type="text"
            spellCheck={false}
            placeholder="Reading/Queue"
            defaultValue={formatScopeInput(
              settings.zoteroMonitorCollectionScope
            )}
            onChange={(e) =>
              updateSetting(
                'zoteroMonitorCollectionScope',
                splitScopeInput((e.target as HTMLInputElement).value)
              )
            }
          />
        </SettingItem>
        <SettingItem
          name="Tags"
          description="Optional comma-separated exact Zotero tags. Leave blank for all tags."
        >
          <input
            type="text"
            spellCheck={false}
            placeholder="to-read, paper"
            defaultValue={formatScopeInput(settings.zoteroMonitorTagScope)}
            onChange={(e) =>
              updateSetting(
                'zoteroMonitorTagScope',
                splitScopeInput((e.target as HTMLInputElement).value)
              )
            }
          />
        </SettingItem>
      </SettingsSection>

      <SettingsDivider />

      <SettingsSection
        title="Literature reports"
        description="Generate local Ollama synthesis reports from imported Zotero literature notes."
      >
        <SettingsSubheading
          title="Report output"
          description="Where generated synthesis notes are saved."
        />
        <SettingItem
          name="Report folder"
          description="Folder where generated literature synthesis reports are saved."
        >
          <div className="zt-picker-field">
            <input
              type="text"
              value={literatureReportFolder}
              placeholder={DEFAULT_LITERATURE_REPORT_FOLDER}
              onInput={(e) =>
                onChangeLiteratureReportFolder(
                  (e.target as HTMLInputElement).value
                )
              }
            />
            <button
              type="button"
              className="clickable-icon setting-editor-extra-setting-button zt-picker-button"
              aria-label="Choose report folder"
              onClick={() => openFolderPicker(onChangeLiteratureReportFolder)}
            >
              <Icon name="lucide-folder-search" />
            </button>
          </div>
        </SettingItem>
        <SettingsSubheading
          title="Local Ollama"
          description="Local-only model endpoint used when generating the editable report preview."
        />
        <SettingItem
          name="Ollama URL"
          description="Local Ollama server URL. Report generation only sends evidence records to this local endpoint."
        >
          <input
            type="text"
            spellCheck={false}
            value={literatureReportOllamaUrl}
            onInput={(e) =>
              onChangeLiteratureReportOllamaUrl(
                (e.target as HTMLInputElement).value
              )
            }
          />
        </SettingItem>
        <SettingItem
          name="Ollama model"
          description="Local model used for literature synthesis; refresh installed models to choose one."
        >
          <div className="zt-ollama-model-field">
            <div className="zt-ollama-model-control">
              <input
                type="text"
                spellCheck={false}
                value={literatureReportModel}
                onInput={(e) =>
                  onChangeLiteratureReportModel(
                    (e.target as HTMLInputElement).value
                  )
                }
              />
              <button
                type="button"
                disabled={isRefreshingOllamaModels}
                onClick={chooseLiteratureReportModel}
              >
                Choose installed model
              </button>
              <button
                type="button"
                disabled={isRefreshingOllamaModels}
                onClick={() => {
                  void refreshLiteratureReportModels();
                }}
              >
                {isRefreshingOllamaModels ? 'Refreshing...' : 'Refresh models'}
              </button>
            </div>
            <p className="zt-settings-field-note">{ollamaModelStatus}</p>
          </div>
        </SettingItem>
        <SettingItem
          name="Ollama model status"
          description="Check whether the configured local Ollama URL is reachable and returns installed models."
        >
          <button
            type="button"
            disabled={isRefreshingOllamaModels}
            onClick={() => {
              void refreshLiteratureReportModels();
            }}
          >
            Check Ollama
          </button>
        </SettingItem>
        <SettingItem
          name="Report language"
          description="Output language requested from the local model."
        >
          <input
            type="text"
            spellCheck={false}
            defaultValue={
              settings.zoteroLiteratureReportLanguage ||
              DEFAULT_LITERATURE_REPORT_LANGUAGE
            }
            onChange={(e) =>
              updateSetting(
                'zoteroLiteratureReportLanguage',
                (e.target as HTMLInputElement).value.trim()
              )
            }
          />
        </SettingItem>
        <SettingsSubheading
          title="Prompt template"
          description="Reusable default instructions for project-centered literature synthesis."
        />
        <SettingItem
          name="Synthesis prompt"
          description="Default prompt used for literature synthesis. The modal can generate, revise, and edit a report-specific prompt."
          className="zt-setting-item-wide"
        >
          <div className="zt-settings-textarea-field">
            <textarea
              spellCheck={false}
              rows={8}
              value={literatureReportPrompt}
              onChange={(e) => {
                const value = (e.target as HTMLTextAreaElement).value;
                setLiteratureReportPrompt(value);
                updateSetting('zoteroLiteratureReportPrompt', value);
              }}
            />
            <p className="zt-settings-field-note">
              Context can guide relevance, but the renderer omits AI claims that
              do not cite valid evidence IDs extracted from local notes.
            </p>
            <button
              type="button"
              onClick={() => {
                setLiteratureReportPrompt(DEFAULT_LITERATURE_REPORT_PROMPT);
                updateSetting(
                  'zoteroLiteratureReportPrompt',
                  DEFAULT_LITERATURE_REPORT_PROMPT
                );
              }}
            >
              Reset prompt
            </button>
          </div>
        </SettingItem>
      </SettingsSection>

      <SettingsDivider />

      <SettingsSection
        title="Citation formats"
        description="Commands that insert formatted citations or rendered citation templates."
      >
        <SettingItem
          name="Add citation format"
          description="Create another command for inserting citations, bibliographies, or citation templates."
        >
          <button onClick={addCite} className="mod-cta">
            Add Citation Format
          </button>
        </SettingItem>
        {citeFormatState.map((f, i) => {
          return (
            <CiteFormatSettings
              key={i}
              format={f}
              index={i}
              updateFormat={updateCite}
              removeFormat={removeCite}
            />
          );
        })}
      </SettingsSection>

      <SettingsDivider />

      <SettingsSection
        title="Import formats"
        description="Templates and output paths used by Zotero import commands."
      >
        <SettingItem
          name="Add import format"
          description="Create another Zotero import command with its own output paths and template."
        >
          <button onClick={addExport} className="mod-cta">
            Add Import Format
          </button>
        </SettingItem>
        {exportFormatState.map((f, i) => {
          return (
            <ExportFormatSettings
              key={exportFormatState.length - i}
              format={f}
              index={i}
              updateFormat={updateExport}
              removeFormat={removeExport}
            />
          );
        })}
      </SettingsSection>

      <SettingsDivider />

      <SettingsSection
        title="Advanced image and OCR settings"
        description="Rectangle annotations can be extracted from PDFs as images."
        collapsible
        defaultOpen={false}
      >
        <SettingItem
          name="Image Format"
          description="File format used when rectangle annotations are exported as images."
        >
          <select
            className="dropdown"
            defaultValue={settings.pdfExportImageFormat}
            onChange={(e) =>
              updateSetting(
                'pdfExportImageFormat',
                (e.target as HTMLSelectElement).value
              )
            }
          >
            <option value="jpg">jpg</option>
            <option value="png">png</option>
          </select>
        </SettingItem>
        <SettingItem
          name="Image Quality (jpg only)"
          description="JPEG quality for exported annotation images, from 0 to 100."
        >
          <input
            min="0"
            max="100"
            onChange={(e) =>
              updateSetting(
                'pdfExportImageQuality',
                Number((e.target as HTMLInputElement).value)
              )
            }
            type="number"
            defaultValue={settings.pdfExportImageQuality.toString()}
          />
        </SettingItem>
        <SettingItem
          name="Image DPI"
          description="Resolution used when rendering rectangle annotations from PDFs."
        >
          <input
            min="0"
            onChange={(e) =>
              updateSetting(
                'pdfExportImageDPI',
                Number((e.target as HTMLInputElement).value)
              )
            }
            type="number"
            defaultValue={settings.pdfExportImageDPI.toString()}
          />
        </SettingItem>
        <SettingItem
          name="Image OCR"
          description="Attempt text extraction from rectangle annotation images using local Tesseract."
        >
          <div
            onClick={() =>
              setOCRState((s) => {
                updateSetting('pdfExportImageOCR', !s);
                return !s;
              })
            }
            className={`checkbox-container${ocrState ? ' is-enabled' : ''}`}
          />
        </SettingItem>
        <SettingItem
          name="Tesseract path"
          description="Absolute path to the local tesseract executable used for OCR."
        >
          <input
            ref={tessPathRef}
            onChange={(e) =>
              updateSetting(
                'pdfExportImageTesseractPath',
                (e.target as HTMLInputElement).value
              )
            }
            type="text"
            defaultValue={settings.pdfExportImageTesseractPath}
          />
          <div
            className="clickable-icon setting-editor-extra-setting-button"
            aria-label="Attempt to find tesseract automatically"
            onClick={async () => {
              try {
                const pathToTesseract = await which('tesseract');
                if (pathToTesseract) {
                  tessPathRef.current.value = pathToTesseract;
                  updateSetting('pdfExportImageTesseractPath', pathToTesseract);
                } else {
                  new Notice(
                    'Unable to find tesseract on your system. If it is installed, please manually enter a path.'
                  );
                }
              } catch (e) {
                new Notice(
                  'Unable to find tesseract on your system. If it is installed, please manually enter a path.'
                );
                console.error(e);
              }
            }}
          >
            <Icon name="magnifying-glass" />
          </div>
        </SettingItem>
        <SettingItem
          name="Image OCR Language"
          description="Tesseract language code for OCR; combine languages with plus signs such as eng+deu."
        >
          <input
            onChange={(e) =>
              updateSetting(
                'pdfExportImageOCRLang',
                (e.target as HTMLInputElement).value
              )
            }
            type="text"
            defaultValue={settings.pdfExportImageOCRLang}
          />
        </SettingItem>
        <SettingItem
          name="Tesseract data directory"
          description="Optional: supply an absolute path to the directory where tesseract's language files reside. This folder should include *.traineddata files for your selected languages."
        >
          <input
            ref={tessDataPathRef}
            onChange={(e) =>
              updateSetting(
                'pdfExportImageTessDataDir',
                (e.target as HTMLInputElement).value
              )
            }
            type="text"
            defaultValue={settings.pdfExportImageTessDataDir}
          />
          <div
            className="clickable-icon setting-editor-extra-setting-button"
            aria-label="Select the tesseract data directory"
            onClick={() => {
              const path = require('electron').remote.dialog.showOpenDialogSync(
                {
                  properties: ['openDirectory'],
                }
              );

              if (path && path.length) {
                tessDataPathRef.current.value = path[0];
                updateSetting('pdfExportImageTessDataDir', path[0]);
              }
            }}
          >
            <Icon name="lucide-folder-open" />
          </div>
        </SettingItem>
      </SettingsSection>
    </div>
  );
}

export class ZoteroConnectorSettingsTab extends PluginSettingTab {
  plugin: ZoteroConnector;
  dbTimer: number;

  constructor(app: App, plugin: ZoteroConnector) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    ReactDOM.render(
      <SettingsComponent
        app={this.app}
        settings={this.plugin.settings}
        addCiteFormat={this.addCiteFormat}
        updateCiteFormat={this.updateCiteFormat}
        removeCiteFormat={this.removeCiteFormat}
        addExportFormat={this.addExportFormat}
        updateExportFormat={this.updateExportFormat}
        removeExportFormat={this.removeExportFormat}
        updateSetting={this.updateSetting}
        runZoteroMonitorCheck={this.runZoteroMonitorCheck}
      />,
      this.containerEl
    );
  }

  addCiteFormat = (format: CitationFormat) => {
    this.plugin.addFormatCommand(format);
    this.plugin.settings.citeFormats.unshift(format);
    this.debouncedSave();

    return this.plugin.settings.citeFormats.slice();
  };

  updateCiteFormat = (index: number, format: CitationFormat) => {
    this.plugin.removeFormatCommand(this.plugin.settings.citeFormats[index]);
    this.plugin.addFormatCommand(format);
    this.plugin.settings.citeFormats[index] = format;
    this.debouncedSave();

    return this.plugin.settings.citeFormats.slice();
  };

  removeCiteFormat = (index: number) => {
    this.plugin.removeFormatCommand(this.plugin.settings.citeFormats[index]);
    this.plugin.settings.citeFormats.splice(index, 1);
    this.debouncedSave();

    return this.plugin.settings.citeFormats.slice();
  };

  addExportFormat = (format: ExportFormat) => {
    this.plugin.addExportCommand(format);
    this.plugin.settings.exportFormats.unshift(format);
    this.debouncedSave();

    return this.plugin.settings.exportFormats.slice();
  };

  updateExportFormat = (index: number, format: ExportFormat) => {
    this.plugin.removeExportCommand(this.plugin.settings.exportFormats[index]);
    this.plugin.addExportCommand(format);
    this.plugin.settings.exportFormats[index] = format;
    this.debouncedSave();

    return this.plugin.settings.exportFormats.slice();
  };

  removeExportFormat = (index: number) => {
    this.plugin.removeExportCommand(this.plugin.settings.exportFormats[index]);
    this.plugin.settings.exportFormats.splice(index, 1);
    this.debouncedSave();

    return this.plugin.settings.exportFormats.slice();
  };

  updateSetting = <T extends keyof ZoteroConnectorSettings>(
    key: T,
    value: ZoteroConnectorSettings[T]
  ) => {
    this.plugin.settings[key] = value;
    this.debouncedSave();
  };

  runZoteroMonitorCheck = () => {
    this.plugin.zoteroMonitor.runManualCheck();
  };

  debouncedSave() {
    clearTimeout(this.dbTimer);
    this.dbTimer = activeWindow.setTimeout(() => {
      this.plugin.saveSettings();
    }, 150);
  }

  hide() {
    super.hide();
    ReactDOM.unmountComponentAtNode(this.containerEl);
  }
}
