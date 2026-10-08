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
    root.append(controls, grid);
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
        editor.textContent = cell?.value ?? '';
        if (cell !== undefined) {
          let committedByTab = false;
          editor.addEventListener('blur', () => {
            if (!committedByTab) this.commitCell(view, rowIndex, column, editor.textContent);
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
    root.append(reveal);
    return root;
  }

  public override ignoreEvent(): boolean {
    return false;
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
