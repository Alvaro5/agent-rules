import { describe, it, expect } from "vitest";
import { formatReport } from "./report.js";

describe("formatReport", () => {
  it("matches the briefing's report shape", () => {
    const report = formatReport(
      [
        { passed: true, label: "cargo test (exit 0)" },
        { passed: true, label: "no changes in frontend/**" },
        { passed: false, label: "new dependency: validator (package.json)" },
      ],
      false,
    );
    expect(report).toBe(
      [
        "PASS  cargo test (exit 0)",
        "PASS  no changes in frontend/**",
        "FAIL  new dependency: validator (package.json)",
        "",
        "Adherence: 2/3",
      ].join("\n"),
    );
  });

  it("indents failure detail under the FAIL line", () => {
    const report = formatReport(
      [{ passed: false, label: "changes in frontend/**", detail: "frontend/a.tsx" }],
      false,
    );
    expect(report).toContain("FAIL  changes in frontend/**\n      frontend/a.tsx");
  });

  it("colors PASS/FAIL only when asked", () => {
    const results = [{ passed: true, label: "x" }];
    expect(formatReport(results, true)).toContain("\x1b[32m");
    expect(formatReport(results, false)).not.toContain("\x1b[");
  });
});
