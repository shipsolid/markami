import type { TextPatch } from '../core/source/Patch.js';
import type { PROTOCOL_VERSION } from './version.js';

export interface PatchRequest {
  readonly requestId: string;
  readonly viewId: string;
  readonly generation: number;
  readonly baseVersion: number;
  readonly patches: readonly TextPatch[];
  readonly draftText?: string;
}

export type HostMessage =
  | {
      readonly type: 'hydrate';
      readonly protocolVersion: typeof PROTOCOL_VERSION;
      readonly viewId: string;
      readonly document: { readonly text: string; readonly version: number; readonly eol: '\n' | '\r\n' };
    }
  | {
      readonly type: 'documentChanged';
      readonly beforeVersion: number;
      readonly version: number;
      readonly changes: readonly TextPatch[];
      readonly originRequestId?: string;
    }
  | { readonly type: 'patchAccepted'; readonly requestId: string; readonly version: number }
  | {
      readonly type: 'patchRejected';
      readonly requestId: string;
      readonly reason: string;
      readonly document: { readonly text: string; readonly version: number };
    }
  | { readonly type: 'showError'; readonly code: string; readonly message: string };

export type WebviewMessage =
  | { readonly type: 'ready'; readonly protocolVersion: number }
  | { readonly type: 'applyPatch'; readonly request: PatchRequest }
  | { readonly type: 'requestSnapshot' }
  | { readonly type: 'save' }
  | { readonly type: 'history'; readonly action: 'undo' | 'redo' };
