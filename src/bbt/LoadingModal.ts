import { App, Modal } from 'obsidian';

export class LoadingModal extends Modal {
  message: string;
  detail?: string;
  private messageEl?: HTMLElement;
  private detailEl?: HTMLElement;
  private progressEl?: HTMLProgressElement;
  private progressMax?: number;
  private progressValue?: number;

  constructor(app: App, message: string) {
    super(app);
    this.message = message;
  }

  onOpen() {
    this.modalEl.addClass('zt-loading-modal');
    this.contentEl.empty();
    this.messageEl = this.contentEl.createDiv({
      cls: 'zt-loading-modal-message',
      text: this.message,
    });
    this.detailEl = this.contentEl.createDiv({
      cls: 'zt-loading-modal-detail',
    });
    this.progressEl = this.contentEl.createEl('progress', {
      cls: 'zt-loading-modal-progress',
    });
    this.render();
  }

  onClose() {
    this.modalEl.removeClass('zt-loading-modal');
    this.contentEl.empty();
    this.messageEl = undefined;
    this.detailEl = undefined;
    this.progressEl = undefined;
  }

  setMessage(message: string, detail?: string) {
    this.message = message;
    this.detail = detail;
    this.render();
  }

  setProgress(value: number, max: number) {
    this.progressValue = value;
    this.progressMax = max;
    this.render();
  }

  private render() {
    this.messageEl?.setText(this.message);

    if (this.detailEl) {
      this.detailEl.setText(this.detail || '');
      this.detailEl.toggle(!!this.detail);
    }

    if (!this.progressEl) return;

    if (this.progressMax && this.progressMax > 0) {
      this.progressEl.max = this.progressMax;
      this.progressEl.value = Math.min(
        Math.max(this.progressValue || 0, 0),
        this.progressMax
      );
      this.progressEl.removeAttribute('aria-hidden');
      this.progressEl.style.display = '';
    } else {
      this.progressEl.removeAttribute('value');
      this.progressEl.setAttribute('aria-hidden', 'true');
      this.progressEl.style.display = 'none';
    }
  }
}
