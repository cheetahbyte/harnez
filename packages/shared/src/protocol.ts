import { z } from "zod";

// --- Base Metadata ---
const BaseEventSchema = z.object({
  id: z.string().uuid(),
  sessionId: z.string(),
  timestamp: z.number().default(() => Date.now()),
});

// --- Client -> Server Messages ---

export const ClientPromptSubmitSchema = BaseEventSchema.extend({
  type: z.literal("prompt.submit"),
  payload: z.object({
    prompt: z.string().min(1),
    context: z.record(z.unknown()).optional(),
  }),
});

export const ClientToolApprovalSchema = BaseEventSchema.extend({
  type: z.literal("tool.approval"),
  payload: z.object({
    callId: z.string(),
    approved: z.boolean(),
    rejectionReason: z.string().optional(),
    overrideArgs: z.record(z.unknown()).optional(),
  }),
});

export const ClientSessionCancelSchema = BaseEventSchema.extend({
  type: z.literal("session.cancel"),
  payload: z.object({
    reason: z.string().optional(),
  }),
});

export const ClientPingSchema = BaseEventSchema.extend({
  type: z.literal("ping"),
});

export const ClientMessageSchema = z.discriminatedUnion("type", [
  ClientPromptSubmitSchema,
  ClientToolApprovalSchema,
  ClientSessionCancelSchema,
  ClientPingSchema,
]);

// --- Server -> Client Messages ---

export const ServerSessionStateSchema = BaseEventSchema.extend({
  type: z.literal("session.state"),
  payload: z.object({
    status: z.enum(["idle", "thinking", "executing_tool", "awaiting_approval", "cancelled", "error"]),
    activeTool: z.string().optional(),
  }),
});

export const ServerTokenDeltaSchema = BaseEventSchema.extend({
  type: z.literal("token.delta"),
  payload: z.object({
    kind: z.enum(["thought", "text"]),
    delta: z.string(),
  }),
});

export const ServerToolCallSchema = BaseEventSchema.extend({
  type: z.literal("tool.call"),
  payload: z.object({
    callId: z.string(),
    toolName: z.string(),
    args: z.record(z.unknown()),
  }),
});

export const ServerToolApprovalRequestSchema = BaseEventSchema.extend({
  type: z.literal("tool.approval_request"),
  payload: z.object({
    callId: z.string(),
    toolName: z.string(),
    args: z.record(z.unknown()),
    riskLevel: z.enum(["low", "medium", "high", "critical"]),
    description: z.string(),
  }),
});

export const ServerToolResultSchema = BaseEventSchema.extend({
  type: z.literal("tool.result"),
  payload: z.object({
    callId: z.string(),
    toolName: z.string(),
    result: z.unknown(),
    isError: z.boolean().default(false),
    executionTimeMs: z.number(),
  }),
});

export const ServerTurnCompleteSchema = BaseEventSchema.extend({
  type: z.literal("turn.complete"),
  payload: z.object({
    finishReason: z.enum(["stop", "max_iterations", "cancelled", "error"]),
    usage: z.object({
      promptTokens: z.number(),
      completionTokens: z.number(),
      totalTokens: z.number(),
    }),
  }),
});

export const ServerErrorSchema = BaseEventSchema.extend({
  type: z.literal("error"),
  payload: z.object({
    code: z.string(),
    message: z.string(),
    fatal: z.boolean().default(false),
  }),
});

export const ServerPongSchema = BaseEventSchema.extend({
  type: z.literal("pong"),
});

export const ServerMessageSchema = z.discriminatedUnion("type", [
  ServerSessionStateSchema,
  ServerTokenDeltaSchema,
  ServerToolCallSchema,
  ServerToolApprovalRequestSchema,
  ServerToolResultSchema,
  ServerTurnCompleteSchema,
  ServerErrorSchema,
  ServerPongSchema,
]);

// --- Inferred Types ---

export type ClientMessage = z.infer<typeof ClientMessageSchema>;
export type ClientMessageType = ClientMessage["type"];

export type ServerMessage = z.infer<typeof ServerMessageSchema>;
export type ServerMessageType = ServerMessage["type"];

// Payload helpers
export type ClientPayload<T extends ClientMessageType> = Extract<ClientMessage, { type: T }>["payload"];
export type ServerPayload<T extends ServerMessageType> = Extract<ServerMessage, { type: T }>["payload"];
