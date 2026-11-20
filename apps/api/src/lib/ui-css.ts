/** Shared CSS for Worker-rendered HTML pages. Colors and fonts come from src/brand.ts. */
import { BRAND } from "../brand";

export function sharedStyles(): string {
  const c = BRAND.colors;
  return `
${BRAND.fontsUrl ? `@import url('${BRAND.fontsUrl}');` : ""}

:root {
  --bg: ${c.bg};
  --surface: ${c.surface};
  --surface-2: ${c.surface2};
  --border: ${c.border};
  --border-soft: ${c.borderSoft};
  --text: ${c.text};
  --text-muted: ${c.textMuted};
  --text-faint: ${c.textFaint};
  --accent: ${c.accent};
  --accent-hover: ${c.accentHover};
  --accent-dim: ${c.accentDim};
  --accent-on: ${c.accentOn};
  --link: ${c.link};
  --success: ${c.success};
  --warning: ${c.warning};
  --danger: ${c.danger};
  --radius: 6px;
  --display: ${BRAND.fonts.display};
  --font: ${BRAND.fonts.body};
  --mono: ${BRAND.fonts.mono};
  --container: 1040px;
  --gutter: 1.5rem;
}

*, *::before, *::after { box-sizing: border-box; }

html { color-scheme: dark; overflow-x: hidden; }

body {
  margin: 0;
  min-height: 100dvh;
  max-width: 100%;
  overflow-x: hidden;
  font-family: var(--font);
  font-size: 15px;
  line-height: 1.65;
  color: var(--text);
  background: var(--bg);
  -webkit-font-smoothing: antialiased;
}

body::before {
  content: '';
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 0;
  opacity: 0.045;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
}

.shell { min-height: 100dvh; display: flex; flex-direction: column; position: relative; z-index: 1; min-width: 0; max-width: 100%; }

/* Links: color on every anchor; the underline effect only on content links. */
a { color: var(--link); text-decoration: none; transition: color 0.15s, border-color 0.15s; }
a:hover { color: var(--text); }
main a:not(.btn) { border-bottom: 1px solid transparent; }
main a:not(.btn):hover { border-bottom-color: var(--accent); }

code { font-family: var(--mono); font-size: 0.88em; overflow-wrap: anywhere; word-break: break-word; }

/* Focus: one visible ring everywhere; inset variants where an ancestor clips. */
a:focus-visible, button:focus-visible, input:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.viewer-stage a:focus-visible, .viewer-stage button:focus-visible { outline-offset: -2px; }
.md-code:focus-visible, .terminal:focus-visible, .prompt-text:focus-visible, .turnstile-wrap:focus-visible {
  outline: none;
  box-shadow: inset 0 0 0 2px var(--accent);
}

.topbar {
  border-bottom: 1px solid var(--border-soft);
  background: var(--bg);
  background: color-mix(in srgb, var(--bg) 92%, transparent);
}
.topbar-inner {
  max-width: var(--container);
  margin: 0 auto;
  padding: 0.6rem var(--gutter);
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 1.5rem;
}
.brand {
  grid-area: brand;
  display: flex; align-items: center; gap: 0.6rem;
  font-family: var(--display);
  font-weight: 500; font-size: 1.15rem;
  font-style: italic;
  color: var(--text);
}
.brand:hover { color: var(--accent); }
.brand-mark {
  width: 0.55rem; height: 0.55rem;
  border-radius: 50%;
  background: var(--accent);
  flex-shrink: 0;
}
.nav { grid-area: nav; display: flex; gap: 1.5rem; margin-left: auto; }
.nav a {
  position: relative;
  padding: 0.6rem 0;
  font-size: 0.8125rem; color: var(--text-muted);
}
.nav a::after {
  content: '';
  position: absolute;
  left: 0; right: 0;
  bottom: calc(0.6rem - 4px);
  height: 1px;
  background: transparent;
  transition: background 0.15s;
}
.nav a:hover { color: var(--text); }
.nav a:hover::after { background: var(--border); }
.nav a[aria-current="page"] { color: var(--text); }
.nav a[aria-current="page"]::after { background: var(--accent); }
.btn.topbar-logout { grid-area: logout; padding: 0.35rem 0.7rem; font-size: 0.8125rem; }

main { flex: 1; min-width: 0; }
.container {
  max-width: var(--container);
  width: 100%;
  margin: 0 auto;
  padding: 3rem var(--gutter) 4rem;
  min-width: 0;
}
.container-narrow { max-width: 440px; }

h1 {
  margin: 0 0 0.75rem;
  font-family: var(--display);
  font-size: clamp(2rem, 5vw, 2.75rem);
  font-weight: 500;
  font-style: normal;
  line-height: 1.12;
  letter-spacing: -0.02em;
  overflow-wrap: anywhere;
}
.lead {
  margin: 0;
  color: var(--text-muted);
  font-size: 1.0625rem;
  line-height: 1.65;
  max-width: 46ch;
}
.lead-spaced { margin-bottom: 1.15rem; }
.section-title {
  margin: 2.75rem 0 1rem;
  font-family: var(--mono);
  font-size: 0.6875rem; font-weight: 500;
  text-transform: lowercase;
  color: var(--text-faint);
}
.section-title::before { content: '— '; color: var(--accent); }

.meta-note { margin: 1.25rem 0 0; color: var(--text-muted); font-size: 0.875rem; overflow-wrap: anywhere; }
.stack-top { margin-top: 1.5rem; }
.error-code { margin: 0 0 0.75rem; font-family: var(--mono); font-size: 0.8125rem; color: var(--text-faint); }

.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 1.25rem 1.35rem;
  min-width: 0;
}

.grid { display: grid; gap: 1rem; min-width: 0; align-items: start; }
.grid > * { min-width: 0; }
.grid-2 { grid-template-columns: repeat(auto-fill, minmax(min(100%, 260px), 1fr)); }

.badge {
  display: inline-block;
  padding: 0.15rem 0.45rem;
  border-radius: 3px;
  font-family: var(--mono);
  font-size: 0.625rem; font-weight: 500;
  line-height: 1.6;
  border: 1px solid var(--border);
  background: var(--surface-2);
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  white-space: nowrap;
}
.badge-public { color: var(--success); border-color: color-mix(in srgb, var(--success) 35%, var(--border)); }
.badge-private { color: var(--warning); border-color: color-mix(in srgb, var(--warning) 35%, var(--border)); }
.badge-row { display: flex; flex-wrap: wrap; gap: 0.4rem; margin-top: 0.5rem; }

.btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 0.4rem;
  padding: 0.55rem 1.1rem;
  border-radius: var(--radius);
  font-family: var(--font); font-size: 0.875rem; font-weight: 500;
  line-height: 1.4;
  border: 1px solid transparent;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.15s, border-color 0.15s, color 0.15s, opacity 0.15s;
}
.btn:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-primary {
  color: var(--accent-on);
  background: var(--accent);
  border-color: var(--accent);
}
.btn-primary:hover {
  background: var(--accent-hover);
  border-color: var(--accent-hover);
  color: var(--accent-on);
}
.btn-ghost {
  color: var(--text-muted);
  background: transparent;
  border-color: var(--border);
}
.btn-ghost:hover {
  border-color: var(--text-faint);
  color: var(--text);
}
.btn-danger {
  color: var(--danger);
  background: transparent;
  border-color: color-mix(in srgb, var(--danger) 40%, var(--border));
}
.btn-danger:hover {
  background: color-mix(in srgb, var(--danger) 12%, transparent);
  border-color: var(--danger);
  color: var(--danger);
}
.btn-block { width: 100%; }

.artifact-card {
  display: flex; flex-direction: column; gap: 0.7rem;
  min-width: 0;
  padding: 0.9rem;
  border-radius: var(--radius);
  background: var(--surface);
  border: 1px solid var(--border);
  border-top: 2px solid var(--border-soft);
  transition: border-color 0.15s;
}
.artifact-card:hover {
  border-color: var(--border);
  border-top-color: var(--accent);
}
.artifact-thumb {
  aspect-ratio: 16/10;
  border-radius: 4px;
  background: var(--bg);
  border: 1px solid var(--border-soft);
  display: grid; place-items: center;
  overflow: hidden;
}
.artifact-thumb img {
  width: 100%; height: 100%; object-fit: cover;
}
.artifact-thumb-label {
  font-family: var(--mono);
  font-size: 0.6875rem;
  color: var(--text-faint);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.artifact-name {
  font-weight: 500; font-size: 0.9375rem;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.artifact-meta { display: flex; flex-wrap: wrap; gap: 0.35rem; align-items: center; }
.artifact-expiry {
  font-family: var(--mono);
  font-size: 0.6875rem;
  letter-spacing: 0.03em;
  color: var(--text-faint);
}
.artifact-actions {
  display: grid;
  grid-template-columns: 1fr 1fr auto;
  gap: 0.45rem;
}
.artifact-actions .btn { min-width: 0; padding: 0.45rem 0.65rem; font-size: 0.8125rem; }
.chev {
  width: 0.4rem; height: 0.4rem;
  border-right: 1.5px solid currentColor;
  border-bottom: 1.5px solid currentColor;
  transform: translateY(-2px) rotate(45deg);
  transition: transform 0.15s;
}
.btn-manage[aria-expanded="true"] { color: var(--text); border-color: var(--text-faint); }
.btn-manage[aria-expanded="true"] .chev { transform: translateY(1px) rotate(-135deg); }
.manage-panel {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding-top: 0.75rem;
  border-top: 1px solid var(--border-soft);
}
.manage-panel[hidden] { display: none; }
.manage-group { display: flex; flex-direction: column; gap: 0.4rem; }
.manage-label {
  font-family: var(--mono);
  font-size: 0.625rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-faint);
}
.manage-row { display: flex; flex-wrap: wrap; gap: 0.4rem; }
.manage-row .btn { flex: 1 1 auto; padding: 0.4rem 0.65rem; font-size: 0.8125rem; }
.manage-panel > .btn { padding: 0.45rem 0.65rem; font-size: 0.8125rem; }

.device-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.85rem;
  padding: 0.75rem 0;
  border-bottom: 1px solid var(--border-soft);
}
.device-row:last-child { border-bottom: none; }
.device-name { display: flex; flex-direction: column; min-width: 0; overflow-wrap: anywhere; }
.device-id {
  font-size: 0.75rem;
  color: var(--text-faint);
  word-break: break-all;
}
.device-name > code:only-child { font-size: 0.8125rem; color: var(--text); word-break: break-all; }

.empty {
  padding: 2.5rem 0;
  color: var(--text-muted);
  font-size: 0.9375rem;
}
.empty p { margin: 0; max-width: 36ch; }
.empty code { color: var(--text); }

.hero-split {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 3rem 4rem;
  align-items: start;
  margin-bottom: 3.5rem;
}
.hero-split > * { min-width: 0; }
.hero-copy { padding-top: 0.5rem; }
.hero-actions { display: flex; gap: 0.75rem; flex-wrap: wrap; margin-top: 1.75rem; }
.hero-aside { position: relative; }

.terminal {
  padding: 1.35rem 1.4rem;
  background: var(--surface);
  border: 1px solid var(--border);
  border-left: 3px solid var(--accent);
  border-radius: var(--radius);
  font-family: var(--mono);
  font-size: 0.75rem;
  line-height: 1.75;
  color: var(--text-muted);
  overflow-x: auto;
}
.terminal-label {
  font-family: var(--mono);
  font-size: 0.625rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-faint);
  margin-bottom: 0.85rem;
}
.terminal .prompt { color: var(--accent); user-select: none; }
.terminal .cmd { color: var(--text); }
.terminal pre.code { overflow-x: visible; width: max-content; min-width: 100%; }

.spec-list {
  margin: 0; padding: 0;
  list-style: none;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
}
.spec-list li {
  padding: 1.1rem 1.25rem;
  border-bottom: 1px solid var(--border-soft);
  border-right: 1px solid var(--border-soft);
  font-size: 0.875rem;
}
.spec-list li:nth-child(2n) { border-right: none; }
.spec-list li:nth-last-child(-n+2) { border-bottom: none; }
.spec-term {
  display: block;
  font-family: var(--mono);
  font-size: 0.6875rem;
  color: var(--accent);
  margin-bottom: 0.35rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.spec-desc { margin: 0; color: var(--text-muted); line-height: 1.55; }
.spec-desc code { color: var(--text); }

.page-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  margin: 0;
  color: var(--text-muted);
  font-size: 1.0625rem;
}
.page-meta-email { min-width: 0; overflow-wrap: anywhere; }

.stat-row {
  display: flex; gap: 2.5rem;
  align-items: flex-end;
  flex-wrap: wrap;
  margin-bottom: 0.25rem;
  padding-bottom: 1.5rem;
  border-bottom: 1px solid var(--border-soft);
}
.stat-value {
  font-family: var(--display);
  font-size: 2rem; font-weight: 500;
  font-variant-numeric: tabular-nums;
  color: var(--text);
  line-height: 1;
}
.stat-label {
  font-family: var(--mono);
  font-size: 0.6875rem; color: var(--text-faint);
  margin-top: 0.35rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.viewer-stage {
  border-radius: var(--radius);
  overflow: hidden;
  border: 1px solid var(--border);
  background: #050505;
  box-shadow: 0 1px 0 var(--border-soft) inset;
}
.viewer-stage-doc { background: var(--surface); }
.viewer-stage img, .viewer-stage video {
  display: block; width: 100%; max-height: 78dvh; object-fit: contain;
  margin: 0 auto;
}
.viewer-stage iframe {
  display: block; width: 100%; height: 78dvh; border: 0;
}
.viewer-stage .stage-text { background: #fff; }
.stage-empty {
  min-height: 220px;
  display: grid;
  place-items: center;
  padding: 2rem 1.25rem;
  background: var(--surface);
  color: var(--text-muted);
  text-align: center;
}
.stage-empty audio { width: min(100%, 420px); }
.stage-file { max-width: 28rem; min-width: 0; }
.stage-filename {
  display: block;
  margin: 0.75rem 0 1rem;
  font-size: 0.9375rem;
  overflow-wrap: anywhere;
}
.md-body {
  padding: 1.5rem 1.75rem;
  font-size: 1.02rem;
  line-height: 1.65;
  color: var(--text);
  max-width: 46rem;
  margin: 0 auto;
  overflow-wrap: anywhere;
}
.md-body h1, .md-body h2, .md-body h3 { font-family: var(--display); margin: 1.25rem 0 0.5rem; color: var(--text); }
.md-body > :first-child { margin-top: 0; }
.md-body p { margin: 0.65rem 0; }
.md-body ul, .md-body ol { margin: 0.5rem 0 0.5rem 1.25rem; padding-left: 0.5rem; }
.md-body img {
  max-width: 100%;
  height: auto;
  border-radius: 4px;
  margin: 0.75rem 0;
  background: #0a0a0a;
}
.md-body a { color: var(--accent); }
.md-body code {
  background: var(--surface-2);
  padding: 0.1em 0.35em;
  border-radius: 3px;
}
.md-code {
  background: var(--surface-2);
  border: 1px solid var(--border-soft);
  border-radius: 4px;
  padding: 0.85rem 1rem;
  overflow-x: auto;
  overflow-wrap: normal;
  font-family: var(--mono);
  font-size: 0.85rem;
}
.md-body .md-code code { background: none; padding: 0; overflow-wrap: normal; word-break: normal; }

.password-gate {
  max-width: 22rem;
  margin: 3rem auto;
  padding: 1.75rem;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
}
.password-gate h1 { font-size: 1.25rem; margin: 0 0 0.5rem; }
.password-gate p { color: var(--text-muted); font-size: 0.9rem; margin: 0 0 1.25rem; }
.password-gate input[type="password"] {
  width: 100%;
  padding: 0.65rem 0.75rem;
  margin-bottom: 0.85rem;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--bg);
  color: var(--text);
  font-family: var(--font);
  font-size: 16px;
  transition: border-color 0.15s;
}
.password-gate input[type="password"]:focus-visible { outline: none; border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
.password-gate .error { color: var(--danger); font-size: 0.8125rem; margin: 0 0 0.75rem; }
.sr-only {
  position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
  overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0;
}
.viewer-toolbar {
  display: flex; flex-wrap: wrap; gap: 1rem; align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 1.25rem;
  padding-bottom: 1.25rem;
  border-bottom: 1px solid var(--border-soft);
}
.viewer-title { flex: 1 1 20rem; min-width: 0; }
.viewer-toolbar h1 {
  margin: 0;
  font-size: clamp(1.25rem, 3vw, 1.5rem);
}
.viewer-actions { display: flex; flex-wrap: wrap; gap: 0.45rem; }

.code-display {
  margin-top: 1.5rem;
  font-family: var(--mono);
  font-size: 1.5rem; font-weight: 500; letter-spacing: 0.1em;
  text-align: center; padding: 1.25rem;
  background: var(--surface);
  border-radius: var(--radius);
  border: 1px solid var(--border);
  color: var(--text);
  overflow-wrap: anywhere;
}

.notice {
  padding: 1rem 1.15rem;
  border-left: 3px solid var(--success);
  background: color-mix(in srgb, var(--success) 8%, var(--surface));
  border-radius: 0 var(--radius) var(--radius) 0;
  font-size: 0.9375rem;
  color: var(--text-muted);
  line-height: 1.55;
}
.notice strong { color: var(--success); font-weight: 500; }
.notice-danger {
  border-left-color: var(--danger);
  background: color-mix(in srgb, var(--danger) 8%, var(--surface));
}
.notice-danger strong { color: var(--danger); }
.card .notice { margin-top: 1rem; }
.turnstile-wrap { max-width: 100%; overflow-x: auto; }
.turnstile-wrap[hidden] { display: none; }

.footer {
  border-top: 1px solid var(--border-soft);
  color: var(--text-faint);
  font-family: var(--mono);
  font-size: 0.6875rem;
  letter-spacing: 0.04em;
}
.footer-inner {
  max-width: var(--container);
  margin: 0 auto;
  padding: 1.5rem var(--gutter);
}
.footer-link { color: inherit; text-decoration: underline; text-underline-offset: 2px; }
.footer-link:hover { color: var(--accent); }

.toast {
  position: fixed; bottom: 1.5rem; left: 50%;
  transform: translateX(-50%) translateY(8px);
  padding: 0.5rem 1rem;
  border-radius: var(--radius);
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--text);
  font-family: var(--mono);
  font-size: 0.6875rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  opacity: 0; pointer-events: none;
  transition: opacity 0.15s, transform 0.15s;
  z-index: 10;
}
.toast.show { transform: translateX(-50%) translateY(0); opacity: 1; }

.endpoint {
  padding: 1rem 0;
  border-bottom: 1px solid var(--border-soft);
}
.endpoint:last-child { border-bottom: none; }
.endpoint-method {
  display: inline-block; min-width: 3rem;
  font-family: var(--mono); font-size: 0.6875rem; font-weight: 500;
  color: var(--accent);
  text-transform: uppercase;
}
.endpoint-path {
  font-family: var(--mono); font-size: 0.875rem; color: var(--text);
  overflow-wrap: anywhere;
}
.endpoint-desc {
  margin: 0.4rem 0 0;
  font-size: 0.875rem; color: var(--text-muted);
  max-width: 58ch;
}
.endpoint-desc code { color: var(--text); }
pre.code {
  margin: 0; padding: 0;
  font-family: var(--mono); font-size: 0.75rem;
  line-height: 1.75; color: var(--text-muted);
  overflow-x: auto;
}
pre.code code { font-family: inherit; }

.setup-section { margin-top: 3rem; }
.prompt-panel {
  position: relative;
  padding: 1.15rem 1.25rem 1.25rem;
  background: var(--surface);
  border: 1px solid var(--border);
  border-left: 3px solid var(--accent);
  border-radius: var(--radius);
}
.prompt-copy { margin-bottom: 1rem; }
.prompt-source {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
  opacity: 0;
  pointer-events: none;
}
.prompt-text {
  margin: 0;
  font-family: var(--mono);
  font-size: 0.72rem;
  line-height: 1.7;
  color: var(--text-muted);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  word-break: break-word;
  max-height: min(320px, 50dvh);
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}
.meta-links {
  font-size: 0.8125rem;
  color: var(--text-muted);
  margin-top: 0.85rem;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.page-head { margin-bottom: 2rem; }

/* Tablet and below: single-column hero and spec list. */
@media (max-width: 900px) {
  .container { padding-top: 2rem; }
  .hero-split { grid-template-columns: minmax(0, 1fr); gap: 2rem; margin-bottom: 2.5rem; }
  .spec-list { grid-template-columns: minmax(0, 1fr); }
  .spec-list li { border-right: none; }
  .spec-list li:nth-last-child(-n+2) { border-bottom: 1px solid var(--border-soft); }
  .spec-list li:last-child { border-bottom: none; }
}

/* Phone. */
@media (max-width: 640px) {
  :root { --gutter: 1rem; }
  .topbar-inner {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-areas: "brand logout" "nav nav";
    gap: 0 1rem;
    padding-top: 0.85rem;
    padding-bottom: 0;
  }
  .topbar-inner--nolog { grid-template-columns: minmax(0, 1fr); grid-template-areas: "brand" "nav"; }
  .nav { margin-left: 0; gap: 1.5rem; }
  .nav a { padding: 0.75rem 0; }
  .nav a::after { bottom: calc(0.75rem - 4px); }
  .container { padding: 1.5rem var(--gutter) 2.75rem; padding-bottom: max(2.75rem, env(safe-area-inset-bottom)); }
  .hero-split { gap: 1.5rem; margin-bottom: 2rem; }
  .hero-actions { flex-direction: column; align-items: stretch; gap: 0.5rem; margin-top: 1.25rem; }
  .hero-actions .btn { width: 100%; }
  h1 { font-size: clamp(1.625rem, 7.5vw, 2.25rem); }
  .lead, .page-meta { font-size: 1rem; }
  .lead { max-width: none; }
  .grid-2 { grid-template-columns: minmax(0, 1fr); }
  .card { padding: 1rem; }
  .stat-row { gap: 1.5rem; }
  .stat-value { font-size: 1.65rem; }
  .viewer-toolbar { flex-direction: column; gap: 0.85rem; }
  .viewer-title { flex: none; width: 100%; }
  .viewer-actions { width: 100%; }
  .viewer-actions .btn { flex: 1 1 auto; padding: 0.5rem 0.75rem; }
  .viewer-stage iframe { height: min(78dvh, 520px); }
  .md-body { padding: 1.25rem 1rem; }
  .code-display {
    font-size: clamp(1rem, 5vw, 1.35rem);
    letter-spacing: 0.06em;
    padding: 1rem 0.75rem;
  }
  .device-row { gap: 0.6rem; }
  .endpoint-method { display: block; margin-bottom: 0.2rem; }
  .endpoint-path { display: block; font-size: 0.8125rem; }
  .terminal { padding: 1rem; font-size: 0.6875rem; }
  .prompt-panel { padding: 1rem; }
  .prompt-copy { width: 100%; }
  .password-gate { margin: 1.5rem auto; padding: 1.25rem; }
  .footer-inner { padding-bottom: max(1.5rem, env(safe-area-inset-bottom)); }
  .toast {
    bottom: max(1rem, env(safe-area-inset-bottom));
    max-width: calc(100vw - 2rem);
    text-align: center;
  }
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { transition: none !important; }
}
`;
}
