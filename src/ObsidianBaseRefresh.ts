const BASE_FILE_EXTENSION = '.base';
const BASE_CODE_BLOCK_RE = /(^|\n)(`{3,}|~{3,})base(?:\s|\n|$)/i;
const BASE_EMBED_RE = /!\[\[[^\]\n]+\.base(?:#[^\]\n]*)?(?:\|[^\]\n]*)?\]\]/i;

export function isObsidianBasePath(path?: string | null): boolean {
  return !!path && path.toLowerCase().endsWith(BASE_FILE_EXTENSION);
}

export function markdownContainsObsidianBase(markdown: string): boolean {
  return BASE_CODE_BLOCK_RE.test(markdown) || BASE_EMBED_RE.test(markdown);
}
