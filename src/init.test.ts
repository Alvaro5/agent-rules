import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initConfig, InitError, TEMPLATE } from "./init.js";
import { parseConfig } from "./config.js";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "agentrules-init-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("initConfig", () => {
  it("writes the template", async () => {
    const path = join(dir, "agentrules.yaml");
    await initConfig(path);
    expect(await readFile(path, "utf8")).toBe(TEMPLATE);
  });

  it("refuses to overwrite an existing file", async () => {
    const path = join(dir, "agentrules.yaml");
    await writeFile(path, "prompt: precious hand-written test\n");
    await expect(initConfig(path)).rejects.toThrow(InitError);
    expect(await readFile(path, "utf8")).toContain("precious");
  });
});

describe("TEMPLATE", () => {
  it("is valid parseable config out of the box", () => {
    const config = parseConfig(TEMPLATE, "agentrules.yaml");
    expect(config.prompt).toContain("realistic task");
  });

  it("mentions every schema key so users can uncomment them", () => {
    for (const key of ["setup", "must_run", "forbidden_paths", "must_not_add_deps"]) {
      expect(TEMPLATE).toContain(`# ${key}:`);
    }
  });
});
