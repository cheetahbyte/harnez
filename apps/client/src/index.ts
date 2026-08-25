import { randomUUID } from "node:crypto";
import * as readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import {
  parseServerMessage,
  type ClientMessage,
} from "@harnez/shared";
import { TerminalRenderer } from "./renderer";

const SERVER_URL = process.env.SERVER_URL || "ws://localhost:3000/ws";
const sessionId = randomUUID();
const renderer = new TerminalRenderer();

const rl = readline.createInterface({ input: stdin, output: stdout });
let isTurnActive = false;
let ws: WebSocket;

function send(msg: ClientMessage): void {
  ws.send(JSON.stringify(msg));
}

async function promptLoop(): Promise<void> {
  while (true) {
    if (isTurnActive) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      continue;
    }

    const input = await rl.question("\x1b[36m\x1b[1muser>\x1b[0m ");
    const trimmed = input.trim();

    if (!trimmed) continue;

    if (trimmed === "/exit" || trimmed === "/quit") {
      ws.close();
      rl.close();
      process.exit(0);
    }

    isTurnActive = true;
    renderer.reset();

    send({
      id: randomUUID(),
      sessionId,
      timestamp: Date.now(),
      type: "prompt.submit",
      payload: { prompt: trimmed },
    });
  }
}

function connect(): void {
  console.log(`\x1b[90mConnecting to ${SERVER_URL} (Session: ${sessionId})...\x1b[0m`);
  ws = new WebSocket(`${SERVER_URL}?sessionId=${sessionId}`);

  ws.addEventListener("open", () => {
    console.log("\x1b[32m✔ Connected to Agent Harness server.\x1b[0m");
    console.log("\x1b[90mType your prompt below. Use /quit or Ctrl+C to exit.\x1b[0m\n");
    promptLoop();
  });

  ws.addEventListener("message", (event) => {
    const parseResult = parseServerMessage(event.data);
    if (!parseResult.success) {
      console.error("\x1b[31m[Client Protocol Error] Failed to parse message:\x1b[0m", event.data);
      return;
    }

    const msg = parseResult.data;
    renderer.renderMessage(msg);

    // Turn lifecycle completion check
    if (
      msg.type === "turn.complete" ||
      msg.type === "error" ||
      (msg.type === "session.state" && (msg.payload.status === "idle" || msg.payload.status === "cancelled"))
    ) {
      isTurnActive = false;
    }
  });

  ws.addEventListener("close", () => {
    console.log("\n\x1b[31m✖ Disconnected from server.\x1b[0m");
    process.exit(0);
  });

  ws.addEventListener("error", (err) => {
    console.error("\x1b[31mWebSocket connection error:\x1b[0m", err);
  });
}

// Handle Ctrl+C gracefully: cancel active turn or exit
process.on("SIGINT", () => {
  if (isTurnActive) {
    console.log("\n\x1b[33mCancelling current turn...\x1b[0m");
    send({
      id: randomUUID(),
      sessionId,
      timestamp: Date.now(),
      type: "session.cancel",
      payload: { reason: "User pressed Ctrl+C" },
    });
  } else {
    ws?.close();
    rl.close();
    process.exit(0);
  }
});

connect();
