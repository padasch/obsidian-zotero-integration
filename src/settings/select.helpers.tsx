import Fuse from 'fuse.js';
import { TFile, TFolder } from 'obsidian';
import React from 'react';
import { StylesConfig } from 'react-select';

import { cslList } from './cslList';

export const customSelectStyles: StylesConfig = {
  container: (provided) => {
    return {
      ...provided,
      width: '100%',
    };
  },
  input: (provided) => {
    return {
      ...provided,
      color: 'var(--text-normal)',
    };
  },
  singleValue: (provided) => {
    return {
      ...provided,
      color: 'var(--text-normal)',
    };
  },
  menu: (provided) => {
    return {
      ...provided,
      backgroundColor: 'var(--background-modifier-form-field)',
      color: 'var(--text-normal)',
      zIndex: 10000,
    };
  },
  menuPortal: (provided) => {
    return {
      ...provided,
      zIndex: 10000,
    };
  },
  option: (provided, { isFocused, isSelected }) => {
    return {
      ...provided,
      backgroundColor: isFocused
        ? `var(--interactive-accent)`
        : isSelected
        ? `var(--background-modifier-hover)`
        : undefined,
      color: isFocused ? `var(--text-on-accent)` : 'var(--text-normal)',
    };
  },
  control: (provided, state) => {
    return {
      ...provided,
      backgroundColor: 'var(--background-modifier-form-field)',
      color: 'var(--text-normal)',
      minHeight: 36,
      borderColor: state.isFocused
        ? 'var(--interactive-accent)'
        : 'var(--background-modifier-border)',
      boxShadow: state.isFocused
        ? '0 0 0 1px var(--interactive-accent)'
        : 'none',
      ':hover': {
        borderColor: state.isFocused
          ? 'var(--interactive-accent)'
          : 'var(--background-modifier-border)',
      },
    };
  },
};

export function searchCSL(inputValue: string) {
  return cslList.search(inputValue).map((res) => res.item);
}

let loadCSLOptionsDB = 0;

export function loadCSLOptions(
  inputValue: string,
  callback: (options: Array<{ value: string; label: string }>) => void
) {
  if (inputValue === '') {
    callback([]);
  } else {
    clearTimeout(loadCSLOptionsDB);
    loadCSLOptionsDB = activeWindow.setTimeout(() => {
      callback([
        { value: inputValue, label: inputValue },
        ...searchCSL(inputValue),
      ]);
    }, 150);
  }
}

export function NoOptionMessage() {
  return <span>Type to search CSL styles</span>;
}

export function NoFileOptionMessage() {
  return <span>Type to search</span>;
}

export function NoFolderOptionMessage() {
  return <span>Type a folder path</span>;
}

export function buildFileSearch() {
  const files = app.vault.getMarkdownFiles();
  return new Fuse(files, {
    keys: ['basename'],
    minMatchCharLength: 2,
  });
}

let fileSearchDB = 0;

export const buildLoadFileOptions =
  (search: Fuse<TFile>) =>
  (
    inputValue: string,
    callback: (options: Array<{ value: string; label: string }>) => void
  ) => {
    if (inputValue === '') {
      callback([]);
    } else {
      clearTimeout(fileSearchDB);
      fileSearchDB = activeWindow.setTimeout(() => {
        callback(
          search.search(inputValue).map((res) => {
            return {
              value: res.item.path,
              label: res.item.path,
            };
          })
        );
      }, 150);
    }
  };

export function buildFolderSearch() {
  const folders = app.vault
    .getAllLoadedFiles()
    .filter((file): file is TFolder => file instanceof TFolder)
    .filter((folder) => folder.path !== '/')
    .sort((a, b) => a.path.localeCompare(b.path));

  return {
    folders,
    search: new Fuse(folders, {
      keys: ['path', 'name'],
      minMatchCharLength: 1,
      threshold: 0.35,
    }),
  };
}

let folderSearchDB = 0;

export const buildLoadFolderOptions =
  ({ folders, search }: { folders: TFolder[]; search: Fuse<TFolder> }) =>
  (
    inputValue: string,
    callback: (options: Array<{ value: string; label: string }>) => void
  ) => {
    clearTimeout(folderSearchDB);
    folderSearchDB = activeWindow.setTimeout(() => {
      const typed = inputValue.trim();
      const found = typed
        ? search.search(typed).map((res) => res.item)
        : folders;
      const options = found.slice(0, 50).map((folder) => ({
        value: folder.path,
        label: folder.path,
      }));

      if (
        typed &&
        !options.some((option: { value: string; label: string }) => option.value === typed)
      ) {
        options.unshift({ value: typed, label: typed });
      }

      callback(options);
    }, 150);
  };
