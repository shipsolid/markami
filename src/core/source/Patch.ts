declare const hostOffsetBrand: unique symbol;
declare const editorOffsetBrand: unique symbol;

export type HostOffset = number & { readonly [hostOffsetBrand]: 'HostOffset' };
export type EditorOffset = number & { readonly [editorOffsetBrand]: 'EditorOffset' };

export interface TextPatch {
  readonly from: HostOffset;
  readonly to: HostOffset;
  readonly insert: string;
}

export function hostOffset(value: number): HostOffset {
  assertOffset(value, 'host');
  return value as HostOffset;
}

export function editorOffset(value: number): EditorOffset {
  assertOffset(value, 'editor');
  return value as EditorOffset;
}

export function createTextPatch(from: number, to: number, insert: string): TextPatch {
  return {
    from: from as HostOffset,
    to: to as HostOffset,
    insert
  };
}

function assertOffset(value: number, kind: string): void {
  if (!Number.isInteger(value)) {
    throw new RangeError(`${kind} offset must be an integer`);
  }
  if (value < 0) {
    throw new RangeError(`${kind} offset must be non-negative`);
  }
}
