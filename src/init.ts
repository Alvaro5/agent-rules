import { writeFile } from "node:fs/promises";

export const TEMPLATE = `# agentrules test file — run with \`agentrules run\`.

# The task to give the agent. Make it realistic for your codebase.
prompt: Describe a realistic task for the agent here.

# Commands run in the worktree BEFORE the agent runs
# (the worktree is a fresh checkout — no node_modules).
# setup:
#   - npm ci

# Commands that must exit 0 after the agent is done.
# must_run:
#   - npm test

# Globs the agent must not touch.
# forbidden_paths:
#   - frontend/**

# Fail if any changed package.json / Cargo.toml gained a dependency.
# must_not_add_deps: true
`;

export class InitError extends Error {}

/** Write the starter template at `path`, refusing to overwrite. */
export async function initConfig(path: string): Promise<void> {
  try {
    await writeFile(path, TEMPLATE, { flag: "wx" });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "EEXIST") {
      throw new InitError(`${path} already exists — delete it first if you want a fresh one.`);
    }
    throw err;
  }
}
