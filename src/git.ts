import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const execFileAsync = promisify(execFile);

export class GitError extends Error {}

export async function git(args: string[], cwd: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync("git", args, {
      cwd,
      maxBuffer: 32 * 1024 * 1024,
    });
    return stdout.trimEnd();
  } catch (err) {
    const stderr =
      err && typeof err === "object" && "stderr" in err ? String(err.stderr).trim() : "";
    throw new GitError(`git ${args.join(" ")} failed${stderr ? `: ${stderr}` : ""}`);
  }
}

/** Root of the repo containing `cwd`, or a GitError if not in one. */
export async function repoRoot(cwd: string): Promise<string> {
  try {
    return await git(["rev-parse", "--show-toplevel"], cwd);
  } catch {
    throw new GitError(
      "Not inside a git repository. agentrules needs one to snapshot and diff the agent's changes.",
    );
  }
}

export interface Worktree {
  path: string;
  remove(): Promise<void>;
}

/**
 * Detached worktree of HEAD in a temp directory — the isolated sandbox the
 * agent runs in. Detached so there is no branch to clean up afterwards.
 */
export async function createWorktree(root: string): Promise<Worktree> {
  const base = await mkdtemp(join(tmpdir(), "agentrules-"));
  const path = join(base, "worktree");
  await git(["worktree", "add", "--detach", path, "HEAD"], root);
  return {
    path,
    async remove() {
      await git(["worktree", "remove", "--force", path], root).catch(() => {
        // Fall through: prune metadata even if the dir was already deleted.
      });
      await git(["worktree", "prune"], root).catch(() => {});
      await rm(base, { recursive: true, force: true }).catch(() => {});
    },
  };
}

/** Paths changed in the worktree since HEAD, including untracked files. */
export async function changedFiles(worktreePath: string): Promise<string[]> {
  const tracked = await git(["diff", "--name-only", "HEAD"], worktreePath);
  const untracked = await git(
    ["ls-files", "--others", "--exclude-standard"],
    worktreePath,
  );
  const all = [...tracked.split("\n"), ...untracked.split("\n")].filter(Boolean);
  return [...new Set(all)].sort();
}
