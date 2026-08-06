// Dedupe branching: comment, reopen, cooldowns, and rate limiting
// (spec 060 US2 — FR-090, FR-094, FR-095, FR-095a, FR-096, FR-098, FR-102,
// FR-104, SC-002, SC-017).
//
// Every assertion here is about WHICH CALLS ARE MADE, not just what comes back.
// That is deliberate: the failure modes this story guards against are almost
// all invisible in the response. An open match that also PATCHes itself open
// still returns 200 — while silently bumping `updated_at` and corrupting the
// comment cooldown it just read. A suppressed reopen that returns the right
// shape but still wrote the label is a churn bug that looks like a pass.
//
// So the stub records every request and the tests assert on the call log.

import { describe, it, expect } from "vitest";
import {
  submitCrashReport,
  CRASH_REPORT_COMMENT_CAP,
  CRASH_REPORT_COMMENT_COOLDOWN_MS,
  CRASH_REPORT_REOPEN_COOLDOWN_MS,
  REGRESSION_LABEL,
  computeFingerprint,
  fingerprintLabel,
  type CrashReportFetchResponse,
  type CrashReportPipelineConfig,
  type GitHubIssue,
} from "./crash-report-pipeline.js";
import type { CrashReportBody } from "./crash-report-schemas.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const NOW = Date.parse("2026-08-05T12:00:00.000Z");

function body(): CrashReportBody {
  return {
    kind: "render",
    message: "TypeError: Cannot read properties of undefined (reading 'keys')",
    stackFrames: [
      { function: "KeyEditor", modulePath: "assets/main-DLGH1X0S.js", line: 1, column: 2 },
    ],
    appVersion: "0.1.0+a1b2c3d",
  };
}

/** Minutes before NOW, as an ISO timestamp. */
function minutesAgo(n: number): string {
  return new Date(NOW - n * 60_000).toISOString();
}

function issue(overrides: Partial<GitHubIssue> = {}): GitHubIssue {
  return {
    number: 42,
    html_url: "https://github.com/keyboard-studio/crash-reports/issues/42",
    state: "open",
    comments: 0,
    updated_at: minutesAgo(60),
    labels: [{ name: fingerprintLabel(computeFingerprint(body()).fingerprint) }],
    ...overrides,
  };
}

interface Call {
  url: string;
  method: string;
  body: unknown;
}

interface StubOptions {
  /** Issues the label lookup returns. Empty array = no match. */
  lookup?: GitHubIssue[] | "error";
  /** Override the reopen PATCH response. */
  patch?: Partial<CrashReportFetchResponse>;
  /** Override the comment POST response. */
  comment?: Partial<CrashReportFetchResponse> & { headers?: Record<string, string> };
}

function stub(options: StubOptions = {}): CrashReportPipelineConfig & {
  calls: Call[];
} {
  const calls: Call[] = [];
  return {
    getInstallationToken: () => Promise.resolve("tok_crash_test"),
    fetch: (url, init): Promise<CrashReportFetchResponse> => {
      calls.push({
        url,
        method: init.method,
        body: init.body === undefined ? undefined : JSON.parse(init.body),
      });

      const respond = (
        payload: unknown,
        over: Partial<CrashReportFetchResponse> & {
          headers?: Record<string, string>;
        } = {},
      ): Promise<CrashReportFetchResponse> =>
        Promise.resolve({
          ok: over.ok ?? true,
          status: over.status ?? 200,
          statusText: "OK",
          headers: {
            get: (name: string) =>
              (over.headers as Record<string, string> | undefined)?.[name] ?? null,
          },
          json: () => Promise.resolve(payload),
          text: () => Promise.resolve(JSON.stringify(payload)),
        });

      if (init.method === "GET" && url.includes("labels=")) {
        if (options.lookup === "error") {
          return respond({}, { ok: false, status: 500 });
        }
        return respond(options.lookup ?? []);
      }
      if (init.method === "GET" && url.includes("since=")) {
        return respond([]); // global cap probe: empty repo
      }
      if (init.method === "PATCH") {
        return respond({}, options.patch ?? {});
      }
      if (init.method === "POST" && url.endsWith("/comments")) {
        return respond({ id: 7 }, options.comment ?? { status: 201 });
      }
      // Create.
      return respond(
        { number: 99, html_url: "https://github.com/keyboard-studio/crash-reports/issues/99" },
        { status: 201 },
      );
    },
    calls,
  };
}

const lookupCalls = (calls: Call[]) =>
  calls.filter((c) => c.method === "GET" && c.url.includes("labels="));
const patchCalls = (calls: Call[]) => calls.filter((c) => c.method === "PATCH");
const commentCalls = (calls: Call[]) =>
  calls.filter((c) => c.method === "POST" && c.url.endsWith("/comments"));
const createCalls = (calls: Call[]) =>
  calls.filter((c) => c.method === "POST" && /\/issues$/.test(c.url.split("?")[0] ?? ""));

// ---------------------------------------------------------------------------
// Lookup (FR-090, FR-091)
// ---------------------------------------------------------------------------

describe("dedupe lookup", () => {
  it("looks up by the fingerprint label on the ordinary issues endpoint", async () => {
    const config = stub();
    await submitCrashReport(body(), config, NOW);

    const lookup = lookupCalls(config.calls)[0];
    expect(lookup).toBeDefined();
    const { fingerprint } = computeFingerprint(body());
    expect(lookup?.url).toContain(encodeURIComponent(`crash/fp-${fingerprint}`));
    expect(lookup?.url).toContain("state=all");
  });

  it("never calls the search API", async () => {
    // Indexing lag would miss a recurrence seconds after the first report —
    // the normal case — and its 30/min shared limit would cap the whole route.
    const config = stub();
    await submitCrashReport(body(), config, NOW);
    expect(config.calls.some((c) => c.url.includes("/search/"))).toBe(false);
  });

  it("fails OPEN to creation when the lookup errors (FR-096)", async () => {
    const config = stub({ lookup: "error" });
    const result = await submitCrashReport(body(), config, NOW);

    expect(result.ok).toBe(true);
    expect(createCalls(config.calls)).toHaveLength(1);
    if (result.ok) expect(result.data.action).toBe("created");
  });
});

// ---------------------------------------------------------------------------
// Open match — comment, never a state change (FR-094, SC-002)
// ---------------------------------------------------------------------------

describe("open match", () => {
  it("comments rather than creating", async () => {
    const config = stub({ lookup: [issue()] });
    const result = await submitCrashReport(body(), config, NOW);

    expect(createCalls(config.calls)).toHaveLength(0);
    expect(commentCalls(config.calls)).toHaveLength(1);
    expect(result.ok && result.data.action).toBe("commented");
    expect(result.ok && result.data.issueNumber).toBe(42);
  });

  it("makes NO state-change call at all on an open issue", async () => {
    // A PATCH setting state:"open" on an already-open issue bumps updated_at,
    // corrupting the comment cooldown that was just read from it.
    const config = stub({ lookup: [issue()] });
    await submitCrashReport(body(), config, NOW);
    expect(patchCalls(config.calls)).toHaveLength(0);
  });

  it("100 repeats create zero extra issues (SC-002)", async () => {
    const config = stub({ lookup: [issue()] });
    for (let i = 0; i < 100; i += 1) {
      await submitCrashReport(body(), config, NOW);
    }
    expect(createCalls(config.calls)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Comment cap and cooldown (FR-102, FR-104)
// ---------------------------------------------------------------------------

describe("comment cap and cooldown", () => {
  it("skips the comment at the cap but still returns 200 commented", async () => {
    const config = stub({ lookup: [issue({ comments: CRASH_REPORT_COMMENT_CAP })] });
    const result = await submitCrashReport(body(), config, NOW);

    expect(commentCalls(config.calls)).toHaveLength(0);
    expect(result.ok).toBe(true);
    expect(result.ok && result.data.action).toBe("commented");
  });

  it("skips the comment inside the cooldown", async () => {
    const recent = new Date(NOW - CRASH_REPORT_COMMENT_COOLDOWN_MS / 2).toISOString();
    const config = stub({ lookup: [issue({ updated_at: recent })] });
    await submitCrashReport(body(), config, NOW);
    expect(commentCalls(config.calls)).toHaveLength(0);
  });

  it("comments once the cooldown has elapsed", async () => {
    const old = new Date(NOW - CRASH_REPORT_COMMENT_COOLDOWN_MS - 1_000).toISOString();
    const config = stub({ lookup: [issue({ updated_at: old })] });
    await submitCrashReport(body(), config, NOW);
    expect(commentCalls(config.calls)).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Closed match — reopen (FR-095, FR-095a, SC-017)
// ---------------------------------------------------------------------------

describe("closed match", () => {
  it("reopens with the regression label and comments", async () => {
    const config = stub({
      lookup: [issue({ state: "closed", updated_at: minutesAgo(120) })],
    });
    const result = await submitCrashReport(body(), config, NOW);

    const patch = patchCalls(config.calls)[0];
    expect(patch).toBeDefined();
    expect((patch?.body as { state: string }).state).toBe("open");
    expect((patch?.body as { labels: string[] }).labels).toContain(REGRESSION_LABEL);
    expect(commentCalls(config.calls)).toHaveLength(1);
    expect(result.ok && result.data.action).toBe("reopened");
  });

  it("reopens regardless of comment-cap state (FR-095a)", async () => {
    // A reopen is a rare, distinct event. The comment cap bounds chatter on a
    // busy OPEN issue and must not silently swallow a regression signal.
    const config = stub({
      lookup: [
        issue({
          state: "closed",
          updated_at: minutesAgo(120),
          comments: CRASH_REPORT_COMMENT_CAP + 5,
        }),
      ],
    });
    const result = await submitCrashReport(body(), config, NOW);

    expect(patchCalls(config.calls)).toHaveLength(1);
    expect(result.ok && result.data.action).toBe("reopened");
  });

  it("reopens on the FIRST hit after a close, even seconds later (SC-017)", async () => {
    // The maintainer's own close set updated_at to now. Reading updated_at
    // alone would call this "inside the cooldown" and drop the single most
    // valuable report the tracker can receive.
    const config = stub({
      lookup: [issue({ state: "closed", updated_at: new Date(NOW - 5_000).toISOString() })],
    });
    const result = await submitCrashReport(body(), config, NOW);

    expect(patchCalls(config.calls)).toHaveLength(1);
    expect(result.ok && result.data.action).toBe("reopened");
  });

  it("suppresses a repeat reopen inside the cooldown, non-fatally", async () => {
    // Already carries `regression`, so this pipeline reopened it before; a
    // second reopen within the window is churn, not signal.
    const config = stub({
      lookup: [
        issue({
          state: "closed",
          updated_at: new Date(NOW - CRASH_REPORT_REOPEN_COOLDOWN_MS / 2).toISOString(),
          labels: [
            { name: fingerprintLabel(computeFingerprint(body()).fingerprint) },
            { name: REGRESSION_LABEL },
          ],
        }),
      ],
    });
    const result = await submitCrashReport(body(), config, NOW);

    expect(patchCalls(config.calls)).toHaveLength(0);
    expect(commentCalls(config.calls)).toHaveLength(0);
    // Same non-fatal shape a capped comment returns (P0-A).
    expect(result.ok).toBe(true);
    expect(result.ok && result.data.action).toBe("commented");
    expect(result.ok && result.data.issueNumber).toBe(42);
  });

  it("reopens a previously-reopened issue once the cooldown has elapsed", async () => {
    const config = stub({
      lookup: [
        issue({
          state: "closed",
          updated_at: new Date(NOW - CRASH_REPORT_REOPEN_COOLDOWN_MS - 1_000).toISOString(),
          labels: [
            { name: fingerprintLabel(computeFingerprint(body()).fingerprint) },
            { name: REGRESSION_LABEL },
          ],
        }),
      ],
    });
    const result = await submitCrashReport(body(), config, NOW);
    expect(patchCalls(config.calls)).toHaveLength(1);
    expect(result.ok && result.data.action).toBe("reopened");
  });

  it("preserves the fingerprint label when adding regression", async () => {
    const config = stub({
      lookup: [issue({ state: "closed", updated_at: minutesAgo(120) })],
    });
    await submitCrashReport(body(), config, NOW);

    const { fingerprint } = computeFingerprint(body());
    const labels = (patchCalls(config.calls)[0]?.body as { labels: string[] }).labels;
    expect(labels).toContain(fingerprintLabel(fingerprint));
    expect(labels).toContain(REGRESSION_LABEL);
  });
});

// ---------------------------------------------------------------------------
// Rate limiting (FR-098)
// ---------------------------------------------------------------------------

describe("GitHub 429", () => {
  it("surfaces as 429 rate_limited with Retry-After from the header", async () => {
    const config = stub({
      lookup: [issue({ updated_at: minutesAgo(120) })],
      comment: { ok: false, status: 429, headers: { "Retry-After": "120" } },
    });
    const result = await submitCrashReport(body(), config, NOW);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(429);
      expect(result.error).toBe("rate_limited");
      expect(result.retryAfterSeconds).toBe(120);
    }
  });

  it("defaults Retry-After to 60 when the header is absent", async () => {
    const config = stub({
      lookup: [issue({ updated_at: minutesAgo(120) })],
      comment: { ok: false, status: 429 },
    });
    const result = await submitCrashReport(body(), config, NOW);
    expect(!result.ok && result.retryAfterSeconds).toBe(60);
  });

  it("defaults Retry-After to 60 when the header is non-numeric", async () => {
    const config = stub({
      lookup: [issue({ updated_at: minutesAgo(120) })],
      comment: { ok: false, status: 429, headers: { "Retry-After": "soon" } },
    });
    const result = await submitCrashReport(body(), config, NOW);
    expect(!result.ok && result.retryAfterSeconds).toBe(60);
  });
});
