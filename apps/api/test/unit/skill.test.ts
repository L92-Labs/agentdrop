import { describe, expect, it } from "vitest";
import { loadConfig, type AppEnv } from "../../src/config";
import { setupPrompt, skillMarkdown } from "../../src/lib/skill";

describe("skill", () => {
  const base = "http://localhost";

  it("skillMarkdown includes frontmatter and base URL", () => {
    const md = skillMarkdown(loadConfig({ PUBLIC_BASE_URL: base, MAX_FILE_MB: "50" } as AppEnv));
    expect(md).toMatch(/^---\nname: agentdrop/);
    expect(md).toContain(base);
    expect(md).toContain("upload_artifact");
    expect(md).toContain("Markdown + local images");
    expect(md).toContain("agentdrop upload ./report.md");
    expect(md).toContain("Limits on this instance");
    expect(md).toContain("Max file: **50MB**");
    expect(md).toContain("private links are unavailable");
    expect(md).toContain("share rotate");
    expect(md).toContain("agentdrop expires");
    expect(md).toContain("set_expiry");
  });

  it("setupPrompt references skill.md and token path", () => {
    const prompt = setupPrompt(base);
    expect(prompt).toContain(`${base}/skill.md`);
    expect(prompt).toContain("~/.agents/skills/agentdrop/SKILL.md");
    expect(prompt).toContain("/api/v1/device/init");
  });
});
