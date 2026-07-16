import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, mkdir, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { repoRoot, createWorktree, changedFiles, GitError } from "./git.js";

const execFileAsync = promisify(execFile);

async function sh(cwd: string, cmd: string, args: string[]) {
  await execFileAsync(cmd, args, { cwd });
}

let repo: string;

beforeEach(async () => {
  repo = await mkdtemp(join(tmpdir(), "agentrules-test-"));
  await sh(repo, "git", ["init", "-q", "-b", "main"]);
  await sh(repo, "git", ["config", "user.email", "test@test.dev"]);
  await sh(repo, "git", ["config", "user.name", "Test"]);
  await writeFile(join(repo, "a.txt"), "hello\n");
  await sh(repo, "git", ["add", "-A"]);
  await sh(repo, "git", ["commit", "-qm", "init"]);
});

afterEach(async () => {
  await rm(repo, { recursive: true, force: true });
});

describe("repoRoot", () => {
  it("finds the root from a subdirectory", async () => {
    await mkdir(join(repo, "sub"));
    const root = await repoRoot(join(repo, "sub"));
    const { stdout } = await execFileAsync("git", ["rev-parse", "--show-toplevel"], {
      cwd: repo,
    });
    expect(root).toBe(stdout.trim());
  });

  it("throws a GitError outside a repo", async () => {
    const outside = await mkdtemp(join(tmpdir(), "agentrules-norepo-"));
    try {
      await expect(repoRoot(outside)).rejects.toThrow(GitError);
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });
});

describe("createWorktree", () => {
  it("creates a detached worktree with the repo contents", async () => {
    const wt = await createWorktree(repo);
    try {
      await expect(stat(join(wt.path, "a.txt"))).resolves.toBeTruthy();
    } finally {
      await wt.remove();
    }
  });

  it("remove() deletes the worktree and its metadata", async () => {
    const wt = await createWorktree(repo);
    await wt.remove();
    await expect(stat(wt.path)).rejects.toThrow();
    const { stdout } = await execFileAsync("git", ["worktree", "list"], { cwd: repo });
    expect(stdout).not.toContain(wt.path);
  });

  it("remove() is safe to call twice", async () => {
    const wt = await createWorktree(repo);
    await wt.remove();
    await expect(wt.remove()).resolves.toBeUndefined();
  });
});

describe("changedFiles", () => {
  it("reports modified and untracked files, sorted", async () => {
    const wt = await createWorktree(repo);
    try {
      await writeFile(join(wt.path, "a.txt"), "changed\n");
      await writeFile(join(wt.path, "new.txt"), "brand new\n");
      expect(await changedFiles(wt.path)).toEqual(["a.txt", "new.txt"]);
    } finally {
      await wt.remove();
    }
  });

  it("reports files in new directories", async () => {
    const wt = await createWorktree(repo);
    try {
      await mkdir(join(wt.path, "src"));
      await writeFile(join(wt.path, "src", "b.ts"), "export {}\n");
      expect(await changedFiles(wt.path)).toEqual(["src/b.ts"]);
    } finally {
      await wt.remove();
    }
  });

  it("is empty when nothing changed", async () => {
    const wt = await createWorktree(repo);
    try {
      expect(await changedFiles(wt.path)).toEqual([]);
    } finally {
      await wt.remove();
    }
  });
});
