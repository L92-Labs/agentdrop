#!/usr/bin/env node
/**
 * Agentdrop CLI — init, status, link, upload, list, delete, rotate, revoke, label.
 */
import { mkdir, readFile, writeFile, chmod, access, open, stat } from "node:fs/promises";
import { basename, dirname, isAbsolute, resolve as pathResolve } from "node:path";
import { homedir } from "node:os";
import { join } from "node:path";

/** Your Agentdrop server, e.g. https://drop.example.com. Saved in token.json by `init`. */
const DEFAULT_BASE = (process.env.AGENTDROP_URL ?? "").replace(/\/$/, "");

function requireBase(base) {
  if (base) return base;
  console.error("No server URL. Run: agentdrop init <base_url>   (or set AGENTDROP_URL)");
  process.exit(1);
}
const CONFIG_DIR = join(homedir(), ".agentdrop");
const TOKEN_FILE = join(CONFIG_DIR, "token.json");
/** Stay under Workers ~100MB request body; multipart for larger (up to 1GB). */
const DIRECT_MAX = 90 * 1024 * 1024;
const PART_SIZE = 8 * 1024 * 1024;

async function loadTokenFile() {
  try {
    return JSON.parse(await readFile(TOKEN_FILE, "utf8"));
  } catch {
    return null;
  }
}

async function saveToken(data) {
  await mkdir(CONFIG_DIR, { recursive: true, mode: 0o700 });
  await writeFile(TOKEN_FILE, JSON.stringify(data, null, 2) + "\n", { mode: 0o600 });
  await chmod(CONFIG_DIR, 0o700);
  await chmod(TOKEN_FILE, 0o600);
}

async function api(path, opts = {}) {
  const tokenData = await loadTokenFile();
  const base = requireBase(tokenData?.base_url ?? DEFAULT_BASE);
  const headers = { ...(opts.headers ?? {}) };
  if (tokenData?.device_token && !headers.Authorization) {
    headers.Authorization = `Bearer ${tokenData.device_token}`;
  }
  const res = await fetch(`${base}${path}`, { ...opts, headers });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    console.error(JSON.stringify(json, null, 2));
    process.exit(1);
  }
  return json;
}

function usage() {
  console.log(`agentdrop — artifact hosting for agent machines

Usage:
  agentdrop init <base_url> [--enroll <token>]
                                Create device token → ~/.agentdrop/token.json
  agentdrop status              Device claim + rate tier
  agentdrop link                Start link flow (open verify_url, approve via Access)
  agentdrop upload <file>       Upload [--title name] [--private|--secret] [--url]
                                [--password secret] [--expires 24h|7d]
                                .md files: local image paths are uploaded + rewritten
                                Files over ~90MB use multipart (max 1GB)
  agentdrop list                List artifacts for this device
  agentdrop delete <id>         Delete artifact by id
  agentdrop share rotate <id>   Rotate secret ?s= token (old links die)
  agentdrop share revoke <id>   Revoke secret link → private
  agentdrop expires <id> <ttl>  Set expiry: 24h | 7d | 30d | now
  agentdrop rotate              Rotate device token (updates token.json)
  agentdrop revoke              Permanently revoke this device token
  agentdrop label <name>        Set a human label for this device

Env:
  AGENTDROP_URL                 Server URL used by init when base_url is omitted
  AGENTDROP_ENROLL_TOKEN        Enroll token for private instances (same as --enroll)
`);
}

/** Find markdown image refs that look like local paths. */
function findLocalMdImages(md) {
  const out = [];
  const re = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  let m;
  while ((m = re.exec(md)) !== null) {
    const url = m[2];
    if (/^(https?:|data:|\/|#)/i.test(url)) continue;
    out.push({ full: m[0], alt: m[1], url, index: m.index });
  }
  return out;
}

/**
 * Upload local images referenced by a markdown file, rewrite to hosted raw_url.
 * Companion assets inherit visibility/expires but not password (password is on the .md).
 */
async function rewriteMarkdownAssets(mdPath, mdText, opts) {
  const refs = findLocalMdImages(mdText);
  if (refs.length === 0) return { text: mdText, assets: [] };

  const baseDir = dirname(pathResolve(mdPath));
  const seen = new Map();
  const assets = [];
  let text = mdText;

  // Replace from end so indices stay valid
  const ordered = [...refs].sort((a, b) => b.index - a.index);
  for (const ref of ordered) {
    const abs = isAbsolute(ref.url)
      ? ref.url
      : pathResolve(baseDir, ref.url.replace(/^\.\//, ""));
    let rawUrl = seen.get(abs);
    if (!rawUrl) {
      try {
        await access(abs);
      } catch {
        continue;
      }
      const uploaded = await uploadBytes(
        await readFile(abs),
        basename(abs),
        {
          ...opts,
          // Images stay link-reachable without the MD password cookie.
          password: undefined,
          title: undefined,
        },
      );
      rawUrl = uploaded.raw_url;
      seen.set(abs, rawUrl);
      assets.push({ path: abs, id: uploaded.id, raw_url: rawUrl });
      process.stderr.write(`asset ${basename(abs)} → ${rawUrl}\n`);
    }
    const replacement = `![${ref.alt}](${rawUrl})`;
    text = text.slice(0, ref.index) + replacement + text.slice(ref.index + ref.full.length);
  }
  return { text, assets };
}

async function uploadBytes(buf, name, opts) {
  const { base, auth, title, visibility, password, expires } = opts;
  if (buf.byteLength > DIRECT_MAX) {
    const startRes = await fetch(`${base}/api/v1/artifacts/multipart`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        filename: name,
        size_bytes: buf.byteLength,
        title,
        visibility: visibility === "public" ? undefined : visibility,
        password: password || undefined,
        expires: expires || undefined,
      }),
    });
    const startJson = await startRes.json().catch(() => ({}));
    if (!startRes.ok) {
      console.error(JSON.stringify(startJson, null, 2));
      process.exit(1);
    }
    const uploadId = startJson.upload_id;
    const partSize = startJson.part_size || PART_SIZE;
    let partNumber = 1;
    let offset = 0;
    while (offset < buf.byteLength) {
      const len = Math.min(partSize, buf.byteLength - offset);
      const part = buf.subarray(offset, offset + len);
      const partRes = await fetch(
        `${base}/api/v1/artifacts/multipart/${encodeURIComponent(uploadId)}/parts/${partNumber}`,
        { method: "PUT", headers: auth, body: part },
      );
      if (!partRes.ok) {
        console.error(await partRes.text());
        await fetch(`${base}/api/v1/artifacts/multipart/${encodeURIComponent(uploadId)}`, {
          method: "DELETE",
          headers: auth,
        }).catch(() => {});
        process.exit(1);
      }
      offset += len;
      partNumber += 1;
    }
    const doneRes = await fetch(
      `${base}/api/v1/artifacts/multipart/${encodeURIComponent(uploadId)}/complete`,
      { method: "POST", headers: auth },
    );
    const doneJson = await doneRes.json().catch(() => ({}));
    if (!doneRes.ok) {
      console.error(JSON.stringify(doneJson, null, 2));
      process.exit(1);
    }
    return doneJson;
  }

  const form = new FormData();
  form.append("file", new Blob([buf]), name);
  if (title) form.append("title", title);
  if (visibility !== "public") form.append("visibility", visibility);
  if (password) form.append("password", password);
  if (expires) form.append("expires", expires);

  const res = await fetch(`${base}/api/v1/artifacts`, {
    method: "POST",
    headers: auth,
    body: form,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error(JSON.stringify(json, null, 2));
    process.exit(1);
  }
  return json;
}

const [cmd, ...rest] = process.argv.slice(2);

if (!cmd || cmd === "help" || cmd === "-h" || cmd === "--help") {
  usage();
  process.exit(0);
}

if (cmd === "init") {
  const args = [...rest];
  let enroll = process.env.AGENTDROP_ENROLL_TOKEN ?? "";
  const ei = args.indexOf("--enroll");
  if (ei >= 0) {
    enroll = args[ei + 1] ?? "";
    args.splice(ei, 2);
  }
  const base = requireBase((args[0] ?? DEFAULT_BASE).replace(/\/$/, ""));
  const res = await fetch(`${base}/api/v1/device/init`, {
    method: "POST",
    headers: enroll ? { "X-Enroll-Token": enroll } : {},
  });
  const json = await res.json();
  if (!res.ok) {
    console.error(json);
    process.exit(1);
  }
  await saveToken({
    device_token: json.device_token,
    device_id: json.device_id,
    base_url: base,
  });
  console.log(JSON.stringify(json, null, 2));
  console.error(`\nSaved ${TOKEN_FILE}`);
} else if (cmd === "status") {
  console.log(JSON.stringify(await api("/api/v1/device/status"), null, 2));
} else if (cmd === "link") {
  const json = await api("/api/v1/link/start", { method: "POST" });
  console.log(JSON.stringify(json, null, 2));
  console.error("\nOpen verify_url in a browser (Cloudflare Access login) and approve.");
} else if (cmd === "list") {
  console.log(JSON.stringify(await api("/api/v1/artifacts"), null, 2));
} else if (cmd === "delete") {
  const id = rest[0];
  if (!id) {
    console.error("usage: agentdrop delete <artifact_id>");
    process.exit(1);
  }
  console.log(
    JSON.stringify(await api(`/api/v1/artifacts/${encodeURIComponent(id)}`, { method: "DELETE" }), null, 2),
  );
} else if (cmd === "share") {
  const action = rest[0];
  const id = rest[1];
  if ((action !== "rotate" && action !== "revoke") || !id) {
    console.error("usage: agentdrop share rotate|revoke <artifact_id>");
    process.exit(1);
  }
  console.log(
    JSON.stringify(
      await api(`/api/v1/artifacts/${encodeURIComponent(id)}/share/${action}`, { method: "POST" }),
      null,
      2,
    ),
  );
} else if (cmd === "expires") {
  const id = rest[0];
  const expires = rest[1];
  if (!id || !expires) {
    console.error("usage: agentdrop expires <artifact_id> <24h|7d|30d|now>");
    process.exit(1);
  }
  console.log(
    JSON.stringify(
      await api(`/api/v1/artifacts/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expires }),
      }),
      null,
      2,
    ),
  );
} else if (cmd === "rotate") {
  const json = await api("/api/v1/device/rotate", { method: "POST" });
  const tokenData = (await loadTokenFile()) ?? {};
  await saveToken({
    ...tokenData,
    device_token: json.device_token,
    device_id: json.device_id,
  });
  console.log(JSON.stringify(json, null, 2));
  console.error(`\nUpdated ${TOKEN_FILE}`);
} else if (cmd === "revoke") {
  const json = await api("/api/v1/device/revoke", { method: "POST" });
  console.log(JSON.stringify(json, null, 2));
  console.error(
    "\nDevice revoked. Delete ~/.agentdrop/token.json and run agentdrop init to start fresh.",
  );
} else if (cmd === "label") {
  const label = rest.join(" ").trim();
  if (!label) {
    console.error("usage: agentdrop label <name>");
    process.exit(1);
  }
  console.log(
    JSON.stringify(
      await api("/api/v1/device/label", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label }),
      }),
      null,
      2,
    ),
  );
} else if (cmd === "upload") {
  const positional = [];
  let title;
  let visibility = "public";
  let urlOnly = false;
  let password;
  let expires;
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === "--title") {
      title = rest[++i];
    } else if (rest[i] === "--private") {
      visibility = "private";
    } else if (rest[i] === "--secret") {
      visibility = "secret";
    } else if (rest[i] === "--url") {
      urlOnly = true;
    } else if (rest[i] === "--password") {
      password = rest[++i];
    } else if (rest[i] === "--expires") {
      expires = rest[++i];
    } else if (!rest[i].startsWith("--")) {
      positional.push(rest[i]);
    }
  }
  const file = positional[0];
  if (!file) {
    console.error(
      "usage: agentdrop upload <path> [--title name] [--private|--secret] [--password secret] [--expires 24h|7d] [--url]",
    );
    process.exit(1);
  }
  try {
    await access(file);
  } catch {
    console.error(`file not found: ${file}`);
    process.exit(1);
  }

  const tokenData = await loadTokenFile();
  if (!tokenData?.device_token) {
    console.error("Run agentdrop init first");
    process.exit(1);
  }
  const base = requireBase(tokenData.base_url ?? DEFAULT_BASE);
  const auth = { Authorization: `Bearer ${tokenData.device_token}` };
  const name = basename(file);
  const opts = { base, auth, title, visibility, password, expires };

  let buf;
  let assets = [];
  if (/\.md$/i.test(name)) {
    const mdText = await readFile(file, "utf8");
    const rewritten = await rewriteMarkdownAssets(file, mdText, opts);
    buf = Buffer.from(rewritten.text, "utf8");
    assets = rewritten.assets;
  } else {
    buf = await readFile(file);
  }

  // Large file path via filesystem for non-rewritten uploads (avoid holding 1GB in RAM twice)
  let json;
  if (!/\.md$/i.test(name) && (await stat(file)).size > DIRECT_MAX) {
    const info = await stat(file);
    const startRes = await fetch(`${base}/api/v1/artifacts/multipart`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        filename: name,
        size_bytes: info.size,
        title,
        visibility: visibility === "public" ? undefined : visibility,
        password: password || undefined,
        expires: expires || undefined,
      }),
    });
    const startJson = await startRes.json().catch(() => ({}));
    if (!startRes.ok) {
      console.error(JSON.stringify(startJson, null, 2));
      process.exit(1);
    }
    const uploadId = startJson.upload_id;
    const partSize = startJson.part_size || PART_SIZE;
    const fh = await open(file, "r");
    try {
      let partNumber = 1;
      let offset = 0;
      while (offset < info.size) {
        const len = Math.min(partSize, info.size - offset);
        const chunk = Buffer.alloc(len);
        await fh.read(chunk, 0, len, offset);
        const partRes = await fetch(
          `${base}/api/v1/artifacts/multipart/${encodeURIComponent(uploadId)}/parts/${partNumber}`,
          { method: "PUT", headers: auth, body: chunk },
        );
        if (!partRes.ok) {
          console.error(await partRes.text());
          await fetch(`${base}/api/v1/artifacts/multipart/${encodeURIComponent(uploadId)}`, {
            method: "DELETE",
            headers: auth,
          }).catch(() => {});
          process.exit(1);
        }
        offset += len;
        partNumber += 1;
        process.stderr.write(`\ruploaded ${Math.min(offset, info.size)} / ${info.size} bytes`);
      }
      process.stderr.write("\n");
    } finally {
      await fh.close();
    }
    const doneRes = await fetch(
      `${base}/api/v1/artifacts/multipart/${encodeURIComponent(uploadId)}/complete`,
      { method: "POST", headers: auth },
    );
    json = await doneRes.json().catch(() => ({}));
    if (!doneRes.ok) {
      console.error(JSON.stringify(json, null, 2));
      process.exit(1);
    }
  } else {
    json = await uploadBytes(buf, name, opts);
  }

  if (assets.length) json.assets = assets;

  if (urlOnly && json.url) {
    console.log(json.url);
  } else {
    console.log(JSON.stringify(json, null, 2));
  }
} else {
  console.error(`unknown command: ${cmd}\n`);
  usage();
  process.exit(1);
}
