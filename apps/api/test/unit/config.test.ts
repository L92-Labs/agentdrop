import { describe, expect, it } from "vitest";
import { loadConfig, missingSecrets, type AppEnv } from "../../src/config";

describe("config", () => {
  it("loadConfig parses cors origins and trims base URL", () => {
    const env = {
      CORS_ORIGINS: "https://a.com, https://b.com",
      PUBLIC_BASE_URL: "http://localhost/",
    } as AppEnv;

    const cfg = loadConfig(env);
    expect(cfg.publicBaseUrl).toBe("http://localhost");
    expect(cfg.corsOrigins.has("https://a.com")).toBe(true);
    expect(cfg.corsOrigins.has("https://b.com")).toBe(true);
  });

  it("missingSecrets reports an unset TOKEN_PEPPER", () => {
    expect(missingSecrets({})).toEqual(["TOKEN_PEPPER"]);
    expect(missingSecrets({ TOKEN_PEPPER: "" })).toEqual(["TOKEN_PEPPER"]);
    expect(missingSecrets({ TOKEN_PEPPER: "x" })).toEqual([]);
  });
});
