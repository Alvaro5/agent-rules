import { spawn } from "node:child_process";

export const AGENT_TIMEOUT_MS = 20 * 60 * 1000;

export interface AgentResult {
  /** null means the agent timed out and was killed. */
  exitCode: number | null;
  output: string;
}

/**
 * Env for the child `claude` process. Strips the variables Claude Code sets
 * in its own sessions — without this, running agentrules from inside a Claude
 * Code terminal makes the nested invocation misbehave.
 */
export function childEnv(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const out = { ...env };
  delete out.CLAUDECODE;
  delete out.CLAUDE_CODE_ENTRYPOINT;
  return out;
}

/**
 * Run Claude Code headless in `cwd`. `acceptEdits` lets it write files
 * unattended; everything is judged from the git state afterwards, so we
 * never need to observe the run itself.
 */
export function runAgent(
  prompt: string,
  cwd: string,
  onOutput?: (chunk: string) => void,
  timeoutMs = AGENT_TIMEOUT_MS,
): Promise<AgentResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "claude",
      ["-p", prompt, "--permission-mode", "acceptEdits"],
      { cwd, env: childEnv(), timeout: timeoutMs, stdio: ["ignore", "pipe", "pipe"] },
    );

    let output = "";
    const collect = (chunk: Buffer) => {
      const text = chunk.toString();
      output += text;
      onOutput?.(text);
    };
    child.stdout.on("data", collect);
    child.stderr.on("data", collect);

    child.on("error", (err) => {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        reject(
          new Error(
            "`claude` not found on PATH. Install Claude Code first: https://claude.com/claude-code",
          ),
        );
      } else {
        reject(err);
      }
    });
    child.on("exit", (_code, signal) => {
      // A killed agent can leave grandchildren holding the stdio pipes open,
      // which would stall `close` indefinitely — drop the pipes ourselves.
      if (signal) {
        child.stdout.destroy();
        child.stderr.destroy();
      }
    });
    child.on("close", (code, signal) =>
      resolve({ exitCode: signal ? null : (code ?? 1), output }),
    );
  });
}
