import { execa } from 'execa';
import { Notice } from 'obsidian';
import path from 'path';
import { ensureExecutableSync, getExeName, getExeRoot } from 'src/helpers';

import { LoadingModal } from './LoadingModal';

interface ExtractParams {
  noWrite?: boolean;
  imageOutputPath?: string;
  imageBaseName?: string;
  imageFormat?: string;
  imageDPI?: number;
  imageQuality?: number;
  ignoreBefore?: string;
  attemptOCR?: boolean;
  ocrLang?: string;
  tesseractPath?: string;
  tessDataDir?: string;
  silent?: boolean;
}

const paramMap: Record<Exclude<keyof ExtractParams, 'silent'>, string> = {
  noWrite: '-w',
  imageOutputPath: '-o',
  imageBaseName: '-n',
  imageFormat: '-f',
  imageDPI: '-d',
  imageQuality: '-q',
  ignoreBefore: '-b',
  attemptOCR: '-e',
  ocrLang: '-l',
  tesseractPath: '--tesseract-path',
  tessDataDir: '--tess-data-dir',
};

export async function extractAnnotations(
  input: string,
  params: ExtractParams,
  overridePath?: string
) {
  const modal = params.silent
    ? null
    : new LoadingModal(app, 'Extracting annotations...');
  modal?.open();

  const args = [input];

  Object.keys(params).forEach((k) => {
    if (k === 'silent') return '';

    const val = params[k as keyof ExtractParams];

    if (val === '' || val === undefined) return '';

    const key = paramMap[k as Exclude<keyof ExtractParams, 'silent'>];

    if (typeof val === 'boolean') {
      if (val) {
        args.push(key);
      }
    } else {
      args.push(key);
      if (typeof val === 'string' && val.startsWith('-')) {
        args.push(`"${val}"`);
      } else {
        args.push(val.toString());
      }
    }
  });

  try {
    const isExecutable = ensureExecutableSync(overridePath);

    if (!isExecutable) {
      if (!params.silent) {
        new Notice(`Error: PDF utility is not executable`, 10000);
      }
      return '[]';
    }

    const result = await execa(
      overridePath || path.join(getExeRoot(), getExeName()),
      args
    );

    modal?.close();

    if (result.stderr.toLowerCase().includes('password')) {
      if (!params.silent) {
        new Notice(
          `Error opening ${path.basename(input)}: PDF is password protected`,
          10000
        );
      }
      return '[]';
    }

    if (result.stderr && !result.stderr.includes('warning')) {
      if (!params.silent) {
        new Notice(`Error processing PDF: ${result.stderr}`, 10000);
      }
      throw new Error(result.stderr);
    }

    return result.stdout;
  } catch (e) {
    modal?.close();

    if (e.message.toLowerCase().includes('password')) {
      if (!params.silent) {
        new Notice(
          `Error opening ${path.basename(input)}: PDF is password protected`,
          10000
        );
      }
      return '[]';
    } else if (e.message.toLowerCase().includes('type3')) {
      if (!params.silent) {
        new Notice(`Error processing annotations: ${e.message}`, 10000);
      }
      return '[]';
    }

    console.error(e);
    if (!params.silent) {
      new Notice(`Error processing PDF: ${e.message}`, 10000);
    }
    throw e;
  }
}
