import { describe, expect, it } from "vitest";
import { api, initDevice, tinyPng } from "../helpers";

describe("MCP upload", () => {
  it("upload_artifact with content_base64 stores file", async () => {
    const { token } = await initDevice();
    const b64 = Buffer.from(tinyPng()).toString("base64");
    const res = await api("/mcp", {
      method: "POST",
      token,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 10,
        method: "tools/call",
        params: {
          name: "upload_artifact",
          arguments: {
            content_base64: b64,
            filename: "mcp.png",
            mime: "image/png",
            title: "mcp upload",
          },
        },
      }),
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { result: { content: { text: string }[] } };
    const payload = JSON.parse(json.result.content[0]!.text) as {
      id: string;
      url: string;
      raw_url: string;
    };
    expect(payload.id).toMatch(/^art_/);
    expect(payload.url).toContain("/a/");

    const raw = await api(new URL(payload.raw_url).pathname);
    expect(raw.status).toBe(200);
  });

  it("link_device returns verify_url without external fetch", async () => {
    const { token } = await initDevice();
    const res = await api("/mcp", {
      method: "POST",
      token,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 11,
        method: "tools/call",
        params: { name: "link_device", arguments: {} },
      }),
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { result: { content: { text: string }[] } };
    const payload = JSON.parse(json.result.content[0]!.text) as { verify_url: string; link_code: string };
    expect(payload.link_code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(payload.verify_url).toContain("/link/");
  });
});
