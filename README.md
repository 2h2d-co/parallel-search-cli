# parallel-search-cli

An unofficial, zero-runtime-dependency CLI for the [Parallel Search API](https://docs.parallel.ai/search/search-quickstart) and [Parallel Extract API](https://docs.parallel.ai/extract/extract-quickstart).

This project is not affiliated with, endorsed by, or maintained by Parallel Web Systems.

## Requirements

- Node.js 22.19 or newer
- A Parallel API key

## Package

- npm package: `parallel-search-cli`
- CLI command: `parallel-search`
- no runtime dependencies and no install/postinstall scripts
- TypeScript source uses strippable syntax and npm distribution runs compiled JavaScript through a small bin shim

## Install

```bash
npm install -g parallel-search-cli
```

## Authentication

```bash
export PARALLEL_API_KEY="your-api-key"
```

You can also pass `--api-key`, or set `PARALLEL_BASE_URL` for testing against a compatible endpoint. The default base URL is `https://api.parallel.ai/v1`.

## Machine-readable requests

Use an explicit `search` or `extract` command. Singular `--query`, `--url`, `--include-domain`, and `--exclude-domain` flags accept one exact value and are repeatable. Use `--search-queries` and `--urls` for JSON string arrays.

Pass request JSON inline, from a file with `@path`, or from standard input with `@-`. Focused flags override matching body fields:

```bash
parallel-search search --body @- --dry-run <<'JSON'
{
  "mode": "basic",
  "objective": "Find current React rendering guidance from official documentation.",
  "search_queries": ["React rendering performance", "React memo optimization"]
}
JSON
```

`--dry-run` validates and prints the effective method, URL, timeout, and request without requiring an API key or making a request. It never includes the API key. Long Search objectives can also be read from standard input by using `-` as the objective.

Print the JSON Schema for either request body with:

```bash
parallel-search schema search
parallel-search schema extract
```

## Reliable output and errors

Use `-o` / `--output` to keep large payloads out of harness stdout. The CLI writes the selected output format atomically with mode `0600`, refuses to replace an existing file, and prints a compact JSON receipt containing the absolute path and byte count:

```bash
tmpdir="$(mktemp -d)"
parallel-search search \
  --mode basic \
  --objective "Find current Parallel Search API guidance" \
  -q "Parallel Search API" \
  --max-chars-total 27000 \
  --compact \
  --json-errors \
  --output "$tmpdir/search.json"
```

Use `--json-errors` or `--error-format json` for a stable error object on stderr. API errors include the HTTP status, reference ID, and structured detail when available.

| Exit code | Meaning                                        |
| --------- | ---------------------------------------------- |
| 0         | Success                                        |
| 2         | Invalid command or request input               |
| 3         | Missing or invalid authentication              |
| 4         | API error                                      |
| 5         | Network failure or timeout                     |
| 6         | Per-URL Extract errors with `--fail-on-errors` |
| 7         | Output file error                              |

Extract may return successful HTTP responses containing per-URL `errors`. Pass `--fail-on-errors` to preserve the response while exiting with code 6 when any requested URL fails.

## Agent Skill

The repository and npm package ship an Agent Skill—a declarative instruction file that teaches compatible coding agents when and how to invoke the CLI safely. Install it from GitHub with the Agent Skills CLI:

```bash
npx skills add 2h2d-co/parallel-search-cli --skill parallel-search-cli
```

The skill uses explicit Basic mode and a 27,000-character Search budget for normal agent loops, saves authoritative JSON to a unique temporary file, checks Extract partial failures, requires citations, and treats retrieved web content as untrusted data. The source is at [`skills/parallel-search-cli/SKILL.md`](skills/parallel-search-cli/SKILL.md).

## Search

Parallel Search requires at least one `search_queries` entry. For best results, provide a self-contained `--objective` plus 2-3 diverse keyword queries with `-q` / `--query`.

Keep each query concise—roughly 3-6 words—and repeat the key entity or topic while varying names, synonyms, or angles. Avoid sentences, instructions, and `site:` operators; put broader context, freshness needs, and soft source preferences in the objective.

```bash
parallel-search search \
  --objective "Find latest product announcements from Parallel Web Systems. Prefer official sources." \
  -q "Parallel Web Systems announcements" \
  -q "Parallel Web Systems products" \
  -q "Parallel Web Systems benchmarks"
```

Choose a mode based on the workload:

- `turbo`: lowest latency and cost for simple, high-volume lookups; currently supports English and Japanese queries.
- `basic`: recommended starting point for most applications and agent workloads.
- `advanced`: highest-quality retrieval for complex or multi-hop work; this is the API default when `--mode` is omitted.

```bash
parallel-search search \
  --mode turbo \
  --objective "What is the current price of NVIDIA stock?" \
  -q "NVIDIA stock price" \
  -q "NVDA quote today"
```

Advanced Search settings are exposed as focused flags. Leave them unset unless they serve a specific product requirement because restrictive settings can reduce quality or increase latency:

```bash
parallel-search search \
  --objective "React performance guidance that must come exclusively from official React documentation" \
  -q "React memo documentation" \
  -q "React useMemo guide" \
  --include-domain react.dev \
  --max-results 5 \
  --excerpt-max-chars-per-result 10000
```

Source policy flags such as `--include-domain` are hard allow-lists. Prefer steering sources in the objective unless results must come exclusively from specific domains. Use either include or exclude domains, not both. Domains must omit schemes, paths, ports, and wildcard syntax; bare extensions such as `.gov` are accepted. Include and exclude lists have a combined limit of 200 domains.

## Extract

Parallel Extract converts up to 20 public URLs—including JavaScript-heavy pages and PDFs—into clean markdown. Batch related URLs in one request when they serve the same task.

For focused excerpts, provide a self-contained, specific `--objective`. Add 2-3 diverse keyword queries of roughly 3-6 words with `-q` when the objective alone may be ambiguous. Without an objective or queries, excerpts fall back to whole-page markdown and may include boilerplate.

```bash
parallel-search extract \
  https://www.un.org/en/about-us/history-of-the-un \
  --objective "When was the United Nations established?"
```

A common workflow is to Search first, select the most relevant URLs, and then Extract deeper detail from only those pages:

```bash
parallel-search search \
  --mode basic \
  --objective "Find official React documentation about preventing unnecessary renders" \
  -q "React memo optimization" \
  -q "React rendering performance" \
  --format urls

parallel-search extract \
  https://react.dev/reference/react/memo \
  https://react.dev/reference/react/useMemo \
  --objective "Compare when React recommends memo and useMemo" \
  -q "React memo guidance" \
  -q "React useMemo guidance"
```

Full content is disabled by default. Enabling it returns both focused excerpts and full content beginning at the start of each page. Cap full content separately because top-level `--max-chars-total` affects only excerpts. Request full content only when excerpts are insufficient; without an objective or queries it is redundant with whole-page excerpts and may produce an API warning.

```bash
parallel-search extract \
  --url https://example.com/report.pdf \
  --objective "Extract methodology and headline findings" \
  --full-content-max-chars-per-result 50000
```

Leave advanced settings unset unless the task requires them. Live fetching can substantially increase latency and is subject to source-site rate limits. Cache fallback remains enabled by default; use `--disable-cache-fallback` only for fresh-or-fail tasks.

```bash
parallel-search extract \
  --url https://example.com/article \
  --objective "Find pricing changes" \
  --max-age-seconds 3600 \
  --timeout-seconds 30
```

## Shared options

```bash
--body <json|@file|@->           Base request JSON. Use @- for stdin; flags override matching fields.
--advanced-settings <json|@file> Raw advanced_settings object.
--max-chars-total <n>            Total excerpt character budget.
--client-model <model>           Model that will consume the results.
--session-id <id>                Reuse across related calls; use a new ID per task.
--format <json|text|urls>        Output format. Default: json.
--compact                        Minify JSON output.
-o, --output <path>              Atomically write output without replacing an existing file.
--error-format <text|json>       Error format on stderr. Default: text.
--json-errors                    Alias for --error-format json.
--dry-run                        Print the effective request without authentication or an API call.
--timeout <ms>                   Request timeout. Default: 60000.
```

Default output is pretty JSON. Use `--format text`, `--format urls`, or `--compact`.

Use a new `--session-id` for each logical task and reuse it across related Search and Extract calls. If you omit it, the API generates a `session_id` in the response that you can pass to subsequent calls.

Run `parallel-search --help`, `parallel-search help search`, or `parallel-search help extract` for the full option list.

## Development

```bash
mise install
npm install
npm run check
npm test
npm run pack:dry
```

Stable and prerelease `v<version>` tags trigger the shared CI release flow. CI validates, tests, builds, previews, and stages the package on npm with provenance. Stable versions use `latest`; prereleases derive their npm dist-tag from the first prerelease identifier.

The project uses `oxfmt`, `oxlint`, TypeScript 7 with `erasableSyntaxOnly`, and publishes compiled JavaScript without install/postinstall scripts.

## License

MIT
