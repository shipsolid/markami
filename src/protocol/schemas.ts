import { z } from 'zod';

const patchSchema = z.object({
  from: z.number().int().nonnegative(),
  to: z.number().int().nonnegative(),
  insert: z.string()
});

export const patchRequestSchema = z.object({
  requestId: z.string().min(1).max(200),
  viewId: z.string().min(1).max(200),
  generation: z.number().int().nonnegative(),
  baseVersion: z.number().int().nonnegative(),
  patches: z.array(patchSchema).max(10_000),
  draftText: z.string().max(10 * 1024 * 1024).optional()
});

export const webviewMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('ready'), protocolVersion: z.number().int() }),
  z.object({ type: z.literal('applyPatch'), request: patchRequestSchema }),
  z.object({ type: z.literal('requestSnapshot') }),
  z.object({ type: z.literal('save') }),
  z.object({ type: z.literal('history'), action: z.enum(['undo', 'redo']) })
]);
