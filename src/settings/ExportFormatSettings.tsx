import React, { ChangeEvent } from 'react';

import { ExportFormat } from '../types';
import { Icon } from './Icon';
import {
  openCSLStylePicker,
  openMarkdownFilePicker,
} from './select.helpers';

interface FormatSettingsProps {
  format: ExportFormat;
  index: number;
  removeFormat: (index: number) => void;
  updateFormat: (index: number, format: ExportFormat) => void;
}

export function ExportFormatSettings({
  format,
  index,
  updateFormat,
  removeFormat,
}: FormatSettingsProps) {
  const [templatePath, setTemplatePath] = React.useState(format.templatePath || '');
  const [cslStyle, setCslStyle] = React.useState(format.cslStyle || '');

  React.useEffect(() => {
    setTemplatePath(format.templatePath || '');
  }, [format.templatePath]);

  React.useEffect(() => {
    setCslStyle(format.cslStyle || '');
  }, [format.cslStyle]);

  const onChangeStr = React.useCallback(
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      const key = (e.target as HTMLInputElement).dataset
        .key as keyof ExportFormat;
      updateFormat(index, {
        ...format,
        [key]: (e.target as HTMLInputElement).value,
      });
    },
    [updateFormat, index, format]
  );

  const updateCSLStyle = React.useCallback(
    (value: string) => {
      setCslStyle(value);
      updateFormat(index, {
        ...format,
        cslStyle: value || undefined,
      });
    },
    [updateFormat, index, format]
  );

  const onChangeCSLStyle = React.useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      updateCSLStyle((e.target as HTMLInputElement).value);
    },
    [updateCSLStyle]
  );

  const updateTemplatePath = React.useCallback(
    (value: string) => {
      setTemplatePath(value);
      updateFormat(index, {
        ...format,
        templatePath: value || undefined,
      });
    },
    [updateFormat, index, format]
  );

  const onChangeTemplatePath = React.useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      updateTemplatePath((e.target as HTMLInputElement).value);
    },
    [updateTemplatePath]
  );

  const onRemove = React.useCallback(() => {
    removeFormat(index);
  }, [removeFormat, index]);

  return (
    <div className="zt-format">
      <div className="zt-format__form">
        <div className="zt-format__label">Name</div>
        <div className="zt-format__input-wrapper">
          <input
            onChange={onChangeStr}
            type="text"
            data-key="name"
            value={format.name}
          />
          <div className="zt-format__delete">
            <button className="zt-format__delete-btn" onClick={onRemove}>
              <Icon name="trash" />
            </button>
          </div>
        </div>
      </div>

      <div className="zt-format__form">
        <div className="zt-format__label">Output Path</div>
        <div className="zt-format__input-wrapper">
          <input
            onChange={onChangeStr}
            type="text"
            data-key="outputPathTemplate"
            value={format.outputPathTemplate}
          />
        </div>
        <div className="zt-format__input-note">
          The path for new markdown files. Supports templating, eg{' '}
          <pre>My Folder/@{'{{citekey}}'}.md</pre>. If this is only a file
          name, Note Import Location is prepended. Updates of existing notes keep
          the current note path.
        </div>
      </div>

      <div className="zt-format__form">
        <div className="zt-format__label">Image Output Path</div>
        <div className="zt-format__input-wrapper">
          <input
            onChange={onChangeStr}
            type="text"
            data-key="imageOutputPathTemplate"
            value={format.imageOutputPathTemplate}
          />
        </div>
        <div className="zt-format__input-note">
          Folder for exported annotation images. Relative paths are resolved from
          the final note folder. Use <pre>images/</pre> for a shared images
          folder beside the note; single folder names are placed below{' '}
          <pre>images/</pre>.
        </div>
      </div>

      <div className="zt-format__form">
        <div className="zt-format__label">Image Base Name</div>
        <div className="zt-format__input-wrapper">
          <input
            onChange={onChangeStr}
            type="text"
            data-key="imageBaseNameTemplate"
            value={format.imageBaseNameTemplate}
          />
        </div>
        <div className="zt-format__input-note">
          The base file name of exported images. Eg.{' '}
          <pre>@{'{{citekey}}'}-image</pre> results in{' '}
          <pre>@smith2024-image-1-x123-y456.jpg</pre>, where the suffix records
          page and rectangle coordinates. Supports templating.
        </div>
      </div>

      <div className="zt-format__form">
        <div className="zt-format__label">Template File</div>
        <div className="zt-format__input-wrapper">
          <input
            type="text"
            placeholder="Type a path or choose a markdown file"
            value={templatePath}
            onInput={onChangeTemplatePath}
          />
          <button
            type="button"
            className="clickable-icon setting-editor-extra-setting-button zt-picker-button"
            aria-label="Choose template file"
            onClick={() => openMarkdownFilePicker(updateTemplatePath)}
          >
            <Icon name="lucide-file-search" />
          </button>
        </div>
        <div className="zt-format__input-note">
          Optional. Leave blank to use the built-in Literature Note template.
          Choose a markdown file only if you want to fully control the
          generated note body. Custom templates can use <pre>{'{% persist %}'}</pre>{' '}
          blocks for sections that should survive updates. Use the Test import
          template command to inspect available data. Templates are written using{' '}
          <a
            href="https://mozilla.github.io/nunjucks/templating.html#variables"
            target="_blank"
            rel="noreferrer"
          >
            Nunjucks
          </a>
          .{' '}
          <a
            href="https://github.com/padasch/obsidian-zotero-integration/blob/main/docs/Templating.md"
            target="_blank"
            rel="noreferrer"
          >
            See the templating documentation here
          </a>
          .
        </div>
      </div>

      {format.headerTemplatePath && (
        <div className="zt-format__form is-deprecated">
          <div className="zt-format__label">
            Header Template File (deprecated)
          </div>
          <div className="zt-format__input-wrapper">
            <input type="text" disabled value={format.headerTemplatePath} />
            <button
              className="mod-warning"
              onClick={() => {
                updateFormat(index, {
                  ...format,
                  headerTemplatePath: undefined,
                });
              }}
            >
              Remove Template
            </button>
          </div>
          <div className="zt-format__input-note">
            Deprecated: Separate template files are no longer needed.{' '}
            <a
              href="https://github.com/padasch/obsidian-zotero-integration/blob/main/docs/Templating.md"
              target="_blank"
              rel="noreferrer"
            >
              See the templating documentation here
            </a>
            .
          </div>
        </div>
      )}

      {format.annotationTemplatePath && (
        <div className="zt-format__form is-deprecated">
          <div className="zt-format__label">
            Annotation Template File (deprecated)
          </div>
          <div className="zt-format__input-wrapper">
            <input type="text" disabled value={format.annotationTemplatePath} />
            <button
              className="mod-warning"
              onClick={() => {
                updateFormat(index, {
                  ...format,
                  annotationTemplatePath: undefined,
                });
              }}
            >
              Remove Template
            </button>
          </div>
          <div className="zt-format__input-note">
            Deprecated: Separate template files are no longer needed.{' '}
            <a
              href="https://github.com/padasch/obsidian-zotero-integration/blob/main/docs/Templating.md"
              target="_blank"
              rel="noreferrer"
            >
              See the templating documentation here
            </a>
            .
          </div>
        </div>
      )}

      {format.footerTemplatePath && (
        <div className="zt-format__form is-deprecated">
          <div className="zt-format__label">
            Footer Template File (deprecated)
          </div>
          <div className="zt-format__input-wrapper">
            <input type="text" disabled value={format.footerTemplatePath} />
            <button
              className="mod-warning"
              onClick={() => {
                updateFormat(index, {
                  ...format,
                  footerTemplatePath: undefined,
                });
              }}
            >
              Remove Template
            </button>
          </div>
          <div className="zt-format__input-note">
            Deprecated: Separate template files are no longer needed.{' '}
            <a
              href="https://github.com/padasch/obsidian-zotero-integration/blob/main/docs/Templating.md"
              target="_blank"
              rel="noreferrer"
            >
              See the templating documentation here
            </a>
            .
          </div>
        </div>
      )}

      <div className="zt-format__form">
        <div className="zt-format__label">Bibliography Style</div>
        <div className="zt-format__input-wrapper">
          <input
            type="text"
            placeholder="Type a style id or choose one"
            value={cslStyle}
            onInput={onChangeCSLStyle}
          />
          <button
            type="button"
            className="clickable-icon setting-editor-extra-setting-button zt-picker-button"
            aria-label="Choose bibliography style"
            onClick={() => openCSLStylePicker(updateCSLStyle)}
          >
            <Icon name="lucide-search" />
          </button>
        </div>
        <div className="zt-format__input-note">
          Note, the chosen style must be installed in Zotero. See{' '}
          <a
            target="_blank"
            href="https://www.zotero.org/support/styles"
            rel="noreferrer"
          >
            Zotero: Citation Styles
          </a>
        </div>
      </div>
    </div>
  );
}
