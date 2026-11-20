/** Server-rendered UI (Worker HTML pages). Branding comes from src/brand.ts. */

import type { Limits } from "../limits";
import { BRAND } from "../brand";

import { setupPrompt } from "./skill";
import { formatExpiresIn } from "./expiry";

export { esc } from "./ui-esc";
import { esc } from "./ui-esc";

export { sharedStyles } from "./ui-css";
import { sharedStyles } from "./ui-css";

function formatMb(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return mb >= 1024 ? `${+(mb / 1024).toFixed(1)} GB` : `${+mb.toFixed(1)} MB`;
}

export function brandMark(): string {
  return `<span class="brand-mark" aria-hidden="true"></span>`;
}

export interface PageOpts {
  title: string;
  description?: string;
  body: string;
  narrow?: boolean;
  activeNav?: "home" | "dashboard" | "docs";
  logoutUrl?: string;
}

export function page(opts: PageOpts): string {
  const navCurrent = (key: PageOpts["activeNav"]) =>
    opts.activeNav === key ? ' aria-current="page"' : "";
  const logout = opts.logoutUrl
    ? `<a class="btn btn-ghost topbar-logout" href="${esc(opts.logoutUrl)}">Log out</a>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"/>
  <meta name="description" content="${esc(opts.description ?? BRAND.description)}"/>
  <title>${esc(opts.title)} · ${esc(BRAND.name)}</title>
  <style>${sharedStyles()}</style>
</head>
<body>
  <div class="shell">
    <header class="topbar">
      <div class="topbar-inner${opts.logoutUrl ? "" : " topbar-inner--nolog"}">
        <a class="brand" href="/">${brandMark()} ${esc(BRAND.name)}</a>
        <nav class="nav" aria-label="Main">
          <a href="/"${navCurrent("home")}>Home</a>
          <a href="/dashboard"${navCurrent("dashboard")}>Dashboard</a>
          <a href="/api"${navCurrent("docs")}>API</a>
        </nav>
        ${logout}
      </div>
    </header>
    <main>
      <div class="container${opts.narrow ? " container-narrow" : ""}">
        ${opts.body}
      </div>
    </main>
    <footer class="footer"><div class="footer-inner">${esc(BRAND.footer)}</div></footer>
  </div>
  <div class="toast" id="toast" role="status" aria-live="polite">copied</div>
  <script>
    function copyText(t) {
      navigator.clipboard.writeText(t).then(function() {
        var el = document.getElementById('toast');
        if (!el) return;
        el.textContent = 'copied';
        el.classList.add('show');
        setTimeout(function() { el.classList.remove('show'); }, 1400);
      });
    }
    function toggleManage(btn) {
      var panel = document.getElementById(btn.getAttribute('aria-controls'));
      if (!panel) return;
      var open = btn.getAttribute('aria-expanded') !== 'true';
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      panel.hidden = !open;
    }
    function deleteArtifact(id, btn) {
      if (!id || !confirm('Delete this artifact permanently?')) return Promise.resolve(false);
      if (btn) btn.disabled = true;
      return fetch('/dashboard/artifacts/' + encodeURIComponent(id), { method: 'DELETE', credentials: 'same-origin' })
        .then(function(r) { return r.json().then(function(j) { return { ok: r.ok, j: j }; }); })
        .then(function(res) {
          if (!res.ok) {
            alert((res.j && res.j.error) || 'Delete failed');
            if (btn) btn.disabled = false;
            return false;
          }
          var card = btn && btn.closest('.artifact-card');
          if (card) card.remove();
          var toast = document.getElementById('toast');
          if (toast) {
            toast.textContent = 'deleted';
            toast.classList.add('show');
            setTimeout(function() { toast.classList.remove('show'); }, 1400);
          }
          var stats = document.querySelectorAll('.stat-value');
          if (stats[0]) {
            var n = parseInt(stats[0].textContent, 10);
            if (!isNaN(n) && n > 0) stats[0].textContent = String(n - 1);
          }
          return true;
        })
        .catch(function() {
          alert('Delete failed');
          if (btn) btn.disabled = false;
          return false;
        });
    }
    function deleteArtifactAndGo(id, btn, href) {
      deleteArtifact(id, btn).then(function(ok) {
        if (ok && href) location.href = href;
      });
    }
    function revokeDevice(id, btn) {
      if (!id || !confirm('Revoke this device? Its token will stop working immediately.')) return;
      if (btn) btn.disabled = true;
      fetch('/dashboard/devices/' + encodeURIComponent(id), { method: 'DELETE', credentials: 'same-origin' })
        .then(function(r) { return r.json().then(function(j) { return { ok: r.ok, j: j }; }); })
        .then(function(res) {
          if (!res.ok) {
            alert((res.j && res.j.error) || 'Revoke failed');
            if (btn) btn.disabled = false;
            return;
          }
          var row = btn && btn.closest('.device-row');
          if (row) row.remove();
        })
        .catch(function() {
          alert('Revoke failed');
          if (btn) btn.disabled = false;
        });
    }
    function shareAction(id, action, btn) {
      if (!id) return;
      var msg = action === 'rotate'
        ? 'Rotate secret link? Old ?s= URLs will stop working.'
        : 'Revoke secret link? Artifact becomes private (Access/device only).';
      if (!confirm(msg)) return;
      if (btn) btn.disabled = true;
      fetch('/dashboard/artifacts/' + encodeURIComponent(id) + '/share/' + action, {
        method: 'POST',
        credentials: 'same-origin'
      })
        .then(function(r) { return r.json().then(function(j) { return { ok: r.ok, j: j }; }); })
        .then(function(res) {
          if (!res.ok) {
            alert((res.j && res.j.error) || action + ' failed');
            if (btn) btn.disabled = false;
            return;
          }
          if (res.j && res.j.url) {
            var card = btn && btn.closest('.artifact-card');
            if (card) {
              var open = card.querySelector('a.btn-primary');
              var copy = card.querySelector('[data-copy-url]');
              if (open) open.href = res.j.url;
              if (copy) copy.dataset.copyUrl = res.j.url;
              var badge = card.querySelector('.artifact-meta .badge');
              if (badge && res.j.visibility) {
                badge.textContent = res.j.visibility;
                var priv = res.j.visibility === 'private' || res.j.visibility === 'secret';
                badge.className = 'badge ' + (priv ? 'badge-private' : 'badge-public');
              }
              if (action === 'revoke') {
                var shareBtns = card.querySelectorAll('[data-share-action]');
                shareBtns.forEach(function(b) { b.remove(); });
                var shareGroup = card.querySelector('[data-share-group]');
                if (shareGroup) shareGroup.remove();
              }
            }
            copyText(res.j.url);
          }
          if (btn) btn.disabled = false;
        })
        .catch(function() {
          alert(action + ' failed');
          if (btn) btn.disabled = false;
        });
    }
    function setExpiry(id, expires, btn) {
      if (!id || !expires) return;
      if (expires === 'now' && !confirm('Expire this artifact now? It will disappear from the viewer.')) return;
      if (btn) btn.disabled = true;
      fetch('/dashboard/artifacts/' + encodeURIComponent(id), {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expires: expires })
      })
        .then(function(r) { return r.json().then(function(j) { return { ok: r.ok, j: j }; }); })
        .then(function(res) {
          if (!res.ok) {
            alert((res.j && res.j.error) || 'Expiry update failed');
            if (btn) btn.disabled = false;
            return;
          }
          var card = btn && btn.closest('.artifact-card');
          if (expires === 'now') {
            if (card) card.remove();
            var stats = document.querySelectorAll('.stat-value');
            if (stats[0]) {
              var n = parseInt(stats[0].textContent, 10);
              if (!isNaN(n) && n > 0) stats[0].textContent = String(n - 1);
            }
          } else if (card && res.j && res.j.expires_in) {
            var expEl = card.querySelector('[data-expires-label]');
            if (expEl) expEl.textContent = 'expires ' + res.j.expires_in;
          }
          var toast = document.getElementById('toast');
          if (toast) {
            toast.textContent = expires === 'now' ? 'expired' : 'expiry updated';
            toast.classList.add('show');
            setTimeout(function() { toast.classList.remove('show'); }, 1400);
          }
          if (btn) btn.disabled = false;
        })
        .catch(function() {
          alert('Expiry update failed');
          if (btn) btn.disabled = false;
        });
    }
  </script>
</body>
</html>`;
}

export function mimeKind(
  mime: string,
): "image" | "video" | "audio" | "pdf" | "html" | "markdown" | "text" | "file" {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if (mime === "application/pdf") return "pdf";
  if (mime === "text/html") return "html";
  if (mime === "text/markdown" || mime === "text/x-markdown") return "markdown";
  if (
    mime.startsWith("text/") ||
    mime === "application/json" ||
    mime === "application/xml" ||
    mime === "application/yaml" ||
    mime === "application/toml" ||
    mime === "application/x-ndjson" ||
    mime === "application/javascript"
  ) {
    return "text";
  }
  return "file";
}

export function mimeLabel(mime: string): string {
  const k = mimeKind(mime);
  const labels: Record<string, string> = {
    image: "img",
    video: "vid",
    audio: "aud",
    pdf: "pdf",
    html: "htm",
    markdown: "md",
    text: "txt",
    file: "file",
  };
  return labels[k] ?? "file";
}

/** `/a/:id` (+ optional `?s=`) → `/a/:id/render` with query preserved. */
export function htmlRenderUrl(viewUrl: string): string {
  try {
    const u = new URL(viewUrl);
    u.pathname = `${u.pathname.replace(/\/$/, "")}/render`;
    return u.toString();
  } catch {
    const q = viewUrl.indexOf("?");
    if (q === -1) return `${viewUrl.replace(/\/$/, "")}/render`;
    return `${viewUrl.slice(0, q).replace(/\/$/, "")}/render${viewUrl.slice(q)}`;
  }
}

export function visibilityBadge(v: string): string {
  const cls =
    v === "private" ? "badge-private" : v === "secret" ? "badge-private" : "badge-public";
  return `<span class="badge ${cls}">${esc(v)}</span>`;
}

export function setupSection(baseUrl: string): string {
  const prompt = setupPrompt(baseUrl);
  return `
      <section id="setup" class="setup-section">
        <h2 class="section-title">new machine</h2>
        <p class="lead lead-spaced">Paste this prompt into Cursor, Claude Code, or any coding agent on a fresh machine — it installs the skill, creates your token, and verifies the setup.</p>
        <div class="prompt-panel">
          <textarea id="setup-prompt" class="prompt-source" readonly aria-hidden="true" tabindex="-1">${esc(prompt)}</textarea>
          <button class="btn btn-primary prompt-copy" type="button" onclick="copyText(document.getElementById('setup-prompt').value)">Copy setup prompt</button>
          <pre class="prompt-text" tabindex="0" role="region" aria-label="Setup prompt">${esc(prompt)}</pre>
        </div>
        <p class="meta-links">Skill source: <a href="${esc(baseUrl)}/skill.md">${esc(baseUrl)}/skill.md</a> · optional MCP at <code>${esc(baseUrl)}/mcp</code></p>
      </section>`;
}

export function pageLanding(baseUrl: string, limits: Limits): string {
  return page({
    title: "home",
    activeNav: "home",
    description: "Upload artifacts from agent machines, share unlisted links",
    body: `
      <div class="hero-split">
        <div class="hero-copy">
          <h1>${esc(BRAND.heroTitle)}</h1>
          <p class="lead">${esc(BRAND.heroLead)}</p>
          <div class="hero-actions">
            <a class="btn btn-primary" href="#setup">Set up this machine</a>
            <a class="btn btn-ghost" href="/dashboard">Dashboard</a>
            <a class="btn btn-ghost" href="/api">API</a>
          </div>
        </div>
        <aside class="hero-aside">
          <div class="terminal" tabindex="0" role="region" aria-label="Example upload command">
            <div class="terminal-label">upload</div>
            <pre class="code"><span class="prompt">$ </span><span class="cmd">curl -X POST ${esc(baseUrl)}/api/v1/artifacts</span> \\
  -H <span class="cmd">"Authorization: Bearer dev_…"</span> \\
  -F <span class="cmd">"file=@screenshot.png"</span></pre>
          </div>
        </aside>
      </div>
      <h2 class="section-title">how it works</h2>
      <ul class="spec-list">
        <li><span class="spec-term">auth</span><p class="spec-desc">Bearer <code>dev_…</code> per machine via <code>agentdrop init</code></p></li>
        <li><span class="spec-term">upload</span><p class="spec-desc"><code>POST /api/v1/artifacts</code> or MCP from your session</p></li>
        <li><span class="spec-term">links</span><p class="spec-desc"><code>/a/:id</code> viewer · <code>/r/:id/:file</code> raw from R2</p></li>
        <li><span class="spec-term">retention</span><p class="spec-desc">${limits.retentionDays} days by default · ${limits.retentionDaysLinked} days for linked devices · up to ${formatMb(limits.maxFileBytes)} per file</p></li>
      </ul>
      ${setupSection(baseUrl)}
    `,
  });
}

export interface DashboardDevice {
  id: string;
  label: string | null;
}

export interface DashboardArtifact {
  id: string;
  filename: string;
  title?: string | null;
  mime: string;
  visibility: string;
  url: string;
  raw_url: string;
  expires_at: string;
  password_protected?: boolean;
}

export function pageDashboard(
  email: string,
  devices: DashboardDevice[],
  artifacts: DashboardArtifact[],
  storage?: { used: number; max: number; usedLabel: string; maxLabel: string },
  opts?: { logoutUrl?: string; maxFileLabel?: string },
): string {
  const deviceHtml =
    devices.length > 0
      ? devices
          .map((d) => {
            const name = d.label
              ? `<span>${esc(d.label)}</span><code class="device-id">${esc(d.id)}</code>`
              : `<code>${esc(d.id)}</code>`;
            return `<div class="device-row">
              <span class="badge">device</span>
              <span class="device-name">${name}</span>
              <button class="btn btn-danger" type="button" data-device-id="${esc(d.id)}" onclick="revokeDevice(this.dataset.deviceId, this)">revoke</button>
            </div>`;
          })
          .join("")
      : `<div class="empty"><p>No linked devices yet. Run <code>agentdrop link</code> on a machine.</p></div>`;

  const artifactHtml =
    artifacts.length > 0
      ? `<div class="grid grid-2">${artifacts
          .map((a) => {
            const isImg = a.mime.startsWith("image/");
            const thumb = isImg
              ? `<img src="${esc(a.raw_url)}" alt="" loading="lazy"/>`
              : `<span class="artifact-thumb-label">${esc(mimeLabel(a.mime))}</span>`;
            const expMs = Date.parse(a.expires_at);
            const expLabel = Number.isFinite(expMs)
              ? `expires ${formatExpiresIn(expMs)}`
              : `exp ${esc(a.expires_at.slice(0, 10))}`;
            const lock = a.password_protected
              ? `<span class="badge badge-private">password</span>`
              : "";
            const panelId = `manage-${a.id}`;
            const shareGroup =
              a.visibility === "secret"
                ? `<div class="manage-group" data-share-group>
                  <span class="manage-label">share link</span>
                  <div class="manage-row">
                    <button class="btn btn-ghost" type="button" data-share-action="rotate" data-artifact-id="${esc(a.id)}" onclick="shareAction(this.dataset.artifactId, 'rotate', this)">rotate link</button>
                    <button class="btn btn-ghost" type="button" data-share-action="revoke" data-artifact-id="${esc(a.id)}" onclick="shareAction(this.dataset.artifactId, 'revoke', this)">revoke link</button>
                  </div>
                </div>`
                : "";
            return `<article class="artifact-card">
              <div class="artifact-thumb">${thumb}</div>
              <div class="artifact-name" title="${esc(a.filename)}">${esc(a.title || a.filename)}</div>
              <div class="artifact-meta">
                ${visibilityBadge(a.visibility)}
                ${lock}
                <span class="badge">${esc(mimeLabel(a.mime))}</span>
              </div>
              <div class="artifact-expiry" data-expires-label>${esc(expLabel)}</div>
              <div class="artifact-actions">
                <a class="btn btn-primary" href="${esc(a.url)}">open</a>
                <button class="btn btn-ghost" type="button" data-copy-url="${esc(a.url)}" onclick="copyText(this.dataset.copyUrl)">copy</button>
                <button class="btn btn-ghost btn-manage" type="button" aria-expanded="false" aria-controls="${esc(panelId)}" onclick="toggleManage(this)">manage <span class="chev" aria-hidden="true"></span></button>
              </div>
              <div class="manage-panel" id="${esc(panelId)}" hidden>
                ${shareGroup}
                <div class="manage-group">
                  <span class="manage-label">expiry</span>
                  <div class="manage-row">
                    <button class="btn btn-ghost" type="button" data-artifact-id="${esc(a.id)}" onclick="setExpiry(this.dataset.artifactId, '7d', this)">7d</button>
                    <button class="btn btn-ghost" type="button" data-artifact-id="${esc(a.id)}" onclick="setExpiry(this.dataset.artifactId, '30d', this)">30d</button>
                    <button class="btn btn-ghost" type="button" data-artifact-id="${esc(a.id)}" onclick="setExpiry(this.dataset.artifactId, 'now', this)">expire</button>
                  </div>
                </div>
                <button class="btn btn-danger btn-block" type="button" data-artifact-id="${esc(a.id)}" onclick="deleteArtifact(this.dataset.artifactId, this)">delete</button>
              </div>
            </article>`;
          })
          .join("")}</div>`
      : `<div class="empty"><p>Nothing here yet. Try <code>agentdrop upload ./file.png</code>.</p></div>`;

  const storageHtml = storage
    ? `<div><div class="stat-value">${esc(storage.usedLabel)}</div><div class="stat-label">of ${esc(storage.maxLabel)}</div></div>`
    : "";
  const fileCap = opts?.maxFileLabel
    ? `<span class="badge">max ${esc(opts.maxFileLabel)}/file</span>`
    : "";

  return page({
    title: "dashboard",
    activeNav: "dashboard",
    description: "Artifacts and linked devices",
    logoutUrl: opts?.logoutUrl,
    body: `
      <div class="page-head">
        <h1>Dashboard</h1>
        <p class="page-meta"><span class="page-meta-email">${esc(email)}</span> ${fileCap}</p>
      </div>
      <div class="stat-row">
        <div><div class="stat-value">${artifacts.length}</div><div class="stat-label">artifacts</div></div>
        <div><div class="stat-value">${devices.length}</div><div class="stat-label">devices</div></div>
        ${storageHtml}
      </div>
      <h2 class="section-title">artifacts</h2>
      ${artifactHtml}
      <h2 class="section-title">devices</h2>
      ${deviceHtml}
    `,
  });
}

export function pageViewer(opts: {
  id: string;
  title: string;
  filename: string;
  mime: string;
  viewUrl: string;
  rawUrl: string;
  visibility: string;
  expiresAt: string;
  markdownHtml?: string;
  passwordProtected?: boolean;
}): string {
  const {
    id,
    title,
    filename,
    mime,
    viewUrl,
    rawUrl,
    visibility,
    expiresAt,
    markdownHtml,
    passwordProtected,
  } = opts;
  let stage = "";
  const k = mimeKind(mime);
  if (k === "image") {
    stage = `<img src="${esc(rawUrl)}" alt="${esc(title)}"/>`;
  } else if (k === "video") {
    stage = `<video src="${esc(rawUrl)}" controls playsinline></video>`;
  } else if (k === "audio") {
    stage = `<div class="stage-empty">
      <audio src="${esc(rawUrl)}" controls></audio>
    </div>`;
  } else if (k === "pdf") {
    stage = `<iframe src="${esc(rawUrl)}" title="${esc(title)}"></iframe>`;
  } else if (k === "html") {
    stage = `<iframe src="${esc(htmlRenderUrl(viewUrl))}" sandbox="" title="${esc(title)}"></iframe>`;
  } else if (k === "markdown" && markdownHtml) {
    stage = markdownHtml;
  } else if (k === "text" || k === "markdown") {
    stage = `<iframe class="stage-text" src="${esc(rawUrl)}" title="${esc(title)}"></iframe>`;
  } else {
    stage = `<div class="stage-empty">
      <p class="stage-file">
        <span class="badge">${esc(mimeLabel(mime))}</span>
        <span class="stage-filename">${esc(filename)}</span>
        <a class="btn btn-primary" href="${esc(rawUrl)}" download>download</a>
      </p>
    </div>`;
  }

  const expMs = Date.parse(expiresAt);
  const expLabel = Number.isFinite(expMs)
    ? `expires ${formatExpiresIn(expMs)}`
    : `exp ${expiresAt.slice(0, 10)}`;
  const lock = passwordProtected ? `<span class="badge badge-private">password</span>` : "";

  return page({
    title,
    body: `
      <div class="viewer-toolbar">
        <div class="viewer-title">
          <h1>${esc(title)}</h1>
          <div class="badge-row">
            ${visibilityBadge(visibility)}
            ${lock}
            <span class="badge">${esc(mimeLabel(mime))}</span>
            <span class="badge">${esc(expLabel)}</span>
          </div>
        </div>
        <div class="viewer-actions">
          <button class="btn btn-ghost" type="button" onclick="copyText(location.href)">copy link</button>
          <a class="btn btn-ghost" href="${esc(rawUrl)}" download>download</a>
          <button class="btn btn-danger" type="button" data-artifact-id="${esc(id)}" onclick="deleteArtifactAndGo(this.dataset.artifactId, this, '/dashboard')">delete</button>
        </div>
      </div>
      <div class="viewer-stage${k === "markdown" && markdownHtml ? " viewer-stage-doc" : ""}">${stage}</div>
    `,
  });
}

export function pagePasswordGate(opts: {
  id: string;
  title: string;
  secretQs?: string;
  error?: string;
}): string {
  const action = `/a/${esc(opts.id)}/unlock${opts.secretQs ?? ""}`;
  const err = opts.error ? `<p class="error">${esc(opts.error)}</p>` : "";
  return page({
    title: "password required",
    narrow: true,
    body: `
      <div class="password-gate">
        <h1>${esc(opts.title)}</h1>
        <p>This share is password-protected.</p>
        ${err}
        <form method="POST" action="${action}">
          <label class="sr-only" for="pw">Password</label>
          <input id="pw" name="password" type="password" autocomplete="current-password" required autofocus placeholder="Password"/>
          <button class="btn btn-primary btn-block" type="submit">Unlock</button>
        </form>
      </div>
    `,
  });
}

export function pageLinkApprove(code: string, email: string): string {
  return page({
    title: "link device",
    narrow: true,
    body: `
      <h1>Link this machine</h1>
      <p class="lead">Approve adding an agent device to your account.</p>
      <div class="code-display">${esc(code)}</div>
      <p class="meta-note">${esc(email)}</p>
      <form class="stack-top" method="POST" action="/link/${esc(code)}">
        <button class="btn btn-primary btn-block" type="submit">Approve</button>
      </form>
    `,
  });
}

export function pageLinkSuccess(): string {
  return page({
    title: "linked",
    narrow: true,
    body: `
      <div class="notice"><strong>Device linked.</strong> You can close this tab — the machine will see claimed status on its next request.</div>
      <a class="btn btn-ghost btn-block stack-top" href="/dashboard">Go to dashboard</a>
    `,
  });
}

export function pageExpired(message: string): string {
  return page({
    title: "expired",
    narrow: true,
    body: `
      <h1>Link expired</h1>
      <p class="lead">${esc(message)}</p>
      <p class="meta-note">Run <code>agentdrop link</code> again on the machine.</p>
      <a class="btn btn-ghost btn-block stack-top" href="/">Home</a>
    `,
  });
}

export function pageVerify(siteKey: string, action: string): string {
  return page({
    title: "verify",
    narrow: true,
    body: `
      <h1>Verify machine</h1>
      <p class="lead">Complete the check to raise upload limits for this device.</p>
      <div class="card stack-top" id="card">
        <form id="f" method="POST" action="${esc(action)}">
          <div class="turnstile-wrap" id="turnstile-wrap" tabindex="0" role="region" aria-label="Verification challenge">
            <div id="turnstile" class="cf-turnstile" data-sitekey="${esc(siteKey)}" data-theme="dark" data-callback="onTurnstile"></div>
          </div>
        </form>
        <script>
          (function() {
            var wrap = document.getElementById('turnstile-wrap');
            var cs = getComputedStyle(wrap);
            var w = wrap.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
            document.getElementById('turnstile').setAttribute('data-size', w < 310 ? 'compact' : 'flexible');
          })();
        </script>
        <div id="done" hidden class="notice">
          <strong>Verified.</strong> Retry your upload.
        </div>
        <div id="err" hidden class="notice notice-danger">
          <strong>Verification failed.</strong> <span id="err-msg"></span>
        </div>
      </div>
      <script>
        var submitted = false;
        function onTurnstile(token) {
          if (submitted || !token) return;
          submitted = true;
          var form = document.getElementById('f');
          var fd = new FormData(form);
          if (!fd.get('cf-turnstile-response')) fd.set('cf-turnstile-response', token);
          fetch(form.action, { method: 'POST', body: fd })
            .then(function(r) { return r.json().then(function(j) { return { ok: r.ok, j: j }; }); })
            .then(function(res) {
              if (res.j && res.j.ok) {
                document.getElementById('done').hidden = false;
                document.getElementById('err').hidden = true;
                var w = document.getElementById('turnstile-wrap');
                if (w) { w.hidden = true; w.removeAttribute('tabindex'); }
              } else {
                submitted = false;
                document.getElementById('err').hidden = false;
                document.getElementById('err-msg').textContent = (res.j && res.j.error) || 'try again';
                if (window.turnstile) window.turnstile.reset('#turnstile');
              }
            })
            .catch(function() {
              submitted = false;
              document.getElementById('err').hidden = false;
              document.getElementById('err-msg').textContent = 'network error — try again';
              if (window.turnstile) window.turnstile.reset('#turnstile');
            });
        }
      </script>
      <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
    `,
  });
}

export function pageApiDocs(baseUrl: string): string {
  return page({
    title: "api",
    activeNav: "docs",
    description: "HTTP API for agent machines",
    body: `
      <div class="page-head">
        <h1>API reference</h1>
        <p class="lead">Machine uploads use bearer tokens. Dashboard and device linking require Cloudflare Access.</p>
      </div>
      <h2 class="section-title">quick start</h2>
      <div class="terminal" tabindex="0" role="region" aria-label="Quick start commands">
        <div class="terminal-label">init + upload</div>
        <pre class="code">curl -X POST ${esc(baseUrl)}/api/v1/device/init

curl -X POST ${esc(baseUrl)}/api/v1/artifacts \\
  -H "Authorization: Bearer dev_…" \\
  -F "file=@screenshot.png"</pre>
      </div>
      <h2 class="section-title">endpoints</h2>
      <div class="endpoint">
        <span class="endpoint-method">post</span> <span class="endpoint-path">/api/v1/device/init</span>
        <p class="endpoint-desc">Issue or reload the machine token. Response includes <code>dev_…</code>.</p>
      </div>
      <div class="endpoint">
        <span class="endpoint-method">post</span> <span class="endpoint-path">/api/v1/artifacts</span>
        <p class="endpoint-desc">Multipart upload. Requires <code>Authorization: Bearer dev_…</code>.</p>
      </div>
      <div class="endpoint">
        <span class="endpoint-method">get</span> <span class="endpoint-path">/a/:id</span>
        <p class="endpoint-desc">Viewer (HTML) or JSON metadata depending on Accept header.</p>
      </div>
      <div class="endpoint">
        <span class="endpoint-method">get</span> <span class="endpoint-path">/r/:id/:file</span>
        <p class="endpoint-desc">Raw object from R2.</p>
      </div>
      <div class="endpoint">
        <span class="endpoint-method">get</span> <span class="endpoint-path">/dashboard</span>
        <p class="endpoint-desc">Artifact list. Cloudflare Access required.</p>
      </div>
      <div class="endpoint">
        <span class="endpoint-method">post</span> <span class="endpoint-path">/mcp</span>
        <p class="endpoint-desc">MCP JSON-RPC endpoint.</p>
      </div>
      <div class="endpoint">
        <span class="endpoint-method">get</span> <span class="endpoint-path">/skill.md</span>
        <p class="endpoint-desc">Agent skill markdown — fetch and install to <code>~/.cursor/skills/agentdrop/SKILL.md</code>.</p>
      </div>
      <div class="endpoint">
        <span class="endpoint-method">get</span> <span class="endpoint-path">/healthz</span>
        <p class="endpoint-desc">Liveness check.</p>
      </div>
    `,
  });
}

export function pageError(title: string, message: string, code?: number): string {
  return page({
    title,
    narrow: true,
    body: `
      <p class="error-code">${code ?? ""}</p>
      <h1>${esc(title)}</h1>
      <p class="lead">${esc(message)}</p>
      <a class="btn btn-ghost btn-block stack-top" href="/">Home</a>
    `,
  });
}

export function wantsHtml(c: { req: { header: (n: string) => string | undefined; path: string } }): boolean {
  const accept = c.req.header("accept") ?? "";
  if (accept.includes("text/html")) return true;
  const p = c.req.path;
  return (
    p === "/" ||
    p === "/api" ||
    p.startsWith("/dashboard") ||
    p.startsWith("/a/") ||
    p.startsWith("/link/") ||
    p.startsWith("/verify/")
  );
}
