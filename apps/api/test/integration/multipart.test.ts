import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { DEFAULT_LIMITS } from "../../src/limits";
import { UPLOAD } from "../../src/shared";
import { api, initDevice, tinyPng } from "../helpers";

describe("multipart uploads", () => {
  it("uploads via multipart (single part under 5MB is ok as last part)", async () => {
    const { token } = await initDevice();
    const payload = new Uint8Array(64 * 1024);
    payload.set(tinyPng(), 0);
    for (let i = tinyPng().length; i < payload.length; i++) payload[i] = i % 251;

    const start = await api("/api/v1/artifacts/multipart", {
      method: "POST",
      token,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filename: "chunk.bin",
        mime: "application/octet-stream",
        size_bytes: payload.byteLength,
      }),
    });
    expect(start.status).toBe(200);
    const { upload_id, part_size } = (await start.json()) as {
      upload_id: string;
      part_size: number;
    };
    expect(upload_id).toMatch(/^art_/);
    expect(part_size).toBe(UPLOAD.multipartPartBytes);

    const put = await api(`/api/v1/artifacts/multipart/${upload_id}/parts/1`, {
      method: "PUT",
      token,
      body: payload,
    });
    expect(put.status).toBe(200);

    const done = await api(`/api/v1/artifacts/multipart/${upload_id}/complete`, {
      method: "POST",
      token,
    });
    expect(done.status).toBe(200);
    const json = (await done.json()) as { id: string; raw_url: string; size_bytes: number };
    expect(json.id).toBe(upload_id);
    expect(json.size_bytes).toBe(payload.byteLength);

    const raw = await api(new URL(json.raw_url).pathname);
    expect(raw.status).toBe(200);
    expect((await raw.arrayBuffer()).byteLength).toBe(payload.byteLength);
  });

  it("rejects non-final parts under 5MB", async () => {
    const { token } = await initDevice();
    const start = await api("/api/v1/artifacts/multipart", {
      method: "POST",
      token,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filename: "big.bin",
        size_bytes: 12 * 1024 * 1024,
      }),
    });
    const { upload_id } = (await start.json()) as { upload_id: string };
    const tiny = await api(`/api/v1/artifacts/multipart/${upload_id}/parts/1`, {
      method: "PUT",
      token,
      body: new Uint8Array(1024),
    });
    expect(tiny.status).toBe(400);
  });

  it("rejects multipart over MAX_FILE_MB", async () => {
    const { token } = await initDevice();
    const res = await api("/api/v1/artifacts/multipart", {
      method: "POST",
      token,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filename: "big.mp4",
        size_bytes: DEFAULT_LIMITS.maxFileBytes + 1,
      }),
    });
    expect(res.status).toBe(413);
    const json = (await res.json()) as { error: string; max_bytes: number };
    expect(json.error).toBe("file_too_large");
    expect(json.max_bytes).toBe(DEFAULT_LIMITS.maxFileBytes);
  });

  it("direct upload limit stays under the Workers request limit", () => {
    expect(UPLOAD.maxBytesDirectUpload).toBeLessThan(100 * 1024 * 1024);
  });
});
