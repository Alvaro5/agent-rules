import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import picomatch from "picomatch";
import { git } from "./git.js";

export interface CheckResult {
  passed: boolean;
  /** e.g. "npm test (exit 0)" or "no changes in frontend/**" */
  label: string;
  /** Extra failure context, shown indented under the FAIL line. */
  detail?: string;
}

const COMMAND_TIMEOUT_MS = 10 * 60 * 1000;

export interface CommandOutcome {
  /** null means the command timed out and was killed. */
  exitCode: number | null;
  output: string;
}

/** Run a shell command in `cwd`, capturing combined output. Never rejects. */
export function runCommand(command: string, cwd: string): Promise<CommandOutcome> {
  return new Promise((resolve) => {
    const child = spawn(command, {
      shell: true,
      cwd,
      timeout: COMMAND_TIMEOUT_MS,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk) => (output += chunk));
    child.stderr.on("data", (chunk) => (output += chunk));
    child.on("error", (err) => resolve({ exitCode: 1, output: String(err) }));
    child.on("close", (code, signal) =>
      resolve({ exitCode: signal ? null : (code ?? 1), output }),
    );
  });
}

export function tail(output: string, lines = 10): string | undefined {
  const trimmed = output.trimEnd();
  if (!trimmed) return undefined;
  return trimmed.split("\n").slice(-lines).join("\n");
}

/** `must_run`: each command must exit 0 in the worktree. Sequential on purpose. */
export async function checkMustRun(
  commands: string[],
  cwd: string,
): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  for (const command of commands) {
    const { exitCode, output } = await runCommand(command, cwd);
    if (exitCode === 0) {
      results.push({ passed: true, label: `${command} (exit 0)` });
    } else if (exitCode === null) {
      results.push({
        passed: false,
        label: `${command} (timed out after ${COMMAND_TIMEOUT_MS / 60000} min)`,
        detail: tail(output),
      });
    } else {
      results.push({
        passed: false,
        label: `${command} (exit ${exitCode})`,
        detail: tail(output),
      });
    }
  }
  return results;
}

/** `forbidden_paths`: no changed file may match the glob. One result per glob. */
export function checkForbiddenPaths(
  globs: string[],
  changedFiles: string[],
): CheckResult[] {
  return globs.map((glob) => {
    const isMatch = picomatch(glob, { dot: true });
    const hits = changedFiles.filter((file) => isMatch(file));
    return hits.length === 0
      ? { passed: true, label: `no changes in ${glob}` }
      : { passed: false, label: `changes in ${glob}`, detail: hits.join("\n") };
  });
}

const MANIFEST_NAMES = new Set(["package.json", "Cargo.toml"]);

/** Dependency names in a package.json, across all dependency sections. */
export function npmDeps(source: string): Set<string> {
  const deps = new Set<string>();
  if (!source.trim()) return deps;
  const parsed = JSON.parse(source) as Record<string, unknown>;
  const sections = [
    "dependencies",
    "devDependencies",
    "peerDependencies",
    "optionalDependencies",
  ];
  for (const section of sections) {
    const value = parsed[section];
    if (value && typeof value === "object" && !Array.isArray(value)) {
      for (const name of Object.keys(value)) deps.add(name);
    }
  }
  return deps;
}

/**
 * Dependency names in a Cargo.toml. Line-based on purpose: we only need the
 * keys of [dependencies]-style sections, not a full TOML parser.
 */
export function cargoDeps(source: string): Set<string> {
  const deps = new Set<string>();
  let inDepsSection = false;
  for (const raw of source.split("\n")) {
    const line = raw.trim();
    if (line.startsWith("[")) {
      const section = line.slice(1, line.lastIndexOf("]")).trim();
      inDepsSection = /(^|\.)(dependencies|dev-dependencies|build-dependencies)$/.test(
        section,
      );
      continue;
    }
    if (!inDepsSection || line === "" || line.startsWith("#")) continue;
    const match = line.match(/^(?:"([^"]+)"|([A-Za-z0-9_.-]+))\s*=/);
    if (match) deps.add(match[1] ?? match[2]);
  }
  return deps;
}

function extractDeps(file: string, source: string): Set<string> {
  return basename(file) === "Cargo.toml" ? cargoDeps(source) : npmDeps(source);
}

/**
 * `must_not_add_deps`: compare every changed dependency manifest against its
 * HEAD version. New manifests count too (all their deps are new).
 */
export async function checkNoNewDeps(
  worktreePath: string,
  changedFiles: string[],
): Promise<CheckResult> {
  const manifests = changedFiles.filter((file) => MANIFEST_NAMES.has(basename(file)));
  const added: string[] = [];
  const problems: string[] = [];

  for (const file of manifests) {
    let before = "";
    try {
      before = await git(["show", `HEAD:${file}`], worktreePath);
    } catch {
      // File didn't exist at HEAD — every dependency in it is new.
    }
    const after = await readFile(join(worktreePath, file), "utf8").catch(() => "");
    try {
      const beforeDeps = extractDeps(file, before);
      for (const dep of extractDeps(file, after)) {
        if (!beforeDeps.has(dep)) added.push(`${dep} (${file})`);
      }
    } catch {
      problems.push(`could not parse ${file} — check it by hand`);
    }
  }

  if (added.length === 0 && problems.length === 0) {
    return { passed: true, label: "no new dependencies" };
  }
  const label =
    added.length > 0
      ? `new ${added.length === 1 ? "dependency" : "dependencies"}: ${added.join(", ")}`
      : "dependency manifests unreadable";
  return { passed: false, label, detail: problems.join("\n") || undefined };
}
