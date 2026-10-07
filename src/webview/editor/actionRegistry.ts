import {
  planHeading,
  planInlineFormat,
  type ActionContext,
  type ActionResult,
  type InlineFormatKind
} from '../../core/markdown/formatting.js';

export interface EditorAction {
  readonly id: string;
  readonly label: string;
  isAvailable(ctx: ActionContext): boolean;
  plan(ctx: ActionContext, args?: unknown): ActionResult;
}

export class ActionRegistry {
  private readonly actions = new Map<string, EditorAction>();

  public register(action: EditorAction): void {
    if (this.actions.has(action.id)) {
      throw new Error(`duplicate editor action: ${action.id}`);
    }
    this.actions.set(action.id, action);
  }

  public get(id: string): EditorAction | undefined {
    return this.actions.get(id);
  }

  public list(): readonly EditorAction[] {
    return [...this.actions.values()];
  }

  public plan(id: string, ctx: ActionContext, args?: unknown): ActionResult {
    const action = this.actions.get(id);
    if (action === undefined) {
      return { ok: false, reason: `unknown editor action: ${id}` };
    }
    if (!action.isAvailable(ctx)) {
      return { ok: false, reason: `${action.label} is unavailable for this selection` };
    }
    return action.plan(ctx, args);
  }
}

export function createFormattingActionRegistry(): ActionRegistry {
  const registry = new ActionRegistry();
  const inline: readonly { id: string; label: string; kind: InlineFormatKind }[] = [
    { id: 'markami.bold', label: 'Bold', kind: 'strong' },
    { id: 'markami.italic', label: 'Italic', kind: 'emphasis' },
    { id: 'markami.strikethrough', label: 'Strikethrough', kind: 'strike' },
    { id: 'markami.inlineCode', label: 'Inline code', kind: 'code' },
    { id: 'markami.link', label: 'Create or edit link', kind: 'link' },
    { id: 'markami.clearFormatting', label: 'Clear formatting', kind: 'clear' }
  ];
  for (const descriptor of inline) {
    registry.register({
      id: descriptor.id,
      label: descriptor.label,
      isAvailable: formattingAvailable,
      plan: (ctx, args) => planInlineFormat(ctx, descriptor.kind, isLinkArgs(args) ? args : {})
    });
  }
  registry.register(headingAction('markami.paragraph', 'Paragraph', 0));
  for (const level of [1, 2, 3, 4, 5, 6] as const) {
    registry.register(headingAction(`markami.heading${String(level)}`, `Heading ${String(level)}`, level));
  }
  return registry;
}

function headingAction(id: string, label: string, level: 0 | 1 | 2 | 3 | 4 | 5 | 6): EditorAction {
  return {
    id,
    label,
    isAvailable: formattingAvailable,
    plan: (ctx) => planHeading(ctx, level)
  };
}

function formattingAvailable(ctx: ActionContext): boolean {
  return ctx.capabilities.formatting !== false && ctx.capabilities.sourceIsland !== true;
}

function isLinkArgs(value: unknown): value is { readonly href?: string } {
  return typeof value === 'object' && value !== null && (!('href' in value) || typeof value.href === 'string');
}
