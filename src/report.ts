import type { CheckResult } from "./checks.js";

const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const RESET = "\x1b[0m";

export function formatReport(results: CheckResult[], color: boolean): string {
  const lines: string[] = [];
  for (const result of results) {
    const tag = result.passed
      ? color
        ? `${GREEN}PASS${RESET}`
        : "PASS"
      : color
        ? `${RED}FAIL${RESET}`
        : "FAIL";
    lines.push(`${tag}  ${result.label}`);
    if (!result.passed && result.detail) {
      lines.push(...result.detail.split("\n").map((line) => `      ${line}`));
    }
  }
  const passed = results.filter((result) => result.passed).length;
  lines.push("", `Adherence: ${passed}/${results.length}`);
  return lines.join("\n");
}
