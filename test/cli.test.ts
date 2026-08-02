import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const cliPath = fileURLToPath(new URL("../src/cli.ts", import.meta.url));

void test("writes output atomically and refuses to replace existing files", () => {
  const directory = mkdtempSync(join(tmpdir(), "parallel-search-cli-test-"));
  const output = join(directory, "preview.json");

  try {
    const first = runCliSync([
      "search",
      "--query",
      "Parallel Search API",
      "--dry-run",
      "--compact",
      "--output",
      output,
    ]);
    assert.equal(first.status, 0, first.stderr);
    assert.deepEqual(JSON.parse(first.stdout), {
      bytes: Buffer.byteLength(readFileSync(output, "utf8")),
      output,
      type: "output",
    });
    assert.deepEqual(JSON.parse(readFileSync(output, "utf8")), {
      endpoint: "search",
      method: "POST",
      request: { search_queries: ["Parallel Search API"] },
      timeout_ms: 60_000,
      url: "https://api.parallel.ai/v1/search",
    });
    assert.equal(statSync(output).mode & 0o777, 0o600);

    const second = runCliSync([
      "search",
      "--query",
      "Parallel Search API",
      "--dry-run",
      "--output",
      output,
    ]);
    assert.equal(second.status, 7);
    assert.match(second.stderr, /Output file already exists/);
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
});

void test("returns stable usage and authentication errors as JSON", () => {
  const usage = runCliSync(["search", "--query", "--mode", "basic", "--json-errors"]);
  assert.equal(usage.status, 2);
  assert.deepEqual(JSON.parse(usage.stderr), {
    error: {
      kind: "usage",
      message: '--query requires a value; use --query=<value> when the value starts with "-"',
    },
    type: "error",
  });

  const auth = runCliSync(["search", "--query", "Parallel Search API", "--json-errors"]);
  assert.equal(auth.status, 3);
  assert.equal(JSON.parse(auth.stderr).error.kind, "auth");
});

function runCliSync(args: string[]): { status: number | null; stderr: string; stdout: string } {
  const env = { ...process.env };
  delete env["PARALLEL_API_KEY"];
  delete env["PARALLEL_BASE_URL"];
  const result = spawnSync(process.execPath, [cliPath, ...args], {
    encoding: "utf8",
    env,
  });
  if (result.error) {
    throw result.error;
  }

  return { status: result.status, stderr: result.stderr, stdout: result.stdout };
}
