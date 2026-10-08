import { z } from 'zod';
import { resourceRequestSchema } from './resourceMessages.js';
import { isProtocolTextWithinLimit, MAX_PROTOCOL_TEXT_BYTES, protocolTextBytes } from './limits.js';

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

export const patchRequestSchema = z.object({
  requestId: z.string().min(1).max(200),
  viewId: z.string().min(1).max(200),
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
  z.object({ type: z.literal('requestSnapshot') }).strict(),
  z.object({ type: z.literal('save') }).strict(),
  z.object({ type: z.literal('history'), action: z.enum(['undo', 'redo']) }).strict(),
  z.object({ type: z.literal('policyReloadReady'), requestId: z.string().min(1).max(200) }).strict(),
  z.object({ type: z.literal('recoveryChoice'), choice: z.enum(['inspect', 'copy', 'reload', 'discard']) }).strict(),
  z.object({ type: z.literal('updateViewPreferences'), changes: viewPreferenceChangesSchema }).strict(),
  z.object({ type: z.literal('resetFileViewPreferences') }).strict(),
  z.object({ type: z.literal('resetWorkspaceViewPreferences') }).strict(),
  resourceRequestSchema
]);
