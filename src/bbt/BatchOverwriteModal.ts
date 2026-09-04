import { App, Modal } from 'obsidian';

export type BatchOverwriteAction = 'overwrite-all' | 'ask-each' | 'cancel';

export class BatchOverwriteModal extends Modal {
  private resolvePromise: (value: BatchOverwriteAction) => void;
  private promise: Promise<BatchOverwriteAction>;
  private hasResolved = false;

  constructor(
    app: App,
    private conflictCount: number,
    private samplePaths: string[]
  ) {
    super(app);
    this.promise = new Promise((resolve) => {
      this.resolvePromise = resolve;
    });
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    const container = contentEl.createDiv('confirmation-modal');
    container.createEl('h2', {
      cls: 'confirmation-modal-title',
      text: 'Existing literature notes found',
    });

    container.createEl('p', {
      cls: 'confirmation-modal-message',
      text: `${this.conflictCount} imported note${
        this.conflictCount === 1 ? '' : 's'
      } would overwrite existing Obsidian file${
        this.conflictCount === 1 ? '' : 's'
      }.`,
    });

    if (this.samplePaths.length) {
      const list = container.createEl('ul');
      list.addClass('confirmation-modal-conflict-list');
      for (const path of this.samplePaths) {
        list.createEl('li', { text: path });
      }
      if (this.samplePaths.length < this.conflictCount) {
        list.createEl('li', {
          text: `...and ${this.conflictCount - this.samplePaths.length} more`,
        });
      }
    }

    const buttonContainer = container.createDiv('confirmation-modal-buttons');

    const cancelButton = buttonContainer.createEl('button', {
      text: 'Cancel import',
    });
    cancelButton.addClass('mod-warning');
    cancelButton.addEventListener('click', () => this.resolve('cancel'));

    const askButton = buttonContainer.createEl('button', {
      text: 'Ask for each',
    });
    askButton.addEventListener('click', () => this.resolve('ask-each'));

    const overwriteButton = buttonContainer.createEl('button', {
      text: 'Overwrite all',
    });
    overwriteButton.addClass('mod-cta');
    overwriteButton.addEventListener('click', () =>
      this.resolve('overwrite-all')
    );

    cancelButton.focus();
  }

  onClose() {
    this.resolve('cancel');
    this.contentEl.empty();
  }

  waitForResult(): Promise<BatchOverwriteAction> {
    return this.promise;
  }

  private resolve(value: BatchOverwriteAction) {
    if (this.hasResolved) return;
    this.hasResolved = true;
    this.resolvePromise(value);
    this.close();
  }
}
