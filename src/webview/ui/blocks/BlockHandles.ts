import type { MovableBlock } from '../../../core/markdown/blockIndex.js';
import { RangeSetBuilder, type Extension } from '@codemirror/state';
import { gutter, GutterMarker } from '@codemirror/view';

export type MoveBlock = (blockId: string, targetIndex: number) => void;

interface DragState {
  readonly block: MovableBlock;
  readonly version: number;
  targetIndex?: number;
}

export class BlockHandles {
  public readonly element: HTMLElement;
  public readonly insertionLine: HTMLElement;
  public readonly status: HTMLElement;

  private activeBlock: MovableBlock | undefined;
  private drag: DragState | undefined;

  public constructor(
    document: Document,
    private readonly move: MoveBlock,
    private readonly revealSource: (blockId: string) => void,
    private readonly copyMarkdown: (blockId: string) => void
  ) {
    this.element = document.createElement('div');
    this.element.hidden = true;
    this.element.className = 'markami-block-handles';
    this.element.setAttribute('role', 'toolbar');
    this.element.setAttribute('aria-label', 'Block actions');
    this.element.style.position = 'fixed';
    this.element.style.zIndex = '18';
    for (const [action, label] of [
      ['moveUp', 'Move block up'],
      ['moveDown', 'Move block down'],
      ['reveal', 'Reveal Markdown source'],
      ['copy', 'Copy as Markdown']
    ] as const) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.action = action;
      button.setAttribute('aria-label', label);
      button.textContent = action === 'moveUp' ? '↑' : action === 'moveDown' ? '↓' : action === 'reveal' ? '</>' : 'Copy';
      button.addEventListener('click', () => this.activate(action));
      this.element.append(button);
    }
    this.insertionLine = document.createElement('div');
    this.insertionLine.className = 'markami-block-insertion-line';
    this.insertionLine.hidden = true;
    this.insertionLine.style.position = 'fixed';
    this.insertionLine.style.height = '2px';
    this.insertionLine.style.background = 'var(--vscode-focusBorder)';
    this.status = document.createElement('div');
    this.status.setAttribute('role', 'status');
    this.status.setAttribute('aria-live', 'polite');
    document.body.append(this.element, this.insertionLine, this.status);
  }

  public show(block: MovableBlock, position: { readonly left: number; readonly top: number }): void {
    this.activeBlock = block;
    this.element.hidden = false;
    this.element.style.left = `${String(Math.max(0, position.left))}px`;
    this.element.style.top = `${String(Math.max(0, position.top))}px`;
    this.setMoveAvailability(block);
  }

  public get isDragging(): boolean {
    return this.drag !== undefined;
  }

  public hide(): void {
    this.element.hidden = true;
    this.activeBlock = undefined;
  }

  public beginDrag(block: MovableBlock, version: number): boolean {
    if (!block.movable || block.version !== version) return false;
    this.drag = { block, version };
    this.status.textContent = `Moving ${block.kind} block.`;
    return true;
  }

  public updateDragTarget(targetIndex: number, top: number): void {
    if (this.drag === undefined) return;
    this.drag.targetIndex = targetIndex;
    this.insertionLine.hidden = false;
    this.insertionLine.style.top = `${String(top)}px`;
  }

  public drop(targetIndex: number, currentVersion: number): boolean {
    const drag = this.drag;
    this.cancelDrag();
    if (drag === undefined || drag.version !== currentVersion) {
      this.status.textContent = 'Block move cancelled because the document changed.';
      return false;
    }
    this.move(drag.block.id, targetIndex);
    this.status.textContent = `Block moved to position ${String(targetIndex + 1)}.`;
    return true;
  }

  public handleKey(key: string): boolean {
    if (key === 'Escape' && this.drag !== undefined) {
      this.cancelDrag();
      this.status.textContent = 'Block move cancelled.';
      return true;
    }
    if (this.activeBlock !== undefined && (key === 'ArrowUp' || key === 'ArrowDown')) {
      const target = this.activeBlock.order + (key === 'ArrowUp' ? -1 : 1);
      if (target >= 0) this.move(this.activeBlock.id, target);
      return true;
    }
    return false;
  }

  public destroy(): void {
    this.element.remove();
    this.insertionLine.remove();
    this.status.remove();
  }

  private activate(action: 'moveUp' | 'moveDown' | 'reveal' | 'copy'): void {
    const block = this.activeBlock;
    if (block === undefined) return;
    if (action === 'reveal') {
      this.revealSource(block.id);
      return;
    }
    if (action === 'copy') {
      this.copyMarkdown(block.id);
      return;
    }
    const target = block.order + (action === 'moveUp' ? -1 : 1);
    if (target < 0) return;
    this.move(block.id, target);
    this.status.textContent = `Block moved ${action === 'moveUp' ? 'up' : 'down'}.`;
  }

  private cancelDrag(): void {
    this.drag = undefined;
    this.insertionLine.hidden = true;
  }

  private setMoveAvailability(block: MovableBlock): void {
    const up = this.element.querySelector<HTMLButtonElement>('[data-action="moveUp"]');
    const down = this.element.querySelector<HTMLButtonElement>('[data-action="moveDown"]');
    if (up !== null) up.disabled = !block.movable || block.order === 0;
    if (down !== null) down.disabled = !block.movable;
  }
}

export function computeAutoScrollVelocity(pointerY: number, viewportHeight: number): number {
  const edge = Math.min(48, viewportHeight / 4);
  if (pointerY < edge) return -Math.round(18 * (1 - Math.max(0, pointerY) / edge));
  if (pointerY > viewportHeight - edge) {
    return Math.round(18 * (1 - Math.max(0, viewportHeight - pointerY) / edge));
  }
  return 0;
}

export function blockHandleGutter(
  blocks: () => readonly MovableBlock[],
  controller: () => BlockHandles | undefined
): Extension {
  return gutter({
    class: 'markami-block-gutter',
    markers(view) {
      const builder = new RangeSetBuilder<GutterMarker>();
      for (const block of blocks()) {
        const position = view.state.doc.lineAt(Math.min(block.core.from, view.state.doc.length)).from;
        builder.add(position, position, new BlockHandleMarker(block, blocks, controller));
      }
      return builder.finish();
    }
  });
}

class BlockHandleMarker extends GutterMarker {
  public constructor(
    private readonly block: MovableBlock,
    private readonly blocks: () => readonly MovableBlock[],
    private readonly controller: () => BlockHandles | undefined
  ) {
    super();
  }

  public override toDOM(): Node {
    const button = document.createElement('button');
    button.type = 'button';
    button.draggable = this.block.movable;
    button.textContent = '⋮⋮';
    button.setAttribute('aria-label', `Actions for ${this.block.kind} block`);
    button.addEventListener('click', () => {
      const rect = button.getBoundingClientRect();
      controllerShow(this.controller(), this.block, rect, this.blocks().length);
    });
    button.addEventListener('dragstart', (event) => {
      if (this.controller()?.beginDrag(this.block, this.block.version) === true) {
        event.dataTransfer?.setData('text/plain', this.block.id);
        if (event.dataTransfer !== null) event.dataTransfer.effectAllowed = 'move';
      } else {
        event.preventDefault();
      }
    });
    return button;
  }
}

function controllerShow(
  controller: BlockHandles | undefined,
  block: MovableBlock,
  rect: DOMRect,
  totalBlocks: number
): void {
  controller?.show(block, { left: rect.right + 4, top: rect.top });
  const down = controller?.element.querySelector<HTMLButtonElement>('[data-action="moveDown"]');
  if (down !== null && down !== undefined) down.disabled = !block.movable || block.order >= totalBlocks - 1;
}
