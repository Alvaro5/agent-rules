import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  runCommand,
  checkMustRun,
  checkForbiddenPaths,
  checkNoNewDeps,
  npmDeps,
  cargoDeps,
  tail,
} from "./checks.js";

const execFileAsync = promisify(execFile);

describe("runCommand", () => {
  it("captures exit code and output", async () => {
    const result = await runCommand("echo hello && exit 3", ".");
    expect(result.exitCode).toBe(3);
    expect(result.output).toContain("hello");
  });
});

describe("checkMustRun", () => {
  it("passes commands that exit 0", async () => {
    const results = await checkMustRun(["true", "echo ok"], ".");
    expect(results.map((r) => r.passed)).toEqual([true, true]);
    expect(results[0].label).toBe("true (exit 0)");
  });

  it("fails commands with non-zero exit and keeps output as detail", async () => {
    const results = await checkMustRun(["echo broken && exit 2"], ".");
    expect(results[0].passed).toBe(false);
    expect(results[0].label).toContain("(exit 2)");
    expect(results[0].detail).toContain("broken");
  });

  it("treats an unknown command as a failure, not a crash", async () => {
    const results = await checkMustRun(["definitely-not-a-real-command-xyz"], ".");
    expect(results[0].passed).toBe(false);
  });
});

describe("checkForbiddenPaths", () => {
  it("passes when nothing matches", () => {
    const results = checkForbiddenPaths(["frontend/**"], ["src/api.ts"]);
    expect(results).toEqual([{ passed: true, label: "no changes in frontend/**" }]);
  });

  it("fails with the offending files listed", () => {
    const results = checkForbiddenPaths(
      ["frontend/**"],
      ["frontend/app.tsx", "frontend/css/main.css", "src/api.ts"],
    );
    expect(results[0].passed).toBe(false);
    expect(results[0].detail).toBe("frontend/app.tsx\nfrontend/css/main.css");
  });

  it("matches dotfiles", () => {
    const results = checkForbiddenPaths(["**/.env*"], [".env.local"]);
    expect(results[0].passed).toBe(false);
  });

  it("produces one result per glob", () => {
    const results = checkForbiddenPaths(["a/**", "b/**"], ["a/x.ts"]);
    expect(results.map((r) => r.passed)).toEqual([false, true]);
  });
});

describe("npmDeps", () => {
  it("collects names across all dependency sections", () => {
    const deps = npmDeps(
      JSON.stringify({
        dependencies: { react: "^19" },
        devDependencies: { vitest: "^3" },
        peerDependencies: { typescript: "^5" },
        optionalDependencies: { fsevents: "^2" },
      }),
    );
    expect([...deps].sort()).toEqual(["fsevents", "react", "typescript", "vitest"]);
  });

  it("returns empty for empty or dependency-less input", () => {
    expect(npmDeps("").size).toBe(0);
    expect(npmDeps("{}").size).toBe(0);
  });

  it("throws on malformed JSON", () => {
    expect(() => npmDeps("{nope")).toThrow();
  });
});

describe("cargoDeps", () => {
  it("collects names from dependency sections only", () => {
    const deps = cargoDeps(`
[package]
name = "mycrate"

[dependencies]
serde = { version = "1", features = ["derive"] }
tokio = "1"

[dev-dependencies]
insta = "1"

[target.'cfg(unix)'.dependencies]
nix = "0.29"

[profile.release]
lto = true
`);
    expect([...deps].sort()).toEqual(["insta", "nix", "serde", "tokio"]);
  });

  it("handles quoted keys and skips comments", () => {
    const deps = cargoDeps(`
[dependencies]
# a comment
"weird-name" = "1"
`);
    expect([...deps]).toEqual(["weird-name"]);
  });
});

describe("checkNoNewDeps", () => {
  let repo: string;

  beforeEach(async () => {
    repo = await mkdtemp(join(tmpdir(), "agentrules-deps-"));
    await execFileAsync("git", ["init", "-q", "-b", "main"], { cwd: repo });
    await execFileAsync("git", ["config", "user.email", "t@t.dev"], { cwd: repo });
    await execFileAsync("git", ["config", "user.name", "T"], { cwd: repo });
    await writeFile(
      join(repo, "package.json"),
      JSON.stringify({ name: "x", dependencies: { react: "^19" } }, null, 2),
    );
    await execFileAsync("git", ["add", "-A"], { cwd: repo });
    await execFileAsync("git", ["commit", "-qm", "init"], { cwd: repo });
  });

  afterEach(async () => {
    await rm(repo, { recursive: true, force: true });
  });

  it("passes when no manifest changed", async () => {
    const result = await checkNoNewDeps(repo, ["src/app.ts"]);
    expect(result).toEqual({ passed: true, label: "no new dependencies" });
  });

  it("passes when a manifest changed but deps did not", async () => {
    await writeFile(
      join(repo, "package.json"),
      JSON.stringify({ name: "renamed", dependencies: { react: "^19" } }, null, 2),
    );
    const result = await checkNoNewDeps(repo, ["package.json"]);
    expect(result.passed).toBe(true);
  });

  it("fails when a dependency was added", async () => {
    await writeFile(
      join(repo, "package.json"),
      JSON.stringify(
        { name: "x", dependencies: { react: "^19", validator: "^13" } },
        null,
        2,
      ),
    );
    const result = await checkNoNewDeps(repo, ["package.json"]);
    expect(result.passed).toBe(false);
    expect(result.label).toBe("new dependency: validator (package.json)");
  });

  it("counts every dependency of a brand-new manifest", async () => {
    await writeFile(
      join(repo, "sub", "..", "Cargo.toml"),
      `[dependencies]\nserde = "1"\n`,
    );
    const result = await checkNoNewDeps(repo, ["Cargo.toml"]);
    expect(result.passed).toBe(false);
    expect(result.label).toContain("serde (Cargo.toml)");
  });

  it("fails gracefully when the agent broke the manifest", async () => {
    await writeFile(join(repo, "package.json"), "{ broken json");
    const result = await checkNoNewDeps(repo, ["package.json"]);
    expect(result.passed).toBe(false);
    expect(result.label).toBe("dependency manifests unreadable");
    expect(result.detail).toContain("package.json");
  });
});

describe("tail", () => {
  it("keeps only the last lines", () => {
    const output = Array.from({ length: 20 }, (_, i) => `line ${i}`).join("\n");
    expect(tail(output, 3)).toBe("line 17\nline 18\nline 19");
  });

  it("returns undefined for empty output", () => {
    expect(tail("  \n ")).toBeUndefined();
  });
});
