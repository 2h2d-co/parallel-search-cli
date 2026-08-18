import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { isJsonObject } from "../src/core.ts";
import {
  assertCliSuccess,
  buildAndUnpackPackedCli,
  type PackedCli,
  parseJsonObject,
  readPackedManifest,
  runPackedCli,
} from "./support/packed-cli.ts";

let installed: PackedCli | undefined;

before(() => {
  installed = buildAndUnpackPackedCli();
});

after(() => {
  installed?.cleanup();
});

void test("the packed npm artifact contains and invokes the compiled CLI", () => {
  const packedCli = getInstalled();
  const manifest = readPackedManifest(packedCli);
  assert.equal(manifest["name"], "parallel-search-cli");
  assert.deepEqual(manifest["bin"], { "parallel-search": "bin/parallel-search.js" });
  assert.equal(manifest["dependencies"], undefined);

  const result = runPackedCli(packedCli, ["--version"], {
    unsetEnv: ["PARALLEL_API_KEY", "PARALLEL_BASE_URL"],
  });
  assertCliSuccess(result, "packed CLI version command");
  assert.equal(result.stderr, "");
  assert.equal(result.stdout.trim(), manifest["version"]);
});

void test("the packed CLI exposes schemas and accepts stdin request bodies", () => {
  const packedCli = getInstalled();
  const schema = runPackedCli(packedCli, ["schema", "search"], {
    unsetEnv: ["PARALLEL_API_KEY", "PARALLEL_BASE_URL"],
  });
  assertCliSuccess(schema, "packed CLI schema command");
  assert.deepEqual(parseJsonObject(schema.stdout, "Search schema")["required"], ["search_queries"]);

  const preview = runPackedCli(packedCli, ["search", "--body", "@-", "--dry-run", "--compact"], {
    input: '{"mode":"turbo","search_queries":["Parallel Search API"]}',
    unsetEnv: ["PARALLEL_API_KEY", "PARALLEL_BASE_URL"],
  });
  assertCliSuccess(preview, "packed CLI dry run");
  assert.deepEqual(parseJsonObject(preview.stdout, "request preview"), {
    endpoint: "search",
    method: "POST",
    request: {
      max_chars_total: 27000,
      mode: "turbo",
      search_queries: ["Parallel Search API"],
    },
    timeout_ms: 60_000,
    url: "https://api.parallel.ai/v1/search",
  });
});

void test("the packed CLI writes protected output and keeps stable JSON errors", () => {
  const packedCli = getInstalled();
  const directory = mkdtempSync(join(tmpdir(), "parallel-search-artifact-output-"));
  const output = join(directory, "preview.json");

  try {
    const first = runPackedCli(
      packedCli,
      ["search", "--query", "Parallel Search API", "--dry-run", "--compact", "-o", output],
      { unsetEnv: ["PARALLEL_API_KEY", "PARALLEL_BASE_URL"] },
    );
    assertCliSuccess(first, "packed CLI output command");
    const receipt = parseJsonObject(first.stdout, "output receipt");
    assert.equal(receipt["output"], output);
    assert.equal(receipt["bytes"], Buffer.byteLength(readFileSync(output, "utf8")));
    assert.equal(statSync(output).mode & 0o777, 0o600);

    const conflict = runPackedCli(
      packedCli,
      ["search", "--query", "Parallel Search API", "--dry-run", "-o", output, "--json-errors"],
      { unsetEnv: ["PARALLEL_API_KEY", "PARALLEL_BASE_URL"] },
    );
    assert.equal(conflict.status, 7);
    assert.equal(parseJsonObject(conflict.stderr, "output error")["type"], "error");

    const auth = runPackedCli(
      packedCli,
      ["search", "--query", "Parallel Search API", "--json-errors"],
      { unsetEnv: ["PARALLEL_API_KEY", "PARALLEL_BASE_URL"] },
    );
    assert.equal(auth.status, 3);
    const error = parseJsonObject(auth.stderr, "authentication error")["error"];
    assert.ok(isJsonObject(error));
    assert.equal(error["kind"], "auth");
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
});

function getInstalled(): PackedCli {
  if (installed === undefined) {
    throw new Error("Packed CLI test setup did not run");
  }

  return installed;
}
