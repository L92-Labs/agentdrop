import { describe, expect, it } from "vitest";
import {
  HTTPError,
  badRequest,
  errorHandler,
  notFound,
  serviceUnavailable,
} from "../../src/errors";
import { REQUEST_ID_VAR } from "../../src/logger";

function mockCtx() {
  return {
    get: (key: string) => (key === REQUEST_ID_VAR ? "test-req" : null),
    json: (body: unknown, status?: number) =>
      Response.json(body, { status: status ?? 200 }),
  };
}

describe("errors", () => {
  it("HTTPError carries status and code", () => {
    const err = new HTTPError(404, "missing", { code: "not_found" });
    expect(err.status).toBe(404);
    expect(err.code).toBe("not_found");
    expect(err.message).toBe("missing");
  });

  it("helpers create expected statuses", () => {
    expect(badRequest("bad").status).toBe(400);
    expect(notFound().status).toBe(404);
    expect(serviceUnavailable("down").status).toBe(503);
  });

  it("HTTPError derives code from status", () => {
    expect(new HTTPError(401, "no").code).toBe("unauthorized");
    expect(new HTTPError(403, "no").code).toBe("forbidden");
    expect(new HTTPError(405, "no").code).toBe("method_not_allowed");
    expect(new HTTPError(409, "no").code).toBe("conflict");
    expect(new HTTPError(500, "no").code).toBe("internal_error");
  });

  it("errorHandler returns envelope for HTTPError", async () => {
    const res = errorHandler(
      new HTTPError(400, "bad input", { details: { field: "x" } }),
      mockCtx() as never,
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as {
      ok: false;
      error: { code: string; message: string; details: unknown };
    };
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("bad_request");
    expect(body.error.message).toBe("bad input");
    expect(body.error.details).toEqual({ field: "x" });
  });

  it("errorHandler hides unhandled errors", async () => {
    const res = errorHandler(new Error("secret stack"), mockCtx() as never);
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("internal_error");
    expect(body.error.message).toBe("internal error");
  });
});
