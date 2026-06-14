import { readFileSync } from "node:fs";

export const VERSION = "0.0.1-alpha.1";

const SEARCH_MODES = ["basic", "advanced"];
const OUTPUT_FORMATS = ["json", "text", "urls"];

export type ApiEndpoint = "search" | "extract";
export type OutputFormat = "json" | "text" | "urls";

export type CliCommand =
  | { kind: "help"; endpoint?: ApiEndpoint }
  | { kind: "version" }
  | {
      kind: "run";
      endpoint: ApiEndpoint;
      options: CliRunOptions;
    };

export type CliRunOptions = {
  apiKey: string;
  baseUrl: string;
  compact: boolean;
  endpoint: ApiEndpoint;
  format: OutputFormat;
  request: Record<string, unknown>;
  timeoutMs: number;
};

type Environment = Record<string, string | undefined>;

type ParseState = {
  advancedSettings: Record<string, unknown>;
  apiKey?: string;
  baseUrl?: string;
  bodyBase?: Record<string, unknown>;
  compact: boolean;
  endpoint: ApiEndpoint;
  excludeDomains: string[];
  format: OutputFormat;
  generated: Record<string, unknown>;
  includeDomains: string[];
  positional: string[];
  searchQueries: string[];
  timeoutMs: number;
  urls: string[];
};

export class CliError extends Error {
  exitCode: number;

  constructor(message: string, exitCode = 1) {
    super(message);
    this.name = "CliError";
    this.exitCode = exitCode;
  }
}

export function parseCli(argv: readonly string[], env: Environment = process.env): CliCommand {
  if (argv.length === 0) {
    return { kind: "help" };
  }

  if (argv[0] === "help") {
    const topic = argv[1];
    if (topic === "search" || topic === "extract") {
      return { kind: "help", endpoint: topic };
    }

    return { kind: "help" };
  }

  let endpoint: ApiEndpoint = "search";
  let startIndex = 0;
  let explicitEndpoint = false;
  if (argv[0] === "search" || argv[0] === "extract") {
    endpoint = argv[0];
    startIndex = 1;
    explicitEndpoint = true;
  }

  const state: ParseState = {
    advancedSettings: {},
    compact: false,
    endpoint,
    excludeDomains: [],
    format: "json",
    generated: {},
    includeDomains: [],
    positional: [],
    searchQueries: [],
    timeoutMs: 60_000,
    urls: [],
  };

  for (let index = startIndex; index < argv.length; index += 1) {
    const current = argv[index];
    if (current === undefined) {
      continue;
    }

    if (current === "--") {
      if (state.endpoint === "extract") {
        state.urls.push(...argv.slice(index + 1));
      } else {
        state.positional.push(...argv.slice(index + 1));
      }
      break;
    }

    if (!current.startsWith("-") || current === "-") {
      if (state.endpoint === "extract") {
        state.urls.push(current);
      } else {
        state.positional.push(current);
      }
      continue;
    }

    const flag = splitFlag(current);
    const readValue = (): string => {
      if (flag.inlineValue !== undefined) {
        return flag.inlineValue;
      }

      index += 1;
      const value = argv[index];
      if (value === undefined) {
        throw new CliError(`${flag.name} requires a value`);
      }

      return value;
    };

    switch (flag.name) {
      case "-h":
      case "--help":
        return explicitEndpoint ? { kind: "help", endpoint } : { kind: "help" };
      case "-V":
      case "--version":
        return { kind: "version" };
      case "--api-key":
        state.apiKey = readValue();
        break;
      case "--base-url":
        state.baseUrl = readValue();
        break;
      case "--body":
        state.bodyBase = parseJsonObject(readValue(), flag.name);
        break;
      case "--objective":
        state.generated.objective = readValue();
        break;
      case "-q":
      case "--query":
      case "--search-query":
      case "--search-queries":
        state.searchQueries.push(...parseList(readValue()));
        break;
      case "--mode":
        ensureEndpoint(state.endpoint, "search", flag.name);
        state.generated.mode = parseAllowed(readValue(), flag.name, SEARCH_MODES);
        break;
      case "--include-domain":
      case "--include-domains":
        ensureEndpoint(state.endpoint, "search", flag.name);
        state.includeDomains.push(...parseList(readValue()));
        break;
      case "--exclude-domain":
      case "--exclude-domains":
        ensureEndpoint(state.endpoint, "search", flag.name);
        state.excludeDomains.push(...parseList(readValue()));
        break;
      case "--source-policy":
        ensureEndpoint(state.endpoint, "search", flag.name);
        state.advancedSettings.source_policy = mergeObjects(
          getRecord(state.advancedSettings.source_policy),
          parseJsonObject(readValue(), flag.name),
        );
        break;
      case "--after-date":
        ensureEndpoint(state.endpoint, "search", flag.name);
        state.advancedSettings.source_policy = mergeObjects(
          getRecord(state.advancedSettings.source_policy),
          { after_date: readValue() },
        );
        break;
      case "--location":
        ensureEndpoint(state.endpoint, "search", flag.name);
        state.advancedSettings.location = readValue().toLowerCase();
        break;
      case "--max-results":
        ensureEndpoint(state.endpoint, "search", flag.name);
        state.advancedSettings.max_results = parseInteger(readValue(), flag.name, { min: 1 });
        break;
      case "--url":
      case "--urls":
        ensureEndpoint(state.endpoint, "extract", flag.name);
        state.urls.push(...parseList(readValue()));
        break;
      case "--full-content":
        ensureEndpoint(state.endpoint, "extract", flag.name);
        state.advancedSettings.full_content = true;
        break;
      case "--no-full-content":
        ensureEndpoint(state.endpoint, "extract", flag.name);
        state.advancedSettings.full_content = false;
        break;
      case "--full-content-settings":
        ensureEndpoint(state.endpoint, "extract", flag.name);
        state.advancedSettings.full_content = mergeObjects(
          getRecord(state.advancedSettings.full_content),
          parseJsonObject(readValue(), flag.name),
        );
        break;
      case "--full-content-max-chars":
      case "--full-content-max-chars-per-result":
        ensureEndpoint(state.endpoint, "extract", flag.name);
        state.advancedSettings.full_content = mergeObjects(
          getRecord(state.advancedSettings.full_content),
          { max_chars_per_result: parseInteger(readValue(), flag.name, { min: 1 }) },
        );
        break;
      case "--max-chars-total":
        state.generated.max_chars_total = parseInteger(readValue(), flag.name, { min: 1 });
        break;
      case "--client-model":
        state.generated.client_model = readValue();
        break;
      case "--session-id":
        state.generated.session_id = readValue();
        break;
      case "--advanced-settings":
        state.advancedSettings = mergeObjects(
          state.advancedSettings,
          parseJsonObject(readValue(), flag.name),
        );
        break;
      case "--fetch-policy":
        state.advancedSettings.fetch_policy = mergeObjects(
          getRecord(state.advancedSettings.fetch_policy),
          parseJsonObject(readValue(), flag.name),
        );
        break;
      case "--max-age-seconds":
        state.advancedSettings.fetch_policy = mergeObjects(
          getRecord(state.advancedSettings.fetch_policy),
          { max_age_seconds: parseInteger(readValue(), flag.name, { min: 600 }) },
        );
        break;
      case "--timeout-seconds":
      case "--fetch-timeout-seconds":
        state.advancedSettings.fetch_policy = mergeObjects(
          getRecord(state.advancedSettings.fetch_policy),
          { timeout_seconds: parseNumber(readValue(), flag.name, { minExclusive: 0 }) },
        );
        break;
      case "--disable-cache-fallback":
        state.advancedSettings.fetch_policy = mergeObjects(
          getRecord(state.advancedSettings.fetch_policy),
          { disable_cache_fallback: true },
        );
        break;
      case "--allow-cache-fallback":
        state.advancedSettings.fetch_policy = mergeObjects(
          getRecord(state.advancedSettings.fetch_policy),
          { disable_cache_fallback: false },
        );
        break;
      case "--excerpt-settings":
        state.advancedSettings.excerpt_settings = mergeObjects(
          getRecord(state.advancedSettings.excerpt_settings),
          parseJsonObject(readValue(), flag.name),
        );
        break;
      case "--excerpt-max-chars":
      case "--excerpt-max-chars-per-result":
        state.advancedSettings.excerpt_settings = mergeObjects(
          getRecord(state.advancedSettings.excerpt_settings),
          { max_chars_per_result: parseInteger(readValue(), flag.name, { min: 1 }) },
        );
        break;
      case "--format":
        state.format = parseAllowed(readValue(), flag.name, OUTPUT_FORMATS) as OutputFormat;
        break;
      case "--json":
        state.format = "json";
        break;
      case "--compact":
        state.compact = true;
        break;
      case "--timeout":
      case "--timeout-ms":
        state.timeoutMs = parseInteger(readValue(), flag.name, { min: 1 });
        break;
      default:
        throw new CliError(`Unknown option: ${flag.name}`);
    }
  }

  return buildCommand(state, env);
}

export function helpText(endpoint?: ApiEndpoint): string {
  if (endpoint === "search") {
    return searchHelpText();
  }

  if (endpoint === "extract") {
    return extractHelpText();
  }

  return `parallel-search ${VERSION}

Usage:
  parallel-search search [options] --query "Parallel docs" --objective "Find official docs"
  parallel-search extract [options] --url https://example.com --objective "Find pricing details"
  parallel-search [search options]

Commands:
  search                         Search the web and return LLM-optimized excerpts.
  extract                        Extract focused markdown from public URLs.

Common options:
      --api-key <key>            Defaults to PARALLEL_API_KEY.
      --base-url <url>           Defaults to PARALLEL_BASE_URL or https://api.parallel.ai/v1.
      --body <json|@file>        Base request JSON. CLI flags override matching fields.
      --max-chars-total <n>      Total excerpt character budget.
      --client-model <model>     Model that will consume the results.
      --session-id <id>          Group related Search and Extract calls.
      --advanced-settings <json|@file>
                                  Raw advanced_settings object.
      --format <json|text|urls>  Output format. Default: json.
      --json                     Alias for --format json.
      --compact                  Minify JSON output.
      --timeout <ms>             Request timeout. Default: 60000.
  -h, --help                     Show help.
  -V, --version                  Show version.

Run "parallel-search help search" or "parallel-search help extract" for command-specific options.
`;
}

export async function apiJson(options: CliRunOptions): Promise<unknown> {
  const response = await postApi(options);
  return response.json();
}

export function formatResponse(response: unknown, format: OutputFormat, compact: boolean): string {
  switch (format) {
    case "json": {
      const json = JSON.stringify(response, null, compact ? 0 : 2);
      return json ?? "undefined";
    }
    case "urls":
      return extractResults(response)
        .map((result) => stringField(result, "url"))
        .filter((url) => url !== undefined)
        .join("\n");
    case "text":
      return formatTextResponse(response);
  }
}

function searchHelpText(): string {
  return `parallel-search ${VERSION}

Usage:
  parallel-search search [options] --query "keyword query" --objective "Research goal"
  parallel-search --query "keyword query" --objective "Research goal"

Search request options:
      --objective <text>               Natural-language research goal. Positional text is used as objective.
  -q, --query <query>                  Keyword search query. Repeatable. 3-6 words is recommended.
      --search-query <query>           Alias for --query.
      --mode <mode>                    basic or advanced. Default API mode is advanced.
      --max-chars-total <n>            Total excerpt character budget.
      --client-model <model>           Model that will consume the results.
      --session-id <id>                Group related calls.
      --body <json|@file>              Base search request JSON. CLI flags override matching fields.

Advanced search settings:
      --include-domain <domain[,..]>   Hard allow-list domains. Repeatable.
      --exclude-domain <domain[,..]>   Exclude domains. Repeatable.
      --after-date <YYYY-MM-DD>        Freshness lower bound in source_policy.after_date.
      --source-policy <json|@file>     Raw advanced_settings.source_policy object.
      --max-age-seconds <n>            Fetch live when indexed content is older than n seconds. Minimum: 600.
      --timeout-seconds <n>            Live fetch timeout_seconds.
      --disable-cache-fallback         Fail when live fetch fails instead of using older indexed content.
      --excerpt-max-chars-per-result <n>
                                      Excerpt budget per result.
      --location <cc>                  ISO 3166-1 alpha-2 search location, such as us, gb, de, jp.
      --max-results <n>                Maximum number of results.
      --advanced-settings <json|@file> Raw advanced_settings object.

Output options:
      --format <json|text|urls>        Output format. Default: json.
      --json                           Alias for --format json.
      --compact                        Minify JSON output.
      --timeout <ms>                   Request timeout. Default: 60000.
      --api-key <key>                  Defaults to PARALLEL_API_KEY.
      --base-url <url>                 Defaults to PARALLEL_BASE_URL or https://api.parallel.ai/v1.
  -h, --help                           Show help.
  -V, --version                        Show version.

Examples:
  parallel-search search --objective "Find latest product announcements from Parallel Web Systems" -q "Parallel Web Systems announcements" -q "Parallel Web Systems products"
  parallel-search search --mode basic --objective "Latest quantum error correction advances" -q "quantum error correction 2026" -q "QEC algorithms"
  parallel-search search --objective "React performance guidance from official docs" -q "React memo docs" -q "React useMemo guide" --include-domain react.dev
`;
}

function extractHelpText(): string {
  return `parallel-search ${VERSION}

Usage:
  parallel-search extract [options] <url...>
  parallel-search extract --url https://example.com --objective "Find pricing details"

Extract request options:
      --url <url[,..]>                 URL to extract. Repeatable. Positional URLs are also accepted.
      --objective <text>               Natural-language extraction goal.
  -q, --query <query>                  Keyword query to focus extraction. Repeatable.
      --search-query <query>           Alias for --query.
      --max-chars-total <n>            Total excerpt character budget.
      --client-model <model>           Model that will consume the results.
      --session-id <id>                Group related calls.
      --body <json|@file>              Base extract request JSON. CLI flags override matching fields.

Advanced extract settings:
      --max-age-seconds <n>            Fetch live when indexed content is older than n seconds. Minimum: 600.
      --timeout-seconds <n>            Live fetch timeout_seconds.
      --disable-cache-fallback         Fail when live fetch fails instead of using older indexed content.
      --excerpt-max-chars-per-result <n>
                                      Excerpt budget per result.
      --full-content                   Enable full_content with API defaults.
      --full-content-max-chars-per-result <n>
                                      Enable full_content and cap full content per result.
      --full-content-settings <json|@file>
                                      Raw advanced_settings.full_content object.
      --no-full-content                Explicitly disable full_content.
      --advanced-settings <json|@file> Raw advanced_settings object.

Output options:
      --format <json|text|urls>        Output format. Default: json.
      --json                           Alias for --format json.
      --compact                        Minify JSON output.
      --timeout <ms>                   Request timeout. Default: 60000.
      --api-key <key>                  Defaults to PARALLEL_API_KEY.
      --base-url <url>                 Defaults to PARALLEL_BASE_URL or https://api.parallel.ai/v1.
  -h, --help                           Show help.
  -V, --version                        Show version.

Examples:
  parallel-search extract https://www.un.org/en/about-us/history-of-the-un --objective "When was the United Nations established?"
  parallel-search extract --url https://example.com/article --objective "React rendering performance tips" -q "React memo" -q "useMemo useCallback"
  parallel-search extract --url https://example.com/report.pdf --full-content-max-chars-per-result 50000
`;
}

function buildCommand(state: ParseState, env: Environment): CliCommand {
  if (state.endpoint === "search" && state.positional.length > 0) {
    if (state.generated.objective !== undefined) {
      throw new CliError("Use either positional objective text or --objective, not both");
    }

    state.generated.objective = state.positional.join(" ");
  }

  if (state.searchQueries.length > 0) {
    state.generated.search_queries = uniqueStrings(state.searchQueries);
  }

  if (state.urls.length > 0) {
    state.generated.urls = uniqueStrings(state.urls);
  }

  if (state.includeDomains.length > 0) {
    state.advancedSettings.source_policy = mergeObjects(
      getRecord(state.advancedSettings.source_policy),
      { include_domains: uniqueStrings(state.includeDomains) },
    );
  }

  if (state.excludeDomains.length > 0) {
    state.advancedSettings.source_policy = mergeObjects(
      getRecord(state.advancedSettings.source_policy),
      { exclude_domains: uniqueStrings(state.excludeDomains) },
    );
  }

  if (Object.keys(state.advancedSettings).length > 0) {
    state.generated.advanced_settings = state.advancedSettings;
  }

  const request = mergeObjects(state.bodyBase ?? {}, state.generated);
  validateRequest(state.endpoint, request);

  const apiKey = state.apiKey ?? env.PARALLEL_API_KEY;
  if (apiKey === undefined || apiKey.trim() === "") {
    throw new CliError("Missing API key. Set PARALLEL_API_KEY or pass --api-key.");
  }

  const baseUrl = state.baseUrl ?? env.PARALLEL_BASE_URL ?? "https://api.parallel.ai/v1";

  return {
    endpoint: state.endpoint,
    kind: "run",
    options: {
      apiKey,
      baseUrl,
      compact: state.compact,
      endpoint: state.endpoint,
      format: state.format,
      request,
      timeoutMs: state.timeoutMs,
    },
  };
}

function validateRequest(endpoint: ApiEndpoint, request: Record<string, unknown>): void {
  validateCommonRequest(request);

  if (endpoint === "search") {
    validateSearchRequest(request);
  } else {
    validateExtractRequest(request);
  }
}

function validateCommonRequest(request: Record<string, unknown>): void {
  if (request.objective !== undefined) {
    assertStringValue(request.objective, "objective", { maxLength: 5000 });
  }

  if (request.search_queries !== undefined) {
    validateSearchQueries(request.search_queries, false);
  }

  if (request.max_chars_total !== undefined) {
    assertIntegerValue(request.max_chars_total, "max_chars_total", { min: 1 });
  }

  if (request.client_model !== undefined) {
    assertStringValue(request.client_model, "client_model");
  }

  if (request.session_id !== undefined) {
    assertStringValue(request.session_id, "session_id", { maxLength: 1000 });
  }

  if (request.advanced_settings !== undefined) {
    if (!isRecord(request.advanced_settings)) {
      throw new CliError("advanced_settings must be an object");
    }

    validateFetchPolicy(request.advanced_settings.fetch_policy);
    validateExcerptSettings(request.advanced_settings.excerpt_settings);
  }
}

function validateSearchRequest(request: Record<string, unknown>): void {
  validateSearchQueries(request.search_queries, true);

  if (request.mode !== undefined) {
    assertAllowedValue(request.mode, "mode", SEARCH_MODES);
  }

  if (request.advanced_settings === undefined) {
    return;
  }

  if (!isRecord(request.advanced_settings)) {
    throw new CliError("advanced_settings must be an object");
  }

  const settings = request.advanced_settings;
  if (settings.source_policy !== undefined) {
    if (!isRecord(settings.source_policy)) {
      throw new CliError("advanced_settings.source_policy must be an object");
    }

    validateStringArray(
      settings.source_policy.include_domains,
      "advanced_settings.source_policy.include_domains",
    );
    validateStringArray(
      settings.source_policy.exclude_domains,
      "advanced_settings.source_policy.exclude_domains",
    );
    if (settings.source_policy.after_date !== undefined) {
      assertStringValue(
        settings.source_policy.after_date,
        "advanced_settings.source_policy.after_date",
      );
    }
  }

  if (settings.location !== undefined) {
    assertStringValue(settings.location, "advanced_settings.location");
  }

  if (settings.max_results !== undefined) {
    assertIntegerValue(settings.max_results, "advanced_settings.max_results", { min: 1 });
  }
}

function validateExtractRequest(request: Record<string, unknown>): void {
  validateUrls(request.urls);

  if (request.advanced_settings === undefined) {
    return;
  }

  if (!isRecord(request.advanced_settings)) {
    throw new CliError("advanced_settings must be an object");
  }

  const fullContent = request.advanced_settings.full_content;
  if (fullContent === undefined || typeof fullContent === "boolean") {
    return;
  }

  if (!isRecord(fullContent)) {
    throw new CliError("advanced_settings.full_content must be a boolean or object");
  }

  if (fullContent.max_chars_per_result !== undefined) {
    assertIntegerValue(
      fullContent.max_chars_per_result,
      "advanced_settings.full_content.max_chars_per_result",
      { min: 1 },
    );
  }
}

function validateSearchQueries(value: unknown, required: boolean): void {
  if (value === undefined) {
    if (required) {
      throw new CliError(
        "search_queries is required. Pass one or more -q/--query flags or --body with search_queries.",
      );
    }

    return;
  }

  if (!Array.isArray(value)) {
    throw new CliError("search_queries must be an array of non-empty strings");
  }

  if (required && value.length === 0) {
    throw new CliError("search_queries must contain at least one query");
  }

  if (value.length > 5) {
    throw new CliError("search_queries must contain at most 5 queries");
  }

  for (const query of value) {
    assertStringValue(query, "search_queries entries", { maxLength: 200 });
  }
}

function validateUrls(value: unknown): void {
  if (!Array.isArray(value) || value.length === 0) {
    throw new CliError("urls is required. Pass positional URLs, --url, or --body with urls.");
  }

  if (value.length > 20) {
    throw new CliError("urls must contain at most 20 URLs");
  }

  for (const url of value) {
    assertStringValue(url, "urls entries");
    assertHttpUrl(url, "urls entries");
  }
}

function validateFetchPolicy(value: unknown): void {
  if (value === undefined) {
    return;
  }

  if (!isRecord(value)) {
    throw new CliError("advanced_settings.fetch_policy must be an object");
  }

  if (value.max_age_seconds !== undefined) {
    assertIntegerValue(value.max_age_seconds, "advanced_settings.fetch_policy.max_age_seconds", {
      min: 600,
    });
  }

  if (value.timeout_seconds !== undefined) {
    assertNumberValue(value.timeout_seconds, "advanced_settings.fetch_policy.timeout_seconds", {
      minExclusive: 0,
    });
  }

  if (
    value.disable_cache_fallback !== undefined &&
    typeof value.disable_cache_fallback !== "boolean"
  ) {
    throw new CliError("advanced_settings.fetch_policy.disable_cache_fallback must be a boolean");
  }
}

function validateExcerptSettings(value: unknown): void {
  if (value === undefined) {
    return;
  }

  if (!isRecord(value)) {
    throw new CliError("advanced_settings.excerpt_settings must be an object");
  }

  if (value.max_chars_per_result !== undefined) {
    assertIntegerValue(
      value.max_chars_per_result,
      "advanced_settings.excerpt_settings.max_chars_per_result",
      { min: 1 },
    );
  }
}

async function postApi(options: CliRunOptions): Promise<Response> {
  const response = await fetch(apiUrl(options.baseUrl, options.endpoint), {
    body: JSON.stringify(options.request),
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "x-api-key": options.apiKey,
    },
    method: "POST",
    signal: AbortSignal.timeout(options.timeoutMs),
  });

  if (!response.ok) {
    throw await buildHttpError(response);
  }

  return response;
}

async function buildHttpError(response: Response): Promise<CliError> {
  const text = await response.text();
  let detail = text.trim();

  if (detail !== "") {
    try {
      const parsed = JSON.parse(detail) as unknown;
      if (isRecord(parsed)) {
        if (typeof parsed.error === "string") {
          detail = parsed.error;
        } else if (Array.isArray(parsed.errors)) {
          detail = parsed.errors.map((entry) => formatContentValue(entry)).join("\n");
        }
      }
    } catch {
      // Keep the plain text body.
    }
  }

  const message =
    detail === ""
      ? `${response.status} ${response.statusText}`
      : `${response.status} ${response.statusText}: ${detail}`;
  return new CliError(message);
}

function formatTextResponse(response: unknown): string {
  const lines: string[] = [];
  const results = extractResults(response);

  results.forEach((result, index) => {
    const title = stringField(result, "title") ?? "Untitled";
    const url = stringField(result, "url") ?? "";
    lines.push(`${index + 1}. ${title}`);
    if (url !== "") {
      lines.push(`   ${url}`);
    }

    const publishDate = stringField(result, "publish_date");
    if (publishDate !== undefined) {
      lines.push(`   ${publishDate}`);
    }

    if (Array.isArray(result.excerpts) && result.excerpts.length > 0) {
      lines.push("   Excerpts:");
      for (const excerpt of result.excerpts) {
        if (typeof excerpt === "string") {
          lines.push(indentBlock(excerpt, "   - ", "     "));
        }
      }
    }

    const fullContent = stringField(result, "full_content");
    if (fullContent !== undefined) {
      lines.push(indentBlock(fullContent, "   Full content: ", "                 "));
    }

    lines.push("");
  });

  if (isRecord(response)) {
    appendResponseMetadata(response, lines);
  }

  return trimTrailingBlankLines(lines).join("\n");
}

function appendResponseMetadata(response: Record<string, unknown>, lines: string[]): void {
  const ids = ["search_id", "extract_id", "session_id"];
  for (const id of ids) {
    const value = stringField(response, id);
    if (value !== undefined) {
      lines.push(`${id}: ${value}`);
    }
  }

  if (response.warnings !== undefined && response.warnings !== null) {
    lines.push(`warnings: ${formatContentValue(response.warnings)}`);
  }

  if (Array.isArray(response.errors) && response.errors.length > 0) {
    lines.push(`errors: ${formatContentValue(response.errors)}`);
  }

  if (Array.isArray(response.usage) && response.usage.length > 0) {
    lines.push(`usage: ${formatContentValue(response.usage)}`);
  }
}

function extractResults(response: unknown): Record<string, unknown>[] {
  if (!isRecord(response) || !Array.isArray(response.results)) {
    return [];
  }

  return response.results.filter(isRecord);
}

function formatContentValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  return JSON.stringify(value, null, 2) ?? "undefined";
}

function indentBlock(value: string, firstPrefix: string, nextPrefix: string): string {
  return value
    .split(/\r?\n/)
    .map((line, index) => `${index === 0 ? firstPrefix : nextPrefix}${line}`)
    .join("\n");
}

function trimTrailingBlankLines(lines: string[]): string[] {
  let end = lines.length;
  while (end > 0 && lines[end - 1] === "") {
    end -= 1;
  }

  return lines.slice(0, end);
}

function splitFlag(value: string): { name: string; inlineValue?: string } {
  if (!value.startsWith("--")) {
    return { name: value };
  }

  const equalsIndex = value.indexOf("=");
  if (equalsIndex === -1) {
    return { name: value };
  }

  return {
    inlineValue: value.slice(equalsIndex + 1),
    name: value.slice(0, equalsIndex),
  };
}

function ensureEndpoint(actual: ApiEndpoint, expected: ApiEndpoint, flag: string): void {
  if (actual !== expected) {
    throw new CliError(`${flag} is only available for the ${expected} command`);
  }
}

function parseJsonObject(value: string, flag: string): Record<string, unknown> {
  const parsed = parseJsonOrFile(value, flag);
  if (!isRecord(parsed)) {
    throw new CliError(`${flag} must be a JSON object`);
  }

  return parsed;
}

function parseJsonOrFile(value: string, flag: string): unknown {
  const source = value.startsWith("@") ? readJsonFile(value.slice(1), flag) : value;

  try {
    return JSON.parse(source) as unknown;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new CliError(`${flag} contains invalid JSON: ${reason}`);
  }
}

function readJsonFile(path: string, flag: string): string {
  try {
    return readFileSync(path === "-" ? 0 : path, "utf8");
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new CliError(`Could not read ${flag} file ${path}: ${reason}`);
  }
}

function parseInteger(value: string, flag: string, bounds: { min?: number; max?: number }): number {
  if (!/^-?\d+$/.test(value)) {
    throw new CliError(`${flag} must be an integer`);
  }

  const parsed = Number(value);
  assertIntegerValue(parsed, flag, bounds);
  return parsed;
}

function parseNumber(
  value: string,
  flag: string,
  bounds: { min?: number; minExclusive?: number; max?: number },
): number {
  if (value.trim() === "" || !Number.isFinite(Number(value))) {
    throw new CliError(`${flag} must be a number`);
  }

  const parsed = Number(value);
  assertNumberValue(parsed, flag, bounds);
  return parsed;
}

function assertIntegerValue(
  value: unknown,
  field: string,
  bounds: { min?: number; max?: number },
): void {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new CliError(`${field} must be an integer`);
  }

  assertNumberValue(value, field, bounds);
}

function assertNumberValue(
  value: unknown,
  field: string,
  bounds: { min?: number; minExclusive?: number; max?: number },
): void {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new CliError(`${field} must be a number`);
  }

  if (bounds.min !== undefined && value < bounds.min) {
    throw new CliError(`${field} must be >= ${bounds.min}`);
  }

  if (bounds.minExclusive !== undefined && value <= bounds.minExclusive) {
    throw new CliError(`${field} must be > ${bounds.minExclusive}`);
  }

  if (bounds.max !== undefined && value > bounds.max) {
    throw new CliError(`${field} must be <= ${bounds.max}`);
  }
}

function parseAllowed(value: string, flag: string, allowed: readonly string[]): string {
  if (!allowed.includes(value)) {
    throw new CliError(`${flag} must be one of: ${allowed.join(", ")}`);
  }

  return value;
}

function assertAllowedValue(value: unknown, field: string, allowed: readonly string[]): void {
  if (typeof value !== "string" || !allowed.includes(value)) {
    throw new CliError(`${field} must be one of: ${allowed.join(", ")}`);
  }
}

function assertStringValue(
  value: unknown,
  field: string,
  options: { maxLength?: number } = {},
): asserts value is string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new CliError(`${field} must be a non-empty string`);
  }

  if (options.maxLength !== undefined && value.length > options.maxLength) {
    throw new CliError(`${field} must be at most ${options.maxLength} characters`);
  }
}

function assertHttpUrl(value: string, field: string): void {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new CliError(`${field} must be an http or https URL`);
    }
  } catch (error) {
    if (error instanceof CliError) {
      throw error;
    }

    throw new CliError(`${field} must be a valid URL`);
  }
}

function parseList(value: string): string[] {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "");
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function validateStringArray(value: unknown, field: string): void {
  if (value === undefined) {
    return;
  }

  if (
    !Array.isArray(value) ||
    value.some((entry) => typeof entry !== "string" || entry.trim() === "")
  ) {
    throw new CliError(`${field} must be an array of non-empty strings`);
  }
}

function mergeObjects(
  base: Record<string, unknown>,
  override: Record<string, unknown>,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...base };

  for (const [key, value] of Object.entries(override)) {
    const baseValue = merged[key];
    if (isRecord(baseValue) && isRecord(value)) {
      merged[key] = mergeObjects(baseValue, value);
    } else {
      merged[key] = value;
    }
  }

  return merged;
}

function getRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringField(record: Record<string, unknown>, field: string): string | undefined {
  const value = record[field];
  return typeof value === "string" && value !== "" ? value : undefined;
}

function apiUrl(baseUrl: string, endpoint: ApiEndpoint): string {
  const trimmed = baseUrl.trim();
  const withoutTrailingSlash = trimmed.replace(/\/+$/, "");
  if (withoutTrailingSlash.endsWith(`/${endpoint}`)) {
    return withoutTrailingSlash;
  }

  return new URL(endpoint, trimmed.endsWith("/") ? trimmed : `${trimmed}/`).toString();
}
