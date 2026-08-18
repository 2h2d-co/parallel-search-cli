import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, before, test } from "node:test";
import { isJsonObject, isString, type JsonObject } from "../../src/core.ts";
import {
  assertCliSuccess,
  buildAndUnpackPackedCli,
  type PackedCli,
  parseJsonObject,
  runPackedCli,
} from "../support/packed-cli.ts";

const realApiBaseUrl = "https://api.parallel.ai/v1";
const liveRequestTimeout = "120000";
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

test("the packed CLI maps a real API authentication failure to JSON", () => {
  const result = runPackedCli(
    getInstalled(),
    [
      "search",
      "--query",
      "Parallel Search API",
      "--api-key",
      "parallel-search-cli-intentionally-invalid",
      "--base-url",
      realApiBaseUrl,
      "--compact",
      "--error-format",
      "json",
    ],
    { unsetEnv: ["PARALLEL_BASE_URL"] },
  );

  assert.equal(result.status, 3);
  assert.equal(result.stdout, "");
  const error = responseError(result.stderr, "live authentication error");
  assert.equal(error["kind"], "auth");
  assert.equal(error["status"], 401);
});

test("the packed CLI preserves real API validation details", () => {
  const result = runPackedCli(
    getInstalled(),
    [
      "search",
      "--body",
      '{"search_queries":["Parallel Search API"],"unsupported_integration_field":true}',
      "--compact",
      "--json-errors",
      "--timeout",
      liveRequestTimeout,
    ],
    { env: realApiEnv() },
  );

  assert.equal(result.status, 4);
  assert.equal(result.stdout, "");
  const error = responseError(result.stderr, "live validation error");
  assert.equal(error["kind"], "api");
  assert.equal(error["status"], 422);
  assert.ok(isString(error["ref_id"]));
  assert.notEqual(error["detail"], undefined);
});

test("the packed CLI distinguishes real timeouts from network failures", () => {
  const timeout = runPackedCli(getInstalled(), [
    "search",
    "--query",
    "Parallel Search API",
    "--base-url",
    realApiBaseUrl,
    "--timeout-ms",
    "1",
    "--json-errors",
  ]);
  assert.equal(timeout.status, 5);
  assert.equal(responseError(timeout.stderr, "live timeout error")["kind"], "timeout");

  const network = runPackedCli(getInstalled(), [
    "search",
    "--query",
    "Parallel Search API",
    "--base-url",
    "http://127.0.0.1:1/v1",
    "--timeout",
    "5000",
    "--error-format",
    "text",
  ]);
  assert.equal(network.status, 5);
  assert.match(network.stderr, /^parallel-search: Network request failed:/);
});

test(
  "the packed CLI completes Turbo Search and focused Extract in one real session",
  { timeout: 300_000 },
  () => {
    const packedCli = getInstalled();
    const directory = mkdtempSync(join(tmpdir(), "parallel-search-live-session-"));
    const queriesFile = join(directory, "queries.json");
    const sessionId = integrationSession("focused");
    writeFileSync(
      queriesFile,
      JSON.stringify(["Parallel Search API documentation", "Parallel web search purpose"]),
    );

    try {
      const search = runPackedCli(
        packedCli,
        [
          "search",
          "-",
          "--mode",
          "turbo",
          "--search-queries",
          `@${queriesFile}`,
          "--client-model",
          "gpt-5.4",
          "--max-chars-total",
          "5000",
          "--session-id",
          sessionId,
          "--compact",
          "--json-errors",
          "--timeout",
          liveRequestTimeout,
        ],
        {
          input:
            "Find current official documentation describing the Parallel Search API and its purpose.\n",
          unsetEnv: ["PARALLEL_BASE_URL"],
        },
      );
      const searchResponse = successfulJson(search, "live Turbo Search");
      assertEndpointResponse(searchResponse, "search_id", "search", sessionId);

      const extract = runPackedCli(
        packedCli,
        [
          "extract",
          "--urls",
          '["https://docs.parallel.ai/search/best-practices"]',
          "--objective",
          "Identify the documented best practices for objectives and keyword queries in Parallel Search.",
          "--search-query",
          "Parallel Search objective guidance",
          "--search-query",
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
          liveRequestTimeout,
        ],
        { env: realApiEnv() },
      );
      const extractResponse = successfulJson(extract, "live focused Extract");
      assertEndpointResponse(extractResponse, "extract_id", "extract", sessionId);
      assert.deepEqual(extractResponse["errors"], []);
    } finally {
      rmSync(directory, { force: true, recursive: true });
    }
  },
);

test(
  "the packed CLI completes Basic, Advanced, and default Search with every output path",
  { timeout: 300_000 },
  () => {
    const packedCli = getInstalled();
    const directory = mkdtempSync(join(tmpdir(), "parallel-search-live-modes-"));
    const bodyFile = join(directory, "default-search.json");
    const outputFile = join(directory, "default-search-response.json");

    try {
      const basicSession = integrationSession("basic");
      const basic = runPackedCli(
        packedCli,
        ["search", "--body", "@-", "--format", "text", "--timeout", liveRequestTimeout],
        {
          env: realApiEnv(),
          input: JSON.stringify({
            client_model: "gpt-5.4",
            max_chars_total: 5000,
            mode: "basic",
            objective: "Find current official guidance for the Parallel Search API.",
            search_queries: ["Parallel Search API guidance", "Parallel Search documentation"],
            session_id: basicSession,
          }),
        },
      );
      assertCliSuccess(basic, "live Basic Search text output");
      assert.equal(basic.stderr, "");
      assert.match(basic.stdout, /https?:\/\//);
      assert.match(basic.stdout, new RegExp(`search_id: search_`));
      assert.match(basic.stdout, new RegExp(`session_id: ${basicSession}`));

      const advanced = runPackedCli(packedCli, [
        "search",
        "--mode",
        "advanced",
        "--objective",
        "Find current documentation and product information from official Parallel domains.",
        "--query",
        "Parallel Search API documentation",
        "--query",
        "Parallel Web Search product",
        "--include-domains",
        "docs.parallel.ai,parallel.ai",
        "--after-date",
        "2020-01-01",
        "--max-age-seconds",
        "600",
        "--fetch-timeout-seconds",
        "15",
        "--allow-cache-fallback",
        "--excerpt-max-chars",
        "1800",
        "--location",
        "us",
        "--max-results",
        "5",
        "--max-chars-total",
        "5000",
        "--client-model",
        "gpt-5.4",
        "--session-id",
        integrationSession("advanced"),
        "--format",
        "urls",
        "--base-url",
        realApiBaseUrl,
        "--timeout",
        liveRequestTimeout,
      ]);
      assertCliSuccess(advanced, "live Advanced Search URL output");
      assert.equal(advanced.stderr, "");
      assertUrlOutput(advanced.stdout, "Advanced Search");

      const defaultSession = integrationSession("default");
      writeFileSync(
        bodyFile,
        JSON.stringify({
          client_model: "gpt-5.4",
          max_chars_total: 5000,
          objective: "Find current information about web search APIs for AI agents.",
          search_queries: ["AI agent web search APIs", "Parallel Search API"],
          session_id: defaultSession,
        }),
      );
      const defaultMode = runPackedCli(
        packedCli,
        [
          "search",
          "--body",
          `@${bodyFile}`,
          "--exclude-domain",
          "example.com",
          "--source-policy",
          '{"exclude_domains":["example.com"]}',
          "--advanced-settings",
          '{"max_results":3}',
          "--fetch-policy",
          '{"disable_cache_fallback":false}',
          "--excerpt-settings",
          '{"max_chars_per_result":1800}',
          "--json",
          "--compact",
          "--output",
          outputFile,
          "--timeout",
          liveRequestTimeout,
        ],
        { env: realApiEnv() },
      );
      assertCliSuccess(defaultMode, "live default Basic Search file output");
      const receipt = parseJsonObject(defaultMode.stdout, "Search output receipt");
      assert.equal(receipt["output"], outputFile);
      assert.equal(receipt["bytes"], Buffer.byteLength(readFileSync(outputFile, "utf8")));
      assert.equal(statSync(outputFile).mode & 0o777, 0o600);
      const defaultResponse = parseJsonObject(
        readFileSync(outputFile, "utf8"),
        "default Search response",
      );
      assertEndpointResponse(defaultResponse, "search_id", "search", defaultSession);
    } finally {
      rmSync(directory, { force: true, recursive: true });
    }
  },
);

test(
  "the packed CLI completes real batch, whole-page, and full-content Extract workflows",
  { timeout: 300_000 },
  () => {
    const packedCli = getInstalled();
    const directory = mkdtempSync(join(tmpdir(), "parallel-search-live-extract-"));
    const urlsFile = join(directory, "urls.json");
    writeFileSync(
      urlsFile,
      JSON.stringify([
        "https://docs.parallel.ai/search/best-practices",
        "https://docs.parallel.ai/extract/best-practices",
      ]),
    );

    try {
      const batchSession = integrationSession("batch");
      const batch = runPackedCli(
        packedCli,
        [
          "extract",
          "--urls",
          `@${urlsFile}`,
          "--objective",
          "-",
          "--search-queries",
          '["Parallel API best practices","objective query guidance"]',
          "--max-chars-total",
          "6000",
          "--client-model",
          "gpt-5.4",
          "--session-id",
          batchSession,
          "--format",
          "text",
          "--fail-on-errors",
          "--timeout",
          liveRequestTimeout,
        ],
        {
          env: realApiEnv(),
          input: "Compare the documented Search and Extract API best practices.\n",
        },
      );
      assertCliSuccess(batch, "live batch Extract text output");
      assert.equal(batch.stderr, "");
      assert.match(batch.stdout, /https:\/\/docs\.parallel\.ai\/search\/best-practices/);
      assert.match(batch.stdout, /https:\/\/docs\.parallel\.ai\/extract\/best-practices/);
      assert.match(batch.stdout, /extract_id: extract_/);
      assert.match(batch.stdout, new RegExp(`session_id: ${batchSession}`));

      const fullSession = integrationSession("full-settings");
      const fullSettings = runPackedCli(
        packedCli,
        [
          "extract",
          "--url",
          "https://example.com/",
          "--objective",
          "Extract the example domain description.",
          "--query",
          "Example Domain description",
          "--max-age-seconds",
          "600",
          "--timeout-seconds",
          "15",
          "--allow-cache-fallback",
          "--excerpt-max-chars-per-result",
          "2000",
          "--full-content-max-chars-per-result",
          "2000",
          "--max-chars-total",
          "3000",
          "--session-id",
          fullSession,
          "--compact",
          "--fail-on-errors",
          "--timeout",
          liveRequestTimeout,
        ],
        { env: realApiEnv() },
      );
      const fullSettingsResponse = successfulJson(fullSettings, "live configured full Extract");
      assertEndpointResponse(fullSettingsResponse, "extract_id", "extract", fullSession);
      assertFullContent(fullSettingsResponse, "configured full Extract");
      assert.deepEqual(fullSettingsResponse["errors"], []);

      const fullBoolean = runPackedCli(
        packedCli,
        [
          "extract",
          "https://example.com/",
          "--full-content",
          "--compact",
          "--fail-on-errors",
          "--timeout",
          liveRequestTimeout,
        ],
        { env: realApiEnv() },
      );
      const fullBooleanResponse = successfulJson(fullBoolean, "live boolean full Extract");
      assertEndpointResponse(fullBooleanResponse, "extract_id", "extract");
      assertFullContent(fullBooleanResponse, "boolean full Extract");

      const wholePage = runPackedCli(
        packedCli,
        [
          "extract",
          "https://example.com/",
          "--no-full-content",
          "--advanced-settings",
          '{"full_content":false}',
          "--compact",
          "--fail-on-errors",
          "--timeout",
          liveRequestTimeout,
        ],
        { env: realApiEnv() },
      );
      const wholePageResponse = successfulJson(wholePage, "live whole-page Extract");
      assertEndpointResponse(wholePageResponse, "extract_id", "extract");
      const wholePageResult = firstResult(wholePageResponse, "whole-page Extract");
      assert.equal(wholePageResult["full_content"], null);
      assert.deepEqual(wholePageResponse["errors"], []);
    } finally {
      rmSync(directory, { force: true, recursive: true });
    }
  },
);

test(
  "the packed CLI preserves real partial Extract responses and enforces strict mode",
  { timeout: 300_000 },
  () => {
    const packedCli = getInstalled();
    const unreachableUrl = "https://parallel-search-cli-test.invalid/unreachable";

    const permissive = runPackedCli(
      packedCli,
      [
        "extract",
        unreachableUrl,
        "--objective",
        "Confirm the URL cannot be extracted.",
        "--query",
        "unreachable URL extraction error",
        "--allow-partial",
        "--compact",
        "--timeout",
        liveRequestTimeout,
      ],
      { env: realApiEnv() },
    );
    const permissiveResponse = successfulJson(permissive, "permissive partial Extract");
    assertPartialExtract(permissiveResponse, unreachableUrl);

    const directory = mkdtempSync(join(tmpdir(), "parallel-search-live-partial-"));
    try {
      const strict = runPackedCli(
        packedCli,
        [
          "extract",
          unreachableUrl,
          "--objective",
          "Confirm the URL cannot be extracted.",
          "--query",
          "unreachable URL extraction error",
          "--max-age-seconds",
          "600",
          "--disable-cache-fallback",
          "--temp-output",
          "--timeout",
          liveRequestTimeout,
        ],
        { env: { ...realApiEnv(), TMPDIR: directory } },
      );
      assert.equal(strict.status, 6);
      const outputFile = strict.stdout.trim();
      assert.equal(dirname(dirname(outputFile)), directory);
      assert.equal(statSync(dirname(outputFile)).mode & 0o777, 0o700);
      assert.equal(statSync(outputFile).mode & 0o777, 0o600);
      const error = responseError(strict.stderr, "strict partial Extract error");
      assert.equal(error["kind"], "partial");
      assert.ok(Array.isArray(error["detail"]) && error["detail"].length === 1);
      assertPartialExtract(
        parseJsonObject(readFileSync(outputFile, "utf8"), "strict partial Extract response"),
        unreachableUrl,
      );
    } finally {
      rmSync(directory, { force: true, recursive: true });
    }
  },
);

function realApiEnv() {
  return { PARALLEL_BASE_URL: realApiBaseUrl };
}

function integrationSession(label: string): string {
  return `parallel_search_cli_${label}_${randomUUID()}`;
}

function successfulJson(result: ReturnType<typeof runPackedCli>, description: string) {
  assertCliSuccess(result, description);
  assert.equal(result.stderr, "");
  return parseJsonObject(result.stdout, `${description} response`);
}

function responseError(stderr: string, description: string): JsonObject {
  const response = parseJsonObject(stderr, description);
  const error = response["error"];
  assert.ok(isJsonObject(error), `${description} did not contain an error object`);
  return error;
}

function assertEndpointResponse(
  response: JsonObject,
  idField: "extract_id" | "search_id",
  idPrefix: "extract" | "search",
  expectedSessionId?: string,
): void {
  assert.match(requiredString(response, idField), new RegExp(`^${idPrefix}_`));
  const sessionId = requiredString(response, "session_id");
  if (expectedSessionId !== undefined) {
    assert.equal(sessionId, expectedSessionId);
  }
  assertResults(response, idPrefix === "search" ? "Search" : "Extract");
  assertUsage(response, idPrefix === "search" ? "Search" : "Extract");
}

function assertResults(response: JsonObject, endpoint: string): void {
  const result = firstResult(response, endpoint);
  assert.match(requiredString(result, "url"), /^https?:\/\//);

  const excerpts = result["excerpts"];
  assert.ok(
    Array.isArray(excerpts) &&
      excerpts.some((excerpt) => isString(excerpt) && excerpt.trim() !== ""),
    `${endpoint} returned no excerpts`,
  );
}

function firstResult(response: JsonObject, endpoint: string): JsonObject {
  const results = response["results"];
  assert.ok(Array.isArray(results) && results.length > 0, `${endpoint} returned no results`);
  const first = results[0];
  assert.ok(isJsonObject(first), `${endpoint} returned an invalid result`);
  return first;
}

function assertUsage(response: JsonObject, endpoint: string): void {
  const usage = response["usage"];
  assert.ok(Array.isArray(usage) && usage.length > 0, `${endpoint} returned no usage metadata`);
}

function assertFullContent(response: JsonObject, description: string): void {
  const result = firstResult(response, description);
  assert.ok(
    isString(result["full_content"]) && result["full_content"].trim() !== "",
    `${description} returned no full content`,
  );
}

function assertPartialExtract(response: JsonObject, expectedUrl: string): void {
  assert.match(requiredString(response, "extract_id"), /^extract_/);
  requiredString(response, "session_id");
  const errors = response["errors"];
  assert.ok(Array.isArray(errors) && errors.length === 1, "Extract did not return one URL error");
  const error = errors[0];
  assert.ok(isJsonObject(error), "Extract returned an invalid URL error");
  assert.equal(error["url"], expectedUrl);
  assert.ok(isString(error["error_type"]));
  assert.deepEqual(response["results"], []);
  assert.ok(Array.isArray(response["usage"]), "partial Extract returned invalid usage metadata");
}

function assertUrlOutput(output: string, description: string): void {
  const urls = output.trim().split("\n");
  assert.ok(urls.length > 0 && urls[0] !== "", `${description} returned no URLs`);
  for (const url of urls) {
    assert.match(url, /^https?:\/\//);
  }
}

function requiredString(record: JsonObject, field: string): string {
  const value = record[field];
  assert.ok(isString(value) && value !== "", `${field} must be a non-empty string`);
  return value;
}

function getInstalled(): PackedCli {
  if (installed === undefined) {
    throw new Error("Packed CLI integration test setup did not run");
  }

  return installed;
}
