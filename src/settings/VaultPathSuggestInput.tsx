import {
  TFolder,
  prepareFuzzySearch,
  renderResults,
} from 'obsidian';
import type { SearchResult, TFile } from 'obsidian';
import React from 'react';

type VaultPathSuggestKind = 'file' | 'folder';
type VaultPathSuggestApplyMode = 'replace' | 'folder-prefix';

interface VaultPathSuggestion {
  match: SearchResult | null;
  matchTarget: 'path' | 'name' | null;
  name: string;
  path: string;
}

interface VaultPathSuggestInputProps {
  applyMode?: VaultPathSuggestApplyMode;
  defaultValue?: string;
  kind: VaultPathSuggestKind;
  onChange: (value: string) => void;
  placeholder?: string;
}

function normalizeVaultPath(value: string): string {
  return value.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');
}

function looksLikePathLeaf(value: string): boolean {
  return value.includes('{{') || value.includes('.') || value.startsWith('@');
}

function getCurrentPathQuery(
  value: string,
  applyMode: VaultPathSuggestApplyMode
): string {
  const trimmed = value.trim();
  if (!trimmed) return '';

  if (applyMode === 'folder-prefix') {
    const normalized = trimmed.replace(/\\/g, '/').replace(/^\/+/, '');
    const slashIndex = normalized.lastIndexOf('/');
    const leaf = slashIndex >= 0 ? normalized.slice(slashIndex + 1) : normalized;

    if (looksLikePathLeaf(leaf)) {
      return slashIndex >= 0 ? normalized.slice(0, slashIndex) : '';
    }
  }

  const segment = trimmed.split('/').pop() || trimmed;
  return segment.replace(/\.md$/i, '').trim() || trimmed;
}

function getVaultPathSuggestions(
  kind: VaultPathSuggestKind,
  value: string,
  applyMode: VaultPathSuggestApplyMode,
  limit = 50
): VaultPathSuggestion[] {
  const entries =
    kind === 'file'
      ? app.vault.getMarkdownFiles().map((file: TFile) => ({
          name: file.basename,
          path: file.path,
        }))
      : app.vault
          .getAllLoadedFiles()
          .filter((file): file is TFolder => file instanceof TFolder)
          .filter((folder) => folder.path !== '/')
          .map((folder) => ({
            name: folder.name,
            path: folder.path,
          }));

  const sorted = entries.sort((a, b) => a.path.localeCompare(b.path));
  const query = getCurrentPathQuery(value, applyMode);
  if (!query) {
    return sorted.slice(0, limit).map((entry) => ({
      ...entry,
      match: null,
      matchTarget: null,
    }));
  }

  const search = prepareFuzzySearch(query);

  return sorted
    .map((entry) => {
      const pathMatch = search(entry.path);
      const nameMatch = search(entry.name);
      const match = pathMatch || nameMatch;

      if (!match) return null;

      return {
        ...entry,
        match,
        matchTarget: pathMatch ? 'path' : 'name',
      };
    })
    .filter((entry): entry is VaultPathSuggestion => Boolean(entry))
    .sort((a, b) => (b.match?.score || 0) - (a.match?.score || 0))
    .slice(0, limit);
}

function applyFolderPrefix(currentValue: string, folderPath: string): string {
  const folder = normalizeVaultPath(folderPath);
  const current = currentValue.replace(/\\/g, '/').replace(/^\/+/, '');
  const slashIndex = current.lastIndexOf('/');
  const leaf = slashIndex >= 0 ? current.slice(slashIndex + 1) : current;
  const shouldKeepLeaf = Boolean(leaf) && looksLikePathLeaf(leaf);

  if (!shouldKeepLeaf) return `${folder}/`;
  return `${folder}/${leaf}`;
}

function SuggestionLabel({ suggestion }: { suggestion: VaultPathSuggestion }) {
  const labelRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!labelRef.current) return;

    labelRef.current.empty();
    if (suggestion.match && suggestion.matchTarget === 'path') {
      renderResults(labelRef.current, suggestion.path, suggestion.match);
    } else {
      labelRef.current.setText(suggestion.path);
    }
  }, [suggestion]);

  return <div ref={labelRef} className="zt-vault-path-suggest-label" />;
}

export function VaultPathSuggestInput({
  applyMode = 'replace',
  defaultValue = '',
  kind,
  onChange,
  placeholder,
}: VaultPathSuggestInputProps) {
  const wrapperRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [value, setValue] = React.useState(defaultValue);
  const [isOpen, setIsOpen] = React.useState(false);
  const [selectedIndex, setSelectedIndex] = React.useState(0);
  const [suggestions, setSuggestions] = React.useState<VaultPathSuggestion[]>(
    () => getVaultPathSuggestions(kind, defaultValue, applyMode)
  );

  React.useEffect(() => {
    const nextValue = defaultValue || '';
    setValue(nextValue);
    setSuggestions(getVaultPathSuggestions(kind, nextValue, applyMode));
    setSelectedIndex(0);
  }, [applyMode, defaultValue, kind]);

  React.useEffect(() => {
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', closeOnOutsideClick);
    return () => document.removeEventListener('mousedown', closeOnOutsideClick);
  }, []);

  const updateValue = React.useCallback(
    (nextValue: string, openSuggestions = true) => {
      setValue(nextValue);
      onChange(nextValue);
      setSuggestions(getVaultPathSuggestions(kind, nextValue, applyMode));
      setSelectedIndex(0);
      setIsOpen(openSuggestions);
    },
    [applyMode, kind, onChange]
  );

  const chooseSuggestion = React.useCallback(
    (suggestion: VaultPathSuggestion) => {
      const nextValue =
        applyMode === 'folder-prefix'
          ? applyFolderPrefix(value, suggestion.path)
          : suggestion.path;

      updateValue(nextValue, false);
      inputRef.current?.focus();
    },
    [applyMode, updateValue, value]
  );

  return (
    <div ref={wrapperRef} className="zt-vault-path-suggest">
      <input
        ref={inputRef}
        type="text"
        spellCheck={false}
        placeholder={placeholder}
        value={value}
        onChange={(event) => updateValue(event.currentTarget.value)}
        onFocus={() => {
          setSuggestions(getVaultPathSuggestions(kind, value, applyMode));
          setIsOpen(true);
        }}
        onKeyDown={(event) => {
          if (!isOpen || !suggestions.length) return;

          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setSelectedIndex((index) => (index + 1) % suggestions.length);
          } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setSelectedIndex(
              (index) => (index - 1 + suggestions.length) % suggestions.length
            );
          } else if (event.key === 'Enter' || event.key === 'Tab') {
            event.preventDefault();
            chooseSuggestion(suggestions[selectedIndex]);
          } else if (event.key === 'Escape') {
            event.preventDefault();
            setIsOpen(false);
          }
        }}
      />
      {isOpen && (
        <div className="zt-vault-path-suggest-menu">
          {suggestions.length ? (
            suggestions.map((suggestion, index) => (
              <button
                key={suggestion.path}
                type="button"
                className={`zt-vault-path-suggest-item${
                  index === selectedIndex ? ' is-selected' : ''
                }`}
                onMouseEnter={() => setSelectedIndex(index)}
                onMouseDown={(event) => {
                  event.preventDefault();
                  chooseSuggestion(suggestion);
                }}
              >
                <SuggestionLabel suggestion={suggestion} />
              </button>
            ))
          ) : (
            <div className="zt-vault-path-suggest-empty">
              No matching {kind === 'file' ? 'files' : 'folders'}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
