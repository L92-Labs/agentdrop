# Security policy

## Reporting a vulnerability

Please report vulnerabilities privately through GitHub. Go to the repository's
**Security** tab and choose **Report a vulnerability**. Do not open a public issue.

Include the affected version or commit, reproduction steps, and the impact.
We aim to acknowledge reports within 3 business days.

## Supported versions

Only the latest `main` is supported. Self-hosters should redeploy to pick up fixes.

## Security model, in brief

- Device tokens (`dev_…`) are random and stored only as peppered SHA-256 hashes (`TOKEN_PEPPER`).
- Dashboard and device linking rely on Cloudflare Access. The Worker verifies
  the Access JWT's RS256 signature against `<team>/cdn-cgi/access/certs`, and
  checks the `aud`, `iss` and expiry claims. Access is disabled unless
  `CF_ACCESS_TEAM_DOMAIN` and `CF_ACCESS_AUD` are both set.
- Public artifact IDs are unguessable. Secret links add a rotatable `?s=`
  token. Password links set an HMAC-signed unlock cookie.
- HTML artifacts render in a sandboxed iframe on a separate `/render` path.
- The Worker refuses to serve requests (503) if `TOKEN_PEPPER` is not set.
