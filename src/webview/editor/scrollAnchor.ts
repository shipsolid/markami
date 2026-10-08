import type { EditorView } from '@codemirror/view';

export interface ScrollAnchor {
  readonly sourceOffset: number;
  readonly deltaY: number;
}

const measureKeys = new WeakMap<EditorView, object>();

export function captureScrollAnchor(view: EditorView): ScrollAnchor {
  const sourceOffset = view.viewportLineBlocks[0]?.from ?? view.viewport.from;
  const top = view.coordsAtPos(sourceOffset)?.top ?? view.documentTop + view.lineBlockAt(sourceOffset).top;
  return {
    sourceOffset,
    deltaY: top - view.scrollDOM.getBoundingClientRect().top
  };
}

export function restoreScrollAnchor(view: EditorView, anchor: ScrollAnchor): void {
  let key = measureKeys.get(view);
  if (key === undefined) {
    key = {};
    measureKeys.set(view, key);
  }
  view.requestMeasure({
    key,
    read(candidate) {
      const sourceOffset = Math.max(0, Math.min(anchor.sourceOffset, candidate.state.doc.length));
      const top = candidate.coordsAtPos(sourceOffset)?.top ?? candidate.documentTop + candidate.lineBlockAt(sourceOffset).top;
      return top - candidate.scrollDOM.getBoundingClientRect().top - anchor.deltaY;
    },
    write(deltaY, candidate) {
      if (!candidate.dom.isConnected || deltaY === 0) return;
      candidate.scrollDOM.scrollTop += deltaY / Math.max(candidate.scaleY, Number.EPSILON);
    }
  });
}
