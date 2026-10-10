export type EditorAssociations = Readonly<Record<string, string>>;
export type DefaultEditorMode = 'markami' | 'native';

export type DefaultEditorPlan =
  | { readonly kind: 'update'; readonly associations: EditorAssociations }
  | { readonly kind: 'unchanged' }
  | { readonly kind: 'unsupported' };

export interface DefaultEditorHost {
  readonly readUserAssociations: () => unknown;
  readonly writeUserAssociations: (associations: EditorAssociations) => PromiseLike<void>;
  readonly confirm: (message: string, action: string) => PromiseLike<boolean>;
  readonly inform: (message: string) => void;
}

const MARKAMI_VIEW_TYPE = 'markami.editor';
const MARKDOWN_PATTERNS = ['*.md', '*.markdown'] as const;

export function planDefaultEditor(current: unknown, mode: DefaultEditorMode): DefaultEditorPlan {
  const associations = readAssociations(current);
  if (associations === undefined) return { kind: 'unsupported' };

  const next: EditorAssociations = mode === 'markami'
    ? { ...associations, ...Object.fromEntries(MARKDOWN_PATTERNS.map((pattern) => [pattern, MARKAMI_VIEW_TYPE])) }
    : Object.fromEntries(Object.entries(associations).filter(([pattern, viewType]) =>
      !(isMarkdownPattern(pattern) && viewType === MARKAMI_VIEW_TYPE)));

  const changed = Object.keys(next).length !== Object.keys(associations).length ||
    Object.entries(next).some(([pattern, viewType]) => associations[pattern] !== viewType);
  return changed ? { kind: 'update', associations: next } : { kind: 'unchanged' };
}

export async function applyDefaultEditor(mode: DefaultEditorMode, host: DefaultEditorHost): Promise<boolean> {
  const plan = planDefaultEditor(host.readUserAssociations(), mode);
  if (plan.kind === 'unsupported') {
    host.inform(
      'markami could not update workbench.editorAssociations because it is not a pattern-to-editor map. ' +
      'Use Reopen Editor With… → Configure default editor for \'*.md\' instead.'
    );
    return false;
  }
  if (plan.kind === 'unchanged') {
    host.inform(mode === 'markami'
      ? 'markami is already the default editor for .md and .markdown files.'
      : 'The native editor is already the default for .md and .markdown files.');
    return true;
  }

  const approved = mode === 'markami'
    ? await host.confirm(
      'Open .md and .markdown files in markami by default? This changes only those two entries in your ' +
      'user workbench.editorAssociations setting. Run "markami: Use Native Markdown Editor by Default" to undo it.',
      'Use markami by Default'
    )
    : await host.confirm(
      'Stop opening .md and .markdown files in markami by default? This removes only the markami entries ' +
      'from your user workbench.editorAssociations setting.',
      'Use Native Editor by Default'
    );
  if (!approved) return false;

  await host.writeUserAssociations(plan.associations);
  return true;
}

function isMarkdownPattern(pattern: string): boolean {
  return (MARKDOWN_PATTERNS as readonly string[]).includes(pattern);
}

function readAssociations(value: unknown): EditorAssociations | undefined {
  if (value === undefined || value === null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) return undefined;
  const entries = Object.entries(value);
  return entries.every((entry): entry is [string, string] => typeof entry[1] === 'string')
    ? Object.fromEntries(entries)
    : undefined;
}
