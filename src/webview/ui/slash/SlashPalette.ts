import type { InsertBlockArgs, InsertBlockKind } from '../../../core/markdown/insertBlock.js';
import type { ActionContext } from '../../../core/markdown/formatting.js';
import { updateSlashState, type SlashState } from '../../editor/slashState.js';

export interface SlashEntry {
  readonly kind: InsertBlockKind;
  readonly label: string;
  readonly keywords: readonly string[];
  readonly group: 'Basic' | 'Lists' | 'Technical' | 'Assets' | 'Advanced';
}

export interface SlashPaletteOptions {
  readonly mathEnabled?: boolean;
  readonly chooseLanguage?: () => Promise<string | undefined>;
  readonly chooseImage?: () => Promise<string | undefined>;
}

export type SlashAccept = (
  kind: InsertBlockKind,
  state: SlashState,
  args?: InsertBlockArgs
) => void | Promise<void>;

const ENTRIES: readonly SlashEntry[] = [
  { kind: 'text', label: 'Text', keywords: ['paragraph'], group: 'Basic' },
  ...([1, 2, 3, 4, 5, 6] as const).map((level): SlashEntry => ({
    kind: `heading${String(level)}` as InsertBlockKind,
    label: `Heading ${String(level)}`,
    keywords: [`h${String(level)}`, 'title'],
    group: 'Basic'
  })),
  { kind: 'bullet', label: 'Bullet list', keywords: ['unordered', 'list'], group: 'Lists' },
  { kind: 'numbered', label: 'Numbered list', keywords: ['ordered', 'list'], group: 'Lists' },
  { kind: 'task', label: 'Task list', keywords: ['todo', 'checkbox'], group: 'Lists' },
  { kind: 'quote', label: 'Quote', keywords: ['blockquote'], group: 'Basic' },
  { kind: 'divider', label: 'Divider', keywords: ['horizontal rule'], group: 'Basic' },
  { kind: 'code', label: 'Code block', keywords: ['fence', 'language'], group: 'Technical' },
  { kind: 'table', label: 'Table', keywords: ['grid', 'gfm'], group: 'Technical' },
  { kind: 'mermaid', label: 'Mermaid', keywords: ['diagram', 'flowchart'], group: 'Technical' },
  { kind: 'math', label: 'Math', keywords: ['formula', 'katex'], group: 'Technical' },
  { kind: 'image', label: 'Image', keywords: ['asset', 'picture'], group: 'Assets' },
  { kind: 'raw', label: 'Raw Markdown', keywords: ['source', 'island'], group: 'Advanced' }
];

export class SlashPalette {
  public readonly element: HTMLElement;
  public readonly status: HTMLElement;
  public visibleEntries: readonly SlashEntry[] = [];

  private state: SlashState | undefined;
  private activeIndex = 0;
  private readonly options: SlashPaletteOptions;
  private mathEnabled: boolean;

  public constructor(document: Document, private readonly onAccept: SlashAccept, options: SlashPaletteOptions = {}) {
    this.options = options;
    this.mathEnabled = options.mathEnabled ?? true;
    this.element = document.createElement('div');
    this.element.hidden = true;
    this.element.className = 'markami-slash-palette';
    this.element.setAttribute('role', 'listbox');
    this.element.setAttribute('aria-label', 'Insert Markdown block');
    this.element.style.position = 'fixed';
    this.element.style.zIndex = '21';
    this.element.style.maxHeight = '320px';
    this.element.style.overflow = 'auto';
    this.element.style.padding = '4px';
    this.element.style.background = 'var(--vscode-editorWidget-background)';
    this.element.style.color = 'var(--vscode-editorWidget-foreground)';
    this.status = document.createElement('div');
    this.status.setAttribute('role', 'status');
    this.status.setAttribute('aria-live', 'polite');
    document.body.append(this.element, this.status);
  }

  public open(state: SlashState): boolean {
    this.state = state;
    this.activeIndex = 0;
    this.element.hidden = false;
    this.filter(state.query);
    return true;
  }

  public get isOpen(): boolean {
    return this.state !== undefined;
  }

  public position(left: number, top: number): void {
    this.element.style.left = `${String(Math.max(4, left))}px`;
    this.element.style.top = `${String(Math.max(4, top))}px`;
  }

  public setMathEnabled(enabled: boolean): void {
    this.mathEnabled = enabled;
    if (this.state !== undefined) {
      this.filter(this.state.query);
    }
  }

  public update(ctx: ActionContext): boolean {
    if (this.state === undefined) {
      return false;
    }
    const updated = updateSlashState(this.state, ctx);
    if (updated === undefined) {
      this.close();
      this.status.textContent = 'Slash command cancelled because the insertion point changed.';
      return false;
    }
    this.state = updated;
    this.filter(updated.query);
    return true;
  }

  public handleKey(key: string): boolean {
    if (this.state === undefined) {
      return false;
    }
    if (key === 'Escape') {
      this.close();
      return true;
    }
    if (key === 'ArrowDown' || key === 'ArrowUp') {
      if (this.visibleEntries.length > 0) {
        const direction = key === 'ArrowDown' ? 1 : -1;
        this.activeIndex = (this.activeIndex + direction + this.visibleEntries.length) % this.visibleEntries.length;
        this.render();
      }
      return true;
    }
    if (key === 'Enter') {
      const entry = this.visibleEntries[this.activeIndex];
      if (entry !== undefined) void this.accept(entry.kind);
      return true;
    }
    return false;
  }

  public async accept(kind: InsertBlockKind): Promise<void> {
    const state = this.state;
    if (state === undefined) {
      return;
    }
    let args: InsertBlockArgs | undefined;
    if (kind === 'code' && this.options.chooseLanguage !== undefined) {
      const language = await this.options.chooseLanguage();
      if (language === undefined) {
        this.close();
        return;
      }
      args = { language };
    }
    if (kind === 'image') {
      const imageMarkdown = await this.options.chooseImage?.();
      if (imageMarkdown === undefined) {
        this.close();
        return;
      }
      args = { imageMarkdown };
    }
    await this.onAccept(kind, state, args);
    this.close();
  }

  public close(): void {
    this.state = undefined;
    this.element.hidden = true;
    this.element.replaceChildren();
  }

  public destroy(): void {
    this.element.remove();
    this.status.remove();
    this.state = undefined;
  }

  private filter(query: string): void {
    const normalized = query.toLocaleLowerCase();
    const mathEnabled = this.mathEnabled && this.state?.context.capabilities.math !== false;
    this.visibleEntries = ENTRIES.filter((entry) =>
      (entry.kind !== 'math' || mathEnabled) &&
      (normalized === '' || [entry.label, ...entry.keywords].some((value) => value.toLocaleLowerCase().includes(normalized)))
    );
    this.activeIndex = Math.min(this.activeIndex, Math.max(0, this.visibleEntries.length - 1));
    this.render();
  }

  private render(): void {
    this.element.replaceChildren();
    if (this.visibleEntries.length === 0) {
      const empty = this.element.ownerDocument.createElement('div');
      empty.textContent = 'No matching blocks';
      this.element.append(empty);
      this.status.textContent = 'No matching blocks.';
      return;
    }
    this.visibleEntries.forEach((entry, index) => {
      const option = this.element.ownerDocument.createElement('button');
      option.type = 'button';
      option.dataset.kind = entry.kind;
      option.setAttribute('role', 'option');
      option.setAttribute('aria-selected', String(index === this.activeIndex));
      option.textContent = entry.label;
      option.addEventListener('mousedown', (event) => event.preventDefault());
      option.addEventListener('click', () => void this.accept(entry.kind));
      this.element.append(option);
    });
    this.status.textContent = `${String(this.visibleEntries.length)} block${this.visibleEntries.length === 1 ? '' : 's'} available.`;
  }
}
