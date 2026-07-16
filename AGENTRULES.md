# AgentRules — Ship #1

**One line:** a tiny CLI that checks whether Claude Code actually followed the rules in your `CLAUDE.md` / `AGENTS.md` on a realistic task.

**Status:** LOCKED as ship #1. Ship date: **Sunday July 26, 2026, 20:00 Paris** (load-bearing — cut scope, never the date).
**Rule 3 applies:** no re-litigating the idea mid-build. Build → ship → judge after.

---

## What ship #1 is (and is not)

Ship #1 is a **momentum ship**: its only job is to close the loop build → live → one X post. It is NOT a business bet. No pricing, no paid layer, no market thinking until after it's live and strangers have run it.

**Shipped =** public GitHub repo + installable via `npx agentrules` + one working example + one build-in-public post on X.

---

## The problem (why anyone cares)

Developers write `CLAUDE.md` / `AGENTS.md` by intuition and never know if the agent actually obeys them. When they edit the file, they have no idea if they made things better or worse. AgentRules gives a concrete answer for one run: *here's what the agent did, here's which of your rules it respected.*

## What v0.1 does

One command: `agentrules run`.

1. Reads a YAML test file (`agentrules.yaml`) containing:
   - `prompt`: a realistic task to give the agent
   - `must_run`: commands that must pass afterwards (e.g. `cargo test`)
   - `forbidden_paths`: globs the agent must not touch (e.g. `frontend/**`)
   - `must_not_add_deps`: true/false — no new entries in package.json / Cargo.toml
2. Creates an isolated **git worktree** of the current repo.
3. Runs Claude Code **headless** (`claude -p "<prompt>"` with permissions configured for unattended edits) inside that worktree.
4. When it finishes, evaluates everything **deterministically after the fact**:
   - run each `must_run` command, check exit codes
   - `git diff --name-only` against `forbidden_paths` globs
   - diff the dependency manifests
5. Prints a pass/fail report:

```
PASS  cargo test (exit 0)
PASS  no changes in frontend/**
FAIL  new dependency: validator
Adherence: 2/3
```

Key design truth: **the diff IS the behavior.** No live monitoring, no hooking into the agent, no transcript parsing. Everything is checked from the filesystem/git state after the run.

## Explicitly OUT of v0.1 (do not build)

- `compare HEAD~1 HEAD` / baseline storage / regression detection ← the scope monster; v0.2 question at best
- Multiple runs per task / statistical handling of nondeterminism
- Support for Codex, Cursor, Copilot, Gemini — Claude Code only
- Web dashboard, accounts, payments, teams
- VS Code extension
- LLM-as-judge scoring — deterministic checks only
- Auto-generating tests

Known limitation to state honestly in the README: agent runs are nondeterministic, so one run is an *adherence report*, not a regression verdict. That honesty is a feature, not a weakness.

## Tech stack

- **TypeScript + Node** (native fit for `npx` distribution; Alvaro's strongest stack with React/TS)
- CLI framework: something minimal (`commander` or plain argv parsing)
- YAML: `yaml` package
- Glob matching: `minimatch` or `picomatch`
- Git: shell out to `git worktree add` / `git diff` (no libgit bindings)
- Claude Code invoked as a child process: `claude -p "<prompt>"` with `--permission-mode` / allowed-tools flags set for unattended file edits
- Tests: Vitest (same as GradePace)
- Publish: npm, package name TBD (check availability day 1)

## DAY 1 GATE (first morning session, 90 min)

Before anything else, spike this: **can I run `claude -p "task"` headless in a git worktree, with permissions set so it edits files unattended, and get a usable diff out?**

- Yes → the rest is plumbing; July 26 holds.
- No / it fights me all session → the cost of the idea just tripled; surface this immediately and rescope (but the ship date still holds — shrink the product, e.g. drop worktrees and run in a throwaway clone).

## Build plan (real hours: ~90-min mornings + weekends)

**Week 1 (Jul 14–19):**
- Day 1: the gate spike above
- Mornings: CLI skeleton, YAML parsing, worktree create/cleanup
- Weekend Jul 18–19: full happy path working end-to-end on a toy repo

**Week 2 (Jul 20–26):**
- Mornings: assertions (must_run, forbidden_paths, deps), report output, error handling
- Dogfood on GradePace with a real CLAUDE.md test
- Weekend Jul 25–26: README + one example repo + npm publish + 60-sec terminal demo (asciinema or screen recording) + launch post on X
- **Sunday 20:00: post goes live. Done.**

If mid-week the scope looks too big: cut assertions (ship with `must_run` + `forbidden_paths` only), cut the demo video, cut polish. Never move the date.

## After shipping (not before)

- Judge by one signal only: do strangers run it more than once / file issues / write their own tests?
- Then and only then think about v0.2 (compare/baseline) or any paid layer.
- Per Path 2 rules: if it's flat after ~a week of distribution effort, record the lesson and line up ship #2.

## X / build-in-public angle

- Launch post: the terminal demo + one sentence of the problem ("you edit CLAUDE.md and pray — I built a thing that checks")
- This is also reply-fodder: every "my agent ignored my instructions" complaint in the Builders list is now a thread I can genuinely contribute to.
