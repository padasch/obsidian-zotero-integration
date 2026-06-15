# Obsidian Zotero Integration

Insert and import citations, bibliographies, notes, and PDF annotations from Zotero into Obsidian. Requires [Better BibTeX for Zotero](https://retorque.re/zotero-better-bibtex/installation/).

This plugin is currently maintained as a clean fork of [peterxcli/obsidian-zotero-integration](https://github.com/peterxcli/obsidian-zotero-integration) and developed further with AI-assisted coding support.

## ⚠️ Backup first

Before installing or updating, create a backup of your Obsidian vault and plugin settings.

## What to expect in this fork

- Cleaner settings fields with native Obsidian-style folder/file/style finders for template and bibliography style selection.
- Persistent monitor notifications for newly found references, with one-click import actions.
- Tidy documentation and maintenance-focused cleanup.

## Current release

- Version `3.2.5` includes all settings simplification, monitor actions, and documentation cleanup changes.

## Documentation

Project documentation is maintained in [docs/README.md](docs/README.md).

## Installation

In Obsidian:

1. Open **Settings → Community plugins**
2. Disable safe mode
3. Browse community plugins and search for "Zotero Integration"

## Monitoring new references

New Zotero items can be shown as a persistent notice in Obsidian with:

- **Open Import** opens the existing import modal.
- **Background Import** imports them immediately using default managed properties.
- **Ignore** dismisses the notice.

## Troubleshooting

### Help, the plugin doesn't load

Make sure you are running a supported Obsidian version.

### Help, I get an error when creating a citation or bibliography

Ensure a citation/CSL style is available in Zotero and that a valid quick-copy style is configured there.

### Help, the plugin cannot find template files

Template and output fields use Obsidian search suggestions from loaded markdown files and folders. If needed, type a valid full path directly.
