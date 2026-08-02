# Changelog

All notable changes to this project will be documented in this file.

The first release will be `0.0.1`. Current changes are tracked under `Unreleased`.

## Unreleased

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
