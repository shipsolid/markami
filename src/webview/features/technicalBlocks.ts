import { Facet, StateField, type Extension } from '@codemirror/state';
import { Decoration, EditorView, WidgetType, type DecorationSet } from '@codemirror/view';
import { FeatureRegistry } from '../../core/markdown/featureRegistry.js';
import { findAlerts, type AlertBlock } from './alerts/alerts.js';
import { findFencedBlocks, type FencedBlock } from './codeBlocks/codeFence.js';
import { findMathRanges, renderMath, type MathRange } from './math/mathRenderer.js';
import { DebouncedMermaidRenderer, LocalMermaidRenderer } from './mermaid/mermaidRenderer.js';
import { findTaskMarkers, type TaskMarker } from './tasks/taskPlanner.js';
import { syntaxSelection } from '../projection/syntaxReveal.js';
import { sanitizeMermaidSvg } from '../security/sanitize.js';

export interface TechnicalCodeBlock extends FencedBlock {
  readonly active: boolean;
}

export interface MermaidBlock extends TechnicalCodeBlock {
  readonly replaceSource: boolean;
}

export interface TechnicalPlan {
  readonly tasks: readonly TaskMarker[];
  readonly codeBlocks: readonly TechnicalCodeBlock[];
  readonly mermaid: readonly MermaidBlock[];
  readonly math: readonly (MathRange & { readonly active: boolean; readonly replaceSource: boolean })[];
  readonly alerts: readonly AlertBlock[];
  readonly sourceIslands: readonly { readonly from: number; readonly to: number; readonly reason: string }[];
}

const mermaidRenderer = new LocalMermaidRenderer();

export interface TechnicalBlockOptions {
  readonly renderMermaid: boolean;
  readonly renderMath: boolean;
  readonly codeWrap: boolean;
}

const defaultOptions: TechnicalBlockOptions = { renderMermaid: true, renderMath: true, codeWrap: true };
const technicalOptions = Facet.define<TechnicalBlockOptions, TechnicalBlockOptions>({
  combine(values) {
    return values.at(-1) ?? defaultOptions;
  }
});

export function technicalBlocks(options: Partial<TechnicalBlockOptions> = {}): Extension {
  return [technicalOptions.of({ ...defaultOptions, ...options }), technicalBlocksField, codeBlockHover];
}

export const technicalBlocksField = StateField.define<DecorationSet>({
  create(state) {
    const selection = syntaxSelection(state);
    return decorationsFor(state.doc.toString(), selection.from, selection.to, state, state.facet(technicalOptions));
  },
  update(_value, transaction) {
    const selection = syntaxSelection(transaction.state);
    return decorationsFor(
      transaction.state.doc.toString(),
      selection.from,
      selection.to,
      transaction.state,
      transaction.state.facet(technicalOptions)
    );
  },
  provide: (field) => EditorView.decorations.from(field)
});

export function buildTechnicalPlan(
  source: string,
  selection: { readonly from: number; readonly to: number }
): TechnicalPlan {
  const fences = findFencedBlocks(source);
  const closed = fences.filter((block) => block.closed);
  const sourceIslands = fences
    .filter((block) => !block.closed)
    .map((block) => ({ from: block.from, to: block.to, reason: 'unterminated fence' }));
  const tasks = findTaskMarkers(source).filter((marker) => !fences.some((block) => overlaps(marker, block)));
  const technical = closed.map((block) => ({ ...block, active: touches(block, selection) }));
  const mermaid = technical
    .filter((block) => block.language.toLocaleLowerCase() === 'mermaid')
    .map((block) => ({ ...block, replaceSource: !block.active }));
  const mermaidStarts = new Set(mermaid.map((block) => block.from));
  const codeBlocks = technical.filter((block) => !mermaidStarts.has(block.from));
  const math = findMathRanges(source)
    .filter((range) => !fences.some((block) => overlaps(range, block)))
    .map((range) => {
      const active = touches(range, selection);
      return { ...range, active, replaceSource: !active };
    });
  return { tasks, codeBlocks, mermaid, math, alerts: findAlerts(source), sourceIslands };
}

export function registerTechnicalFeatures(registry: FeatureRegistry): void {
  registry.register({ id: 'tasks', sourceKinds: ['taskListItem'] });
  registry.register({ id: 'code-blocks', sourceKinds: ['fencedCode'] });
  registry.register({ id: 'mermaid', sourceKinds: ['fencedCode:mermaid'] });
  registry.register({ id: 'math', sourceKinds: ['inlineMath', 'displayMath'] });
  registry.register({ id: 'alerts', sourceKinds: ['blockquote:alert'] });
}

function decorationsFor(
  source: string,
  selectionFrom: number,
  selectionTo: number,
  state: { readonly doc: { lineAt(position: number): { readonly from: number; readonly to: number }; readonly length: number } },
  options: TechnicalBlockOptions
): DecorationSet {
  const plan = buildTechnicalPlan(source, { from: selectionFrom, to: selectionTo });
  const ranges = [];
  for (const task of plan.tasks) {
    ranges.push(Decoration.replace({ widget: new TaskCheckboxWidget(task) }).range(task.from, task.to));
  }
  for (const block of plan.codeBlocks) {
    ranges.push(Decoration.replace({ widget: new CodeHeaderWidget(block, block.active), block: true }).range(block.opening.from, block.opening.to));
    if (block.closing !== undefined) {
      ranges.push(Decoration.replace({}).range(block.closing.from, block.closing.to));
      ranges.push(Decoration.line({ class: 'markami-code-fence-close' }).range(state.doc.lineAt(block.closing.from).from));
    }
    const codeLines: number[] = [];
    for (let position = block.content.from; position < block.content.to;) {
      const line = state.doc.lineAt(position);
      codeLines.push(line.from);
      position = line.to < state.doc.length ? line.to + 1 : block.content.to;
    }
    codeLines.forEach((lineFrom, index) => {
      const classes = ['markami-code-line'];
      if (options.codeWrap) classes.push('markami-code-wrap');
      if (index === 0) classes.push('markami-code-first');
      if (index === codeLines.length - 1) classes.push('markami-code-last');
      ranges.push(Decoration.line({ class: classes.join(' ') }).range(lineFrom));
    });
  }
  for (const block of plan.mermaid) {
    if (!options.renderMermaid) continue;
    const widget = new MermaidWidget(source.slice(block.content.from, block.content.to), block.content.from);
    if (block.replaceSource) {
      ranges.push(Decoration.replace({ widget, block: true }).range(block.from, block.to));
    } else {
      ranges.push(Decoration.widget({ widget, block: true, side: -1 }).range(block.opening.from));
    }
  }
  for (const math of plan.math) {
    if (!options.renderMath) continue;
    if (math.replaceSource) {
      ranges.push(Decoration.replace({ widget: new MathWidget(math), block: math.display }).range(math.from, math.to));
    }
  }
  for (const alert of plan.alerts) {
    ranges.push(Decoration.line({ class: `markami-alert markami-alert-${alert.type}` }).range(state.doc.lineAt(alert.from).from));
  }
  for (const island of plan.sourceIslands) {
    ranges.push(Decoration.line({ class: 'markami-technical-source-island' }).range(state.doc.lineAt(island.from).from));
  }
  return Decoration.set(ranges, true);
}

export class TaskCheckboxWidget extends WidgetType {
  public constructor(private readonly marker: TaskMarker) {
    super();
  }

  public override eq(other: TaskCheckboxWidget): boolean {
    return other.marker.from === this.marker.from && other.marker.checked === this.marker.checked;
  }

  public override toDOM(view: EditorView): HTMLElement {
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = this.marker.checked;
    checkbox.setAttribute('aria-label', this.marker.checked ? 'Mark task incomplete' : 'Mark task complete');
    checkbox.addEventListener('change', () => {
      view.dispatch({
        changes: { from: this.marker.from + 1, to: this.marker.from + 2, insert: checkbox.checked ? 'x' : ' ' },
        userEvent: 'input.markami.task'
      });
    });
    return checkbox;
  }

  public override ignoreEvent(): boolean {
    return false;
  }
}

class CodeHeaderWidget extends WidgetType {
  public constructor(private readonly block: TechnicalCodeBlock, private readonly active: boolean) {
    super();
  }

  public override eq(other: CodeHeaderWidget): boolean {
    return other.block.from === this.block.from && other.block.info === this.block.info && other.active === this.active;
  }

  // The header takes no row: it is a zero-height anchor whose tools float over the card's top-right corner and show
  // for the hovered block, the block holding the caret, or while a tool has keyboard focus.
  public override toDOM(view: EditorView): HTMLElement {
    const header = document.createElement('div');
    header.className = 'markami-code-header';
    if (this.active) header.dataset.active = 'true';
    const tools = document.createElement('div');
    tools.className = 'markami-code-tools';
    const label = document.createElement('span');
    label.className = 'markami-code-label';
    label.textContent = this.block.language || 'code';
    const copy = document.createElement('button');
    copy.type = 'button';
    copy.textContent = 'Copy';
    copy.setAttribute('aria-label', `Copy ${this.block.language || 'code'} block`);
    copy.addEventListener('click', () => {
      void navigator.clipboard.writeText(view.state.doc.sliceString(this.block.content.from, this.block.content.to));
    });
    tools.append(label, copy);
    header.append(tools);
    return header;
  }

  public override ignoreEvent(): boolean {
    return false;
  }
}

/** Marks the header of the code block under the pointer so its tools can show without a wrapper around the lines. */
const codeBlockHover = EditorView.domEventHandlers({
  mousemove(event, view) {
    setHoveredCodeHeader(view, codeHeaderFor(event.target));
  },
  mouseleave(_event, view) {
    setHoveredCodeHeader(view, undefined);
  }
});

function setHoveredCodeHeader(view: EditorView, header: HTMLElement | undefined): void {
  for (const hovered of view.contentDOM.querySelectorAll<HTMLElement>('.markami-code-header[data-hover="true"]')) {
    if (hovered !== header) delete hovered.dataset.hover;
  }
  if (header !== undefined) header.dataset.hover = 'true';
}

function codeHeaderFor(target: EventTarget | null): HTMLElement | undefined {
  if (!(target instanceof Element)) return undefined;
  const own = target.closest<HTMLElement>('.markami-code-header');
  if (own !== null) return own;
  let sibling: Element | null = target.closest('.cm-line.markami-code-line, .cm-line.markami-code-fence-close');
  while (sibling !== null) {
    const header = sibling.matches('.markami-code-header')
      ? sibling
      : sibling.querySelector(':scope > .markami-code-header');
    if (header instanceof HTMLElement) return header;
    if (!sibling.matches('.cm-line.markami-code-line, .cm-line.markami-code-fence-close')) return undefined;
    sibling = sibling.previousElementSibling;
  }
  return undefined;
}

class MermaidWidget extends WidgetType {
  private readonly jobs = new DebouncedMermaidRenderer(mermaidRenderer, 200);

  public constructor(private readonly source: string, private readonly sourceOffset: number) {
    super();
  }

  public override eq(other: MermaidWidget): boolean {
    return other.source === this.source && other.sourceOffset === this.sourceOffset;
  }

  public override toDOM(view: EditorView): HTMLElement {
    const root = document.createElement('div');
    root.className = 'markami-mermaid';
    root.tabIndex = 0;
    root.setAttribute('aria-label', 'Mermaid diagram. Activate to edit source.');
    root.textContent = 'Rendering Mermaid…';
    root.addEventListener('click', () => {
      view.dispatch({ selection: { anchor: this.sourceOffset }, scrollIntoView: true });
      view.focus();
    });
    root.addEventListener('keydown', (event) => {
      if (!(event instanceof KeyboardEvent)) return;
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      view.dispatch({ selection: { anchor: this.sourceOffset }, scrollIntoView: true });
      view.focus();
    });
    this.jobs.schedule(this.source, (result) => {
      if (!root.isConnected) return;
      if (result.ok) {
        root.innerHTML = sanitizeMermaidSvg(result.svg);
      } else {
        root.textContent = `Mermaid error: ${result.error}`;
        root.classList.add('markami-render-error');
      }
    });
    return root;
  }

  public override destroy(): void {
    this.jobs.dispose();
  }

  public override ignoreEvent(): boolean {
    return false;
  }
}

class MathWidget extends WidgetType {
  public constructor(private readonly math: MathRange) {
    super();
  }

  public override eq(other: MathWidget): boolean {
    return other.math.source === this.math.source && other.math.display === this.math.display;
  }

  public override toDOM(view: EditorView): HTMLElement {
    const root = document.createElement(this.math.display ? 'div' : 'span');
    root.className = 'markami-math';
    root.tabIndex = 0;
    root.setAttribute('aria-label', 'Math expression. Activate to edit source.');
    root.addEventListener('click', () => {
      view.dispatch({ selection: { anchor: this.math.from }, scrollIntoView: true });
      view.focus();
    });
    root.addEventListener('keydown', (event) => {
      if (!(event instanceof KeyboardEvent)) return;
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      view.dispatch({ selection: { anchor: this.math.from }, scrollIntoView: true });
      view.focus();
    });
    void renderMath(this.math.source, this.math.display).then((html) => {
      if (root.isConnected) root.innerHTML = html;
    }).catch((error: unknown) => {
      root.textContent = error instanceof Error ? error.message : 'Math rendering failed';
    });
    return root;
  }

  public override ignoreEvent(): boolean {
    return false;
  }
}

function overlaps(left: { readonly from: number; readonly to: number }, right: { readonly from: number; readonly to: number }): boolean {
  return left.from < right.to && right.from < left.to;
}

function touches(range: { readonly from: number; readonly to: number }, selection: { readonly from: number; readonly to: number }): boolean {
  return selection.from >= range.from && selection.to <= range.to;
}
