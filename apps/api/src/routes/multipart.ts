import { UPLOAD } from "../shared";
import { Hono } from "hono";
import { sanitizeMime } from "../lib/device";
import {
  assertUploadAllowed,
  artifactR2Key,
  consumeRateLimit,
  deviceRetentionDays,
  expiresAt,
  insertArtifact,
  mintShareToken,
  newArtifactId,
  normalizeVisibility,
  optionalPasswordHash,
  toUploadResponse,
} from "../lib/upload";
import type { AppContext } from "../middleware";

type MultipartPart = { partNumber: number; etag: string; size: number };

type MultipartRow = {
  id: string;
  device_id: string;
  account_id: string | null;
  r2_key: string;
  r2_upload_id: string;
  filename: string;
  mime: string;
  title: string | null;
  visibility: string;
  share_token: string | null;
  size_bytes: number;
  retention_days: number;
  parts_json: string;
  rate_key: string;
  expires_at: number;
  password_hash: string | null;
};

export const multipartRoutes = new Hono<AppContext>();

/** Start a multipart upload for files up to the plan file cap. */
multipartRoutes.post("/api/v1/artifacts/multipart", async (c) => {
  const device = c.get("device");
  if (!device) return c.json({ error: "missing_device_token" }, 401);

  const body = (await c.req.json().catch(() => null)) as {
    filename?: string;
    mime?: string;
    size_bytes?: number;
    title?: string;
    visibility?: string;
    retention_days?: number;
    expires?: string;
    password?: string;
  } | null;
  if (!body) return c.json({ error: "json_required" }, 400);

  const sizeBytes = Number(body.size_bytes);
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return c.json({ error: "size_bytes_required" }, 400);
  }

  const gate = await assertUploadAllowed(c.env.DB, device, sizeBytes, c.get("config").limits);
  if (!gate.ok) {
    const out = { ...gate.body };
    if (gate.status === 429) {
      out.verify_url = `${c.get("config").publicBaseUrl}/verify/${device.id}`;
    }
    return c.json(out, gate.status);
  }

  const filename = body.filename || "upload.bin";
  const mime = sanitizeMime(body.mime || "", filename);
  if (!mime) return c.json({ error: "mime_not_allowed" }, 415);

  const vis = normalizeVisibility(
    body.visibility,
    Boolean(device.account_id),
    c.get("config").accessEnabled,
  );
  if (!vis.ok) {
    return c.json({ error: vis.error, hint: vis.hint }, 403);
  }

  let passwordHash: string | null = null;
  try {
    passwordHash = await optionalPasswordHash(body.password, c.env.TOKEN_PEPPER);
  } catch {
    return c.json({ error: "password_too_long" }, 400);
  }

  const id = newArtifactId();
  const shareToken = mintShareToken(vis.visibility);
  const r2Key = artifactR2Key(device.id, id, filename);
  const multipart = await c.env.DATA.createMultipartUpload(r2Key, {
    httpMetadata: { contentType: mime },
  });

  const retentionDays = deviceRetentionDays(
    device,
    c.get("config").limits,
    body.expires,
    body.retention_days,
  );
  const sessionExpires = Date.now() + 6 * 3600_000;
  await c.env.DB.prepare(
    `INSERT INTO multipart_uploads
     (id, device_id, account_id, r2_key, r2_upload_id, filename, mime, title, visibility, share_token,
      size_bytes, retention_days, parts_json, rate_key, created_at, expires_at, password_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', ?, ?, ?, ?)`,
  )
    .bind(
      id,
      device.id,
      device.account_id,
      r2Key,
      multipart.uploadId,
      filename,
      mime,
      body.title ?? null,
      vis.visibility,
      shareToken,
      sizeBytes,
      retentionDays,
      gate.rate.key,
      Date.now(),
      sessionExpires,
      passwordHash,
    )
    .run();

  return c.json({
    upload_id: id,
    artifact_id: id,
    part_size: UPLOAD.multipartPartBytes,
    max_bytes: c.get("config").limits.maxFileBytes,
    size_bytes: sizeBytes,
    parts_expected: Math.ceil(sizeBytes / UPLOAD.multipartPartBytes),
  });
});

multipartRoutes.put("/api/v1/artifacts/multipart/:uploadId/parts/:partNumber", async (c) => {
  const device = c.get("device");
  if (!device) return c.json({ error: "missing_device_token" }, 401);

  const uploadId = c.req.param("uploadId");
  const partNumber = Number.parseInt(c.req.param("partNumber"), 10);
  if (!Number.isFinite(partNumber) || partNumber < 1 || partNumber > 10_000) {
    return c.json({ error: "invalid_part_number" }, 400);
  }

  const session = await c.env.DB.prepare("SELECT * FROM multipart_uploads WHERE id = ?")
    .bind(uploadId)
    .first<MultipartRow>();
  if (!session || session.device_id !== device.id) return c.json({ error: "not_found" }, 404);
  if (session.expires_at <= Date.now()) return c.json({ error: "upload_expired" }, 410);

  const body = await c.req.arrayBuffer();
  if (body.byteLength === 0) return c.json({ error: "empty_part" }, 400);
  if (body.byteLength > UPLOAD.maxBytesDirectUpload) {
    return c.json({ error: "part_too_large", max_bytes: UPLOAD.maxBytesDirectUpload }, 413);
  }

  const parts = JSON.parse(session.parts_json || "[]") as MultipartPart[];
  const other = parts.filter((p) => p.partNumber !== partNumber);
  const uploadedBytes = other.reduce((sum, p) => sum + p.size, 0);
  const isLast = uploadedBytes + body.byteLength >= session.size_bytes;
  if (!isLast && body.byteLength < UPLOAD.multipartMinPartBytes) {
    return c.json(
      {
        error: "part_too_small",
        min_bytes: UPLOAD.multipartMinPartBytes,
        hint: "R2 requires every part except the last to be at least 5MB",
      },
      400,
    );
  }

  const multipart = c.env.DATA.resumeMultipartUpload(session.r2_key, session.r2_upload_id);
  const uploaded = await multipart.uploadPart(partNumber, body);

  const next = [...other, { partNumber, etag: uploaded.etag, size: body.byteLength }];
  next.sort((a, b) => a.partNumber - b.partNumber);

  await c.env.DB.prepare("UPDATE multipart_uploads SET parts_json = ? WHERE id = ?")
    .bind(JSON.stringify(next), uploadId)
    .run();

  return c.json({ ok: true, part_number: partNumber, etag: uploaded.etag, parts: next.length });
});

multipartRoutes.post("/api/v1/artifacts/multipart/:uploadId/complete", async (c) => {
  const device = c.get("device");
  if (!device) return c.json({ error: "missing_device_token" }, 401);

  const uploadId = c.req.param("uploadId");
  const session = await c.env.DB.prepare("SELECT * FROM multipart_uploads WHERE id = ?")
    .bind(uploadId)
    .first<MultipartRow>();
  if (!session || session.device_id !== device.id) return c.json({ error: "not_found" }, 404);
  if (session.expires_at <= Date.now()) return c.json({ error: "upload_expired" }, 410);

  const parts = JSON.parse(session.parts_json || "[]") as MultipartPart[];
  if (parts.length === 0) return c.json({ error: "no_parts" }, 400);

  const multipart = c.env.DATA.resumeMultipartUpload(session.r2_key, session.r2_upload_id);
  await multipart.complete(parts.map((p) => ({ partNumber: p.partNumber, etag: p.etag })));

  const exp = expiresAt(session.retention_days);
  await insertArtifact(c.env.DB, {
    id: session.id,
    deviceId: session.device_id,
    accountId: session.account_id,
    title: session.title,
    filename: session.filename,
    mime: session.mime,
    sizeBytes: session.size_bytes,
    r2Key: session.r2_key,
    visibility: session.visibility,
    shareToken: session.share_token,
    expiresAt: exp,
    passwordHash: session.password_hash,
  });

  await consumeRateLimit(c.env.DB, session.rate_key);
  await c.env.DB.prepare("DELETE FROM multipart_uploads WHERE id = ?").bind(uploadId).run();

  return c.json(
    toUploadResponse(c.get("config").publicBaseUrl, {
      id: session.id,
      filename: session.filename,
      visibility: session.visibility,
      shareToken: session.share_token,
      expiresAt: exp,
      passwordHash: session.password_hash,
      mime: session.mime,
      sizeBytes: session.size_bytes,
      accountId: session.account_id,
    }),
  );
});

multipartRoutes.delete("/api/v1/artifacts/multipart/:uploadId", async (c) => {
  const device = c.get("device");
  if (!device) return c.json({ error: "missing_device_token" }, 401);

  const uploadId = c.req.param("uploadId");
  const session = await c.env.DB.prepare("SELECT * FROM multipart_uploads WHERE id = ?")
    .bind(uploadId)
    .first<MultipartRow>();
  if (!session || session.device_id !== device.id) return c.json({ error: "not_found" }, 404);

  try {
    const multipart = c.env.DATA.resumeMultipartUpload(session.r2_key, session.r2_upload_id);
    await multipart.abort();
  } catch {
    // already aborted / missing
  }
  await c.env.DB.prepare("DELETE FROM multipart_uploads WHERE id = ?").bind(uploadId).run();
  return c.json({ ok: true, aborted: true });
});
