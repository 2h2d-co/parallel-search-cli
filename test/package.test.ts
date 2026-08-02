import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

void test("packages an agent skill with bounded and safe CLI guidance", () => {
  const packageJson: unknown = JSON.parse(readFileSync("package.json", "utf8"));
  assert.ok(isRecord(packageJson));
  assert.ok(Array.isArray(packageJson["files"]));
  assert.ok(packageJson["files"].includes("skills"));

  const skill = readFileSync("skills/parallel-search-cli/SKILL.md", "utf8");
  assert.match(skill, /^name: parallel-search-cli$/m);
  assert.match(skill, /allowed-tools: Bash\(parallel-search:\*\)/);
  assert.match(skill, /--mode basic/);
  assert.match(skill, /--max-chars-total 27000/);
  assert.match(skill, /--output/);
  assert.match(skill, /--fail-on-errors/);
  assert.match(skill, /untrusted data/);
  assert.match(skill, /never expose `PARALLEL_API_KEY`/);
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
