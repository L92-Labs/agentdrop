import { applyD1Migrations, env } from "cloudflare:test";
import { TEST_ACCESS_TEAM, testAccessCerts } from "./helpers";

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});

// Serve the test Access signing keys; pass every other request through.
const realFetch = globalThis.fetch;
beforeEach(() => {
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url === `${TEST_ACCESS_TEAM}/cdn-cgi/access/certs`) {
      return Response.json(await testAccessCerts());
    }
    return realFetch(input, init);
  });
});
