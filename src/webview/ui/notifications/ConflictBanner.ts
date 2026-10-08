import type { RecoveryChoice } from '../../bridge/recovery.js';

export class ConflictBanner {
  public readonly element: HTMLElement;

  public constructor(onChoice: (choice: RecoveryChoice) => void) {
    const banner = document.createElement('section');
    banner.setAttribute('role', 'alert');
    banner.setAttribute('aria-label', 'Unsaved Markdown conflict');
    banner.textContent = 'The file changed while markami had unacknowledged edits.';
    for (const [choice, label] of [
      ['inspect', 'Inspect diff'],
      ['copy', 'Copy local draft'],
      ['reload', 'Reload canonical'],
      ['discard', 'Discard local draft']
    ] as const) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.addEventListener('click', () => onChoice(choice));
      banner.append(button);
    }
    this.element = banner;
  }

  public destroy(): void {
    this.element.remove();
  }
}
