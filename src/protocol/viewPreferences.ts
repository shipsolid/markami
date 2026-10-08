export type AppearanceMode = 'vscode' | 'document';
export type DocumentWidth = 'auto' | 'readable' | 'full';
export type SyntaxRevealPolicy = 'activeBlock' | 'selection' | 'manual';

export interface FileViewOverrides {
  readonly appearance?: AppearanceMode;
  readonly width?: DocumentWidth;
  readonly maxContentWidth?: number;
  readonly syntaxReveal?: SyntaxRevealPolicy;
  readonly outlineCollapsed?: boolean;
}

export type FileViewOverrideChanges = {
  -readonly [Key in keyof FileViewOverrides]?: FileViewOverrides[Key] | undefined;
};

export interface PreferenceRecord {
  readonly schemaVersion: 1;
  readonly overrides: FileViewOverrides;
  readonly updatedAt: number;
}

export interface StoredViewPreferences {
  readonly schemaVersion: 1;
  readonly records: Readonly<Record<string, unknown>>;
}

export interface EffectiveViewPreferences {
  readonly appearance: AppearanceMode;
  readonly width: DocumentWidth;
  readonly maxContentWidth: number;
  readonly syntaxReveal: SyntaxRevealPolicy;
  readonly outlineCollapsed: boolean;
}

export interface ViewPreferencesState {
  readonly schemaVersion: 1;
  readonly rememberPerFile: boolean;
  readonly effective: EffectiveViewPreferences;
}

export const VIEW_PREFERENCES_SCHEMA_VERSION = 1 as const;
