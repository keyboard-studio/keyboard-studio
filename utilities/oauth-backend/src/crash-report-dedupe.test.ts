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
  RETRACTION_COMMENT,
  retractCrashReport,
  checkGlobalCreateCap,
  CRASH_REPORT_GLOBAL_CREATE_CAP,
  CRASH_REPORT_CREATE_PROBE_PER_PAGE,
  CRASH_REPORT_CREATE_PROBE_MAX_PAGES,
  type GitHubCalls,
  computeFingerprint,
  fingerprintLabel,
  type CrashReportFetchResponse,
  type CrashReportPipelineConfig,
  type GitHubIssue,
} from "./crash-report-pipeline.js";
import {
  mintRetractionToken,
  CRASH_RETRACTION_TOKEN_TTL_MS,
} from "./crash-report-retraction-token.js";
import type { CrashReportBody } from "./crash-report-schemas.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const NOW = Date.parse("2026-08-05T12:00:00.000Z");

/**
 * Signing key for retraction tokens in these tests.
 *
 * A literal, not the real derived key: the point of taking the secret through
 * the pipeline config is that no env var and no App private key has to exist for
 * the retraction path to be exercised (FR-136).
 */
const TEST_SECRET = "test-only-retraction-secret";

/** A capability token for a report the pipeline "filed" at NOW. */
function token(grant: {
  issueNumber: number;
  action: "created" | "commented" | "reopened";
  commentId?: number;
}): string {
  return mintRetractionToken(grant, TEST_SECRET, NOW);
}

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
    retractionSecret: TEST_SECRET,
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
// Burst behaviour — the shape the criteria actually state (SC-016, SC-017)
// ---------------------------------------------------------------------------

describe("bursts", () => {
  it("50 distinct fingerprints at the global cap create nothing (SC-016)", async () => {
    // The single-request cap test proves the branch; this proves the property
    // under the load it exists for. A cap that leaks one creation per request
    // would pass the former and fail this.
    const atCap = Array.from({ length: 200 }, (_, i) => ({
      ...issue({ number: i + 1 }),
      created_at: minutesAgo(1),
    }));
    const config = stub({ lookup: [] });
    // Re-point the cap probe at a full window — PAGED THE WAY GITHUB PAGES IT.
    //
    // Slicing by `page`/`per_page` rather than returning all 200 in one response
    // is what makes this test load-bearing. A stub that ignores those params
    // hands back a page no real API could produce, and under it the single-request
    // form of this check passed while being unable to trip at all in production:
    // `per_page` is capped at 100 by GitHub and the cap is 200.
    const base = config.fetch;
    config.fetch = (url, init) => {
      if (init.method !== "GET" || !url.includes("since=")) return base(url, init);
      const perPage = Number(/per_page=(\d+)/.exec(url)?.[1] ?? "30");
      const page = Number(/[?&]page=(\d+)/.exec(url)?.[1] ?? "1");
      const slice = atCap.slice((page - 1) * perPage, page * perPage);
      return Promise.resolve({
        ok: true,
        status: 200,
        statusText: "OK",
        headers: { get: () => null },
        json: () => Promise.resolve(slice),
        text: () => Promise.resolve(""),
      });
    };

    const results = [];
    for (let i = 0; i < 50; i += 1) {
      results.push(
        await submitCrashReport(
          { ...body(), message: `distinct failure number ${i}` },
          config,
          NOW,
        ),
      );
    }

    expect(createCalls(config.calls)).toHaveLength(0);
    expect(results.every((r) => !r.ok && r.status === 429)).toBe(true);
  });

  it("50 requests against a closed issue reopen it exactly once (SC-017)", async () => {
    // Without the cooldown this is 50 reopen-plus-label calls — a
    // publicly-triggerable write amplification, since a closed issue's content
    // is public and anyone can replay it.
    let reopened = false;
    const closed = () =>
      issue({
        state: "closed",
        updated_at: reopened ? new Date(NOW).toISOString() : minutesAgo(120),
        labels: reopened
          ? [
              { name: fingerprintLabel(computeFingerprint(body()).fingerprint) },
              { name: REGRESSION_LABEL },
            ]
          : [{ name: fingerprintLabel(computeFingerprint(body()).fingerprint) }],
      });

    const calls: Call[] = [];
    const config: CrashReportPipelineConfig & { calls: Call[] } = {
      getInstallationToken: () => Promise.resolve("tok"),
      retractionSecret: TEST_SECRET,
      fetch: (url, init) => {
        calls.push({
          url,
          method: init.method,
          body: init.body === undefined ? undefined : JSON.parse(init.body),
        });
        const respond = (payload: unknown): Promise<CrashReportFetchResponse> =>
          Promise.resolve({
            ok: true,
            status: 200,
            statusText: "OK",
            headers: { get: () => null },
            json: () => Promise.resolve(payload),
            text: () => Promise.resolve(""),
          });
        if (init.method === "GET" && url.includes("labels=")) return respond([closed()]);
        if (init.method === "GET") return respond([]);
        if (init.method === "PATCH") {
          // The reopen lands: subsequent lookups see regression + a fresh
          // updated_at, which is what the cooldown reads.
          reopened = true;
          return respond({});
        }
        return respond({ id: 1 });
      },
      calls,
    };

    for (let i = 0; i < 50; i += 1) {
      await submitCrashReport(body(), config, NOW);
    }

    expect(patchCalls(calls)).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Retraction (FR-075, FR-076, FR-077, SC-012)
// ---------------------------------------------------------------------------

describe("retraction", () => {
  const deleteCalls = (calls: Call[]) => calls.filter((c) => c.method === "DELETE");

  it("closes the issue and adds a retraction comment for a created report", async () => {
    const config = stub();
    const result = await retractCrashReport(
      { retractionToken: token({ issueNumber: 42, action: "created" }) },
      config,
      NOW,
    );

    expect(commentCalls(config.calls)).toHaveLength(1);
    expect(commentCalls(config.calls)[0]?.body).toEqual({ body: RETRACTION_COMMENT });
    const patch = patchCalls(config.calls)[0];
    expect((patch?.body as { state: string }).state).toBe("closed");
    expect(result.ok).toBe(true);
  });

  it("never deletes the ISSUE — an installation token cannot", async () => {
    const config = stub();
    await retractCrashReport(
      { retractionToken: token({ issueNumber: 42, action: "created" }) },
      config,
      NOW,
    );

    const issueDeletes = deleteCalls(config.calls).filter(
      (c) => !c.url.includes("/comments/"),
    );
    expect(issueDeletes).toEqual([]);
  });

  it("deletes only this session's comment for a commented report", async () => {
    const config = stub();
    await retractCrashReport(
      {
        retractionToken: token({ issueNumber: 42, action: "commented", commentId: 7 }),
      },
      config,
      NOW,
    );

    const deletes = deleteCalls(config.calls);
    expect(deletes).toHaveLength(1);
    expect(deletes[0]?.url).toContain("/issues/comments/7");
  });

  it("never touches the issue's state when retracting a comment", async () => {
    // The issue belongs to everyone who hit that bug; one person withdrawing
    // their report must not close it for the rest.
    const config = stub();
    await retractCrashReport(
      {
        retractionToken: token({ issueNumber: 42, action: "commented", commentId: 7 }),
      },
      config,
      NOW,
    );
    expect(patchCalls(config.calls)).toHaveLength(0);
  });

  it("adds no comment when retracting a comment", async () => {
    const config = stub();
    await retractCrashReport(
      {
        retractionToken: token({ issueNumber: 42, action: "commented", commentId: 7 }),
      },
      config,
      NOW,
    );
    expect(commentCalls(config.calls)).toHaveLength(0);
  });

  it("is a non-fatal no-op when no comment id is known", async () => {
    const config = stub();
    const result = await retractCrashReport(
      { retractionToken: token({ issueNumber: 42, action: "commented" }) },
      config,
      NOW,
    );

    // Better to leave the report standing than to guess which comment to remove.
    expect(deleteCalls(config.calls)).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it("treats a reopened report as a comment retraction", async () => {
    // The reopen is a fact about the bug recurring, not about this author's
    // report, so it stands.
    const config = stub();
    await retractCrashReport(
      {
        retractionToken: token({ issueNumber: 42, action: "reopened", commentId: 9 }),
      },
      config,
      NOW,
    );
    expect(patchCalls(config.calls)).toHaveLength(0);
    expect(deleteCalls(config.calls)).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Retraction authorization (FR-074a, P0-6)
// ---------------------------------------------------------------------------
//
// The property under test is NOT "a valid token works" — the cases above cover
// that. It is that NOTHING ELSE works. This endpoint is public and acts on a
// repository whose issue numbers are sequential and guessable, so every case
// below was, before the capability token, a way for an anonymous caller to close
// or mutate a crash report belonging to someone else.

describe("retraction authorization", () => {
  const deleteCalls = (calls: Call[]) => calls.filter((c) => c.method === "DELETE");

  /** Every write this route can make, in one list. */
  const writeCalls = (calls: Call[]) => calls.filter((c) => c.method !== "GET");

  it("rejects a request carrying no usable token", async () => {
    const config = stub();
    const result = await retractCrashReport({ retractionToken: "" }, config, NOW);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(403);
      expect(result.error).toBe("retraction_not_authorized");
    }
  });

  it("makes NO GitHub call for an unauthorized request", async () => {
    // Verified before the token mint, so a forgery flood costs nothing against
    // the App's 5,000/hr budget.
    const config = stub();
    await retractCrashReport({ retractionToken: "forged" }, config, NOW);
    expect(config.calls).toEqual([]);
  });

  it("rejects a token signed with a different key", async () => {
    const config = stub();
    const foreign = mintRetractionToken(
      { issueNumber: 42, action: "created" },
      "not-the-server-secret",
      NOW,
    );
    const result = await retractCrashReport({ retractionToken: foreign }, config, NOW);

    expect(result.ok).toBe(false);
    expect(writeCalls(config.calls)).toEqual([]);
  });

  it("rejects a token whose payload was edited to point at another issue", async () => {
    // The attack the old body-driven form made trivial: retract issue 1 instead
    // of your own 42. Re-encoding the payload invalidates the MAC.
    const original = token({ issueNumber: 42, action: "created" });
    const [version, payload, mac] = original.split(".");
    const decoded = JSON.parse(
      Buffer.from(payload as string, "base64url").toString("utf8"),
    ) as { i: number };
    decoded.i = 1;
    const tampered = [
      version,
      Buffer.from(JSON.stringify(decoded), "utf8").toString("base64url"),
      mac,
    ].join(".");

    const config = stub();
    const result = await retractCrashReport({ retractionToken: tampered }, config, NOW);

    expect(result.ok).toBe(false);
    expect(writeCalls(config.calls)).toEqual([]);
  });

  it("rejects a token past its TTL", async () => {
    // The first server-side time bound this route has had. Before it, a captured
    // request body stayed replayable indefinitely.
    const config = stub();
    const result = await retractCrashReport(
      { retractionToken: token({ issueNumber: 42, action: "created" }) },
      config,
      NOW + CRASH_RETRACTION_TOKEN_TTL_MS + 1,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(403);
    expect(config.calls).toEqual([]);
  });

  it("acts on the comment the TOKEN names, never one named alongside it", async () => {
    const config = stub();
    await retractCrashReport(
      {
        retractionToken: token({ issueNumber: 42, action: "commented", commentId: 7 }),
        // Leftovers from the pre-FR-074a body shape. zod strips them on the
        // wire; the pipeline does not read them here either.
        ...({ issueNumber: 1, commentId: 999 } as Record<string, never>),
      },
      config,
      NOW,
    );

    const deletes = deleteCalls(config.calls);
    expect(deletes).toHaveLength(1);
    expect(deletes[0]?.url).toContain("/issues/comments/7");
    expect(deletes[0]?.url).not.toContain("/999");
  });
});

// ---------------------------------------------------------------------------
// The token the report hands out (FR-074a)
// ---------------------------------------------------------------------------

describe("retraction token issuance", () => {
  it("accompanies a created report and retracts it end to end", async () => {
    // The round trip, because the two halves are only useful together: a token
    // the report mints that the retract path rejects is worse than no token.
    const config = stub({ lookup: [] });
    const filed = await submitCrashReport(body(), config, NOW);
    expect(filed.ok).toBe(true);
    if (!filed.ok) return;

    expect(filed.data.retractionToken).toBeDefined();

    const retracted = await retractCrashReport(
      { retractionToken: filed.data.retractionToken as string },
      stub(),
      NOW,
    );
    expect(retracted.ok).toBe(true);
  });

  it("accompanies a flood-controlled report too", async () => {
    // A report whose comment was skipped by the cap still told the author a
    // report was sent, so Undo must still work for it — withholding the token
    // would make the affordance vanish in exactly that case.
    const config = stub({ lookup: [issue({ comments: CRASH_REPORT_COMMENT_CAP })] });
    const filed = await submitCrashReport(body(), config, NOW);
    expect(filed.ok && filed.data.retractionToken !== undefined).toBe(true);
  });

  it("binds the comment id, so Undo removes that comment and no other", async () => {
    const config = stub({ lookup: [issue({ updated_at: minutesAgo(120) })] });
    const filed = await submitCrashReport(body(), config, NOW);
    expect(filed.ok && filed.data.commentId).toBe(7);
    if (!filed.ok) return;

    const target = stub();
    await retractCrashReport(
      { retractionToken: filed.data.retractionToken as string },
      target,
      NOW,
    );
    const deletes = target.calls.filter((c) => c.method === "DELETE");
    expect(deletes[0]?.url).toContain("/issues/comments/7");
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

// ---------------------------------------------------------------------------
// Global creation cap — pagination (FR-106, SC-016)
// ---------------------------------------------------------------------------
//
// WHY THESE TEST checkGlobalCreateCap DIRECTLY rather than through
// submitCrashReport: the bug being pinned here is arithmetic between two
// constants and GitHub's own page ceiling, and it is invisible end-to-end. The
// original form asked for `per_page=100` and tripped at 200, so it could never
// observe enough creations to fire — the documented "last line of defence" was
// unreachable in production while every route-level test passed, because a stub
// fetch happily returns a 200-element page no real API would.
//
// So these drive the probe with a page-honouring fake and assert on the page
// requests themselves.

describe("global creation cap — pagination", () => {
  /** `n` issues, all created inside the window. */
  function created(n: number): GitHubIssue[] {
    return Array.from({ length: n }, (_, i) => ({
      ...issue({ number: i + 1 }),
      created_at: minutesAgo(1),
    })) as GitHubIssue[];
  }

  /**
   * A `GitHubCalls` whose cap probe pages exactly as GitHub's does: `per_page`
   * is honoured, and `page` past the end returns an empty array.
   */
  function pagingCalls(all: GitHubIssue[]): GitHubCalls & { pages: number[] } {
    const pages: number[] = [];
    const notUsed = (): never => {
      throw new Error("cap probe must not make any other call");
    };
    return {
      pages,
      listCreatedSince: (_since, page) => {
        pages.push(page);
        const perPage = CRASH_REPORT_CREATE_PROBE_PER_PAGE;
        const slice = all.slice((page - 1) * perPage, page * perPage);
        return Promise.resolve({
          ok: true,
          status: 200,
          statusText: "OK",
          headers: { get: () => null },
          json: () => Promise.resolve(slice),
          text: () => Promise.resolve(""),
        });
      },
      listByLabel: notUsed,
      createIssue: notUsed,
      addComment: notUsed,
      patchIssue: notUsed,
      deleteComment: notUsed,
    };
  }

  it("asks for no more than GitHub's per_page ceiling", async () => {
    // Asking for 200 would look like it worked and silently return 100.
    expect(CRASH_REPORT_CREATE_PROBE_PER_PAGE).toBeLessThanOrEqual(100);
  });

  it("reads enough pages to be able to reach the cap at all", async () => {
    // The regression this file exists to prevent: a page budget below
    // ceil(cap / per_page) makes the cap unsatisfiable arithmetic.
    expect(
      CRASH_REPORT_CREATE_PROBE_MAX_PAGES * CRASH_REPORT_CREATE_PROBE_PER_PAGE,
    ).toBeGreaterThanOrEqual(CRASH_REPORT_GLOBAL_CREATE_CAP);
  });

  it("trips at the cap when the creations span more than one page", async () => {
    const gh = pagingCalls(created(CRASH_REPORT_GLOBAL_CREATE_CAP));
    const result = await checkGlobalCreateCap(gh, NOW);

    expect(result).not.toBeNull();
    expect(result?.ok).toBe(false);
    if (result && !result.ok) expect(result.status).toBe(429);
    // Two pages of 100 to observe 200 — the whole point.
    expect(gh.pages).toEqual([1, 2]);
  });

  it("does not trip one creation below the cap", async () => {
    const gh = pagingCalls(created(CRASH_REPORT_GLOBAL_CREATE_CAP - 1));
    expect(await checkGlobalCreateCap(gh, NOW)).toBeNull();
  });

  it("makes exactly ONE request on a healthy tracker", async () => {
    // Pagination must not tax the normal path. A short page means there is no
    // page after it, so the probe stops without asking.
    const gh = pagingCalls(created(3));
    expect(await checkGlobalCreateCap(gh, NOW)).toBeNull();
    expect(gh.pages).toEqual([1]);
  });

  it("stops at a full page that contributes no in-window creations", async () => {
    // `since=` filters on UPDATED time, so a busy tracker returns a full page of
    // old issues merely commented on. Ordered created-descending, those sort
    // behind every in-window creation — so a page with none means later pages
    // have none either, and paging on would be pure waste.
    const old = Array.from({ length: CRASH_REPORT_CREATE_PROBE_PER_PAGE * 2 }, (_, i) => ({
      ...issue({ number: i + 1 }),
      created_at: minutesAgo(1_440),
    })) as GitHubIssue[];
    const gh = pagingCalls(old);

    expect(await checkGlobalCreateCap(gh, NOW)).toBeNull();
    expect(gh.pages).toEqual([1]);
  });

  it("never reads past its page budget", async () => {
    // A flood far beyond the cap must not turn the probe into its own flood.
    const gh = pagingCalls(created(CRASH_REPORT_CREATE_PROBE_PER_PAGE * 10));
    await checkGlobalCreateCap(gh, NOW);
    expect(gh.pages.length).toBeLessThanOrEqual(CRASH_REPORT_CREATE_PROBE_MAX_PAGES);
  });

  it("fails OPEN when a later page errors", async () => {
    // Same posture as the dedupe lookup (FR-096): a dropped crash report is
    // worse than a duplicate issue.
    const all = created(CRASH_REPORT_GLOBAL_CREATE_CAP);
    const gh = pagingCalls(all);
    const paged = gh.listCreatedSince;
    gh.listCreatedSince = (since, page) =>
      page === 2
        ? Promise.resolve({
            ok: false,
            status: 500,
            statusText: "Server Error",
            headers: { get: () => null },
            json: () => Promise.resolve({}),
            text: () => Promise.resolve(""),
          })
        : paged(since, page);

    expect(await checkGlobalCreateCap(gh, NOW)).toBeNull();
  });
});
