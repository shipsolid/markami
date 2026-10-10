import { StateField } from '@codemirror/state';
import { Decoration, EditorView, WidgetType, type DecorationSet } from '@codemirror/view';
import {
  parseGfmTables,
  planCellEdit,
  planCellEditAndAppendRow,
  planTableOperation,
  type GfmTable
} from '../../../core/markdown/tables.js';
import { syntaxSelection } from '../../projection/syntaxReveal.js';
import { renderInlineMarkdown, sourceOffsetForRenderedOffset } from './inlineRender.js';

const CELL_POINTER_EVENTS = new Set([
  'mousedown', 'mouseup', 'click', 'dblclick', 'pointerdown', 'pointerup', 'touchstart', 'touchend', 'contextmenu'
]);

export type TablePlan = GfmTable & { readonly replaceSource: boolean };

export function buildTablePlan(source: string, selection: { readonly from: number; readonly to: number }): readonly TablePlan[] {
  return parseGfmTables(source).map((table) => ({
    ...table,
    replaceSource: !(selection.from >= table.from && selection.to <= table.to)
  }));
}

export const tableProjectionField = StateField.define<DecorationSet>({
  create(state) {
    const selection = syntaxSelection(state);
    return decorations(state.doc.toString(), selection.from, selection.to);
  },
  update(_value, transaction) {
    const selection = syntaxSelection(transaction.state);
    return decorations(transaction.state.doc.toString(), selection.from, selection.to);
  },
  provide: (field) => EditorView.decorations.from(field)
});

function decorations(source: string, from: number, to: number): DecorationSet {
  const ranges = buildTablePlan(source, { from, to })
    .filter((table) => table.replaceSource)
    .map((table) => Decoration.replace({ widget: new TableWidget(table), block: true }).range(table.from, table.to));
  return Decoration.set(ranges, true);
}

class TableWidget extends WidgetType {
  public constructor(private readonly table: GfmTable) {
    super();
  }

  public override eq(other: TableWidget): boolean {
    return other.table.snapshot === this.table.snapshot && other.table.from === this.table.from;
  }

  public override toDOM(view: EditorView): HTMLElement {
    const root = document.createElement('div');
    root.className = 'markami-table';
    const grid = document.createElement('div');
    grid.className = 'markami-table-grid';
    grid.setAttribute('role', 'grid');
    grid.setAttribute('aria-label', 'Markdown table');
    grid.setAttribute('aria-rowcount', String(this.table.rows.length));
    grid.setAttribute('aria-colcount', String(this.table.columnCount));
    const controls = document.createElement('div');
    controls.className = 'markami-table-controls';
    const operations = [
      ['insertRow', 'Add row'],
      ['deleteRow', 'Delete last row'],
      ['insertColumn', 'Add column'],
      ['deleteColumn', 'Delete last column'],
      ['align', 'Cycle first-column alignment']
    ] as const;
    for (const [operation, label] of operations) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.action = operation;
      button.textContent = label;
      button.addEventListener('click', () => this.applyStructure(view, operation));
      controls.append(button);
    }
    const scroll = document.createElement('div');
    scroll.className = 'markami-table-scroll';
    scroll.append(grid);
    root.append(controls, scroll);
    this.table.rows.forEach((row, rowIndex) => {
      const rowElement = document.createElement('div');
      rowElement.setAttribute('role', 'row');
      rowElement.setAttribute('aria-rowindex', String(rowIndex + 1));
      for (let column = 0; column < this.table.columnCount; column += 1) {
        const cell = row.cells[column];
        const editor = document.createElement('div');
        editor.contentEditable = cell === undefined ? 'false' : 'true';
        editor.setAttribute('role', rowIndex === 0 ? 'columnheader' : 'gridcell');
        editor.setAttribute('aria-rowindex', String(rowIndex + 1));
        editor.setAttribute('aria-colindex', String(column + 1));
        const header = this.table.rows[0]?.cells[column]?.value.trim() || `Column ${String(column + 1)}`;
        editor.setAttribute('aria-label', rowIndex === 0 ? `Column ${header}` : `Row ${String(rowIndex + 1)}, ${header}`);
        editor.tabIndex = 0;
        showRendered(editor, cell?.value ?? '');
        if (cell !== undefined) {
          let committedByTab = false;
          let pointerRenderedOffset: number | undefined;
          // The browser places the caret on the layout it finds after the focus swap, so remember where in the rendered
          // text the pointer went down and put the caret at the matching source offset once the click completes.
          editor.addEventListener('mousedown', (event) => {
            pointerRenderedOffset = editor.dataset.rendered === 'true'
              ? renderedOffsetAt(editor, event.clientX, event.clientY)
              : undefined;
          });
          editor.addEventListener('mouseup', () => {
            const rendered = pointerRenderedOffset;
            pointerRenderedOffset = undefined;
            const source = editor.dataset.rawSource ?? '';
            if (rendered === undefined || source === editor.dataset.shownText) return;
            placeCaret(editor, sourceOffsetForRenderedOffset(source, rendered));
          });
          // A cell shows its inline Markdown rendered and switches to the raw source while it has focus.
          editor.addEventListener('focus', () => showSource(editor));
          editor.addEventListener('blur', () => {
            const value = editor.textContent;
            if (!committedByTab) this.commitCell(view, rowIndex, column, value);
            showRendered(editor, value);
          });
          editor.addEventListener('keydown', (event) => {
            if (event.key !== 'Tab') return;
            const lastRow = rowIndex === this.table.rows.length - 1;
            const lastColumn = column === this.table.columnCount - 1;
            const firstCell = rowIndex === 0 && column === 0;
            event.preventDefault();
            committedByTab = true;
            if (!event.shiftKey && lastRow && lastColumn) {
              const result = planCellEditAndAppendRow(
                view.state.doc.toString(),
                this.table,
                rowIndex,
                column,
                editor.textContent
              );
              if (result.ok) {
                dispatch(view, result.edit, true);
                focusTableCell(view, rowIndex + 1, 0);
              }
              return;
            }
            const linear = rowIndex * this.table.columnCount + column + (event.shiftKey ? -1 : 1);
            const result = planCellEdit(view.state.doc.toString(), this.table, rowIndex, column, editor.textContent);
            if (result.ok) dispatch(view, result.edit, true);
            if (event.shiftKey && firstCell) focusTableControls(view);
            else focusTableCell(view, Math.floor(linear / this.table.columnCount), linear % this.table.columnCount);
          });
        }
        rowElement.append(editor);
      }
      grid.append(rowElement);
    });
    const reveal = document.createElement('button');
    reveal.type = 'button';
    reveal.textContent = 'Edit table source';
    reveal.addEventListener('click', () => {
      view.dispatch({ selection: { anchor: this.table.from, head: this.table.to }, scrollIntoView: true });
      view.focus();
    });
    controls.append(reveal);
    return root;
  }

  // Pointer events inside a cell belong to the cell: left to the editor they would move the document selection into
  // the table, which reveals its source and replaces the cell being clicked. Everything else still reaches the editor.
  public override ignoreEvent(event: Event): boolean {
    return CELL_POINTER_EVENTS.has(event.type) && event.target instanceof Element &&
      event.target.closest('[role="gridcell"], [role="columnheader"]') !== null;
  }

  private commitCell(view: EditorView, row: number, column: number, value: string): void {
    const result = planCellEdit(view.state.doc.toString(), this.table, row, column, value);
    if (result.ok) dispatch(view, result.edit, true);
  }

  private applyStructure(
    view: EditorView,
    operation: 'insertRow' | 'deleteRow' | 'insertColumn' | 'deleteColumn' | 'align'
  ): void {
    const action = operation === 'insertRow'
      ? { type: 'insertRow' as const, row: this.table.rows.length }
      : operation === 'deleteRow'
        ? { type: 'deleteRow' as const, row: this.table.rows.length - 1 }
        : operation === 'insertColumn'
          ? { type: 'insertColumn' as const, column: this.table.columnCount, label: 'Column' }
          : operation === 'deleteColumn'
            ? { type: 'deleteColumn' as const, column: this.table.columnCount - 1 }
            : { type: 'align' as const, column: 0, alignment: nextAlignment(this.table.alignments[0] ?? 'none') };
    const result = planTableOperation(view.state.doc.toString(), this.table, action);
    if (result.ok) dispatch(view, result.edit, true);
  }
}

/** Renders a cell's inline Markdown; remembers what is shown so focus can tell untouched content from edited. */
function showRendered(editor: HTMLElement, source: string): void {
  editor.replaceChildren(renderInlineMarkdown(editor.ownerDocument, source));
  editor.dataset.rendered = 'true';
  editor.dataset.rawSource = source;
  editor.dataset.shownText = editor.textContent;
}

/** Swaps an untouched rendered cell for its raw source with the caret at the end; plain cells are left alone. */
function showSource(editor: HTMLElement): void {
  if (editor.dataset.rendered !== 'true') return;
  const source = editor.dataset.rawSource ?? '';
  delete editor.dataset.rendered;
  if (editor.textContent !== editor.dataset.shownText || editor.dataset.shownText === source) return;
  editor.textContent = source;
  const selection = editor.ownerDocument.defaultView?.getSelection();
  if (selection === null || selection === undefined) return;
  const range = editor.ownerDocument.createRange();
  range.selectNodeContents(editor);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

/** The number of rendered characters before the point, or undefined when it is not over the cell's text. */
function renderedOffsetAt(editor: HTMLElement, x: number, y: number): number | undefined {
  const position = editor.ownerDocument.caretPositionFromPoint(x, y);
  if (position === null || !editor.contains(position.offsetNode)) return undefined;
  const range = editor.ownerDocument.createRange();
  range.selectNodeContents(editor);
  range.setEnd(position.offsetNode, position.offset);
  return range.toString().length;
}

/** Puts a collapsed caret at a source offset, unless the user is dragging out a range. */
function placeCaret(editor: HTMLElement, offset: number): void {
  const selection = editor.ownerDocument.defaultView?.getSelection();
  const text = editor.firstChild;
  if (selection === null || selection === undefined || text?.nodeType !== Node.TEXT_NODE || !selection.isCollapsed) return;
  const range = editor.ownerDocument.createRange();
  range.setStart(text, Math.min(offset, (text.nodeValue ?? '').length));
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

function dispatch(
  view: EditorView,
  edit: Extract<ReturnType<typeof planCellEdit>, { ok: true }>['edit'],
  preserveSelection = false
): void {
  view.dispatch({
    changes: edit.patches.map((patch) => ({ from: Number(patch.from), to: Number(patch.to), insert: patch.insert })),
    ...(preserveSelection ? {} : { selection: edit.selectionAfter }),
    userEvent: 'input.markami.table'
  });
}

function focusTableCell(view: EditorView, row: number, column: number): void {
  queueMicrotask(() => view.dom.querySelector<HTMLElement>(
    `[role="gridcell"][aria-rowindex="${String(row + 1)}"][aria-colindex="${String(column + 1)}"],` +
    `[role="columnheader"][aria-rowindex="${String(row + 1)}"][aria-colindex="${String(column + 1)}"]`
  )?.focus({ preventScroll: true }));
}

function focusTableControls(view: EditorView): void {
  queueMicrotask(() => view.dom.querySelector<HTMLButtonElement>('.markami-table-controls button:last-child')
    ?.focus({ preventScroll: true }));
}

function nextAlignment(current: 'none' | 'left' | 'center' | 'right'): 'none' | 'left' | 'center' | 'right' {
  return current === 'none' ? 'left' : current === 'left' ? 'center' : current === 'center' ? 'right' : 'none';
}
