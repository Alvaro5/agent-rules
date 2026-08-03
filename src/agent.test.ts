import { describe, it, expect } from "vitest";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { childEnv, runAgent } from "./agent.js";

describe("childEnv", () => {
  it("strips Claude Code session variables and keeps the rest", () => {
    const env = childEnv({
      CLAUDECODE: "1",
      CLAUDE_CODE_ENTRYPOINT: "cli",
      PATH: "/bin",
    });
    expect(env.CLAUDECODE).toBeUndefined();
    expect(env.CLAUDE_CODE_ENTRYPOINT).toBeUndefined();
    expect(env.PATH).toBe("/bin");
  });
});

describe("runAgent", () => {
  // Uses a fake `claude` on PATH — the suite never spawns the real agent.
  it("kills a stalled agent at the timeout and reports it as exit null", async () => {
    const dir = await mkdtemp(join(tmpdir(), "agentrules-agent-"));
    const fake = join(dir, "claude");
    await writeFile(fake, "#!/bin/sh\necho started\nsleep 30\n");
    await chmod(fake, 0o755);
    const originalPath = process.env.PATH;
    process.env.PATH = `${dir}:${originalPath}`;
    try {
      const result = await runAgent("task", dir, undefined, 500);
      expect(result.exitCode).toBeNull();
      expect(result.output).toContain("started");
    } finally {
      process.env.PATH = originalPath;
      await rm(dir, { recursive: true, force: true });
    }
  }, 10_000);
});
