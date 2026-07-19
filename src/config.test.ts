import { describe, it, expect } from "vitest";
import { parseConfig, ConfigError } from "./config.js";

const FILE = "agentrules.yaml";

describe("parseConfig", () => {
  it("parses a full config", () => {
    const config = parseConfig(
      `
prompt: Add an endpoint
setup:
  - npm ci
must_run:
  - npm test
  - npm run lint
forbidden_paths:
  - frontend/**
  - "*.lock"
must_not_add_deps: true
`,
      FILE,
    );
    expect(config).toEqual({
      prompt: "Add an endpoint",
      setup: ["npm ci"],
      must_run: ["npm test", "npm run lint"],
      forbidden_paths: ["frontend/**", "*.lock"],
      must_not_add_deps: true,
    });
  });

  it("defaults everything except prompt", () => {
    const config = parseConfig("prompt: do the thing", FILE);
    expect(config).toEqual({
      prompt: "do the thing",
      setup: [],
      must_run: [],
      forbidden_paths: [],
      must_not_add_deps: false,
    });
  });

  it("rejects a missing prompt", () => {
    expect(() => parseConfig("must_run: [npm test]", FILE)).toThrow(ConfigError);
  });

  it("rejects an empty prompt", () => {
    expect(() => parseConfig('prompt: "  "', FILE)).toThrow(/prompt/);
  });

  it("rejects an empty file", () => {
    expect(() => parseConfig("", FILE)).toThrow(/empty/);
  });

  it("rejects invalid YAML", () => {
    expect(() => parseConfig("prompt: [unclosed", FILE)).toThrow(/valid YAML/);
  });

  it("rejects unknown keys with a helpful message", () => {
    expect(() => parseConfig("prompt: x\nforbidden_path: [a]", FILE)).toThrow(
      /Unknown key `forbidden_path`/,
    );
  });

  it("rejects non-string list entries", () => {
    expect(() => parseConfig("prompt: x\nmust_run: [1, 2]", FILE)).toThrow(
      /must_run.*list of strings/,
    );
  });

  it("rejects a non-boolean must_not_add_deps", () => {
    expect(() => parseConfig("prompt: x\nmust_not_add_deps: yes please", FILE)).toThrow(
      /must_not_add_deps/,
    );
  });
});
