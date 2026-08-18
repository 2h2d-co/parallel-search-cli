import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { isJsonObject } from "../src/core.ts";

void test("packages an agent skill with bounded and safe CLI guidance", () => {
  const packageJson: unknown = JSON.parse(readFileSync("package.json", "utf8"));
  assert.ok(isJsonObject(packageJson));
  assert.ok(Array.isArray(packageJson["files"]));
  assert.ok(packageJson["files"].includes("skills"));

  const skill = readFileSync("skills/parallel-search-cli/SKILL.md", "utf8");
  assert.match(skill, /^name: parallel-search-cli$/m);
  assert.match(skill, /allowed-tools: Bash\(parallel-search:\*\)/);
  assert.match(skill, /defaults to Basic mode/);
  assert.match(skill, /27,000-character total excerpt budget/);
  assert.match(skill, /--temp-output/);
  assert.match(skill, /exits 6 on per-URL errors by default/);
  assert.match(skill, /untrusted data/);
  assert.match(skill, /never expose `PARALLEL_API_KEY`/);
});
