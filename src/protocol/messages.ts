import type { TextPatch } from '../core/source/Patch.js';
import type { PROTOCOL_VERSION } from './version.js';
import type { ResourceRequest, ResourceResponse } from './resourceMessages.js';
import type { FileViewOverrideChanges, ViewPreferencesState } from './viewPreferences.js';

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
      readonly viewPreferences: ViewPreferencesState;
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
  | { readonly type: 'executeAction'; readonly actionId: string; readonly value?: string }
  | { readonly type: 'viewPreferencesChanged'; readonly viewPreferences: ViewPreferencesState }
  | { readonly type: 'preparePolicyReload'; readonly requestId: string }
  | {
      readonly type: 'configuration';
      readonly selectionToolbarEnabled: boolean;
      readonly slashCommandsEnabled: boolean;
      readonly mathEnabled: boolean;
      readonly blockHandlesEnabled: boolean;
      readonly outlineEnabled: boolean;
      readonly renderMermaid: boolean;
      readonly codeBlockWrap: boolean;
      readonly useEditorFont: boolean;
    }
  | ResourceResponse
  | { readonly type: 'showError'; readonly code: string; readonly message: string };

export type WebviewMessage =
  | { readonly type: 'ready'; readonly protocolVersion: number }
  | { readonly type: 'applyPatch'; readonly request: PatchRequest }
  | { readonly type: 'requestSnapshot' }
  | { readonly type: 'save' }
  | { readonly type: 'history'; readonly action: 'undo' | 'redo' }
  | { readonly type: 'policyReloadReady'; readonly requestId: string }
  | { readonly type: 'updateViewPreferences'; readonly changes: FileViewOverrideChanges }
  | { readonly type: 'resetFileViewPreferences' }
  | { readonly type: 'resetWorkspaceViewPreferences' }
  | ResourceRequest;
