import { randomUUID } from "node:crypto";
import type { ServerMessage } from "@harnez/shared";

interface MockRunOptions {
  sessionId: string;
  prompt: string;
  signal: AbortSignal;
  requestApproval?: (toolName: string, args: Record<string, unknown>) => Promise<boolean>;
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException("Aborted", "AbortError"));
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    });
  });

/**
 * Async generator yielding a simulated agent workflow:
 * Thinking -> Tool Call -> Tool Result -> Text Streaming -> Turn Complete
 */
export async function* runMockAgent({
  sessionId,
  prompt,
  signal,
}: MockRunOptions): AsyncGenerator<ServerMessage> {
  const createEvent = <T extends ServerMessage>(type: T["type"], payload: T["payload"]): T =>
    ({
      id: randomUUID(),
      sessionId,
      timestamp: Date.now(),
      type,
      payload,
    }) as T;

  // 1. Thinking phase
  const thoughts = ["Deconstructing prompt...", `Planning execution steps for: "${prompt}"`];
  for (const thought of thoughts) {
    await sleep(250, signal);
    yield createEvent("token.delta", { kind: "thought", delta: `${thought}\n` });
  }

  // 2. Simulated tool invocation
  await sleep(300, signal);
  const callId = randomUUID();
  const toolName = "shell_exec";
  const args = { command: `echo "Processing: ${prompt.slice(0, 20)}..."` };

  yield createEvent("session.state", { status: "executing_tool", activeTool: toolName });
  yield createEvent("tool.call", { callId, toolName, args });

  // 3. Simulated tool execution delay & result
  await sleep(600, signal);
  yield createEvent("tool.result", {
    callId,
    toolName,
    result: { stdout: `Executed command successfully. Processed prompt: ${prompt}`, exitCode: 0 },
    isError: false,
    executionTimeMs: 612,
  });

  // 4. Text generation phase
  yield createEvent("session.state", { status: "thinking" });
  const responseWords = `I evaluated your request regarding "${prompt}". The task executed cleanly in the sandbox environment.`.split(
    " ",
  );

  for (const word of responseWords) {
    await sleep(60, signal);
    yield createEvent("token.delta", { kind: "text", delta: `${word} ` });
  }

  // 5. Completion
  yield createEvent("turn.complete", {
    finishReason: "stop",
    usage: {
      promptTokens: 42,
      completionTokens: responseWords.length + 15,
      totalTokens: responseWords.length + 57,
    },
  });

  yield createEvent("session.state", { status: "idle" });
}
