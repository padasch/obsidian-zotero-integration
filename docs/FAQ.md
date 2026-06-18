# FAQ - Frequently Asked Questions


## My import from Zotero fails, throws errors or behaves unexpectedly
There can be multiple reasons for imports to fail.

- Please verify that your Bibliography Style is set and available in Zotero, too.
- Check the [Obsidian Error Console](https://forum.obsidian.md/t/how-to-access-the-console/16703).
- Double-check your template for typos.
- Use the plugin's Data Explorer and inspect the raw data from Zotero; this is what templates use.
- Also check the FAQ entry "My import doesn't see any annotations."
- Report plugin issues here: https://github.com/padasch/obsidian-zotero-integration/issues


## Does the Bibliography Style need to be set/activated on the Zotero side, too?

No. Ensure the style is installed in Zotero and visible in Zotero's citation style list.


## What are some example templates & steps on how to setup this plugin?
- Step by step guide: https://publish.obsidian.md/history-notes/01+Notetaking+for+Historians
- Some template examples: https://forum.obsidian.md/t/zotero-desktop-connector-import-templates/36310


## Do I need to extract annotations in Zotero into its own note?
Short answer is no.

In the past you had to extract annotations in Zotero into its own note. This is no longer required. When using templating, you can extract the annotation directly from Zotero. But this requires setting up a good template that works for you.

### But it might be easier to extract annotations first
The easiest way is to extract annotations in Zotero first and then use the "Insert notes into current document". Example import:

Importing via "Insert notes into your current document" will lose color information, images, and some blocks. This might not be ideal, but you no longer need to set up your own import template.


## My import doesn't see any annotations / doesn't import any images

There may be a bug in Zotero extraction flow. Zotero has the annotation but it is not seen in Obsidian. Please report at https://github.com/padasch/obsidian-zotero-integration/issues.

You can export the PDF annotation in Zotero directly into a note. Downside is that you will lose images, location links, and color coding in the note.

## I don't see the monitor notification for new references

The monitor notice is shown persistently and stays visible until acted on. It includes:

- **Open Import**: opens the full selection modal
- **Background Import**: imports immediately with default managed properties
- **Ignore**: dismisses the notice

If the monitor is quiet, check monitor settings (`Monitor` section) for:

- time window (`last X days`)
- selected libraries / collections / tags
- selected import format

## Can I import several newly found references with different project metadata?

Yes. Use **Open Import** from the monitor notice or **Check now** in settings. In the review modal:

- **Import & close** imports the selected references and closes the modal.
- **Import & continue** imports the selected references, removes them from the review list, and keeps the modal open so you can change project/topic/status/note fields for the next import.

## Why does the missing-reference table only show one collection path?

Zotero/Better BibTeX can return parent and child collection paths for the same item. The monitor now shows only the deepest collection path for display and search. For example, if Zotero reports `topics`, `topics/coding`, and `topics/coding/r`, the table shows `topics/coding/r`.

You can choose which columns appear in the modal under **Settings -> Zotero Monitor -> Missing-reference table columns**.

## Unanswered questions
- What is the difference between the various BibTeX and CSL-based configurations?
