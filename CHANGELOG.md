# Changelog

All notable changes are listed here. Versions follow [SemVer](https://semver.org/).

## Unreleased

### Fixed
- Viewer: HTML artifacts shared through secret links no longer return 403 in the iframe.
- `/api` page: no longer claims that `/a/:id` returns JSON.

### Added
- Footer "source" link, configured with `BRAND.sourceUrl`. Set it to `""` to hide it.
- `docs/API.md`: full HTTP and MCP reference.

## 1.0.0 (2026-11-20)

First public release.

- Uploads by CLI, `curl` or MCP, with one bearer token per machine.
- Public, secret (`?s=`), password-protected and private links, with per-file expiry.
- Browser viewer for images, video, PDF, sandboxed HTML and Markdown.
- Limits set by Worker variables: file size, storage and file count per owner, total storage, retention, and upload rates per tier.
- Optional Cloudflare Access (dashboard, accounts, device linking), Turnstile (verified tier) and `ENROLL_TOKEN` (private instance).
- White-label settings in `apps/api/src/brand.ts`.
- Deploy to Cloudflare button. D1 and R2 are created automatically, and migrations run on every deploy.
