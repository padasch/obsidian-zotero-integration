import { Notice, TFile, moment } from 'obsidian';
import { ExportToMarkdownParams } from 'src/types';

export const DEFAULT_IMPORT_TEMPLATE = `# {{title}}

{% if bibliography -%}
> [!quote] Reference
> {{bibliography}}
{% endif %}
{% if abstractNote -%}
> [!abstract] Abstract
> {{abstractNote | replace("\\n", " ")}}
{% endif %}
> [!summary] Automated Metadata
> **Paper**
> - Title: {{title}}
{% if date -%}
> - Year: {{date | format("YYYY")}}
{% endif -%}
{% if authors -%}
> - Authors: {{authors}}
{% endif -%}
{% if itemType -%}
> - Item type: {{itemType}}
{% endif -%}
{% if publisher -%}
> - Publisher: {{publisher}}
{% endif -%}
{% if publicationTitle -%}
> - Publication: {{publicationTitle}}
{% endif -%}
{% if bibliography -%}
> - Bibliography: {{bibliography}}
{% endif -%}
{% if tags and tags.length -%}
> - Zotero tags: {% for tag in tags %}{{tag.tag}}{% if not loop.last %}, {% endif %}{% endfor %}
{% endif -%}
>
> **Links**
{% if desktopURI -%}
> - [zotero item]({{desktopURI}})
{% endif -%}
{% if pdfZoteroLink -%}
> - {{pdfZoteroLink | markdownLinkLabel("zotero reader")}}
{% else -%}
> - zotero reader: no pdf available
{% endif -%}
{% if url -%}
> - [weblink]({{url}})
{% endif -%}
{% if pdfLink -%}
> - {{pdfLink | markdownLinkLabel("Local pdf")}}
{% else -%}
> - Local pdf: no pdf available
{% endif -%}
{% if DOI or doi -%}
> - DOI: {{DOI or doi}}
{% endif -%}
>
> **Import**
{% if collections and collections.length -%}
> - Collections: {% for collection in collections %}{{collection.name or collection.fullPath}}{% if not loop.last %}, {% endif %}{% endfor %}
{% endif -%}
{% if dateAdded -%}
> - Date added: {{dateAdded | format("YYYY-MM-DD")}}
{% endif -%}
{% if importDate -%}
> - Last import: {{importDate | format("YYYY-MM-DD")}}
{% endif -%}
{% if citationKey or citekey -%}
> - Citation key: {{citationKey or citekey}}
{% endif %}
{% if annotations and annotations.length %}
{% set followUpAnnotations = annotations | filterby("colorCategory", "contains", "Gray", "Magenta", "Purple") -%}
{% if followUpAnnotations.length -%}
> [!todo]+ Follow-up Annotations
{% for annotation in followUpAnnotations -%}
{% if annotation.annotatedText -%}
> - {{annotation.annotatedText | nl2br}}{% if annotation.desktopURI %} ([Ref]({{annotation.desktopURI}})){% endif %}
{% elif annotation.comment -%}
> - {{annotation.comment | nl2br}}{% if annotation.desktopURI %} ([Ref]({{annotation.desktopURI}})){% endif %}
{% elif annotation.imageRelativePath -%}
> - Image{% if annotation.desktopURI %} ([Ref]({{annotation.desktopURI}})){% endif %}
{% endif -%}
{% if annotation.comment and annotation.annotatedText -%}
>   - _Comment:_ {{annotation.comment | nl2br}}
{% endif -%}
{% endfor %}
{% endif %}
{% endif %}

## Annotations

{% if annotations and annotations.length -%}
{% for annotation in annotations -%}
{% set annotationColor = annotation.colorCategory or "gray" -%}
> [!annotation-{{annotationColor | lower}}] {% if annotation.page %}Page {{annotation.page}}{% else %}Annotation{% endif %}{% if annotation.desktopURI %} ([Ref]({{annotation.desktopURI}})){% endif %}
{% if annotation.annotatedText -%}
> {{annotation.annotatedText | nl2br}}
{% endif -%}
{% if annotation.imageRelativePath -%}
> ![[{{annotation.imageRelativePath}}|500]]
{% endif -%}
{% if annotation.comment -%}
>
> _Comment:_ {{annotation.comment | nl2br}}
{% endif %}
{% endfor %}
{% else -%}
_No annotations imported._
{% endif %}
`;

export function loadTemplate(
  name: string,
  path: string
): Promise<string | null> {
  if (!path) return null;

  const templateFile = app.vault.getAbstractFileByPath(
    sanitizeObsidianPath(path)
  );

  if (!templateFile) {
    new Notice(`Error: ${name} template not found ${path}`);
    return null;
  }

  return app.vault.cachedRead(templateFile as TFile);
}

export async function getTemplates(params: ExportToMarkdownParams) {
  const { exportFormat } = params;
  const noLegacyTemplates =
    !exportFormat.headerTemplatePath &&
    !exportFormat.annotationTemplatePath &&
    !exportFormat.footerTemplatePath;

  if (exportFormat.templatePath) {
    return {
      template: await loadTemplate('', exportFormat.templatePath),
    };
  }

  if (noLegacyTemplates) {
    return {
      template: DEFAULT_IMPORT_TEMPLATE,
    };
  }

  return {
    headerTemplate: await loadTemplate(
      'Header',
      exportFormat.headerTemplatePath
    ),
    annotationTemplate: await loadTemplate(
      'Annotation',
      exportFormat.annotationTemplatePath
    ),
    footerTemplate: await loadTemplate(
      'Footer',
      exportFormat.footerTemplatePath
    ),
  };
}

export function getLastExport(md: string): moment.Moment {
  let match = md.match(/%% Import Date: (\S+) %%\n$/);

  if (match && match[1]) {
    return moment(match[1]);
  }

  // Legacy
  match = md.match(/%% Export Date: (\S+) %%\n$/);

  if (match && match[1]) {
    return moment(match[1]);
  }

  return moment(0);
}

export function appendExportDate(md: string): string {
  return md + `\n\n%% Import Date: ${moment().toISOString(true)} %%\n`;
}

export function getExistingAnnotations(md: string): string {
  const match = md.match(
    /%% Begin annotations %%([\w\W]+)%% End annotations %%/
  );

  if (match && match[1]) {
    return match[1].trim();
  }

  return '';
}

export function wrapAnnotationTemplate(str: string) {
  return `\n%% Begin annotations %%\n${str}\n%% End annotations %%\n`;
}

export function removeStartingSlash(str: string) {
  if (str.startsWith('/')) {
    return str.replace(/^\/+/, '');
  }

  return str;
}

export function sanitizeObsidianPath(str: string) {
  if (!str.endsWith('.md')) {
    str += '.md';
  }

  if (str.startsWith('/')) {
    str = removeStartingSlash(str);
  }

  return str;
}
