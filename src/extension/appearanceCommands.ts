export type DocumentAppearance = 'vscode' | 'document';
export type DocumentWidth = 'auto' | 'readable' | 'full';

export interface PreferenceChoice {
  readonly label: string;
  readonly description: string;
  readonly value: DocumentAppearance | DocumentWidth;
}

export type PreferencePicker = (
  items: readonly PreferenceChoice[]
) => PromiseLike<PreferenceChoice | undefined>;

const APPEARANCE_CHOICES: readonly PreferenceChoice[] = [
  { label: 'VS Code', description: 'Compact editor-oriented typography', value: 'vscode' },
  { label: 'Document', description: 'Comfortable document-oriented typography', value: 'document' }
];

const WIDTH_CHOICES: readonly PreferenceChoice[] = [
  { label: 'Auto', description: 'Centered up to the configured maximum', value: 'auto' },
  { label: 'Readable', description: 'Prose capped at 80 characters', value: 'readable' },
  { label: 'Full', description: 'All available content width', value: 'full' }
];

export async function chooseDocumentAppearance(
  supplied: unknown,
  pick: PreferencePicker
): Promise<DocumentAppearance | undefined> {
  if (isDocumentAppearance(supplied)) return supplied;
  const selected = await pick(APPEARANCE_CHOICES);
  return isDocumentAppearance(selected?.value) ? selected.value : undefined;
}

export async function chooseDocumentWidth(
  supplied: unknown,
  pick: PreferencePicker
): Promise<DocumentWidth | undefined> {
  if (isDocumentWidth(supplied)) return supplied;
  const selected = await pick(WIDTH_CHOICES);
  return isDocumentWidth(selected?.value) ? selected.value : undefined;
}

function isDocumentAppearance(value: unknown): value is DocumentAppearance {
  return value === 'vscode' || value === 'document';
}

function isDocumentWidth(value: unknown): value is DocumentWidth {
  return value === 'auto' || value === 'readable' || value === 'full';
}
