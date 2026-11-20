import { describe, expect, it } from "vitest";
import { api, fakeAccessJwt, initDevice, tinyPng, uploadArtifact } from "../helpers";

async function mcpCall(
  token: string | undefined,
  name: string,
  args: Record<string, unknown> = {},
  id = 1,
) {
  return api("/mcp", {
    method: "POST",
    token,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id,
      method: "tools/call",
      params: { name, arguments: args },
    }),
  });
}

describe("MCP errors and list", () => {
  it("list_artifacts returns device uploads", async () => {
    const { token } = await initDevice();
    await uploadArtifact(token, { filename: "listed.png" });
    const res = await mcpCall(token, "list_artifacts");
    expect(res.status).toBe(200);
    const json = (await res.json()) as { result: { content: { text: string }[] } };
    const payload = JSON.parse(json.result.content[0]!.text) as {
      artifacts: { filename: string }[];
    };
    expect(payload.artifacts.some((a) => a.filename === "listed.png")).toBe(true);
  });

  it("ping and unknown method/tool", async () => {
    const ping = await api("/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "ping" }),
    });
    expect(ping.status).toBe(200);
    expect(await ping.json()).toMatchObject({ result: {} });

    const unknown = await api("/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 3, method: "nope" }),
    });
    const ujson = (await unknown.json()) as { error: { code: number } };
    expect(ujson.error.code).toBe(-32601);

    const { token } = await initDevice();
    const badTool = await mcpCall(token, "no_such_tool");
    expect(badTool.status).toBe(400);
  });

  it("upload_artifact requires token for content_base64", async () => {
    const b64 = Buffer.from(tinyPng()).toString("base64");
    const res = await mcpCall(undefined, "upload_artifact", {
      content_base64: b64,
      filename: "x.png",
      mime: "image/png",
    });
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { message: string } };
    expect(json.error.message).toMatch(/device token/i);
  });

  it("upload_artifact rejects invalid base64 and blocked mime", async () => {
    const { token } = await initDevice();
    const badB64 = await mcpCall(token, "upload_artifact", {
      content_base64: "!!!",
      filename: "x.png",
      mime: "image/png",
    });
    expect(badB64.status).toBe(400);
    const j1 = (await badB64.json()) as { error: { message: string } };
    expect(j1.error.message).toContain("invalid_base64");

    const badMime = await mcpCall(token, "upload_artifact", {
      content_base64: Buffer.from("hi").toString("base64"),
      filename: "x.exe",
      mime: "application/x-msdownload",
    });
    expect(badMime.status).toBe(400);
    const j2 = (await badMime.json()) as { error: { message: string } };
    expect(j2.error.message).toContain("mime_not_allowed");
  });

  it("upload_artifact private requires claimed device", async () => {
    const { token } = await initDevice();
    const res = await mcpCall(token, "upload_artifact", {
      content_base64: Buffer.from(tinyPng()).toString("base64"),
      filename: "priv.png",
      mime: "image/png",
      visibility: "private",
    });
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { message: string } };
    expect(json.error.message).toContain("private_requires_claimed_device");
  });

  it("upload_artifact curl fallback when only path given", async () => {
    const { token } = await initDevice();
    const res = await mcpCall(token, "upload_artifact", { path: "/tmp/shot.png" });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { result: { content: { text: string }[] } };
    expect(json.result.content[0]!.text).toContain("curl");
    expect(json.result.content[0]!.text).toContain("/tmp/shot.png");
  });

  it("upload_artifact rejects empty file", async () => {
    const { token } = await initDevice();
    const empty = await mcpCall(token, "upload_artifact", {
      content_base64: " ",
      filename: "empty.png",
      mime: "image/png",
    });
    expect(empty.status).toBe(400);
    expect(((await empty.json()) as { error: { message: string } }).error.message).toContain(
      "empty_file",
    );
  });

  it("upload_artifact rate limit returns error", async () => {
    const { token } = await initDevice();
    for (let i = 0; i < 5; i++) {
      const ok = await mcpCall(
        token,
        "upload_artifact",
        {
          content_base64: Buffer.from(tinyPng()).toString("base64"),
          filename: `r${i}.png`,
          mime: "image/png",
        },
        100 + i,
      );
      expect(ok.status).toBe(200);
    }
    const limited = await mcpCall(
      token,
      "upload_artifact",
      {
        content_base64: Buffer.from(tinyPng()).toString("base64"),
        filename: "blocked.png",
        mime: "image/png",
      },
      200,
    );
    expect(limited.status).toBe(400);
    expect(((await limited.json()) as { error: { message: string } }).error.message).toContain(
      "rate_limit_exceeded",
    );
  });
});
