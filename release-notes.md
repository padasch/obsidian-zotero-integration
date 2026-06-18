* 3.2.9
  - Replaced datalist-style settings suggestions with public Obsidian fuzzy picker modals for folder, markdown template, and CSL style fields.
  - Added **Import selected (...) and close** and **Import selected (...) and continue** actions to the missing-reference review modal.
  - Kept monitor review actions above the scrollable results list so they remain visible while reviewing references.
  - Retained persistent automatic monitor notices with **Open Import**, **Background Import**, and **Ignore** actions.
  - Refreshed docs for backup guidance, fork lineage, and AI-assisted maintenance.

* 3.2.8
  - Simplified settings UI for folder/file/style selectors by using Obsidian-style input recommendations for:
    - note import folder
    - export template path
    - bibliography/citation style
  - Removed unused legacy monitor selector/style blocks and cleaned stale settings CSS.
  - Kept persistent Zotero monitor notices and explicit actions (**Open Import**, **Background Import**, **Ignore**) for newly detected references.
  - Refined release metadata and docs wording for fork lineage, AI-assisted maintenance, and backup guidance.

* 3.2.7
  - Wired monitor lifecycle into the plugin core (startup check + interval scheduling) with new default settings.
  - Added missing TypeScript wiring for monitor fields and monitor-related settings models.
  - Polished template/style selection inputs and finder behavior for a cleaner Obsidian-style field experience.
  - Ensured missing-item monitor notices remain persistent and continue exposing **Open Import**, **Background Import**, and **Ignore** actions.

* 3.2.6
  - Refined settings finders for note import folder, template file, and bibliography style fields using native-style autocomplete list inputs with deduplicated suggestions.
  - Added/kept persistent monitor notice actions for new references: **Open Import**, **Background Import**, and **Ignore**.
  - Cleaned up obsolete settings-related styles and documentation references, including removing old screenshot-era references.

* 3.2.5
  - Fixed settings inputs for template and bibliography fields to use Obsidian-style quick folder/file/style suggestions.
  - Added persistent monitor notice actions for newly detected references: **Open Import**, **Background Import**, **Ignore**.
  - Fixed monitor import flow and removed old/unused styling artifacts for a cleaner runtime path.
  - Updated docs and metadata for this fork and prepared release metadata for version alignment.

* 3.2.4
  - Added firstAttachmentLink template data.
  - Support epub and snapshot annotations.
  - Merge pull request #344 from brchristian/patch-1.
  - Merge pull request #349 from abachant/fix-import-format-settings-327.
  - Merge pull request #248 from fguiotte/patch-1.
  - Fix spelling of 'Bibliography'.
  - Update PDF Annotations.md.
  - Fix coloCategory Blue.
  - Fix colorCategory Purple.
