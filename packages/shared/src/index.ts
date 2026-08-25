import { ClientMessageSchema, ServerMessageSchema } from "./protocol";

export * from "./protocol";

/**
 * Validates and parses an incoming WebSocket string into a safe ClientMessage.
 */
export function parseClientMessage(raw: string | ArrayBuffer | Uint8Array) {
  const text = typeof raw === "string" ? raw : new TextDecoder().decode(raw);
  return ClientMessageSchema.safeParse(JSON.parse(text));
}

/**
 * Validates and parses an incoming WebSocket string into a safe ServerMessage.
 */
export function parseServerMessage(raw: string | ArrayBuffer | Uint8Array) {
  const text = typeof raw === "string" ? raw : new TextDecoder().decode(raw);
  return ServerMessageSchema.safeParse(JSON.parse(text));
}
