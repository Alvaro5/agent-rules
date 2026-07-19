# agentrules

**Check whether Claude Code actually followed the rules in your `CLAUDE.md` / `AGENTS.md`.**

You write agent instructions by intuition and never know if they're obeyed. When you edit the file, you can't tell if you made things better or worse. `agentrules` gives you a concrete answer for one run: here's what the agent did, here's which of your rules it respected.

> **Status: v0.1 feature-complete, not yet published to npm.** The full loop works: isolated worktree, headless agent run, deterministic checks, pass/fail report with adherence score.

## How it works

One command: `agentrules run`.

1. Reads `agentrules.yaml` — a realistic task plus the rules you expect to hold afterwards.
2. Creates an isolated **git worktree** of your repo, so the agent can't touch your working tree.
3. Runs Claude Code **headless** (`claude -p`) inside it, with permissions set for unattended file edits.
4. Evaluates everything **deterministically after the fact** from the git state — no live monitoring, no transcript parsing. The diff *is* the behavior.
5. Prints a pass/fail adherence report and cleans up the worktree.

## Requirements

- Node.js ≥ 20
- git
- [Claude Code](https://claude.com/claude-code) installed and authenticated (`claude` on your PATH)
- Run it from inside a git repository

## Usage

Create an `agentrules.yaml` in your repo:

```yaml
# The task to give the agent — make it realistic for your codebase.
prompt: Add an /api/health endpoint that returns 200.

# Optional: commands run in the worktree BEFORE the agent, so must_run can work
# (the worktree is a fresh checkout — no node_modules).
setup:
  - npm ci

# Commands that must exit 0 after the agent is done.
must_run:
  - npm test

# Globs the agent must not touch (checked against every changed or added file).
forbidden_paths:
  - frontend/**

# Fail if any changed package.json / Cargo.toml gained a dependency.
must_not_add_deps: true
```

Then:

```sh
agentrules run            # uses ./agentrules.yaml
agentrules run -c path/to/test.yaml
agentrules run --keep     # keep the worktree afterwards for inspection
```

Output:

```
Creating isolated worktree of /your/repo ...
Running Claude Code headless (this can take a few minutes) ...

Agent finished (exit 0).
Changed files:
  src/api/health.ts
  src/router.ts

PASS  npm test (exit 0)
FAIL  changes in frontend/**
      frontend/api-client.ts
PASS  no new dependencies

Adherence: 2/3
```

Exit code is `0` when every check passes and `1` otherwise, so you can script around it. `must_run` and `setup` commands run through your shell in the worktree, with a 10-minute timeout each.

## Honest limitation

Agent runs are nondeterministic. One run is an **adherence report**, not a regression verdict — the same prompt can produce a different diff tomorrow. `agentrules` tells you what happened in *this* run; treat trends across runs as signal, single runs as anecdote.

## Scope of v0.1

Claude Code only. Deterministic checks only (no LLM-as-judge). No baselines or run comparison, no dashboard, no multi-agent support — deliberately.

## Development

```sh
npm install
npm test          # unit tests (Vitest)
npm run build     # compile to dist/
npm run dev       # run the CLI from source (tsx)
```

## License

MIT
