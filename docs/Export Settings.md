## What is an export format?

Export formats define how data from Zotero should be exported and converted to markdown in your Obsidian vault.

### Output path

The output path is where new markdown notes should be saved within your vault. Output paths support templating. You can view the data available to templates using the `Test import template` command in Obsidian's command palette.

If the output path is just a file name, the global `Note Import Location` setting is prepended. If the output path already contains a folder, it is used as written. Updating an existing note keeps that note's current path.

### Image output path

The image output path is where extracted annotation images should be saved. Relative paths are resolved from the final note folder. The default `images/` creates a shared images folder beside the note. A single folder name such as `figures` is placed below `images/`, as `images/figures`.

### Image base name

The base file name of exported images. For example, `@{{citekey}}-image` results in names like `@smith2024-image-1-x123-y456.jpg`, where the suffix records page and rectangle coordinates. Supports templating. Templates have access to data from the Zotero item and the current attachment.

### Template file

The Template File setting is optional. Leave it blank to use the built-in minimal Literature Note template. Choose a markdown file only when you want to fully control the generated note body.

Custom templates can use `{% persist "section-id" %}` blocks to preserve hand-written sections during updates.

### Header, annotation, and footer templates

See [Templating](Templating.md).

### Bibliography style

The data exported from Zotero includes a formatted bibliography for the selected items. This setting determines how the bibliography is formatted.
