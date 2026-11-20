import { esc } from "./ui-esc";

/**
 * Minimal safe Markdown → HTML for agent notes.
 * Supports headings, lists, code, links, images, bold/italic, paragraphs.
 * Relative image URLs are resolved against `imageBase` (e.g. sibling /r/art_x/).
 */
export function renderMarkdown(src: string, opts: { imageBase?: string } = {}): string {
  const imageBase = (opts.imageBase ?? "").replace(/\/?$/, "/");
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let inCode = false;
  let codeBuf: string[] = [];
  let listType: "ul" | "ol" | null = null;
  let codeBlocks = 0;
  // Scrollable code blocks are keyboard-focusable regions with a unique label.
  const codeBlock = (code: string): string =>
    `<pre class="md-code" tabindex="0" role="region" aria-label="Code block ${++codeBlocks}"><code>${esc(code)}</code></pre>`;

  const closeList = () => {
    if (listType) {
      out.push(`</${listType}>`);
      listType = null;
    }
  };

  const inline = (text: string): string => {
    let t = esc(text);
    t = t.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (_m, alt, url) => {
      const href = resolveUrl(String(url), imageBase);
      if (!href) return esc(String(alt || url));
      return `<img src="${esc(href)}" alt="${esc(String(alt))}" loading="lazy"/>`;
    });
    t = t.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (_m, label, url) => {
      const href = resolveUrl(String(url), imageBase);
      if (!href) return esc(String(label));
      return `<a href="${esc(href)}" rel="noopener noreferrer">${esc(String(label))}</a>`;
    });
    t = t.replace(/`([^`]+)`/g, (_m, code) => `<code>${esc(String(code))}</code>`);
    t = t.replace(/\*\*([^*]+)\*\*/g, (_m, inner) => `<strong>${inner}</strong>`);
    t = t.replace(/\*([^*]+)\*/g, (_m, inner) => `<em>${inner}</em>`);
    return t;
  };

  for (const raw of lines) {
    if (raw.startsWith("```")) {
      if (inCode) {
        out.push(codeBlock(codeBuf.join("\n")));
        codeBuf = [];
        inCode = false;
      } else {
        closeList();
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      codeBuf.push(raw);
      continue;
    }

    if (/^\s*$/.test(raw)) {
      closeList();
      continue;
    }

    const heading = raw.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      closeList();
      const level = heading[1]!.length;
      out.push(`<h${level}>${inline(heading[2]!)}</h${level}>`);
      continue;
    }

    const ul = raw.match(/^[-*+]\s+(.*)$/);
    if (ul) {
      if (listType !== "ul") {
        closeList();
        listType = "ul";
        out.push("<ul>");
      }
      out.push(`<li>${inline(ul[1]!)}</li>`);
      continue;
    }

    const ol = raw.match(/^\d+\.\s+(.*)$/);
    if (ol) {
      if (listType !== "ol") {
        closeList();
        listType = "ol";
        out.push("<ol>");
      }
      out.push(`<li>${inline(ol[1]!)}</li>`);
      continue;
    }

    closeList();
    out.push(`<p>${inline(raw)}</p>`);
  }

  if (inCode) out.push(codeBlock(codeBuf.join("\n")));
  closeList();
  return `<div class="md-body">${out.join("\n")}</div>`;
}

function resolveUrl(url: string, imageBase: string): string | null {
  const u = url.trim();
  if (!u || /^javascript:/i.test(u)) return null;
  if (/^https?:\/\//i.test(u) || u.startsWith("data:image/") || u.startsWith("/")) return u;
  if (u.startsWith("#")) return u;
  // Bare relative paths are rewritten by the CLI before upload (local assets → /r/…).
  // Do not map them onto this artifact's /r/:id/ (that would serve the .md bytes as an image).
  if (imageBase && (u.startsWith("./") || u.startsWith("../"))) {
    return `${imageBase}${u.replace(/^\.\//, "")}`;
  }
  return null;
}
