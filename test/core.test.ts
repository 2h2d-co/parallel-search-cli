import assert from "node:assert/strict";
import test from "node:test";
import { CliError, formatResponse, parseCli } from "../src/core.ts";

const env = { PARALLEL_API_KEY: "test-key" };

void test("builds a search request with objective, queries, and advanced settings", () => {
  const command = parseCli(
    [
      "search",
      "--objective",
      "Find latest product announcements from Parallel Web Systems.",
      "-q",
      "Parallel Web Systems announcements",
      "-q",
      "Parallel Web Systems products",
      "--mode",
      "basic",
      "--max-results",
      "5",
      "--include-domain",
      "parallel.ai,docs.parallel.ai",
    ],
    env,
  );
  assert.equal(command.kind, "run");

  if (command.kind !== "run") {
    return;
  }

  assert.equal(command.endpoint, "search");
  assert.deepEqual(command.options.request, {
    advanced_settings: {
      max_results: 5,
      source_policy: {
        include_domains: ["parallel.ai", "docs.parallel.ai"],
      },
    },
    mode: "basic",
    objective: "Find latest product announcements from Parallel Web Systems.",
    search_queries: ["Parallel Web Systems announcements", "Parallel Web Systems products"],
  });
  assert.equal(command.options.apiKey, "test-key");
  assert.equal(command.options.baseUrl, "https://api.parallel.ai/v1");
});

void test("builds an extract request from positional and flag URLs", () => {
  const command = parseCli(
    [
      "extract",
      "https://example.com/a",
      "--url",
      "https://example.com/b",
      "--objective",
      "Find pricing details.",
      "-q",
      "pricing details",
      "--full-content-max-chars-per-result",
      "50000",
      "--max-age-seconds",
      "600",
    ],
    env,
  );
  assert.equal(command.kind, "run");

  if (command.kind !== "run") {
    return;
  }

  assert.equal(command.endpoint, "extract");
  assert.deepEqual(command.options.request, {
    advanced_settings: {
      fetch_policy: {
        max_age_seconds: 600,
      },
      full_content: {
        max_chars_per_result: 50000,
      },
    },
    objective: "Find pricing details.",
    search_queries: ["pricing details"],
    urls: ["https://example.com/a", "https://example.com/b"],
  });
});

void test("merges body as a base request and lets CLI flags override nested settings", () => {
  const command = parseCli(
    [
      "search",
      "--body",
      '{"search_queries":["body query"],"advanced_settings":{"excerpt_settings":{"max_chars_per_result":1000},"max_results":2}}',
      "--max-results",
      "5",
      "--excerpt-max-chars-per-result",
      "2000",
    ],
    env,
  );
  assert.equal(command.kind, "run");

  if (command.kind !== "run") {
    return;
  }

  assert.deepEqual(command.options.request, {
    advanced_settings: {
      excerpt_settings: {
        max_chars_per_result: 2000,
      },
      max_results: 5,
    },
    search_queries: ["body query"],
  });
});

void test("rejects search requests without search_queries", () => {
  assert.throws(
    () => parseCli(["search", "Find", "official", "docs"], env),
    (error: unknown) =>
      error instanceof CliError && error.message.includes("search_queries is required"),
  );
});

void test("rejects extract requests with more than 20 URLs", () => {
  const urls = Array.from({ length: 21 }, (_, index) => `https://example.com/${index}`);
  assert.throws(
    () => parseCli(["extract", ...urls], env),
    (error: unknown) => error instanceof CliError && error.message.includes("at most 20 URLs"),
  );
});

void test("formats URL and text output", () => {
  const response = {
    results: [
      {
        excerpts: ["First excerpt\nsecond line"],
        publish_date: "2026-01-02",
        title: "One",
        url: "https://example.com/one",
      },
      { title: "Two", url: "https://example.com/two" },
    ],
    search_id: "search_123",
    session_id: "session_123",
  };

  assert.equal(
    formatResponse(response, "urls", false),
    "https://example.com/one\nhttps://example.com/two",
  );

  assert.equal(
    formatResponse(response, "text", false),
    [
      "1. One",
      "   https://example.com/one",
      "   2026-01-02",
      "   Excerpts:",
      "   - First excerpt",
      "     second line",
      "",
      "2. Two",
      "   https://example.com/two",
      "",
      "search_id: search_123",
      "session_id: session_123",
    ].join("\n"),
  );
});
