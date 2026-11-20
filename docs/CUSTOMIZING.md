# Customizing Agentdrop

| What | Where | Needs code change? |
|------|-------|--------------------|
| Limits, retention, rate limits | Worker variables (see the [README](../README.md#configure)) | No |
| Domain, CORS, Access, Turnstile, enroll token | Worker variables and secrets ([SELF_HOSTING.md](SELF_HOSTING.md)) | No |
| Name, landing copy, colors, fonts | `apps/api/src/brand.ts` | One file |
| Page layout and styles | `apps/api/src/lib/ui.ts`, `ui-css.ts` | Yes |
| CLI name | `packages/cli` | Yes |

## Branding: `apps/api/src/brand.ts`

```ts
export const BRAND = {
  name: "acme drop",
  description: "File sharing for ACME's agents",
  footer: "ACME internal · contact it@acme.example",
  heroTitle: "Your agents' files, one link away.",
  heroLead: "Upload from any machine with one token. Share links with your team.",
  fontsUrl: "",                       // "" = system fonts, no Google Fonts request
  fonts: { display: "system-ui, sans-serif", body: "system-ui, sans-serif", mono: "ui-monospace, monospace" },
  colors: { accent: "#2f6fed", accentHover: "#4a83f0", accentDim: "rgba(47,111,237,0.14)", /* … */ },
};
```

The name and copy appear in every page title, the top bar, the footer, the
landing page and the agent skill (`/skill.md`). The colors become the CSS
variables that every page uses. The UI is dark-only, so keep `bg` and
`surface` dark and `text` light.

If you deployed with the button, edit the file in the repository it created.
Each push redeploys.

## Limits

The limits are Worker variables, read by `apps/api/src/limits.ts`. A variable
that is missing or invalid falls back to its default. For the limits marked
"unlimited" in the table, `0` means no limit. The landing page, `/skill.md`
and `agentdrop status` all show the values in effect.

The "owner" of an upload is the linked account if the device is linked, and
the device itself otherwise. Storage and file-count limits are counted per
owner, over files that haven't expired yet.

There are two fixed transport limits, and you shouldn't need to change them.
Files over 95 MB are sent through multipart upload, which keeps each request
under Cloudflare's 100 MB request limit. Multipart parts are 8 MB. Both are set
in `apps/api/src/shared.ts`.

## Renaming the CLI

The CLI is called `agentdrop` and keeps its token in `~/.agentdrop/`. To ship
it under another name:

1. Change `bin` in `packages/cli/package.json`.
2. Change `CONFIG_DIR` and the usage text in `packages/cli/bin/agentdrop.js`.
3. Update the command and path hints shown to agents in
   `apps/api/src/lib/skill.ts`, `ui.ts` and `routes/device.ts`.

Most deployments keep the CLI name and change only `BRAND.name`.

## Adding features

Read [AGENTS.md](../AGENTS.md) and [CONTRIBUTING.md](../CONTRIBUTING.md).
Routes live in `apps/api/src/routes/*` and are mounted in `src/index.ts`.
Schema changes go in a new `apps/api/migrations/NNNN_*.sql` file; deploying
applies it.
