import {
  editorOffset,
  hostOffset,
  type EditorOffset,
  type HostOffset
} from './Patch.js';

export type CoordinateBias = 'backward' | 'forward';

export interface CoordinateMap {
  readonly hostText: string;
  readonly editorText: string;
  toHost(offset: EditorOffset): HostOffset;
  toEditor(offset: HostOffset, bias?: CoordinateBias): EditorOffset;
}

export { editorOffset, hostOffset };

export function createCoordinateMap(hostText: string): CoordinateMap {
  const editorParts: string[] = [];
  const editorToHost: number[] = [0];
  const hostToEditorBackward = new Array<number>(hostText.length + 1);
  const hostToEditorForward = new Array<number>(hostText.length + 1);
  hostToEditorBackward[0] = 0;
  hostToEditorForward[0] = 0;

  let host = 0;
  let editor = 0;
  while (host < hostText.length) {
    const codeUnit = hostText.charAt(host);
    if (codeUnit === '\r' && hostText.charAt(host + 1) === '\n') {
      hostToEditorBackward[host] = editor;
      hostToEditorForward[host] = editor;
      hostToEditorBackward[host + 1] = editor;
      hostToEditorForward[host + 1] = editor + 1;
      editorParts.push('\n');
      host += 2;
      editor += 1;
    } else {
      hostToEditorBackward[host] = editor;
      hostToEditorForward[host] = editor;
      editorParts.push(codeUnit === '\r' ? '\n' : codeUnit);
      host += 1;
      editor += 1;
    }

    hostToEditorBackward[host] = editor;
    hostToEditorForward[host] = editor;
    editorToHost[editor] = host;
  }

  const editorText = editorParts.join('');
  return {
    hostText,
    editorText,
    toHost(offset: EditorOffset): HostOffset {
      const value = Number(offset);
      if (value > editorText.length) {
        throw new RangeError('offset is outside editor text');
      }
      const mapped = editorToHost[value];
      if (mapped === undefined) {
        throw new RangeError('offset has no host coordinate');
      }
      return hostOffset(mapped);
    },
    toEditor(offset: HostOffset, bias: CoordinateBias = 'backward'): EditorOffset {
      const value = Number(offset);
      if (value > hostText.length) {
        throw new RangeError('offset is outside host text');
      }
      const mapped = bias === 'forward' ? hostToEditorForward[value] : hostToEditorBackward[value];
      if (mapped === undefined) {
        throw new RangeError('offset has no editor coordinate');
      }
      return editorOffset(mapped);
    }
  };
}
