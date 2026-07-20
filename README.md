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
npm install -g parallel-search-cli@alpha
```

## Authentication

```bash
export PARALLEL_API_KEY="your-api-key"
```

You can also pass `--api-key`, or set `PARALLEL_BASE_URL` for testing against a compatible endpoint. The default base URL is `https://api.parallel.ai/v1`.

## Search

Parallel Search requires at least one `search_queries` entry. For best results, provide a self-contained `--objective` plus 2-3 concise keyword queries with `-q` / `--query`.

```bash
parallel-search search \
  --objective "Find latest product announcements from Parallel Web Systems. Prefer official sources." \
  -q "Parallel Web Systems announcements" \
  -q "Parallel Web Systems products"
```

Use `--mode basic` for lower latency or omit it for the API default `advanced` mode:

```bash
parallel-search search \
  --mode basic \
  --objective "What are the latest advances in quantum error correction?" \
  -q "quantum error correction 2026" \
  -q "QEC algorithms"
```

Advanced Search settings are exposed as focused flags:

```bash
parallel-search search \
  --objective "React performance guidance from official docs" \
  -q "React memo docs" \
  -q "React useMemo guide" \
  --include-domain react.dev \
  --max-results 5 \
  --excerpt-max-chars-per-result 10000
```

Source policy flags such as `--include-domain` are hard allow-lists. Prefer steering sources in the objective unless the task must only use specific domains.

## Extract

Parallel Extract accepts up to 20 public URLs and returns clean markdown excerpts focused by `--objective` and optional `-q` queries. Without an objective or queries, the API falls back to whole-page markdown.

```bash
parallel-search extract \
  https://www.un.org/en/about-us/history-of-the-un \
  --objective "When was the United Nations established?"
```

Request focused excerpts plus full content:

```bash
parallel-search extract \
  --url https://example.com/report.pdf \
  --objective "Extract methodology and headline findings" \
  --full-content-max-chars-per-result 50000
```

Use fetch policy flags when you need fresher source content:

```bash
parallel-search extract \
  --url https://example.com/article \
  --objective "Find pricing changes" \
  --max-age-seconds 3600 \
  --timeout-seconds 30
```

## Shared options

```bash
--body <json|@file>              Base request JSON. CLI flags override matching fields.
--advanced-settings <json|@file> Raw advanced_settings object.
--max-chars-total <n>            Total excerpt character budget.
--client-model <model>           Model that will consume the results.
--session-id <id>                Group related Search and Extract calls.
--format <json|text|urls>        Output format. Default: json.
--compact                        Minify JSON output.
--timeout <ms>                   Request timeout. Default: 60000.
```

Default output is pretty JSON. Use `--format text`, `--format urls`, or `--compact`.

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
