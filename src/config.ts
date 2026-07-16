import { readFile } from "node:fs/promises";
import { parse } from "yaml";

export interface AgentRulesConfig {
  /** The task given to the agent. */
  prompt: string;
  /** Commands that must exit 0 after the agent run. */
  must_run: string[];
  /** Globs the agent must not touch (matched against `git diff --name-only`). */
  forbidden_paths: string[];
  /** Fail if package.json / Cargo.toml gained dependencies. */
  must_not_add_deps: boolean;
}

export class ConfigError extends Error {}

const KNOWN_KEYS = new Set([
  "prompt",
  "must_run",
  "forbidden_paths",
  "must_not_add_deps",
]);

function stringArray(value: unknown, key: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((v) => typeof v !== "string")) {
    throw new ConfigError(`\`${key}\` must be a list of strings`);
  }
  return value;
}

export function parseConfig(source: string, filename: string): AgentRulesConfig {
  let raw: unknown;
  try {
    raw = parse(source);
  } catch (err) {
    throw new ConfigError(
      `${filename} is not valid YAML: ${err instanceof Error ? err.message : err}`,
    );
  }

  if (raw === null || raw === undefined) {
    throw new ConfigError(`${filename} is empty`);
  }
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new ConfigError(`${filename} must be a YAML mapping`);
  }
  const obj = raw as Record<string, unknown>;

  for (const key of Object.keys(obj)) {
    if (!KNOWN_KEYS.has(key)) {
      throw new ConfigError(
        `Unknown key \`${key}\` in ${filename}. Known keys: ${[...KNOWN_KEYS].join(", ")}`,
      );
    }
  }

  if (typeof obj.prompt !== "string" || obj.prompt.trim() === "") {
    throw new ConfigError(`\`prompt\` is required and must be a non-empty string`);
  }

  if (obj.must_not_add_deps !== undefined && typeof obj.must_not_add_deps !== "boolean") {
    throw new ConfigError(`\`must_not_add_deps\` must be true or false`);
  }

  return {
    prompt: obj.prompt,
    must_run: stringArray(obj.must_run, "must_run"),
    forbidden_paths: stringArray(obj.forbidden_paths, "forbidden_paths"),
    must_not_add_deps: obj.must_not_add_deps ?? false,
  };
}

export async function loadConfig(path: string): Promise<AgentRulesConfig> {
  let source: string;
  try {
    source = await readFile(path, "utf8");
  } catch {
    throw new ConfigError(
      `Could not read ${path}. Create an agentrules.yaml with at least a \`prompt\` key.`,
    );
  }
  return parseConfig(source, path);
}
