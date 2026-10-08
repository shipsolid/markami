export const MAX_PROTOCOL_TEXT_BYTES = 4 * 1024 * 1024;

const encoder = new TextEncoder();

export function protocolTextBytes(value: string): number {
  return encoder.encode(value).byteLength;
}

export function isProtocolTextWithinLimit(value: string): boolean {
  return protocolTextBytes(value) <= MAX_PROTOCOL_TEXT_BYTES;
}
