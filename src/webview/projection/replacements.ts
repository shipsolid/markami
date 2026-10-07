import { Decoration, type DecorationSet } from '@codemirror/view';
import type { HiddenToken } from '../../core/markdown/syntax.js';

export function hiddenTokenDecorations(tokens: readonly HiddenToken[]): DecorationSet {
  return Decoration.set(tokens.map((token) => Decoration.replace({}).range(token.from, token.to)), true);
}
