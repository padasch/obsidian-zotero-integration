# Obsidian Zotero Integration

This is a maintained fork of [peterxcli/obsidian-zotero-integration](https://github.com/peterxcli/obsidian-zotero-integration).

This repo uses AI-assisted coding for cleanup, modernization, and maintenance work, and then human review for release quality.

## ⚠️ Important: create backups before installing or testing

Before installing/updating this plugin in your vault, make a backup of:

- your vault contents
- plugin settings (`.obsidian/plugins/obsidian-zotero-integration*`)
- any templates or import formats you rely on

## Latest release

Current plugin release: **3.2.12**.

## Install

### Obsidian Community plugins

1. Settings → Community plugins
2. Turn off Safe mode
3. Install and enable **Zotero Integration**

### Manual install / update

1. Download `manifest.json`, `main.js`, `styles.css`, and `versions.json` from the [latest GitHub release](https://github.com/padasch/obsidian-zotero-integration/releases/latest).
2. Copy the files into:
   `/.obsidian/plugins/obsidian-zotero-integration/` (or your local plugin folder)
3. Reload Obsidian.

## Overview

- Import citations, bibliographies, notes, and PDF annotations from Zotero (and Juris-M)
- Run imports from commands or ribbons
- Import notes from a configurable folder
- Quick monitor that detects newly added Zotero references in Obsidian

## Key fork updates

- **Obsidian fuzzy picker buttons** in settings for:
  - note import folder
  - markdown template path
  - CSL bibliography / citation style
  
  Type paths manually when needed, or use the picker buttons to search available folders, files, and styles.
- **Persistent monitor notice** for new references with explicit actions:
  - `Open Import`
  - `Background Import`
  - `Ignore`
- **Multi-step missing-reference imports** in the review modal:
  - `Import & close`
  - `Import & continue`
- **Faster missing-reference review** through background Zotero metadata caching.
- **Online paper links** in the missing-reference table, using DOI/publisher URL or a Scholar search fallback.
- **Configurable missing-reference table columns** with separate tags and leaf collection path columns.
- **Row-click selection** in the missing-reference table, while links and controls keep their normal behavior.
- Cleaner and slimmer settings documentation and CSS cleanup, with legacy screenshot assets removed from the repository.

## Settings that matter most

### Zotero Monitor

The monitor watches for missing literature notes and can run:

- on startup
- on a recurring interval
- manually via **Check Zotero now**

You can control how many recent days it considers (`Recent Zotero items`), scope (library/collections/tags), which import format should be used for automatic/background imports, and which columns are shown in the missing-reference table.

### Default-style folder/file/style entry fields

The following fields are now plain input fields with Obsidian fuzzy picker buttons:

- `Note Import Location`
- `Template File`
- `Citation Style`
- `Bibliography Style`

This avoids non-standard select behavior while keeping manual path entry available.

## Documentation

- [docs/README.md](docs/README.md)
- [FAQ](docs/FAQ.md)
- [Templating](docs/Templating.md)
- [PDF Annotations](docs/PDF%20Annotations.md)
- [Export Settings](docs/Export%20Settings.md)

## Development notes

- Build output (`main.js`) is generated from source in this repository.
- The old image/gif assets used in previous docs were intentionally removed.

## License

MIT — see [LICENSE.md](LICENSE.md).
