# Plugin documentation

This repository is a maintained fork of [peterxcli/obsidian-zotero-integration](https://github.com/peterxcli/obsidian-zotero-integration).

## ⚠️ Backup before install or upgrade

Back up your vault and plugin configuration before installing, upgrading, or experimenting with import formats.

## Current fork-focused docs

- [FAQ](FAQ.md)
- [Templating](Templating.md)
- [PDF Annotations](PDF%20Annotations.md)
- [Export Settings](Export%20Settings.md)

## New behavior in this fork

- Native-feeling settings inputs with Obsidian fuzzy picker buttons for:
  - note import folder
  - template file path
  - citation / bibliography style
- A built-in Literature Note template is used when Template File is blank. It includes Zotero identity fields, links, abstract, tag/collection metadata, annotation/task counts, a preserved notes section, and annotation sections.
- Optional scite metadata can add or refresh `zoteroScite*` frontmatter fields on import when enabled, or through the refresh command for existing notes.
- Optional post-import opening of a fixed markdown or Obsidian `.base` file, useful for a Bases literature overview.
- Missing-reference review modal actions:
  - Import & close
  - Import & continue
- Configurable Zotero item table columns, with text-field ordering, validation, tags, and leaf collection paths shown separately.
- Persistent monitor notices for recently added references with quick actions:
  - Open Import
  - Background Import
  - Ignore

Development and maintenance in this fork use AI-assisted coding, with human review before release. The original codebase comes from [peterxcli/obsidian-zotero-integration](https://github.com/peterxcli/obsidian-zotero-integration).

## Why no screenshots in this repo

Older screenshot/gif assets were intentionally removed to keep the repository lightweight. Functionality and setup details are documented in the markdown docs and release notes.
