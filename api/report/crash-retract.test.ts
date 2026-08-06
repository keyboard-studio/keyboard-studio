// Handler-level tests for the /api/report/crash-retract Vercel function
// (FR-074 – FR-077, FR-074a, FR-136).
//
// The sibling of api/report/crash.test.ts, and it exists because this route was
// shipping without one. It is a LIVE endpoint — wired at /report/crash/retract by
// vercel.json's rewrite and called by packages/studio/src/crash/send.ts's
// `retractCrashReport()` — and its HTTP glue was covered by nothing: no method
// guard test, no 503, no status mapping. Its structural twin next door had 24.
//
// Same seam, same discipline: only the glue is verified here, with a stub config
// injected so no real env var, credential, App, or repository has to exist. The
// pipeline's own retraction branching (close-and-comment for a created report,
// comment-delete for a commented one, never an issue delete) is asserted in
// utilities/oauth-backend/src/crash-report-dedupe.test.ts, and the token's own
// verification in crash-report-retraction-token.test.ts.

import { describe, it, expect } from "vitest";
import { runCrashRetractHandler } from "./crash-retract.js";
import { mintRetractionToken } from "../../utilities/oauth-backend/src/crash-report-retraction-token.js";
import type {
  CrashReportPipelineConfig,
  CrashReportFetchResponse,
} from "../../utilities/oauth-backend/src/crash-report-pipeline.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** The signing key the stub config verifies against. No env var involved. */
const SECRET = "test-only-retraction-secret";

/** A capability token for a report the server would have filed (FR-074a). */
function token(
  grant: {
    issueNumber: number;
    action: "created" | "commented" | "reopened";
    commentId?: number;
  } = { issueNumber: 42, action: "created" },
): string {
  return mintRetractionToken(grant, SECRET);
}

function postReq(body: unknown): Request {
  return new Request("https://app.example/report/crash/retract", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

interface StubResponse {
  ok?: boolean;
  status?: number;
  headers?: Record<string, string>;
  body?: unknown;
}

interface StubCall {
  url: string;
  method: string;
  body: unknown;
}

/**
 * Route by request rather than replaying a fixed sequence, matching
 * crash.test.ts. The retraction path makes two calls for a `"created"` report
 * (comment, then PATCH) and one for a `"commented"` one, so an index-keyed stub
 * would mean different assertions per case.
 */
function stubConfig(
  overrides: {
    comment?: StubResponse;
    patch?: StubResponse;
    del?: StubResponse;
  } = {},
): CrashReportPipelineConfig & { calls: StubCall[] } {
  const calls: StubCall[] = [];
  return {
    getInstallationToken: () => Promise.resolve("tok_crash_test"),
    retractionSecret: SECRET,
    fetch: (url, init): Promise<CrashReportFetchResponse> => {
      calls.push({
        url,
        method: init.method,
        body: init.body === undefined ? undefined : JSON.parse(init.body),
      });

      let r: StubResponse;
      if (init.method === "POST" && url.endsWith("/comments")) {
        r = overrides.comment ?? { ok: true, status: 201, body: { id: 7 } };
      } else if (init.method === "PATCH") {
        r = overrides.patch ?? { ok: true, status: 200, body: {} };
      } else if (init.method === "DELETE") {
        r = overrides.del ?? { ok: true, status: 204, body: {} };
      } else {
        r = { ok: true, status: 200, body: {} };
      }

      const body = r.body ?? {};
      return Promise.resolve({
        ok: r.ok ?? true,
        status: r.status ?? 200,
        statusText: "OK",
        headers: { get: (name: string) => r.headers?.[name] ?? null },
        json: () => Promise.resolve(body),
        text: () => Promise.resolve(JSON.stringify(body)),
      });
    },
    calls,
  };
}

const patchCalls = (calls: StubCall[]) => calls.filter((c) => c.method === "PATCH");
const commentCalls = (calls: StubCall[]) =>
  calls.filter((c) => c.method === "POST" && c.url.endsWith("/comments"));
const deleteCalls = (calls: StubCall[]) => calls.filter((c) => c.method === "DELETE");

// ---------------------------------------------------------------------------
// Method guard
// ---------------------------------------------------------------------------

describe("runCrashRetractHandler — method guard", () => {
  it("returns 405 with Allow: POST for a GET", async () => {
    const req = new Request("https://app.example/report/crash/retract", { method: "GET" });
    const res = await runCrashRetractHandler(req, stubConfig());
    expect(res.status).toBe(405);
    expect(res.headers.get("Allow")).toBe("POST");
    expect(await res.json()).toEqual({ error: "method_not_allowed" });
  });

  it("makes no GitHub call for a rejected method", async () => {
    // A GET that reached the pipeline would be a retraction triggered by a
    // link-preview crawler.
    const config = stubConfig();
    await runCrashRetractHandler(
      new Request("https://app.example/report/crash/retract", { method: "GET" }),
      config,
    );
    expect(config.calls).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Not configured (503)
// ---------------------------------------------------------------------------

describe("runCrashRetractHandler — not configured", () => {
  it("returns 503 reporting_not_configured when the crash App is absent", async () => {
    // `null` is the explicit "no config" seam, distinct from `undefined`, which
    // would mean "read the environment".
    const res = await runCrashRetractHandler(postReq({ retractionToken: token() }), null);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "reporting_not_configured" });
  });

  it("makes no GitHub call at all when not configured", async () => {
    const config = stubConfig();
    await runCrashRetractHandler(postReq({ retractionToken: token() }), null);
    expect(config.calls).toEqual([]);
  });

  it("shares the report route's kill switch — unsetting the App disables both", async () => {
    // Documented in the runbook: unset any CRASH_REPORT_APP_* var and redeploy.
    // If retraction stayed live while reporting went dark, the kill switch would
    // leave a public write path open.
    const res = await runCrashRetractHandler(postReq({ retractionToken: token() }), null);
    expect(res.status).toBe(503);
  });
});

// ---------------------------------------------------------------------------
// Body validation (400)
// ---------------------------------------------------------------------------

describe("runCrashRetractHandler — body validation", () => {
  it("returns 400 for unparseable JSON", async () => {
    const res = await runCrashRetractHandler(postReq("{not json"), stubConfig());
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_request" });
  });

  it("returns 400 when the token is missing entirely", async () => {
    const res = await runCrashRetractHandler(postReq({}), stubConfig());
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_request" });
  });

  it("returns 400 for an empty token string", async () => {
    const res = await runCrashRetractHandler(
      postReq({ retractionToken: "" }),
      stubConfig(),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for a token past the length cap", async () => {
    const res = await runCrashRetractHandler(
      postReq({ retractionToken: "x".repeat(3000) }),
      stubConfig(),
    );
    expect(res.status).toBe(400);
  });

  it("rejects a body that names an issue but carries no token (FR-074a)", async () => {
    // The pre-FR-074a request shape. This is the regression test for the P0: the
    // route must not accept a caller-named target, so the old body is now simply
    // an invalid request.
    const config = stubConfig();
    const res = await runCrashRetractHandler(
      postReq({ issueNumber: 42, action: "created", commentId: 7 }),
      config,
    );
    expect(res.status).toBe(400);
    expect(config.calls).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Authorization (403) — the P0 this route was missing
// ---------------------------------------------------------------------------

describe("runCrashRetractHandler — authorization", () => {
  it("returns 403 retraction_not_authorized for a forged token", async () => {
    const res = await runCrashRetractHandler(
      postReq({ retractionToken: "v1.YWJj.ZGVm" }),
      stubConfig(),
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "retraction_not_authorized" });
  });

  it("returns 403 for a token signed with someone else's key", async () => {
    const foreign = mintRetractionToken({ issueNumber: 42, action: "created" }, "other-key");
    const res = await runCrashRetractHandler(
      postReq({ retractionToken: foreign }),
      stubConfig(),
    );
    expect(res.status).toBe(403);
  });

  it("makes no GitHub call for an unauthorized request", async () => {
    // Rejected before the token mint, so a forgery flood costs nothing against
    // the App's rate budget.
    const config = stubConfig();
    await runCrashRetractHandler(postReq({ retractionToken: "forged" }), config);
    expect(config.calls).toEqual([]);
  });

  it("says the same thing for every rejection reason", async () => {
    // A caller that could tell "bad signature" from "expired" learns whether it
    // guessed the key.
    const bodies = await Promise.all(
      ["forged", "v1.YWJj.ZGVm", "v9.YWJj.ZGVm"].map(async (t) =>
        (await runCrashRetractHandler(postReq({ retractionToken: t }), stubConfig())).json(),
      ),
    );
    expect(new Set(bodies.map((b) => JSON.stringify(b))).size).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Success paths (200)
// ---------------------------------------------------------------------------

describe("runCrashRetractHandler — created report", () => {
  it("returns 200 with issueUrl / issueNumber / action", async () => {
    const res = await runCrashRetractHandler(
      postReq({ retractionToken: token({ issueNumber: 42, action: "created" }) }),
      stubConfig(),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      issueUrl: "https://github.com/keyboard-studio/crash-reports/issues/42",
      issueNumber: 42,
      action: "created",
    });
  });

  it("closes the issue and leaves a retraction comment", async () => {
    const config = stubConfig();
    await runCrashRetractHandler(
      postReq({ retractionToken: token({ issueNumber: 42, action: "created" }) }),
      config,
    );

    expect(commentCalls(config.calls)).toHaveLength(1);
    expect((patchCalls(config.calls)[0]?.body as { state: string }).state).toBe("closed");
  });

  it("issues no token of its own — retracting a retraction is not an operation", async () => {
    const res = await runCrashRetractHandler(
      postReq({ retractionToken: token({ issueNumber: 42, action: "created" }) }),
      stubConfig(),
    );
    expect(await res.json()).not.toHaveProperty("retractionToken");
  });

  it("targets keyboard-studio/crash-reports, a source constant (FR-089)", async () => {
    const config = stubConfig();
    await runCrashRetractHandler(
      postReq({ retractionToken: token({ issueNumber: 42, action: "created" }) }),
      config,
    );
    expect(config.calls[0]?.url).toContain("/repos/keyboard-studio/crash-reports/");
  });
});

describe("runCrashRetractHandler — commented report", () => {
  it("deletes only the comment the token names", async () => {
    const config = stubConfig();
    const res = await runCrashRetractHandler(
      postReq({
        retractionToken: token({ issueNumber: 42, action: "commented", commentId: 7 }),
      }),
      config,
    );

    expect(res.status).toBe(200);
    expect(deleteCalls(config.calls)).toHaveLength(1);
    expect(deleteCalls(config.calls)[0]?.url).toContain("/issues/comments/7");
  });

  it("never touches the issue's state — the bug belongs to everyone who hit it", async () => {
    const config = stubConfig();
    await runCrashRetractHandler(
      postReq({
        retractionToken: token({ issueNumber: 42, action: "commented", commentId: 7 }),
      }),
      config,
    );
    expect(patchCalls(config.calls)).toHaveLength(0);
  });

  it("is a non-fatal 200 when the token carries no comment id", async () => {
    // Better to leave the report standing than to guess which comment to remove.
    const config = stubConfig();
    const res = await runCrashRetractHandler(
      postReq({ retractionToken: token({ issueNumber: 42, action: "commented" }) }),
      config,
    );
    expect(res.status).toBe(200);
    expect(deleteCalls(config.calls)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Error mapping — the same vocabulary as the report route (FR-088)
// ---------------------------------------------------------------------------

describe("runCrashRetractHandler — error mapping", () => {
  it("maps GitHub 403 to 502 submission_unavailable, naming no credential", async () => {
    const config = stubConfig({ comment: { ok: false, status: 403, body: {} } });
    const res = await runCrashRetractHandler(
      postReq({ retractionToken: token() }),
      config,
    );
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "submission_unavailable" });
  });

  it("maps GitHub 401 to 502 submission_unavailable", async () => {
    const config = stubConfig({ comment: { ok: false, status: 401, body: {} } });
    const res = await runCrashRetractHandler(
      postReq({ retractionToken: token() }),
      config,
    );
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "submission_unavailable" });
  });

  it("maps GitHub 429 to 429 rate_limited with Retry-After from the header", async () => {
    const config = stubConfig({
      comment: { ok: false, status: 429, headers: { "Retry-After": "42" }, body: {} },
    });
    const res = await runCrashRetractHandler(
      postReq({ retractionToken: token() }),
      config,
    );
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("42");
    expect(await res.json()).toEqual({ error: "rate_limited" });
  });

  it("maps any other non-ok to 502 upstream_error", async () => {
    const config = stubConfig({ comment: { ok: false, status: 500, body: {} } });
    const res = await runCrashRetractHandler(
      postReq({ retractionToken: token() }),
      config,
    );
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "upstream_error" });
  });

  it("does not close the issue when the retraction comment failed", async () => {
    // Closing without the explanatory comment leaves a maintainer with a closed
    // issue and no reason for it.
    const config = stubConfig({ comment: { ok: false, status: 500, body: {} } });
    await runCrashRetractHandler(postReq({ retractionToken: token() }), config);
    expect(patchCalls(config.calls)).toHaveLength(0);
  });

  it("maps a token-mint failure to 502, not 500", async () => {
    const config: CrashReportPipelineConfig = {
      getInstallationToken: () => Promise.reject(new Error("mint failed")),
      retractionSecret: SECRET,
      fetch: () => {
        throw new Error("must not be reached");
      },
    };
    const res = await runCrashRetractHandler(
      postReq({ retractionToken: token() }),
      config,
    );
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "submission_unavailable" });
  });

  it("maps a network throw to 502 submission_unavailable", async () => {
    const config: CrashReportPipelineConfig = {
      getInstallationToken: () => Promise.resolve("tok"),
      retractionSecret: SECRET,
      fetch: () => Promise.reject(new Error("ECONNRESET")),
    };
    const res = await runCrashRetractHandler(
      postReq({ retractionToken: token() }),
      config,
    );
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "submission_unavailable" });
  });
});
