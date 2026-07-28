import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { parseConfig } from "./config.js";

// Drift guard: the shipped example must always parse against the real schema.
describe("examples/toy-node", () => {
  it("has a valid agentrules.yaml", async () => {
    const source = await readFile(
      new URL("../examples/toy-node/agentrules.yaml", import.meta.url),
      "utf8",
    );
    const config = parseConfig(source, "examples/toy-node/agentrules.yaml");
    expect(config.prompt).toContain("subtract");
    expect(config.must_run.length).toBeGreaterThan(0);
    expect(config.must_not_add_deps).toBe(true);
  });
});
