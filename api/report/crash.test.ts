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
import { verifyRetractionToken } from "../../utilities/oauth-backend/src/crash-report-retraction-token.js";
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

/**
 * Retraction-token signing key (FR-074a). A literal: the seam exists so no env
 * var, App, or credential has to exist for these tests to run.
 */
const TEST_RETRACTION_SECRET = "test-only-retraction-secret";

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
 * Build a stub config that ROUTES by request rather than replaying a fixed
 * sequence, and records every call so a test can assert not just the outcome
 * but which GitHub calls were and were not made.
 *
 * Routing rather than sequencing matters here: the pipeline's call order grows
 * as branches land (the global-cap probe, then the dedupe lookup), and an
 * index-keyed stub silently re-points every assertion at the wrong call each
 * time one is added.
 */
function stubConfig(
  overrides: { create?: StubResponse; capProbe?: StubResponse } = {},
): CrashReportPipelineConfig & { calls: StubCall[] } {
  const calls: StubCall[] = [];
  return {
    getInstallationToken: () => Promise.resolve("tok_crash_test"),
    retractionSecret: TEST_RETRACTION_SECRET,
    fetch: (url, init): Promise<CrashReportFetchResponse> => {
      calls.push({
        url,
        method: init.method,
        body: init.body === undefined ? undefined : JSON.parse(init.body),
      });

      let r: StubResponse;
      if (init.method === "GET" && url.includes("since=")) {
        // Global-creation-cap probe — an empty repo by default.
        //
        // PAGED THE WAY GITHUB PAGES IT. A stub that ignored `per_page`/`page`
        // and handed back a whole fixture in one response is what let the probe's
        // original single-request form look tested while being unable to trip in
        // production: `per_page` is capped at 100 and the cap is 200 (FR-106).
        r = overrides.capProbe ?? { ok: true, status: 200, body: [] };
        if (Array.isArray(r.body)) {
          const perPage = Number(/per_page=(\d+)/.exec(url)?.[1] ?? "30");
          const page = Number(/[?&]page=(\d+)/.exec(url)?.[1] ?? "1");
          r = { ...r, body: r.body.slice((page - 1) * perPage, page * perPage) };
        }
      } else if (init.method === "POST" && /\/issues$/.test(url.split("?")[0] ?? "")) {
        r = overrides.create ?? createdIssue;
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

/** A successful `POST /issues` response. */
const createdIssue: StubResponse = {
  ok: true,
  status: 201,
  body: {
    number: 42,
    html_url: "https://github.com/keyboard-studio/crash-reports/issues/42",
  },
};

/** The recorded `POST …/issues` call, or undefined if creation never happened. */
function createCall(calls: StubCall[]): StubCall | undefined {
  return calls.find(
    (c) => c.method === "POST" && /\/issues$/.test(c.url.split("?")[0] ?? ""),
  );
}

// ---------------------------------------------------------------------------
// Method guard
// ---------------------------------------------------------------------------

describe("runCrashReportHandler — method guard", () => {
  it("returns 405 with Allow: POST for a GET", async () => {
    const req = new Request("https://app.example/report/crash", { method: "GET" });
    const res = await runCrashReportHandler(req, stubConfig());
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
    const config = stubConfig();
    await runCrashReportHandler(postReq(validBody()), null);
    expect(config.calls).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Body validation (400)
// ---------------------------------------------------------------------------

describe("runCrashReportHandler — body validation", () => {
  it("returns 400 for unparseable JSON", async () => {
    const res = await runCrashReportHandler(postReq("{not json"), stubConfig());
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_request" });
  });

  it("returns 400 when `message` is missing", async () => {
    const res = await runCrashReportHandler(
      postReq({ kind: "render", stackFrames: [] }),
      stubConfig(),
    );
    expect(res.status).toBe(400);
  });

  it("ignores a client-supplied `fingerprint` rather than honouring it (P0-1)", async () => {
    // The field does not exist in the schema, so it is stripped — the request
    // still succeeds, and the label is derived from the content.
    const config = stubConfig();
    const res = await runCrashReportHandler(
      postReq({ ...validBody(), fingerprint: "deadbeefcafe", title: "own title" }),
      config,
    );
    expect(res.status).toBe(200);

    const created = createCall(config.calls)?.body as { labels: string[]; title: string };
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
    const config = stubConfig();
    const res = await runCrashReportHandler(postReq(validBody()), config);

    expect(res.status).toBe(200);
    // `retractionToken` is asserted separately below — its value is a signature
    // over a timestamp, so pinning it here would make this a clock test.
    const filed = (await res.json()) as Record<string, unknown>;
    expect(filed).toMatchObject({
      issueUrl: "https://github.com/keyboard-studio/crash-reports/issues/42",
      issueNumber: 42,
      action: "created",
    });
  });

  it("hands back a retraction capability, not an issue number to name (FR-074a)", async () => {
    // Undo posts this token back and nothing else. Without it the retract route
    // would read its target off a request body, which on a public endpoint acting
    // on sequential issue numbers is an authorization hole (P0-6).
    const config = stubConfig();
    const res = await runCrashReportHandler(postReq(validBody()), config);
    const filed = (await res.json()) as { retractionToken?: string };

    expect(typeof filed.retractionToken).toBe("string");
    expect(
      verifyRetractionToken(filed.retractionToken as string, TEST_RETRACTION_SECRET),
    ).toEqual({ issueNumber: 42, action: "created" });
  });

  it("issues a token that does not verify under another key", async () => {
    const config = stubConfig();
    const res = await runCrashReportHandler(postReq(validBody()), config);
    const filed = (await res.json()) as { retractionToken: string };
    expect(verifyRetractionToken(filed.retractionToken, "someone-elses-key")).toBeNull();
  });

  it("targets keyboard-studio/crash-reports, a source constant (FR-089)", async () => {
    const config = stubConfig();
    await runCrashReportHandler(postReq(validBody()), config);
    expect(createCall(config.calls)?.url).toContain(
      "/repos/keyboard-studio/crash-reports/issues",
    );
    expect(createCall(config.calls)?.method).toBe("POST");
  });

  it("labels the issue crash/fp-<hash12> and nothing else", async () => {
    const config = stubConfig();
    await runCrashReportHandler(postReq(validBody()), config);
    const created = createCall(config.calls)?.body as { labels: string[] };
    expect(created.labels).toHaveLength(1);
    expect(created.labels[0]).toMatch(/^crash\/fp-[0-9a-f]{12}$/);
  });

  it("carries the fingerprint body trailer for auditability (FR-092)", async () => {
    const config = stubConfig();
    await runCrashReportHandler(postReq(validBody()), config);
    const created = createCall(config.calls)?.body as { body: string; labels: string[] };
    const hash = (created.labels[0] as string).replace("crash/fp-", "");
    expect(created.body).toContain(`<!-- crash-fingerprint: ${hash} -->`);
  });

  it("accepts a pre-mount body with no `kind` and no stackFrames (SC-018)", async () => {
    const config = stubConfig();
    const res = await runCrashReportHandler(
      postReq({
        message: "Studio bootstrap: #root element missing from index.html",
        stack: "requireRoot@assets/main-DLGH1X0S.js:3:11",
        appVersion: "0.1.0+a1b2c3d",
      }),
      config,
    );
    expect(res.status).toBe(200);
    const created = createCall(config.calls)?.body as { body: string };
    expect(created.body).toContain("`pre-mount`");
  });
});

// ---------------------------------------------------------------------------
// Global creation cap (FR-106, SC-016)
// ---------------------------------------------------------------------------

describe("runCrashReportHandler — global creation cap", () => {
  /** `n` issues all created inside the window. */
  function recentIssues(n: number) {
    const createdAt = new Date().toISOString();
    return Array.from({ length: n }, (_, i) => ({
      number: i + 1,
      html_url: `https://github.com/keyboard-studio/crash-reports/issues/${i + 1}`,
      state: "open",
      comments: 0,
      updated_at: createdAt,
      created_at: createdAt,
    }));
  }

  it("skips creation and returns 429 rate_limited once the cap is reached", async () => {
    // 200 creations arrive across two pages of 100, because that is the only way
    // GitHub can deliver them — see the paging note in the stub.
    const config = stubConfig({ capProbe: { ok: true, status: 200, body: recentIssues(200) } });
    const res = await runCrashReportHandler(postReq(validBody()), config);

    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "rate_limited" });
    expect(createCall(config.calls)).toBeUndefined();
  });

  it("reads a second page rather than stopping at GitHub's per_page ceiling", async () => {
    // The regression: `per_page` maxes out at 100 while the cap is 200, so a
    // single-request probe could never observe enough creations to fire and the
    // documented last line of defence was unreachable in production.
    const config = stubConfig({ capProbe: { ok: true, status: 200, body: recentIssues(200) } });
    await runCrashReportHandler(postReq(validBody()), config);

    const probes = config.calls.filter(
      (c) => c.method === "GET" && c.url.includes("since="),
    );
    expect(probes).toHaveLength(2);
    expect(probes.every((c) => c.url.includes("per_page=100"))).toBe(true);
    expect(probes.map((c) => /[?&]page=(\d+)/.exec(c.url)?.[1])).toEqual(["1", "2"]);
  });

  it("makes exactly one probe on a healthy tracker", async () => {
    // Pagination must not tax the normal path: a short page has nothing after it.
    const config = stubConfig({ capProbe: { ok: true, status: 200, body: recentIssues(3) } });
    await runCrashReportHandler(postReq(validBody()), config);

    expect(
      config.calls.filter((c) => c.method === "GET" && c.url.includes("since=")),
    ).toHaveLength(1);
  });

  it("sets Retry-After from the window, not a hard-coded literal", async () => {
    const config = stubConfig({ capProbe: { ok: true, status: 200, body: recentIssues(200) } });
    const res = await runCrashReportHandler(postReq(validBody()), config);
    // CRASH_REPORT_GLOBAL_CREATE_WINDOW_MS is 600_000.
    expect(res.headers.get("Retry-After")).toBe("600");
  });

  it("creates normally when the window is below the cap", async () => {
    const config = stubConfig({ capProbe: { ok: true, status: 200, body: recentIssues(199) } });
    const res = await runCrashReportHandler(postReq(validBody()), config);
    expect(res.status).toBe(200);
    expect(createCall(config.calls)).toBeDefined();
  });

  it("does not count issues merely UPDATED in the window against a creation cap", async () => {
    // `since=` filters on updated time, so a busy tracker returns issues that
    // were only commented on. Counting those would cap the route on comment
    // traffic rather than creation volume.
    const old = new Date(Date.now() - 86_400_000).toISOString();
    const touched = recentIssues(200).map((i) => ({ ...i, created_at: old }));
    const config = stubConfig({ capProbe: { ok: true, status: 200, body: touched } });
    const res = await runCrashReportHandler(postReq(validBody()), config);
    expect(res.status).toBe(200);
  });

  it("fails OPEN to creation when the cap probe itself errors", async () => {
    // A dropped report is worse than a duplicate — same posture as the dedupe
    // lookup (FR-096).
    const config = stubConfig({ capProbe: { ok: false, status: 500, body: {} } });
    const res = await runCrashReportHandler(postReq(validBody()), config);
    expect(res.status).toBe(200);
    expect(createCall(config.calls)).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Error mapping
// ---------------------------------------------------------------------------

describe("runCrashReportHandler — error mapping", () => {
  it("maps GitHub 403 to 502 submission_unavailable, naming no credential", async () => {
    const config = stubConfig({ create: { ok: false, status: 403, body: {} } });
    const res = await runCrashReportHandler(postReq(validBody()), config);
    expect(res.status).toBe(502);
    // Deliberately generic: a caller that could distinguish "wrong App" from
    // "missing issues:write" would be probing the App's configuration.
    expect(await res.json()).toEqual({ error: "submission_unavailable" });
  });

  it("maps GitHub 401 to 502 submission_unavailable", async () => {
    const config = stubConfig({ create: { ok: false, status: 401, body: {} } });
    const res = await runCrashReportHandler(postReq(validBody()), config);
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "submission_unavailable" });
  });

  it("maps any other non-ok to 502 upstream_error", async () => {
    const config = stubConfig({ create: { ok: false, status: 500, body: {} } });
    const res = await runCrashReportHandler(postReq(validBody()), config);
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "upstream_error" });
  });

  it("maps a token-mint failure to 502, not 500", async () => {
    const config: CrashReportPipelineConfig = {
      getInstallationToken: () => Promise.reject(new Error("mint failed")),
      retractionSecret: TEST_RETRACTION_SECRET,
      fetch: () => {
        throw new Error("must not be reached");
      },
    };
    const res = await runCrashReportHandler(postReq(validBody()), config);
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "submission_unavailable" });
  });
});
