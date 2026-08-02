# Changelog

All notable changes to this project will be documented in this file.

Current changes are tracked under `Unreleased`.

## Unreleased

### Added

- Dry-run request previews that validate and print the effective request without authentication or an API call.
- Machine-readable JSON Schemas for Search and Extract request bodies.
- Standard-input support for request bodies, JSON query arrays, and Search objectives.

### Changed

- Require an explicit `search` or `extract` command and reject unknown commands, help topics, and missing option values before making requests.
- Treat singular query, URL, and domain flags as exact values; plural query and URL flags now accept JSON string arrays.

## [0.0.1] - 2026-08-02

### Added

- Initial `parallel-search` CLI for the Parallel Search and Extract APIs.
- API key support through `PARALLEL_API_KEY` and `--api-key`.
- Search request flags for objectives, search queries, Turbo, Basic, and Advanced modes, source policy, fetch policy, excerpt settings, location, and result count.
- Extract request flags for URLs, objectives, search queries, fetch policy, excerpt settings, and full content settings.
- JSON, text, and URL output formats.
- Node.js 22.19+ CLI distribution with compiled JavaScript, TypeScript source, a small npm bin shim, and no runtime dependencies or install scripts.
- mise, TypeScript, oxfmt, oxlint, and node:test project setup.

### Changed

- Align Search help and README guidance with current query, mode, advanced-setting, source-policy, and session best practices.
- Align Extract help and README guidance with current focusing, batching, full-content, fetch-policy, and session best practices.
- Validate Search source-policy domains, conflicting include/exclude lists, the combined 200-domain limit, RFC 3339 dates, location format, and the public 20-result cap before sending requests.
