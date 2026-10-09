import { z } from 'zod';
import { resourceRequestSchema } from './resourceMessages.js';
import { isProtocolTextWithinLimit, MAX_PROTOCOL_TEXT_BYTES, protocolTextBytes } from './limits.js';
import type { HostMessage } from './messages.js';

const requestIdSchema = z.string().min(1).max(200);
const viewIdSchema = z.string().min(1).max(200);
const protocolTextSchema = z.string().refine(isProtocolTextWithinLimit, 'text exceeds the protocol text limit');

const patchSchema = z.object({
  from: z.number().int().nonnegative(),
  to: z.number().int().nonnegative(),
  insert: z.string().refine(isProtocolTextWithinLimit, 'patch insert exceeds the protocol text limit')
}).strict();

const viewPreferenceChangesSchema = z.object({
  appearance: z.enum(['vscode', 'document']).optional(),
  width: z.enum(['auto', 'readable', 'full']).optional(),
  maxContentWidth: z.number().int().min(480).max(2400).optional(),
  syntaxReveal: z.enum(['activeBlock', 'selection', 'manual']).optional(),
  outlineCollapsed: z.boolean().optional()
}).strict().refine((changes) => Object.keys(changes).length > 0);

const viewPreferencesStateSchema = z.object({
  schemaVersion: z.literal(1),
  rememberPerFile: z.boolean(),
  effective: z.object({
    appearance: z.enum(['vscode', 'document']),
    width: z.enum(['auto', 'readable', 'full']),
    maxContentWidth: z.number().int().min(480).max(2400),
    syntaxReveal: z.enum(['activeBlock', 'selection', 'manual']),
    outlineCollapsed: z.boolean()
  }).strict()
}).strict();

export const patchRequestSchema = z.object({
  requestId: requestIdSchema,
  viewId: viewIdSchema,
  generation: z.number().int().nonnegative(),
  baseVersion: z.number().int().nonnegative(),
  patches: z.array(patchSchema).max(10_000),
  draftText: z.string().refine(isProtocolTextWithinLimit, 'draft exceeds the protocol text limit').optional()
}).strict().superRefine((request, context) => {
  let insertedBytes = request.draftText === undefined ? 0 : protocolTextBytes(request.draftText);
  for (const patch of request.patches) {
    insertedBytes += protocolTextBytes(patch.insert);
    if (insertedBytes > MAX_PROTOCOL_TEXT_BYTES) {
      context.addIssue({ code: 'custom', path: ['patches'], message: 'patch inserts exceed the protocol text limit' });
      return;
    }
  }
});

export const webviewMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('ready'), protocolVersion: z.number().int() }).strict(),
  z.object({ type: z.literal('applyPatch'), request: patchRequestSchema }).strict(),
  z.object({
    type: z.literal('storeDraft'),
    viewId: z.string().min(1).max(200),
    generation: z.number().int().nonnegative(),
    revision: z.number().int().positive(),
    baseVersion: z.number().int().nonnegative(),
    draftText: z.string().refine(isProtocolTextWithinLimit, 'draft exceeds the protocol text limit')
  }).strict(),
  z.object({ type: z.literal('requestSnapshot') }).strict(),
  z.object({ type: z.literal('requestSourceFallback') }).strict(),
  z.object({ type: z.literal('save') }).strict(),
  z.object({ type: z.literal('history'), action: z.enum(['undo', 'redo']) }).strict(),
  z.object({ type: z.literal('policyReloadReady'), requestId: z.string().min(1).max(200) }).strict(),
  z.object({
    type: z.literal('recoveryChoice'),
    choice: z.enum(['inspect', 'copy', 'reload', 'discard']),
    draftText: z.string().refine(isProtocolTextWithinLimit, 'draft exceeds the protocol text limit').optional()
  }).strict(),
  z.object({ type: z.literal('updateViewPreferences'), changes: viewPreferenceChangesSchema }).strict(),
  z.object({ type: z.literal('resetFileViewPreferences') }).strict(),
  z.object({ type: z.literal('resetWorkspaceViewPreferences') }).strict(),
  resourceRequestSchema
]);

const resourceResponseSchema = z.union([
  z.object({
    type: z.literal('resourceResult'), requestId: requestIdSchema, action: z.literal('pickImage'), ok: z.literal(true),
    markdown: protocolTextSchema.optional()
  }).strict(),
  z.object({
    type: z.literal('resourceResult'), requestId: requestIdSchema, action: z.literal('resolveImage'), ok: z.literal(true),
    uri: z.string().min(1).max(32_768)
  }).strict(),
  z.object({
    type: z.literal('resourceResult'), requestId: requestIdSchema, action: z.literal('openLink'), ok: z.literal(true),
    fragment: z.string().max(16_384).optional()
  }).strict(),
  z.object({
    type: z.literal('resourceResult'), requestId: requestIdSchema,
    action: z.enum(['pickImage', 'resolveImage', 'openLink']), ok: z.literal(false),
    reason: z.string().min(1).max(16_384)
  }).strict()
]);

const hostCoreMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('hydrate'),
    protocolVersion: z.number().int(),
    viewId: viewIdSchema,
    generation: z.number().int().nonnegative(),
    document: z.object({
      text: protocolTextSchema,
      version: z.number().int().nonnegative(),
      eol: z.enum(['\n', '\r\n'])
    }).strict(),
    viewPreferences: viewPreferencesStateSchema
  }).strict(),
  z.object({
    type: z.literal('documentChanged'),
    beforeVersion: z.number().int().nonnegative(),
    version: z.number().int().nonnegative(),
    changes: z.array(patchSchema).max(10_000).superRefine((patches, context) => {
      let insertedBytes = 0;
      for (const patch of patches) {
        insertedBytes += protocolTextBytes(patch.insert);
        if (insertedBytes > MAX_PROTOCOL_TEXT_BYTES) {
          context.addIssue({ code: 'custom', message: 'patch inserts exceed the protocol text limit' });
          return;
        }
      }
    }),
    originRequestId: requestIdSchema.optional()
  }).strict(),
  z.object({ type: z.literal('patchAccepted'), requestId: requestIdSchema, version: z.number().int().nonnegative() }).strict(),
  z.object({
    type: z.literal('draftStored'), viewId: viewIdSchema, generation: z.number().int().nonnegative(),
    revision: z.number().int().positive()
  }).strict(),
  z.object({
    type: z.literal('patchRejected'), requestId: requestIdSchema, reason: z.string().min(1).max(16_384),
    document: z.object({ text: protocolTextSchema, version: z.number().int().nonnegative() }).strict()
  }).strict(),
  z.object({
    type: z.literal('executeAction'), actionId: z.string().min(1).max(200), value: protocolTextSchema.optional()
  }).strict(),
  z.object({ type: z.literal('viewPreferencesChanged'), viewPreferences: viewPreferencesStateSchema }).strict(),
  z.object({ type: z.literal('preparePolicyReload'), requestId: requestIdSchema }).strict(),
  z.object({
    type: z.literal('recoveryAvailable'), baseMatches: z.boolean(), timestamp: z.number().int().nonnegative()
  }).strict(),
  z.object({
    type: z.literal('configuration'),
    selectionToolbarEnabled: z.boolean(),
    slashCommandsEnabled: z.boolean(),
    mathEnabled: z.boolean(),
    blockHandlesEnabled: z.boolean(),
    outlineEnabled: z.boolean(),
    renderMermaid: z.boolean(),
    renderSafeHtml: z.boolean(),
    showSourceIslandLabels: z.boolean(),
    debugShowSourceRanges: z.boolean(),
    codeBlockWrap: z.boolean(),
    useEditorFont: z.boolean()
  }).strict(),
  z.object({ type: z.literal('showError'), code: z.string().min(1).max(200), message: z.string().min(1).max(16_384) }).strict()
]);

export const hostMessageSchema = z.union([hostCoreMessageSchema, resourceResponseSchema]);

export type HostMessageParseResult =
  | { readonly ok: true; readonly message: HostMessage }
  | { readonly ok: false; readonly requestSnapshot: boolean };

export function parseHostMessage(value: unknown): HostMessageParseResult {
  const parsed = hostMessageSchema.safeParse(value);
  if (parsed.success) return { ok: true, message: parsed.data as HostMessage };
  const type = typeof value === 'object' && value !== null && 'type' in value
    ? (value as { readonly type?: unknown }).type
    : undefined;
  return {
    ok: false,
    requestSnapshot: type === 'hydrate' || type === 'documentChanged' || type === 'patchRejected'
  };
}
