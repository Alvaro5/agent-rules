#!/usr/bin/env node
import { Command } from "commander";
import { resolve } from "node:path";
import { loadConfig, ConfigError } from "./config.js";
import { repoRoot, createWorktree, changedFiles, GitError } from "./git.js";
import { runAgent, AGENT_TIMEOUT_MS } from "./agent.js";
import {
  checkMustRun,
  checkForbiddenPaths,
  checkNoNewDeps,
  runCommand,
  tail,
  type CheckResult,
} from "./checks.js";
import { formatReport } from "./report.js";
import { initConfig, InitError } from "./init.js";

const program = new Command();

program
  .name("agentrules")
  .description(
    "Turn the rules in your CLAUDE.md into deterministic checks, and see whether a real Claude Code run respects them",
  )
  .version("0.1.1");

program
  .command("init")
  .description("Create a starter agentrules.yaml in the current directory")
  .action(async () => {
    try {
      await initConfig("agentrules.yaml");
      console.log(
        "Created agentrules.yaml — edit the prompt (and uncomment the checks you want), then run `agentrules run`.",
      );
    } catch (err) {
      console.error(err instanceof InitError ? `Error: ${err.message}` : err);
      process.exitCode = 1;
    }
  });

program
  .command("run")
  .description("Run the agent on the task in agentrules.yaml and report which checks passed")
  .option("-c, --config <path>", "path to the test file", "agentrules.yaml")
  .option("--keep", "keep the worktree after the run for inspection")
  .action(async (opts: { config: string; keep?: boolean }) => {
    try {
      const config = await loadConfig(resolve(opts.config));
      if (
        config.must_run.length === 0 &&
        config.forbidden_paths.length === 0 &&
        !config.must_not_add_deps
      ) {
        console.error(
          `Error: no checks defined in ${opts.config} — add must_run / forbidden_paths / must_not_add_deps to get a report.`,
        );
        process.exitCode = 1;
        return;
      }
      const root = await repoRoot(process.cwd());

      console.log(`Creating isolated worktree of ${root} ...`);
      const worktree = await createWorktree(root);

      let removed = false;
      const removeWorktree = async () => {
        if (removed) return;
        removed = true;
        await worktree.remove();
      };
      const onSignal = (signal: NodeJS.Signals) => {
        if (opts.keep) {
          console.error(`\nInterrupted (${signal}). Worktree kept at: ${worktree.path}`);
          process.exit(1);
        }
        console.error(`\nInterrupted (${signal}) — removing worktree ...`);
        void removeWorktree().finally(() => process.exit(1));
      };
      process.once("SIGINT", onSignal);
      process.once("SIGTERM", onSignal);

      try {
        for (const command of config.setup) {
          console.log(`Setup: ${command}`);
          const { exitCode, output } = await runCommand(command, worktree.path);
          if (exitCode !== 0) {
            const suffix = exitCode === null ? "timed out" : `exit ${exitCode}`;
            console.error(`Error: setup command failed (${suffix}): ${command}`);
            const context = tail(output);
            if (context) console.error(context);
            process.exitCode = 1;
            return;
          }
        }

        console.log(`Running Claude Code headless (this can take a few minutes) ...\n`);
        const result = await runAgent(config.prompt, worktree.path, (chunk) =>
          process.stdout.write(chunk),
        );
        if (result.exitCode === null) {
          console.log(
            `\nAgent timed out after ${AGENT_TIMEOUT_MS / 60000} min and was killed — evaluating what it did anyway.`,
          );
        } else {
          console.log(`\nAgent finished (exit ${result.exitCode}).`);
          if (result.exitCode !== 0) {
            console.log("Agent exited non-zero — evaluating what it did anyway.");
          }
        }

        const changed = await changedFiles(worktree.path);
        if (changed.length === 0) {
          console.log("The agent changed no files.");
        } else {
          console.log(`Changed files:\n${changed.map((f) => `  ${f}`).join("\n")}`);
        }

        const results: CheckResult[] = [
          ...(await checkMustRun(config.must_run, worktree.path)),
          ...checkForbiddenPaths(config.forbidden_paths, changed),
        ];
        if (config.must_not_add_deps) {
          results.push(await checkNoNewDeps(worktree.path, changed));
        }

        console.log("\n" + formatReport(results, process.stdout.isTTY ?? false));
        if (results.some((r) => !r.passed)) process.exitCode = 1;
      } finally {
        process.removeListener("SIGINT", onSignal);
        process.removeListener("SIGTERM", onSignal);
        if (opts.keep) {
          console.log(`\nWorktree kept at: ${worktree.path}`);
        } else {
          await removeWorktree();
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
