import { spawn } from "node:child_process";

export interface AgentResult {
  exitCode: number;
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
): Promise<AgentResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "claude",
      ["-p", prompt, "--permission-mode", "acceptEdits"],
      { cwd, env: childEnv(), stdio: ["ignore", "pipe", "pipe"] },
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
    child.on("close", (code) => resolve({ exitCode: code ?? 1, output }));
  });
}
