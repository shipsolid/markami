export interface RecoveredDraft {
  readonly canonicalText: string;
  readonly draftText: string;
  readonly baseMatches: boolean;
}

export type { RecoveryChoice } from '../../protocol/messages.js';

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

export function preserveLiveConflictDraft(
  current: string | undefined,
  incoming: string | undefined
): string | undefined {
  return incoming ?? current;
}
