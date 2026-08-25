import { randomUUID } from "node:crypto";
import type { ServerWebSocket } from "bun";
import { runMockAgent } from "@harnez/agent-core";
import {
  parseClientMessage,
  type ClientMessage,
  type ServerMessage,
  ServerMessageSchema
} from "@harnez/shared";

interface SessionSocketData {
  sessionId: string;
  connectedAt: number;
  abortController: AbortController | null;
}

const PORT = Number(process.env.PORT) || 3000;

function send(ws: ServerWebSocket<SessionSocketData>, message: ServerMessage): void {
  ws.send(JSON.stringify(message));
}

function sendError(
  ws: ServerWebSocket<SessionSocketData>,
  sessionId: string,
  code: string,
  message: string,
  fatal = false,
): void {
  send(ws, {
    id: randomUUID(),
    sessionId,
    timestamp: Date.now(),
    type: "error",
    payload: { code, message, fatal },
  });
}

function handleClientMessage(
  ws: ServerWebSocket<SessionSocketData>,
  msg: ClientMessage,
): void {
  const { sessionId } = ws.data;

  switch (msg.type) {
    case "ping": {
      send(ws, {
        id: randomUUID(),
        sessionId,
        timestamp: Date.now(),
        type: "pong",
        payload: {},
      });
      break;
    }

    case "prompt.submit": {
      ws.data.abortController?.abort();
      const ac = new AbortController();
      ws.data.abortController = ac;

      // Execute the generator asynchronously
      (async () => {
        try {
          const runner = runMockAgent({
            sessionId,
            prompt: msg.payload.prompt,
            signal: ac.signal,
          });

          for await (const event of runner) {
            if (ac.signal.aborted) break;
            send(ws, event);
          }
        } catch (err: unknown) {
          if (err instanceof DOMException && err.name === "AbortError") {
            return; // Normal turn cancellation
          }

          sendError(
            ws,
            sessionId,
            "EXECUTION_ERROR",
            err instanceof Error ? err.message : "Agent runtime error",
          );
        }
      })();
      break;
    }

    case "tool.approval": {
      const { callId, approved } = msg.payload;
      console.log(`[Tool ${callId}] Approval received: ${approved}`);
      // TODO: Resolve pending tool execution promise
      break;
    }

    case "session.cancel": {
      if (ws.data.abortController) {
        ws.data.abortController.abort(msg.payload.reason ?? "User cancelled");
        ws.data.abortController = null;
      }

      send(ws, {
        id: randomUUID(),
        sessionId,
        timestamp: Date.now(),
        type: "session.state",
        payload: { status: "cancelled" },
      });
      break;
    }
  }
}

const server = Bun.serve<SessionSocketData>({
  port: PORT,

  fetch(req, server) {
    const url = new URL(req.url);

    // Health check endpoint
    if (url.pathname === "/health" && req.method === "GET") {
      return Response.json({ status: "ok", uptime: process.uptime() });
    }

    // WebSocket upgrade endpoint
    if (url.pathname === "/ws") {
      const sessionId = url.searchParams.get("sessionId") ?? randomUUID();
      const upgraded = server.upgrade(req, {
        data: {
          sessionId,
          connectedAt: Date.now(),
          abortController: null,
        },
      });

      if (upgraded) return undefined;
      return new Response("WebSocket upgrade failed", { status: 400 });
    }

    return new Response("Not Found", { status: 404 });
  },

  websocket: {
    open(ws) {
      console.log(`[WS] Client connected: session=${ws.data.sessionId}`);
      send(ws, {
        id: randomUUID(),
        sessionId: ws.data.sessionId,
        timestamp: Date.now(),
        type: "session.state",
        payload: { status: "idle" },
      });
    },

    message(ws, raw) {
      let parsedJson: unknown;
      try {
        const text = typeof raw === "string" ? raw : new TextDecoder().decode(raw);
        parsedJson = JSON.parse(text);
      } catch {
        sendError(ws, ws.data.sessionId, "INVALID_JSON", "Malformed JSON payload");
        return;
      }

      const result = parseClientMessage(JSON.stringify(parsedJson));
      if (!result.success) {
        sendError(
          ws,
          ws.data.sessionId,
          "VALIDATION_ERROR",
          result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", "),
        );
        return;
      }

      handleClientMessage(ws, result.data);
    },

    close(ws, code, reason) {
      console.log(`[WS] Client disconnected: session=${ws.data.sessionId} (${code}: ${reason})`);
      ws.data.abortController?.abort("Socket closed");
      ws.data.abortController = null;
    },
  },
});

console.log(`Agent server listening on http://localhost:${server.port}`);
