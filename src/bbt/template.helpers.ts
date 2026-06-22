import { Notice, TFile, moment } from 'obsidian';
import { ExportToMarkdownParams } from 'src/types';

export function loadTemplate(
  name: string,
  path?: string
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

export const DEFAULT_LITERATURE_NOTE_TEMPLATE = `---
title: "{{ title | replace('"', "'") }}"
{% if abstractNote -%}
zoteroAbstract: "{{ abstractNote | replace('"', "'") | replace("\\n", " ") }}"
{% endif -%}
{% if annotations and annotations.length -%}
{% set activeTaskAnnotations = annotations | filterby("colorCategory", "contains", "Gray", "Magenta", "Purple") -%}
zoteroAnnotationCount: {{ annotations.length }}
zoteroOpenTaskCount: {{ activeTaskAnnotations.length }}
zoteroOpenTasks: {% if activeTaskAnnotations.length %}true{% else %}false{% endif %}
{% else -%}
{% set activeTaskAnnotations = [] -%}
zoteroAnnotationCount: 0
zoteroOpenTaskCount: 0
zoteroOpenTasks: false
{% endif -%}
{% if citationKey or citekey -%}
aliases:
  - "@{{ citationKey or citekey }}: {{ title | replace('"', "'") }}"
citekey: "{{ citationKey or citekey }}"
zoteroCitekey: "{{ citationKey or citekey }}"
{% endif -%}
{% if libraryID -%}
zoteroLibraryID: {{ libraryID }}
{% endif -%}
{% if itemKey or key -%}
zoteroItemKey: "{{ itemKey or key }}"
{% endif -%}
{% if title -%}
zoteroTitle: "{{ title | replace('"', "'") }}"
{% endif -%}
{% if date -%}
zoteroYear: "{{ date | format("YYYY") }}"
{% endif -%}
{% if itemType -%}
zoteroType: "{{ itemType }}"
{% endif -%}
{% if creators and creators.length -%}
zoteroAuthors:
{% for creator in creators -%}
{% if creator.name -%}
  - "{{ creator.name | replace('"', "'") }}"
{% else -%}
  - "{{ creator.firstName or '' }} {{ creator.lastName or '' }}"
{% endif -%}
{% endfor -%}
{% elif authors -%}
zoteroAuthors:
  - "{{ authors | replace('"', "'") }}"
{% endif -%}
{% set publication = publicationTitle or proceedingsTitle or bookTitle -%}
{% if publication -%}
zoteroPublication: "{{ publication | replace('"', "'") }}"
{% endif -%}
{% if publisher -%}
zoteroPublisher: "{{ publisher | replace('"', "'") }}"
{% endif -%}
{% if DOI or doi -%}
zoteroDOI: "{{ DOI or doi }}"
{% endif -%}
{% if url -%}
zoteroURL: "[weblink]({{ url }})"
{% endif -%}
{% if desktopURI -%}
zoteroURI: "[zotero item]({{ desktopURI }})"
{% endif -%}
{% set localPdf = pdfLink or "no pdf available" -%}
zoteroPDF: "{{ localPdf | replace('"', "'") }}"
{% set readerLink = pdfZoteroLink or "no pdf available" -%}
zoteroReader: "{{ readerLink | replace('"', "'") }}"
{% if dateAdded -%}
zoteroDateAdded: "{{ dateAdded | format("YYYY-MM-DD") }}"
{% endif -%}
{% if dateModified -%}
zoteroDateModified: "{{ dateModified | format("YYYY-MM-DD") }}"
{% endif -%}
zoteroTags:
{% if tags and tags.length -%}
{% for tag in tags -%}
{% set tagName = tag.tag or tag.name or tag -%}
  - "{{ tagName | replace('"', "'") }}"
{% endfor -%}
{% else %}
  - "/notags"
{% endif -%}
{% if collections and collections.length -%}
zoteroCollections:
{% for collection in collections %}
{% set collectionName = collection.fullPath or collection.name or collection -%}
  - "{{ collectionName | replace('"', "'") }}"
{% endfor -%}
{% endif -%}
{% if zoteroProject and zoteroProject.length -%}
zoteroProject:
{% for project in zoteroProject %}
  - "{{ project | replace('"', "'") }}"
{% endfor -%}
{% endif -%}
{% if zoteroTopic and zoteroTopic.length -%}
zoteroTopic:
{% for topic in zoteroTopic %}
  - "{{ topic | replace('"', "'") }}"
{% endfor -%}
{% endif -%}
{% if zoteroNote -%}
zoteroNote: "{{ zoteroNote | replace('"', "'") }}"
{% endif -%}
{% if zoteroStatus -%}
zoteroStatus: "{{ zoteroStatus | replace('"', "'") }}"
{% endif -%}
{% if zoteroSummary is defined -%}
zoteroSummary: "{{ zoteroSummary | replace('"', "'") }}"
{% endif -%}
---

# {{ title }}

{% if bibliography -%}
> [!quote] Reference
> {{ bibliography }}
{% endif %}
{% if abstractNote -%}
> [!abstract] Abstract
> {{ abstractNote | replace("\\n", " ") }}
{% endif %}
> [!summary] Automated Metadata
> **Paper**
> - Title: {{ title }}
{% if date -%}
> - Year: {{ date | format("YYYY") }}
{% endif -%}
{% if authors -%}
> - Authors: {{ authors }}
{% endif -%}
{% if itemType -%}
> - Item type: {{ itemType }}
{% endif -%}
{% if publication -%}
> - Publication: {{ publication }}
{% endif -%}
{% if bibliography -%}
> - Bibliography: {{ bibliography }}
{% endif -%}
> - Zotero tags: {% if allTags %}{{ allTags }}{% else %}/notags{% endif %}
>
> **Links**
{% if desktopURI -%}
> - [zotero item]({{ desktopURI }})
{% endif -%}
> - Zotero reader: {{ readerLink }}
{% if url -%}
> - [weblink]({{ url }})
{% endif -%}
> - Local pdf: {{ localPdf }}
{% if DOI or doi -%}
> - DOI: {{ DOI or doi }}
{% endif -%}
>
> **Import**
{% if dateAdded -%}
> - Date added: {{ dateAdded | format("YYYY-MM-DD") }}
{% endif -%}
{% if importDate -%}
> - Last import: {{ importDate | format("YYYY-MM-DD") }}
{% endif -%}
{% if citationKey or citekey -%}
> - Citation key: {{ citationKey or citekey }}
{% endif %}

## Notes

{% persist "notes" %}
{% endpersist %}

{% if annotations and annotations.length -%}
{% if activeTaskAnnotations.length -%}
> [!todo]+ Follow-up Annotations
{% for annotation in activeTaskAnnotations -%}
{% if annotation.annotatedText -%}
> - {{ annotation.annotatedText | nl2br }}{% if annotation.desktopURI %} ([Ref]({{ annotation.desktopURI }})){% endif %}
{% elif annotation.comment -%}
> - {{ annotation.comment | nl2br }}{% if annotation.desktopURI %} ([Ref]({{ annotation.desktopURI }})){% endif %}
{% elif annotation.imageRelativePath -%}
> - Image{% if annotation.desktopURI %} ([Ref]({{ annotation.desktopURI }})){% endif %}
{% endif -%}
{% if annotation.comment and annotation.annotatedText -%}
>   - _Comment:_ {{ annotation.comment | nl2br }}
{% endif -%}
{% endfor %}

{% endif -%}
## All Annotations

{% for annotation in annotations -%}
{% set annotationColor = annotation.colorCategory or "gray" -%}
> [!annotation-{{ annotationColor | lower }}] {% if annotation.page %}Page {{ annotation.page }}{% else %}Annotation{% endif %}{% if annotation.desktopURI %} ([Ref]({{ annotation.desktopURI }})){% endif %}
{% if annotation.annotatedText -%}
> {{ annotation.annotatedText | nl2br }}
{% endif -%}
{% if annotation.imageRelativePath -%}
> ![[{{ annotation.imageRelativePath }}|500]]
{% endif -%}
{% if annotation.comment -%}
>
> _Comment:_ {{ annotation.comment | nl2br }}
{% endif %}
{% endfor -%}
{% else -%}
_No annotations imported._
{% endif %}
`;

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
      template: DEFAULT_LITERATURE_NOTE_TEMPLATE,
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
