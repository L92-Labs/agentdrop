import { describe, expect, it } from "vitest";
import {
  artifactUrls,
  bearerToken,
  formatBytes,
  sanitizeMime,
  withinLimit,
} from "../../src/lib/device";

describe("device helpers", () => {
  it("bearerToken parses Authorization header", () => {
    expect(bearerToken("Bearer dev_abc")).toBe("dev_abc");
    expect(bearerToken("bearer dev_abc")).toBeNull();
    expect(bearerToken(undefined)).toBeNull();
    expect(bearerToken("Bearer ")).toBeNull();
    expect(bearerToken("Bearer   ")).toBeNull();
  });

  it("sanitizeMime blocks executables", () => {
    expect(sanitizeMime("application/x-msdownload", "evil.exe")).toBeNull();
    expect(sanitizeMime("application/x-executable", "bin")).toBeNull();
    expect(sanitizeMime("text/plain", "run.bat")).toBeNull();
    expect(sanitizeMime("text/plain", "run.cmd")).toBeNull();
    expect(sanitizeMime("application/octet-stream", "hack.ps1")).toBeNull();
    expect(sanitizeMime("image/png", "ok.png")).toBe("image/png");
    expect(sanitizeMime("", "file.bin")).toBe("application/octet-stream");
  });

  it("sanitizeMime infers type from extension for agent uploads", () => {
    expect(sanitizeMime("", "clip.mp4")).toBe("video/mp4");
    expect(sanitizeMime("application/octet-stream", "notes.json")).toBe("application/json");
    expect(sanitizeMime("", "demo.webm")).toBe("video/webm");
    expect(sanitizeMime("", "track.mp3")).toBe("audio/mpeg");
    expect(sanitizeMime("", "report.pdf")).toBe("application/pdf");
    expect(sanitizeMime("", "bundle.zip")).toBe("application/zip");
    expect(sanitizeMime("video/mp4", "clip.mp4")).toBe("video/mp4");
  });

  it("artifactUrls builds viewer and raw paths", () => {
    const urls = artifactUrls("http://localhost", "art_1", "a b.png");
    expect(urls.url).toBe("http://localhost/a/art_1");
    expect(urls.raw_url).toBe("http://localhost/r/art_1/a%20b.png");
    const secret = artifactUrls("http://localhost", "art_1", "x.png", { shareToken: "sec_ab" });
    expect(secret.url).toContain("?s=sec_ab");
  });

  it("formatBytes and withinLimit", () => {
    expect(formatBytes(500)).toBe("500 B");
    expect(formatBytes(2048)).toContain("KB");
    expect(formatBytes(2 * 1024 * 1024)).toContain("MB");
    expect(formatBytes(2 * 1024 * 1024 * 1024)).toContain("GB");
    expect(withinLimit(100, 50, 200)).toBe(true);
    expect(withinLimit(100, 50, 0)).toBe(true);
    expect(withinLimit(100, 50, 140)).toBe(false);
  });
});
