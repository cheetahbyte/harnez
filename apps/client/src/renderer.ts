import type { ServerMessage } from "@harnez/shared";

// ANSI escape codes for zero-dependency terminal styling
const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  gray: "\x1b[90m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  magenta: "\x1b[35m",
};

export class TerminalRenderer {
  private lastKind: "thought" | "text" | null = null;

  renderMessage(msg: ServerMessage): void {
    switch (msg.type) {
      case "token.delta": {
        const { kind, delta } = msg.payload;

        // Visual separation when switching between thought and text streams
        if (this.lastKind !== kind) {
          if (kind === "thought") {
            process.stdout.write(`\n${c.gray}${c.dim}💭 `);
          } else if (kind === "text") {
            process.stdout.write(`\n\n${c.reset}${c.bold}Agent:${c.reset} `);
          }
          this.lastKind = kind;
        }

        if (kind === "thought") {
          process.stdout.write(`${c.gray}${c.dim}${delta}${c.reset}`);
        } else {
          process.stdout.write(`${c.reset}${delta}`);
        }
        break;
      }

      case "tool.call": {
        this.lastKind = null;
        const { toolName, args } = msg.payload;
        console.log(`\n\n${c.yellow}⚙️  [Tool Call: ${toolName}]${c.reset}`);
        console.log(`${c.dim}${JSON.stringify(args, null, 2)}${c.reset}`);
        break;
      }

      case "tool.result": {
        this.lastKind = null;
        const { toolName, result, isError, executionTimeMs } = msg.payload;
        const statusColor = isError ? c.red : c.green;
        const statusIcon = isError ? "❌" : "✔️";

        console.log(
          `${statusColor}${statusIcon} [Tool Result: ${toolName}] (${executionTimeMs}ms)${c.reset}`,
        );
        console.log(`${c.dim}${JSON.stringify(result, null, 2)}${c.reset}`);
        break;
      }

      case "tool.approval_request": {
        this.lastKind = null;
        const { toolName, description, riskLevel } = msg.payload;
        console.log(
          `\n${c.magenta}⚠️  [Approval Required - ${riskLevel.toUpperCase()}] ${toolName}${c.reset}: ${description}`,
        );
        break;
      }

      case "turn.complete": {
        this.lastKind = null;
        const { finishReason, usage } = msg.payload;
        console.log(`\n\n${c.gray}─`.repeat(50));
        console.log(
          `🏁 Turn complete (${finishReason}) | Tokens: ${usage.promptTokens} in / ${usage.completionTokens} out (${usage.totalTokens} total)${c.reset}\n`,
        );
        break;
      }

      case "error": {
        this.lastKind = null;
        console.log(`\n${c.red}💥 [Error: ${msg.payload.code}] ${msg.payload.message}${c.reset}\n`);
        break;
      }

      case "session.state": {
        if (msg.payload.status === "cancelled") {
          this.lastKind = null;
          console.log(`\n${c.yellow}🛑 Turn cancelled by user.${c.reset}\n`);
        }
        break;
      }
    }
  }

  reset(): void {
    this.lastKind = null;
  }
}
