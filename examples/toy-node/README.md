# Toy example

The smallest possible `agentrules` demo: a one-file node "project" and a test
that asks Claude Code to add a function, then checks it behaved.

The example must live in its **own** git repo (agentrules snapshots the repo it
runs in — inside the agent-rules repo it would snapshot all of agent-rules).
Copy it out and run:

```sh
cp -r examples/toy-node ~/agentrules-demo
cd ~/agentrules-demo
git init -b main && git add -A && git commit -m "toy repo"
agentrules run
```

Expected: the agent adds `subtract` to `src/math.js`, every check passes,
`Checks passed: 5/5`, exit code 0.

To see what a **violation** looks like, add the line `- src/**` under
`forbidden_paths:` in `agentrules.yaml` and run it again — the task requires
editing `src/math.js`, so the run must break that rule: `FAIL  changes in
src/**` with the file listed, `Checks passed: 4/5` (the agent may vary between
runs, but that check can never pass), exit code 1.
