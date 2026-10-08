import { markdownLanguage } from '@codemirror/lang-markdown';
import { findUnknownSyntaxRanges, type SourceRange } from '../../../core/markdown/syntax.js';

export type FindMode = 'visible' | 'source';

export interface FindOptions {
  readonly mode: FindMode;
  readonly caseSensitive?: boolean;
  readonly wholeWord?: boolean;
}

export interface FindMatch {
  readonly from: number;
  readonly to: number;
}

interface VisibleProjection {
  readonly text: string;
  readonly sourceOffsets: readonly number[];
}

const HIDDEN_NODE_NAMES = new Set([
  'CodeInfo',
  'CodeMark',
  'EmphasisMark',
  'Escape',
  'HeaderMark',
  'LinkMark',
  'LinkTitle',
  'ListMark',
  'QuoteMark',
  'TableDelimiter',
  'TaskMarker',
  'URL'
]);

export function findDocumentMatches(source: string, query: string, options: FindOptions): readonly FindMatch[] {
  if (query.length === 0) return [];
  const projection = options.mode === 'source'
    ? { text: source, sourceOffsets: Array.from({ length: source.length }, (_value, index) => index) }
    : buildVisibleProjection(source);
  const pattern = new RegExp(escapeRegExp(query), options.caseSensitive === true ? 'gu' : 'giu');
  const matches: FindMatch[] = [];
  for (const match of projection.text.matchAll(pattern)) {
    const index = match.index;
    const matched = match[0];
    if (options.wholeWord === true && !isWholeWord(projection.text, index, index + matched.length)) continue;
    const from = projection.sourceOffsets[index];
    const last = projection.sourceOffsets[index + matched.length - 1];
    if (from !== undefined && last !== undefined) matches.push({ from, to: last + 1 });
  }
  return matches;
}

export function visibleDocumentText(source: string): string {
  return buildVisibleProjection(source).text;
}

export function nextMatchIndex(matches: readonly FindMatch[], current: number, direction: -1 | 1): number {
  if (matches.length === 0) return -1;
  if (current < 0 || current >= matches.length) return direction === 1 ? 0 : matches.length - 1;
  return (current + direction + matches.length) % matches.length;
}

export class DocumentFind {
  public readonly element: HTMLElement;
  public readonly status: HTMLElement;

  private readonly input: HTMLInputElement;
  private readonly caseSensitive: HTMLInputElement;
  private readonly wholeWord: HTMLInputElement;
  private readonly mode: HTMLSelectElement;
  private matches: readonly FindMatch[] = [];
  private activeIndex = -1;

  public constructor(
    documentRef: Document,
    private readonly source: () => string,
    private readonly navigate: (match: FindMatch) => void,
    private readonly showResults: (matches: readonly FindMatch[], activeIndex: number) => void,
    private readonly restoreEditorFocus: () => void
  ) {
    this.element = documentRef.createElement('section');
    this.element.className = 'markami-find';
    this.element.hidden = true;
    this.element.setAttribute('role', 'dialog');
    this.element.setAttribute('aria-label', 'Find in document');
    this.element.setAttribute('aria-modal', 'false');

    this.input = documentRef.createElement('input');
    this.input.type = 'search';
    this.input.setAttribute('aria-label', 'Find text');
    this.input.addEventListener('input', () => this.refresh(true));
    this.input.addEventListener('keydown', (event) => this.onInputKeyDown(event));

    this.mode = documentRef.createElement('select');
    this.mode.setAttribute('aria-label', 'Find scope');
    this.mode.append(option(documentRef, 'visible', 'Document text'), option(documentRef, 'source', 'Markdown source'));
    this.mode.addEventListener('change', () => this.refresh(true));

    this.caseSensitive = checkbox(documentRef, 'Match case', () => this.refresh(true));
    this.wholeWord = checkbox(documentRef, 'Match whole word', () => this.refresh(true));

    const previous = button(documentRef, 'Previous match', '↑', () => this.move(-1));
    const next = button(documentRef, 'Next match', '↓', () => this.move(1));
    const close = button(documentRef, 'Close find', '×', () => this.close());
    this.status = documentRef.createElement('span');
    this.status.setAttribute('role', 'status');
    this.status.setAttribute('aria-live', 'polite');
    this.element.append(
      this.input,
      this.mode,
      labelledCheckbox(documentRef, 'Case', this.caseSensitive),
      labelledCheckbox(documentRef, 'Word', this.wholeWord),
      previous,
      next,
      close,
      this.status
    );
    documentRef.body.append(this.element);
  }

  public open(mode: FindMode): void {
    this.mode.value = mode;
    this.element.hidden = false;
    this.refresh(true);
    this.input.focus({ preventScroll: true });
    this.input.select();
  }

  public close(): void {
    if (this.element.hidden) return;
    this.element.hidden = true;
    this.matches = [];
    this.activeIndex = -1;
    this.showResults([], -1);
    this.restoreEditorFocus();
  }

  public refresh(resetActive = false): void {
    if (this.element.hidden) return;
    if (resetActive) this.activeIndex = -1;
    this.matches = findDocumentMatches(this.source(), this.input.value, {
      mode: this.mode.value === 'source' ? 'source' : 'visible',
      caseSensitive: this.caseSensitive.checked,
      wholeWord: this.wholeWord.checked
    });
    if (this.activeIndex >= this.matches.length) this.activeIndex = -1;
    this.status.textContent = this.matches.length === 1 ? '1 match' : `${String(this.matches.length)} matches`;
    this.showResults(this.matches, this.activeIndex);
  }

  public destroy(): void {
    this.element.remove();
  }

  private move(direction: -1 | 1): void {
    this.activeIndex = nextMatchIndex(this.matches, this.activeIndex, direction);
    const match = this.matches[this.activeIndex];
    if (match === undefined) return;
    this.status.textContent = `${String(this.activeIndex + 1)} of ${String(this.matches.length)}`;
    this.showResults(this.matches, this.activeIndex);
    this.navigate(match);
  }

  private onInputKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.close();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      this.move(event.shiftKey ? -1 : 1);
    }
  }
}

function buildVisibleProjection(source: string): VisibleProjection {
  const islands = findUnknownSyntaxRanges(source);
  const hidden: SourceRange[] = [];
  markdownLanguage.parser.parse(source).cursor().iterate((node) => {
    if (HIDDEN_NODE_NAMES.has(node.name) && !islands.some((island) => contains(island, node.from, node.to))) {
      hidden.push({ from: node.from, to: node.to });
    }
  });
  hidden.sort((left, right) => left.from - right.from || left.to - right.to);
  let text = '';
  const sourceOffsets: number[] = [];
  let hiddenIndex = 0;
  for (let index = 0; index < source.length; index += 1) {
    while ((hidden[hiddenIndex]?.to ?? Number.POSITIVE_INFINITY) <= index) hiddenIndex += 1;
    const range = hidden[hiddenIndex];
    if (range !== undefined && index >= range.from && index < range.to) continue;
    const character = source[index];
    if (character === undefined) continue;
    text += character;
    sourceOffsets.push(index);
  }
  return { text, sourceOffsets };
}

function isWholeWord(text: string, from: number, to: number): boolean {
  const word = /[\p{L}\p{N}_]/u;
  return (from === 0 || !word.test(text[from - 1] ?? '')) && (to === text.length || !word.test(text[to] ?? ''));
}

function contains(range: SourceRange, from: number, to: number): boolean {
  return from >= range.from && to <= range.to;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function checkbox(documentRef: Document, label: string, onChange: () => void): HTMLInputElement {
  const input = documentRef.createElement('input');
  input.type = 'checkbox';
  input.setAttribute('aria-label', label);
  input.addEventListener('change', onChange);
  return input;
}

function labelledCheckbox(documentRef: Document, text: string, input: HTMLInputElement): HTMLLabelElement {
  const label = documentRef.createElement('label');
  label.append(input, documentRef.createTextNode(text));
  return label;
}

function option(documentRef: Document, value: FindMode, text: string): HTMLOptionElement {
  const element = documentRef.createElement('option');
  element.value = value;
  element.textContent = text;
  return element;
}

function button(documentRef: Document, label: string, text: string, onClick: () => void): HTMLButtonElement {
  const element = documentRef.createElement('button');
  element.type = 'button';
  element.setAttribute('aria-label', label);
  element.textContent = text;
  element.addEventListener('click', onClick);
  return element;
}
