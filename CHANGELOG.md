# Changelog

All notable changes to this project will be documented in this file.

Current changes are tracked under `Unreleased`.

## Unreleased

### Security

- Require npm releases to match a locally built SHA-256 recorded in an SSH-signed release commit before trusted publishing can stage the package.

### Fixed

- Read the CLI version from the package manifest so prerelease builds report their exact version.

## [0.1.0] - 2026-08-03

### Added

- `--temp-output` for private generated response files whose absolute path is returned directly.
- Explicit `--pretty` and `--allow-partial` overrides for automatic presentation and Extract failure defaults.

### Changed

- Default Search to Basic mode and cap Search and Extract excerpts at 27,000 total characters.
- Cap `--full-content` at 50,000 characters per result while keeping full content opt-in.
- Exit on Extract per-URL errors by default, with the complete response preserved before exit.
- Use compact JSON and structured errors outside interactive terminals while retaining human-readable interactive output.

## [0.0.2] - 2026-08-03

### Added

- Dry-run request previews that validate and print the effective request without authentication or an API call.
- Machine-readable JSON Schemas for Search and Extract request bodies.
- Standard-input support for request bodies, JSON query arrays, and Search objectives.
- Atomic `--output` files with compact JSON receipts and no implicit replacement of existing files.
- Structured JSON errors, stable exit codes, and strict per-URL Extract failure handling.
- A packaged Agent Skill with bounded Search defaults, file-based result handling, citation guidance, and untrusted-content safeguards.

### Changed

- Require an explicit `search` or `extract` command and reject unknown commands, help topics, and missing option values before making requests.
- Treat singular query, URL, and domain flags as exact values; plural query and URL flags now accept JSON string arrays.

### Fixed

- Preserve nested API error messages, HTTP status codes, reference IDs, and structured details.
- Distinguish validation, authentication, API, timeout, network, partial Extract, and output failures with stable exit codes.

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
