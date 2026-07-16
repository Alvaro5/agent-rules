# agentrules

**Check whether Claude Code actually followed the rules in your `CLAUDE.md` / `AGENTS.md`.**

You write agent instructions by intuition and never know if they're obeyed. When you edit the file, you can't tell if you made things better or worse. `agentrules` gives you a concrete answer for one run: here's what the agent did, here's which of your rules it respected.

> **Status: work in progress (v0.1 in development).** The core loop works — isolated worktree, headless agent run, changed-files report. The pass/fail assertions (`must_run`, `forbidden_paths`, `must_not_add_deps`) are parsed but not yet evaluated. Not yet published to npm.

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

# Commands that must exit 0 after the agent is done. (parsed, evaluation coming)
must_run:
  - npm test

# Globs the agent must not touch. (parsed, evaluation coming)
forbidden_paths:
  - frontend/**

# Fail if package.json / Cargo.toml gained dependencies. (parsed, evaluation coming)
must_not_add_deps: true
```

Then:

```sh
agentrules run            # uses ./agentrules.yaml
agentrules run -c path/to/test.yaml
agentrules run --keep     # keep the worktree afterwards for inspection
```

Current output (assertions land next):

```
Creating isolated worktree of /your/repo ...
Running Claude Code headless (this can take a few minutes) ...

Agent finished (exit 0).
Changed files:
  src/api/health.ts
  src/router.ts
```

Target output for v0.1:

```
PASS  npm test (exit 0)
PASS  no changes in frontend/**
FAIL  new dependency: validator
Adherence: 2/3
```

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
