import {
  applyImageImportFolder,
  applyNoteImportFolder,
  getPort,
  mkMDDir,
  replaceIllegalChars,
  sanitizeFilePath,
} from '../helpers';

describe('getPort()', () => {
  it('returns correct port for database', () => {
    expect(getPort('Juris-M')).toBe('24119');
    expect(getPort('Zotero')).toBe('23119');
  });
});

describe('mkMDDir()', () => {
  it('does not call createFolder if path exists', async () => {
    global.app = {
      vault: {
        adapter: {
          exists: async () => true,
        },
        createFolder: jest.fn(async () => {}),
      },
    } as any;

    await mkMDDir('mock');

    expect(global.app.vault.createFolder as jest.Mock).not.toBeCalled();
  });

  it('does call createFolder if path exists', async () => {
    global.app = {
      vault: {
        adapter: {
          exists: async () => false,
        },
        createFolder: jest.fn(async () => {}),
      },
    } as any;

    await mkMDDir('mock');

    expect(global.app.vault.createFolder as jest.Mock).toBeCalled();
  });
});

describe('replaceIllegalChars()', () => {
  it('replaces ? and * with spaces', () => {
    const chars = ['?', '*'];
    chars.forEach((c) => {
      expect(replaceIllegalChars(`Hello${c}  world`)).toBe('Hello world');
    });
  });

  it('replaces :"<>| with dash', () => {
    const chars = [':', '"', '<', '>', '|'];
    chars.forEach((c) => {
      expect(replaceIllegalChars(`Hello${c}  world`)).toBe('Hello - world');
    });
  });

  it('leaves no trailing or leading spaces', () => {
    expect(replaceIllegalChars('?')).toBe('');
    expect(replaceIllegalChars(':')).toBe('-');
    expect(replaceIllegalChars('*hello?')).toBe('hello');
  });
});

describe('sanitizeFilePath()', () => {
  it('keeps slashes', () => {
    expect(sanitizeFilePath('/hello/world.txt')).toBe('/hello/world.txt');
  });

  it('replaces ? and * with spaces', () => {
    const chars = ['?', '*'];
    chars.forEach((c) => {
      expect(sanitizeFilePath(`/hel${c} lo/${c}world${c}.txt`)).toBe(
        '/hel lo/world.txt'
      );
    });
  });

  it('replaces :"<>| with dash', () => {
    const chars = [':', '"', '<', '>', '|'];
    chars.forEach((c) => {
      expect(sanitizeFilePath(`/hel${c} lo/${c}world${c}.txt`)).toBe(
        '/hel - lo/- world -.txt'
      );
    });
  });

  it('leaves no trailing or leading spaces', () => {
    expect(replaceIllegalChars('?')).toBe('');
    expect(replaceIllegalChars(':')).toBe('-');
    expect(replaceIllegalChars('*hello?')).toBe('hello');
  });
});

describe('applyNoteImportFolder()', () => {
  it('prefixes the note import folder for filename-only literature paths', () => {
    expect(applyNoteImportFolder('smith2024.md', 'Literature')).toBe(
      'Literature/smith2024.md'
    );
  });

  it('does not prefix paths that already specify a folder', () => {
    expect(applyNoteImportFolder('Papers/smith2024.md', 'Literature')).toBe(
      'Papers/smith2024.md'
    );
  });

  it('normalizes leading and trailing folder slashes', () => {
    expect(applyNoteImportFolder('smith2024.md', '/Literature/Inbox/')).toBe(
      'Literature/Inbox/smith2024.md'
    );
  });

  it('leaves filename-only paths unchanged when no note import folder is set', () => {
    expect(applyNoteImportFolder('smith2024.md', '')).toBe('smith2024.md');
  });
});

describe('applyImageImportFolder()', () => {
  it('places the shared images folder under the note folder', () => {
    expect(
      applyImageImportFolder('images', 'Literature/Inbox/@smith2024.md')
    ).toBe('Literature/Inbox/images');
  });

  it('places filename-only image folders under images in the note folder', () => {
    expect(
      applyImageImportFolder('smith2024', 'Literature/Inbox/@smith2024.md')
    ).toBe('Literature/Inbox/images/smith2024');
  });

  it('places configured image subfolders under the note folder', () => {
    expect(
      applyImageImportFolder(
        'images/smith2024',
        'Literature/Inbox/@smith2024.md'
      )
    ).toBe('Literature/Inbox/images/smith2024');
  });

  it('does not duplicate the note folder when the image path already includes it', () => {
    expect(
      applyImageImportFolder(
        'Literature/Inbox/images/smith2024',
        'Literature/Inbox/@smith2024.md'
      )
    ).toBe('Literature/Inbox/images/smith2024');
  });

  it('uses vault-level images when the note is at the vault root', () => {
    expect(applyImageImportFolder('smith2024', '@smith2024.md')).toBe(
      'images/smith2024'
    );
  });
});
