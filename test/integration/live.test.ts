import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import {
  assertCliSuccess,
  buildAndUnpackPackedCli,
  isRecord,
  type PackedCli,
  parseJsonObject,
  runPackedCli,
} from "../support/packed-cli.ts";

const realApiBaseUrl = "https://api.parallel.ai/v1";
let installed: PackedCli | undefined;

before(() => {
  const apiKey = process.env["PARALLEL_API_KEY"];
  if (apiKey === undefined || apiKey.trim() === "") {
    throw new Error(
      "Live integration tests require PARALLEL_API_KEY and make billable requests to the real Parallel API",
    );
  }

  installed = buildAndUnpackPackedCli();
});

after(() => {
  installed?.cleanup();
});

void test("the packed CLI maps a real API authentication failure to its stable contract", () => {
  const result = runPackedCli(
    getInstalled(),
    ["search", "--query", "Parallel Search API", "--compact", "--json-errors"],
    {
      env: {
        PARALLEL_API_KEY: "parallel-search-cli-intentionally-invalid",
        PARALLEL_BASE_URL: realApiBaseUrl,
      },
    },
  );

  assert.equal(result.status, 3);
  assert.equal(result.stdout, "");
  const response = parseJsonObject(result.stderr, "live authentication error");
  const error = response["error"];
  assert.ok(isRecord(error));
  assert.equal(error["kind"], "auth");
  assert.equal(error["status"], 401);
});

void test(
  "the packed CLI completes real Turbo Search and focused Extract calls in one session",
  { timeout: 180_000 },
  () => {
    const packedCli = getInstalled();
    const sessionId = `parallel_search_cli_integration_${randomUUID()}`;
    const liveEnv = { PARALLEL_BASE_URL: realApiBaseUrl };

    const search = runPackedCli(
      packedCli,
      [
        "search",
        "--mode",
        "turbo",
        "--objective",
        "Find current official documentation describing the Parallel Search API and its purpose.",
        "--query",
        "Parallel Search API documentation",
        "--query",
        "Parallel web search purpose",
        "--client-model",
        "gpt-5.4",
        "--max-chars-total",
        "5000",
        "--session-id",
        sessionId,
        "--compact",
        "--json-errors",
        "--timeout",
        "120000",
      ],
      { env: liveEnv },
    );
    assertCliSuccess(search, "live Turbo Search");
    assert.equal(search.stderr, "");
    const searchResponse = parseJsonObject(search.stdout, "live Search response");
    assert.match(requiredString(searchResponse, "search_id"), /^search_/);
    assert.equal(requiredString(searchResponse, "session_id"), sessionId);
    assertResults(searchResponse, "Search");
    assertUsage(searchResponse, "Search");

    const extract = runPackedCli(
      packedCli,
      [
        "extract",
        "https://docs.parallel.ai/search/best-practices",
        "--objective",
        "Identify the documented best practices for objectives and keyword queries in Parallel Search.",
        "--query",
        "Parallel Search objective guidance",
        "--query",
        "Parallel keyword query practices",
        "--client-model",
        "gpt-5.4",
        "--max-chars-total",
        "5000",
        "--session-id",
        sessionId,
        "--fail-on-errors",
        "--compact",
        "--json-errors",
        "--timeout",
        "120000",
      ],
      { env: liveEnv },
    );
    assertCliSuccess(extract, "live focused Extract");
    assert.equal(extract.stderr, "");
    const extractResponse = parseJsonObject(extract.stdout, "live Extract response");
    assert.match(requiredString(extractResponse, "extract_id"), /^extract_/);
    assert.equal(requiredString(extractResponse, "session_id"), sessionId);
    assertResults(extractResponse, "Extract");
    assertUsage(extractResponse, "Extract");
    assert.deepEqual(extractResponse["errors"], []);
  },
);

function assertResults(response: Record<string, unknown>, endpoint: string): void {
  const results = response["results"];
  assert.ok(Array.isArray(results) && results.length > 0, `${endpoint} returned no results`);

  const first = results[0];
  assert.ok(isRecord(first), `${endpoint} returned an invalid result`);
  assert.match(requiredString(first, "url"), /^https?:\/\//);

  const excerpts = first["excerpts"];
  assert.ok(
    Array.isArray(excerpts) &&
      excerpts.some((excerpt) => typeof excerpt === "string" && excerpt.trim() !== ""),
    `${endpoint} returned no excerpts`,
  );
}

function assertUsage(response: Record<string, unknown>, endpoint: string): void {
  const usage = response["usage"];
  assert.ok(Array.isArray(usage) && usage.length > 0, `${endpoint} returned no usage metadata`);
}

function requiredString(record: Record<string, unknown>, field: string): string {
  const value = record[field];
  assert.ok(typeof value === "string" && value !== "", `${field} must be a non-empty string`);
  return value;
}

function getInstalled(): PackedCli {
  if (installed === undefined) {
    throw new Error("Packed CLI integration test setup did not run");
  }

  return installed;
}
