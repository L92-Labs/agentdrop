/**
 * Branding — the one file to edit to white-label this deployment.
 *
 * Everything user-facing in the Worker-rendered pages (name, copy, colors,
 * fonts) comes from here. Deployment settings and limits are Worker vars
 * (`wrangler.jsonc`, see src/limits.ts). See docs/CUSTOMIZING.md.
 */
export const BRAND = {
  /** Product name shown in the top bar and page titles. */
  name: "agentdrop",
  /** Default <meta name="description">. */
  description: "Artifact hosting for agent machines",
  /** Small text in the page footer. */
  footer: "artifact host · one token per machine",
  /** Landing page hero. */
  heroTitle: "Files from your agents, hosted properly.",
  heroLead:
    "Screenshots, HTML, PDFs, binaries — uploaded via curl or MCP. One bearer token per machine. Unlisted links by default.",
  /** Google Fonts stylesheet URL, or "" to use system fonts only. */
  fontsUrl:
    "https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,400&family=Fraunces:ital,opsz,wght@0,9..144,500;0,9..144,600;1,9..144,400&family=IBM+Plex+Mono:wght@400;500&display=swap",
  fonts: {
    display: "'Fraunces', Georgia, 'Times New Roman', serif",
    body: "'DM Sans', system-ui, sans-serif",
    mono: "'IBM Plex Mono', ui-monospace, monospace",
  },
  /** Dark theme palette (CSS colors). */
  colors: {
    bg: "#0c0b09",
    surface: "#151311",
    surface2: "#1c1916",
    border: "#2c2824",
    borderSoft: "#221f1c",
    text: "#f3ece4",
    textMuted: "#a69b90",
    textFaint: "#6b635c",
    accent: "#c8795a",
    accentHover: "#d4896a",
    accentDim: "rgba(200, 121, 90, 0.14)",
    accentOn: "#0c0b09",
    link: "#ddb89e",
    success: "#7aab82",
    warning: "#c9a04a",
    danger: "#c96a6a",
  },
} as const;
