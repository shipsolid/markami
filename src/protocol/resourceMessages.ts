import { z } from 'zod';

const requestId = z.string().min(1).max(200);
const rawPath = z.string().min(1).max(16_384);

export const resourceRequestSchema = z.discriminatedUnion('action', [
  z.object({ type: z.literal('resourceRequest'), requestId, action: z.literal('pickImage') }),
  z.object({ type: z.literal('resourceRequest'), requestId, action: z.literal('resolveImage'), rawPath }),
  z.object({ type: z.literal('resourceRequest'), requestId, action: z.literal('openLink'), rawPath })
]);

export type ResourceRequest = z.infer<typeof resourceRequestSchema>;

export type ResourceResponse =
  | { readonly type: 'resourceResult'; readonly requestId: string; readonly action: 'pickImage'; readonly ok: true; readonly markdown?: string }
  | { readonly type: 'resourceResult'; readonly requestId: string; readonly action: 'resolveImage'; readonly ok: true; readonly uri: string }
  | { readonly type: 'resourceResult'; readonly requestId: string; readonly action: 'openLink'; readonly ok: true; readonly fragment?: string }
  | { readonly type: 'resourceResult'; readonly requestId: string; readonly action: ResourceRequest['action']; readonly ok: false; readonly reason: string };
