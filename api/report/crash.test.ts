// Handler-level tests for the /api/report/crash Vercel function (FR-136).
//
// Mirrors api/submit/managed-pr.test.ts in structure: only the HTTP glue is
// verified here — method guard, 503 not-configured, body validation, status
// mapping — with a stub config injected so no real env var, credential, App,
// or repository has to exist. The pipeline's own branching is tested in
// utilities/oauth-backend/src/crash-report-pipeline.test.ts.
//
// NO REAL NETWORK AND NO REAL TOKEN. That is the point of the seam: every
// server task for this feature is testable while the crash-reporting App and
// the keyboard-studio/crash-reports repository do not yet exist (Prerequisites
// 1-4 block the route's LIVE function, not its implementation).

import { describe, it, expect } from "vitest";
import { runCrashReportHandler } from "./crash.js";
import type {
  CrashReportPipelineConfig,
  CrashReportFetchResponse,
} from "../../utilities/oauth-backend/src/crash-report-pipeline.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal valid post-mount body: `kind` present, so frames are required. */
function validBody() {
  return {
    kind: "render" as const,
    message: "TypeError: Cannot read properties of undefined (reading 'exemplarSet')",
    stackFrames: [
      { function: "KeyEditor", modulePath: "assets/main-DLGH1X0S.js", line: 12, column: 40 },
    ],
    appVersion: "0.1.0+a1b2c3d",
  };
}

function postReq(body: unknown): Request {
  return new Request("https://app.example/report/crash", {
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
 * Build a stub config whose fetch returns the given responses in order and
 * records every call, so a test can assert not just the outcome but which
 * GitHub calls were and were not made.
 */
function stubConfig(
  responses: StubResponse[],
): CrashReportPipelineConfig & { calls: StubCall[] } {
  const calls: StubCall[] = [];
  let index = 0;
  return {
    getInstallationToken: () => Promise.resolve("tok_crash_test"),
    fetch: (url, init): Promise<CrashReportFetchResponse> => {
      calls.push({
        url,
        method: init.method,
        body: init.body === undefined ? undefined : JSON.parse(init.body),
      });
      const r = responses[index++] ?? { ok: true, status: 200, body: {} };
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

/** A successful `POST /issues` response. */
const createdIssue = {
  ok: true,
  status: 201,
  body: {
    number: 42,
    html_url: "https://github.com/keyboard-studio/crash-reports/issues/42",
  },
};

// ---------------------------------------------------------------------------
// Method guard
// ---------------------------------------------------------------------------

describe("runCrashReportHandler — method guard", () => {
  it("returns 405 with Allow: POST for a GET", async () => {
    const req = new Request("https://app.example/report/crash", { method: "GET" });
    const res = await runCrashReportHandler(req, stubConfig([]));
    expect(res.status).toBe(405);
    expect(res.headers.get("Allow")).toBe("POST");
    expect(await res.json()).toEqual({ error: "method_not_allowed" });
  });
});

// ---------------------------------------------------------------------------
// Not configured (503)
// ---------------------------------------------------------------------------

describe("runCrashReportHandler — not configured", () => {
  it("returns 503 reporting_not_configured when the crash App is absent", async () => {
    // `null` is the explicit test seam for "no config", distinct from
    // `undefined` which would mean "read the environment".
    const res = await runCrashReportHandler(postReq(validBody()), null);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "reporting_not_configured" });
  });

  it("makes no GitHub call at all when not configured", async () => {
    const config = stubConfig([createdIssue]);
    await runCrashReportHandler(postReq(validBody()), null);
    expect(config.calls).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Body validation (400)
// ---------------------------------------------------------------------------

describe("runCrashReportHandler — body validation", () => {
  it("returns 400 for unparseable JSON", async () => {
    const res = await runCrashReportHandler(postReq("{not json"), stubConfig([]));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_request" });
  });

  it("returns 400 when `message` is missing", async () => {
    const res = await runCrashReportHandler(
      postReq({ kind: "render", stackFrames: [] }),
      stubConfig([]),
    );
    expect(res.status).toBe(400);
  });

  it("ignores a client-supplied `fingerprint` rather than honouring it (P0-1)", async () => {
    // The field does not exist in the schema, so it is stripped — the request
    // still succeeds, and the label is derived from the content.
    const config = stubConfig([createdIssue]);
    const res = await runCrashReportHandler(
      postReq({ ...validBody(), fingerprint: "deadbeefcafe", title: "own title" }),
      config,
    );
    expect(res.status).toBe(200);

    const created = config.calls[0]?.body as { labels: string[]; title: string };
    expect(created.labels).not.toContain("crash/fp-deadbeefcafe");
    expect(created.title).not.toBe("own title");
    expect(created.title.startsWith("bug(studio): ")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Create path (200)
// ---------------------------------------------------------------------------

describe("runCrashReportHandler — create path", () => {
  it("files an issue and returns issueUrl / issueNumber / action", async () => {
    const config = stubConfig([createdIssue]);
    const res = await runCrashReportHandler(postReq(validBody()), config);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      issueUrl: "https://github.com/keyboard-studio/crash-reports/issues/42",
      issueNumber: 42,
      action: "created",
    });
  });

  it("targets keyboard-studio/crash-reports, a source constant (FR-089)", async () => {
    const config = stubConfig([createdIssue]);
    await runCrashReportHandler(postReq(validBody()), config);
    expect(config.calls[0]?.url).toContain(
      "/repos/keyboard-studio/crash-reports/issues",
    );
    expect(config.calls[0]?.method).toBe("POST");
  });

  it("labels the issue crash/fp-<hash12> and nothing else", async () => {
    const config = stubConfig([createdIssue]);
    await runCrashReportHandler(postReq(validBody()), config);
    const created = config.calls[0]?.body as { labels: string[] };
    expect(created.labels).toHaveLength(1);
    expect(created.labels[0]).toMatch(/^crash\/fp-[0-9a-f]{12}$/);
  });

  it("carries the fingerprint body trailer for auditability (FR-092)", async () => {
    const config = stubConfig([createdIssue]);
    await runCrashReportHandler(postReq(validBody()), config);
    const created = config.calls[0]?.body as { body: string; labels: string[] };
    const hash = (created.labels[0] as string).replace("crash/fp-", "");
    expect(created.body).toContain(`<!-- crash-fingerprint: ${hash} -->`);
  });

  it("accepts a pre-mount body with no `kind` and no stackFrames (SC-018)", async () => {
    const config = stubConfig([createdIssue]);
    const res = await runCrashReportHandler(
      postReq({
        message: "Studio bootstrap: #root element missing from index.html",
        stack: "requireRoot@assets/main-DLGH1X0S.js:3:11",
        appVersion: "0.1.0+a1b2c3d",
      }),
      config,
    );
    expect(res.status).toBe(200);
    const created = config.calls[0]?.body as { body: string };
    expect(created.body).toContain("`pre-mount`");
  });
});

// ---------------------------------------------------------------------------
// Error mapping
// ---------------------------------------------------------------------------

describe("runCrashReportHandler — error mapping", () => {
  it("maps GitHub 403 to 502 submission_unavailable, naming no credential", async () => {
    const config = stubConfig([{ ok: false, status: 403, body: {} }]);
    const res = await runCrashReportHandler(postReq(validBody()), config);
    expect(res.status).toBe(502);
    // Deliberately generic: a caller that could distinguish "wrong App" from
    // "missing issues:write" would be probing the App's configuration.
    expect(await res.json()).toEqual({ error: "submission_unavailable" });
  });

  it("maps GitHub 401 to 502 submission_unavailable", async () => {
    const config = stubConfig([{ ok: false, status: 401, body: {} }]);
    const res = await runCrashReportHandler(postReq(validBody()), config);
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "submission_unavailable" });
  });

  it("maps any other non-ok to 502 upstream_error", async () => {
    const config = stubConfig([{ ok: false, status: 500, body: {} }]);
    const res = await runCrashReportHandler(postReq(validBody()), config);
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "upstream_error" });
  });

  it("maps a token-mint failure to 502, not 500", async () => {
    const config: CrashReportPipelineConfig = {
      getInstallationToken: () => Promise.reject(new Error("mint failed")),
      fetch: () => {
        throw new Error("must not be reached");
      },
    };
    const res = await runCrashReportHandler(postReq(validBody()), config);
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "submission_unavailable" });
  });
});
