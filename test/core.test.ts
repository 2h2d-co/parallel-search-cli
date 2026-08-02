import assert from "node:assert/strict";
import test from "node:test";
import { CliError, formatResponse, helpText, parseCli } from "../src/core.ts";

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

void test("supports Turbo Search mode through flags and base request bodies", () => {
  const fromFlag = parseCli(["search", "--mode", "turbo", "-q", "Parallel Search API"], env);
  assert.equal(fromFlag.kind, "run");
  if (fromFlag.kind === "run") {
    assert.equal(fromFlag.options.request["mode"], "turbo");
  }

  const fromBody = parseCli(
    ["search", "--body", '{"mode":"turbo","search_queries":["Parallel Search API"]}'],
    env,
  );
  assert.equal(fromBody.kind, "run");
  if (fromBody.kind === "run") {
    assert.equal(fromBody.options.request["mode"], "turbo");
  }
});

void test("documents current Search modes and query guidance", () => {
  const help = helpText("search");
  assert.match(help, /turbo, basic, or advanced/);
  assert.match(help, /2-3 diverse keyword queries/);
  assert.match(help, /Avoid sentences, instructions, and site: operators/);
});

void test("documents current Extract focusing and advanced-setting guidance", () => {
  const help = helpText("extract");
  assert.match(help, /2-3 diverse 3-6 word queries/);
  assert.match(help, /does not affect full content/);
  assert.match(help, /allow-cache-fallback/);
  assert.match(help, /redundant with excerpts and may warn/);
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
      "pricing plan details",
      "-q",
      "subscription cost changes",
      "--max-chars-total",
      "50000",
      "--client-model",
      "gpt-5.4",
      "--session-id",
      "pricing-review",
      "--excerpt-max-chars-per-result",
      "10000",
      "--full-content-max-chars-per-result",
      "50000",
      "--max-age-seconds",
      "600",
      "--timeout-seconds",
      "30",
      "--disable-cache-fallback",
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
      excerpt_settings: {
        max_chars_per_result: 10000,
      },
      fetch_policy: {
        disable_cache_fallback: true,
        max_age_seconds: 600,
        timeout_seconds: 30,
      },
      full_content: {
        max_chars_per_result: 50000,
      },
    },
    client_model: "gpt-5.4",
    max_chars_total: 50000,
    objective: "Find pricing details.",
    search_queries: ["pricing plan details", "subscription cost changes"],
    session_id: "pricing-review",
    urls: ["https://example.com/a", "https://example.com/b"],
  });
});

void test("supports Extract full-content boolean and raw advanced-setting flags", () => {
  const fullContent = parseCli(["extract", "https://example.com", "--full-content"], env);
  assert.equal(fullContent.kind, "run");
  if (fullContent.kind === "run") {
    assert.deepEqual(fullContent.options.request["advanced_settings"], { full_content: true });
  }

  const noFullContent = parseCli(["extract", "https://example.com", "--no-full-content"], env);
  assert.equal(noFullContent.kind, "run");
  if (noFullContent.kind === "run") {
    assert.deepEqual(noFullContent.options.request["advanced_settings"], { full_content: false });
  }

  const rawSettings = parseCli(
    [
      "extract",
      "https://example.com",
      "--fetch-policy",
      '{"max_age_seconds":600,"disable_cache_fallback":true}',
      "--allow-cache-fallback",
      "--excerpt-settings",
      '{"max_chars_per_result":5000}',
      "--full-content-settings",
      '{"max_chars_per_result":50000}',
    ],
    env,
  );
  assert.equal(rawSettings.kind, "run");
  if (rawSettings.kind === "run") {
    assert.deepEqual(rawSettings.options.request["advanced_settings"], {
      excerpt_settings: { max_chars_per_result: 5000 },
      fetch_policy: { disable_cache_fallback: false, max_age_seconds: 600 },
      full_content: { max_chars_per_result: 50000 },
    });
  }
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

void test("accepts documented source-policy domain and date forms", () => {
  const command = parseCli(
    [
      "search",
      "-q",
      "government climate guidance",
      "--include-domain",
      "example.gov,.gov",
      "--after-date",
      "2026-01-31",
      "--max-results",
      "20",
      "--location",
      "GB",
    ],
    env,
  );
  assert.equal(command.kind, "run");

  if (command.kind !== "run") {
    return;
  }

  assert.deepEqual(command.options.request["advanced_settings"], {
    location: "gb",
    max_results: 20,
    source_policy: {
      after_date: "2026-01-31",
      include_domains: ["example.gov", ".gov"],
    },
  });
});

void test("rejects conflicting source-policy domain lists", () => {
  assert.throws(
    () =>
      parseCli(
        [
          "search",
          "-q",
          "Parallel Search API",
          "--include-domain",
          "parallel.ai",
          "--exclude-domain",
          "example.com",
        ],
        env,
      ),
    (error: unknown) => error instanceof CliError && error.message.includes("not both"),
  );
});

void test("rejects invalid source-policy domains", () => {
  const invalidDomains = [
    "https://parallel.ai",
    "parallel.ai/docs",
    "parallel.ai:443",
    "*.org",
    "localhost",
  ];

  for (const domain of invalidDomains) {
    assert.throws(
      () => parseCli(["search", "-q", "Parallel Search API", "--include-domain", domain], env),
      (error: unknown) => error instanceof CliError && error.message.includes("plain domains"),
      domain,
    );
  }
});

void test("rejects more than 200 source-policy domains", () => {
  const includeDomains = Array.from({ length: 201 }, (_, index) => `domain-${index}.example`);
  assert.throws(
    () =>
      parseCli(
        [
          "search",
          "--body",
          JSON.stringify({
            advanced_settings: { source_policy: { include_domains: includeDomains } },
            search_queries: ["Parallel Search API"],
          }),
        ],
        env,
      ),
    (error: unknown) => error instanceof CliError && error.message.includes("at most 200 domains"),
  );
});

void test("rejects invalid source-policy dates", () => {
  for (const date of ["not-a-date", "2026-02-30"]) {
    assert.throws(
      () => parseCli(["search", "-q", "Parallel Search API", "--after-date", date], env),
      (error: unknown) => error instanceof CliError && error.message.includes("RFC 3339 date"),
      date,
    );
  }
});

void test("rejects Search result limits above the public API cap", () => {
  assert.throws(
    () =>
      parseCli(
        [
          "search",
          "--body",
          '{"search_queries":["Parallel Search API"],"advanced_settings":{"max_results":21}}',
        ],
        env,
      ),
    (error: unknown) => error instanceof CliError && error.message.includes("must be <= 20"),
  );
});

void test("rejects invalid Search location formats", () => {
  assert.throws(
    () => parseCli(["search", "-q", "Parallel Search API", "--location", "usa"], env),
    (error: unknown) => error instanceof CliError && error.message.includes("ISO 3166-1 alpha-2"),
  );
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

void test("rejects invalid Extract URLs, query counts, and advanced limits", () => {
  assert.throws(
    () => parseCli(["extract", "file:///tmp/report.pdf"], env),
    (error: unknown) => error instanceof CliError && error.message.includes("http or https URL"),
  );

  const queries = Array.from({ length: 6 }, (_, index) => `focused query ${index}`);
  assert.throws(
    () =>
      parseCli(
        [
          "extract",
          "--body",
          JSON.stringify({ search_queries: queries, urls: ["https://example.com"] }),
        ],
        env,
      ),
    (error: unknown) => error instanceof CliError && error.message.includes("at most 5 queries"),
  );

  assert.throws(
    () => parseCli(["extract", "https://example.com", "--max-age-seconds", "599"], env),
    (error: unknown) => error instanceof CliError && error.message.includes("must be >= 600"),
  );

  assert.throws(
    () =>
      parseCli(["extract", "https://example.com", "--full-content-max-chars-per-result", "0"], env),
    (error: unknown) => error instanceof CliError && error.message.includes("must be >= 1"),
  );
});

void test("formats Extract errors, warnings, usage, and session metadata", () => {
  const response = {
    errors: [
      {
        content: "Source returned an error",
        error_type: "fetch_error",
        http_status_code: 500,
        url: "https://example.com/failure",
      },
    ],
    extract_id: "extract_123",
    results: [],
    session_id: "session_123",
    usage: [{ count: 1, name: "sku_extract_excerpts" }],
    warnings: [{ message: "Example warning", type: "warning" }],
  };

  assert.equal(formatResponse(response, "urls", false), "");

  const text = formatResponse(response, "text", false);
  assert.match(text, /extract_id: extract_123/);
  assert.match(text, /session_id: session_123/);
  assert.match(text, /warnings: \[/);
  assert.match(text, /errors: \[/);
  assert.match(text, /"error_type": "fetch_error"/);
  assert.match(text, /usage: \[/);
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
