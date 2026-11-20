import { describe, expect, it } from "vitest";
import { api, initDevice } from "../helpers";

describe("MCP", () => {
  it("initialize returns server info", async () => {
    const res = await api("/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize" }),
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { result: { serverInfo: { name: string } } };
    expect(json.result.serverInfo.name).toBe("agentdrop");
  });

  it("tools/list returns upload_artifact", async () => {
    const res = await api("/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }),
    });
    const json = (await res.json()) as { result: { tools: { name: string }[] } };
    const names = json.result.tools.map((t) => t.name);
    expect(names).toContain("upload_artifact");
    expect(names).toContain("device_status");
  });

  it("device_status requires bearer token", async () => {
    const { token } = await initDevice();
    const res = await api("/mcp", {
      method: "POST",
      token,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name: "device_status", arguments: {} },
      }),
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { result: { content: { text: string }[] } };
    const payload = JSON.parse(json.result.content[0]!.text) as { device_id: string; tier: string };
    expect(payload.device_id).toMatch(/^dvc_/);
    expect(payload.tier).toBe("cold");
  });
});
