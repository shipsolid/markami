import { selectionCapabilities, type ActionContext } from '../../core/markdown/formatting.js';

export interface SlashState {
  readonly from: number;
  readonly to: number;
  readonly query: string;
  readonly editorRevision: number;
  readonly hostVersion: number;
  readonly explicit: boolean;
  readonly context: ActionContext;
}

export function canOpenSlash(ctx: ActionContext): boolean {
  if (ctx.selection.anchor !== ctx.selection.head) {
    return false;
  }
  const cursor = ctx.selection.head;
  const lineFrom = ctx.source.lastIndexOf('\n', Math.max(0, cursor - 1)) + 1;
  const nextNewline = ctx.source.indexOf('\n', cursor);
  const lineTo = nextNewline === -1 ? ctx.source.length : nextNewline;
  const line = ctx.source.slice(lineFrom, lineTo);
  const capabilities = selectionCapabilities(ctx.source, ctx.selection);
  return capabilities.formatting !== false &&
    ctx.capabilities.sourceIsland !== true &&
    lineFrom + line.length === cursor &&
    /^\/[\p{L}\p{N}_-]*$/u.test(line);
}

export function openSlashState(ctx: ActionContext, explicit = false): SlashState {
  const cursor = ctx.selection.head;
  if (ctx.selection.anchor !== cursor) {
    throw new RangeError('slash commands require one caret');
  }
  const lineFrom = ctx.source.lastIndexOf('\n', Math.max(0, cursor - 1)) + 1;
  const nextNewline = ctx.source.indexOf('\n', cursor);
  const lineTo = nextNewline === -1 ? ctx.source.length : nextNewline;
  if (explicit) {
    if (ctx.source.slice(lineFrom, lineTo).trim() !== '') {
      throw new RangeError('slash commands require an empty top-level paragraph');
    }
    return makeState(ctx, cursor, cursor, '', true);
  }
  if (!canOpenSlash(ctx)) {
    throw new RangeError('slash trigger is not available here');
  }
  return makeState(ctx, lineFrom, cursor, ctx.source.slice(lineFrom + 1, cursor), false);
}

export function updateSlashState(state: SlashState, ctx: ActionContext): SlashState | undefined {
  if (ctx.selection.anchor !== ctx.selection.head || ctx.capabilities.sourceIsland === true) {
    return undefined;
  }
  if (state.explicit) {
    return ctx.editorRevision === state.editorRevision && ctx.hostVersion === state.hostVersion
      ? { ...state, context: ctx }
      : undefined;
  }
  const cursor = ctx.selection.head;
  if (cursor < state.from || !/^\/[\p{L}\p{N}_-]*$/u.test(ctx.source.slice(state.from, cursor))) {
    return undefined;
  }
  const nextNewline = ctx.source.indexOf('\n', cursor);
  const lineTo = nextNewline === -1 ? ctx.source.length : nextNewline;
  if (ctx.source.slice(cursor, lineTo).trim() !== '') {
    return undefined;
  }
  return makeState(ctx, state.from, cursor, ctx.source.slice(state.from + 1, cursor), false);
}

function makeState(ctx: ActionContext, from: number, to: number, query: string, explicit: boolean): SlashState {
  return {
    from,
    to,
    query,
    editorRevision: ctx.editorRevision,
    hostVersion: ctx.hostVersion,
    explicit,
    context: {
      ...ctx,
      selection: { anchor: from, head: to },
      capabilities: { ...ctx.capabilities }
    }
  };
}
