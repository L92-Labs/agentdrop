import { describe, expect, it } from "vitest";
import { renderMarkdown } from "../../src/lib/markdown";

describe("renderMarkdown", () => {
  it("renders headings, links, and absolute images", () => {
    const html = renderMarkdown(
      `# Title\n\nSee [doc](/a/art_1) and ![shot](https://cdn.example/a.png)\n\n![local](./x.png)`,
    );
    expect(html).toContain("<h1>");
    expect(html).toContain('href="/a/art_1"');
    expect(html).toContain('src="https://cdn.example/a.png"');
    // bare relative: show alt text, do not emit an img src
    expect(html).not.toContain('src="./x.png"');
    expect(html).toContain("local");
  });

  it("blocks javascript urls", () => {
    const html = renderMarkdown(`[x](javascript:alert(1))`);
    expect(html).not.toContain("javascript:");
    expect(html).toContain("x");
  });

  it("makes closed and unterminated code fences focusable, labelled regions", () => {
    const html = renderMarkdown("```\na\n```\n\ntext\n\n```\nunterminated");
    expect(html).toContain('<pre class="md-code" tabindex="0" role="region" aria-label="Code block 1">');
    expect(html).toContain('<pre class="md-code" tabindex="0" role="region" aria-label="Code block 2">');
  });

  it("restarts code block numbering on every render", () => {
    renderMarkdown("```\na\n```");
    expect(renderMarkdown("```\nb\n```")).toContain('aria-label="Code block 1"');
  });
});
