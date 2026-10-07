export interface RecoveredDraft {
  readonly canonicalText: string;
  readonly draftText: string;
  readonly baseMatches: boolean;
}

export type RecoveryChoice = 'inspect' | 'copy' | 'reload' | 'discard';

export function prepareRecoveredDraft(
  canonicalText: string,
  canonicalHash: string,
  record: { readonly canonicalBaseHash: string; readonly draftText: string }
): RecoveredDraft {
  return {
    canonicalText,
    draftText: record.draftText,
    baseMatches: record.canonicalBaseHash === canonicalHash
  };
}
