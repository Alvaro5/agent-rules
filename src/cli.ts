#!/usr/bin/env node
import { Command } from "commander";
import { resolve } from "node:path";
import { loadConfig, ConfigError } from "./config.js";
import { repoRoot, createWorktree, changedFiles, GitError } from "./git.js";
import { runAgent } from "./agent.js";

const program = new Command();

program
  .name("agentrules")
  .description(
    "Check whether Claude Code actually followed the rules in your CLAUDE.md / AGENTS.md",
  )
  .version("0.1.0");

program
  .command("run")
  .description("Run the agent on the task in agentrules.yaml and report rule adherence")
  .option("-c, --config <path>", "path to the test file", "agentrules.yaml")
  .option("--keep", "keep the worktree after the run for inspection")
  .action(async (opts: { config: string; keep?: boolean }) => {
    try {
      const config = await loadConfig(resolve(opts.config));
      const root = await repoRoot(process.cwd());

      console.log(`Creating isolated worktree of ${root} ...`);
      const worktree = await createWorktree(root);

      try {
        console.log(`Running Claude Code headless (this can take a few minutes) ...\n`);
        const result = await runAgent(config.prompt, worktree.path, (chunk) =>
          process.stdout.write(chunk),
        );
        console.log(`\nAgent finished (exit ${result.exitCode}).`);

        const changed = await changedFiles(worktree.path);
        if (changed.length === 0) {
          console.log("The agent changed no files.");
        } else {
          console.log(`Changed files:\n${changed.map((f) => `  ${f}`).join("\n")}`);
        }

        // Assertions (must_run, forbidden_paths, must_not_add_deps) land next.
      } finally {
        if (opts.keep) {
          console.log(`\nWorktree kept at: ${worktree.path}`);
        } else {
          await worktree.remove();
        }
      }
    } catch (err) {
      if (err instanceof ConfigError || err instanceof GitError) {
        console.error(`Error: ${err.message}`);
      } else {
        console.error(err);
      }
      process.exitCode = 1;
    }
  });

program.parseAsync();
