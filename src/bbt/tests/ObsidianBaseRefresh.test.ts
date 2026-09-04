import {
  isObsidianBasePath,
  markdownContainsObsidianBase,
} from '../../ObsidianBaseRefresh';

describe('isObsidianBasePath()', () => {
  it('matches Obsidian Bases files case-insensitively', () => {
    expect(isObsidianBasePath('Literature/Reading.base')).toBe(true);
    expect(isObsidianBasePath('Literature/Reading.BASE')).toBe(true);
  });

  it('does not match Markdown files', () => {
    expect(isObsidianBasePath('Literature/Reading.md')).toBe(false);
    expect(isObsidianBasePath(undefined)).toBe(false);
  });
});

describe('markdownContainsObsidianBase()', () => {
  it('matches fenced base code blocks', () => {
    expect(markdownContainsObsidianBase('```base\nviews:\n```')).toBe(true);
    expect(markdownContainsObsidianBase('~~~base\nviews:\n~~~')).toBe(true);
  });

  it('matches embedded .base files', () => {
    expect(markdownContainsObsidianBase('![[Literature.base]]')).toBe(true);
    expect(
      markdownContainsObsidianBase('![[Bases/Literature.base|Table]]')
    ).toBe(true);
  });

  it('does not match ordinary Markdown content', () => {
    expect(markdownContainsObsidianBase('## Literature\n- [[Paper]]')).toBe(
      false
    );
  });
});
