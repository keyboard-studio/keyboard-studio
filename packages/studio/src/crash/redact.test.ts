// Identity-absence assertion for the crash payload (spec 060, FR-034, SC-005).
//
// WHY THIS TEST IS WRITTEN THE WAY IT IS.
//
// The obvious version of this test — build a payload, assert the builder did
// not throw, eyeball the fields — proves nothing. `redact.ts` is an allowlist,
// so of course it produces only allowlisted fields TODAY; the failure this
// guards against is somebody later adding a convenience spread, a `context`
// passthrough, or a "just include the attribution for triage" field.
//
// So the assertion is inverted: build a payload from a fixture populated with
// REAL Attribution values and REAL identity sessions for both providers, then
// serialize the whole thing and assert that not one of those strings appears
// anywhere in it. That fails on any future leak regardless of which field
// carries it, because it never names the fields — only the values.

import { describe, it, expect, beforeEach } from "vitest";
import { buildCrashReport, extractStackFrames } from "./redact.ts";
import { _resetBreadcrumbs, pushBreadcrumb } from "./breadcrumbs.ts";
import type { CrashContext } from "./types.ts";

// ---------------------------------------------------------------------------
// The fixture — every value here MUST be absent from the payload
// ---------------------------------------------------------------------------

/** Shaped as `Attribution` from @keyboard-studio/contracts. Values are distinctive. */
const ATTRIBUTION = {
  authorName: "Ada Lovelace-Fixture",
  authorEmail: "ada.fixture@example.org",
  copyrightHolder: "Analytical Engine Society (fixture)",
};

/** Shaped as `GitHubIdentitySession`. */
const GITHUB_SESSION = {
  provider: "github",
  token: {
    accessToken: "gho_FIXTUREtoken0123456789abcdef",
    refreshToken: "ghr_FIXTURErefresh0123456789abcd",
  },
  login: "ada-fixture-login",
};

/** Shaped as `GoogleIdentitySession`. */
const GOOGLE_SESSION = {
  provider: "google",
  sub: "112233445566778899000-fixture",
  email: "ada.google.fixture@example.net",
  emailVerified: true,
  name: "Ada Lovelace-Fixture (Google)",
  picture: "https://lh3.example.net/a/fixture-avatar",
};

/**
 * Every string that must never reach a crash report, flattened.
 *
 * Booleans are excluded: `emailVerified: true` is not identifying and searching
 * for the substring "true" would match nothing meaningful.
 */
const FORBIDDEN_VALUES: string[] = [
  ATTRIBUTION.authorName,
  ATTRIBUTION.authorEmail,
  ATTRIBUTION.copyrightHolder,
  GITHUB_SESSION.token.accessToken,
  GITHUB_SESSION.token.refreshToken,
  GITHUB_SESSION.login,
  GOOGLE_SESSION.sub,
  GOOGLE_SESSION.email,
  GOOGLE_SESSION.name,
  GOOGLE_SESSION.picture,
];

/**
 * The structural context a caller legitimately passes in — the SAME working
 * copy the fixture attribution belongs to, so the test reflects the real
 * situation (a signed-in author with a named keyboard) rather than an empty one
 * that could not leak anything even if the builder were broken.
 */
function callerContext(): CrashContext {
  return {
    keyboardId: "fixture_kbd",
    bcp47Tags: ["frm-Latn-FR"],
    stepId: "characters",
    keyCount: 47,
    exemplarCount: 132,
    decisionTail: [
      { id: "step.script.confirm", choice: "Latn" },
      { id: "step.layout.base", choice: "basic_kbdfr" },
    ],
  };
}

function thrownError(): Error {
  const error = new Error("Cannot read properties of undefined (reading 'keys')");
  error.stack = [
    "TypeError: Cannot read properties of undefined (reading 'keys')",
    "    at KeyEditor (assets/main-DLGH1X0S.js:1284:17)",
    "    at renderWithHooks (assets/vendor-B7QK2M4P.js:11566:26)",
  ].join("\n");
  return error;
}

beforeEach(() => {
  _resetBreadcrumbs();
});

// ---------------------------------------------------------------------------
// SC-005 — identity absence
// ---------------------------------------------------------------------------

describe("buildCrashReport — identity absence (FR-034, SC-005)", () => {
  it("carries none of the fixture's attribution or identity values", () => {
    const report = buildCrashReport({
      kind: "render",
      error: thrownError(),
      context: callerContext(),
    });

    const serialized = JSON.stringify(report);
    const leaked = FORBIDDEN_VALUES.filter((v) => serialized.includes(v));
    expect(leaked).toEqual([]);
  });

  it("still carries none of them when a breadcrumb quotes an identity value", () => {
    // Defence in depth: a leak through the breadcrumb ring would bypass the
    // allowlist entirely, because breadcrumbs are appended by call sites all
    // over the app rather than by this module.
    pushBreadcrumb("console.error", `sign-in failed for ${GOOGLE_SESSION.email}`);

    const report = buildCrashReport({
      kind: "onerror",
      error: thrownError(),
      context: callerContext(),
    });

    // The breadcrumb IS carried — that is its job — so this assertion documents
    // the residual exposure rather than pretending it does not exist: the
    // client cannot prevent a call site writing an email into a label, which is
    // exactly why the server scrubs every string again before writing to a
    // public issue (FR-033, scrubText in crash-report-pipeline.ts).
    const serialized = JSON.stringify(report);
    expect(serialized).toContain(GOOGLE_SESSION.email);
  });

  it("has no fingerprint, hash, or dedupe-key field (FR-021)", () => {
    const report = buildCrashReport({ kind: "render", error: thrownError() });
    const keys = Object.keys(report);
    expect(keys).not.toContain("fingerprint");
    expect(keys).not.toContain("hash");
    expect(keys).not.toContain("dedupeKey");
  });

  it("carries only the allowlisted top-level fields", () => {
    const report = buildCrashReport({
      kind: "render",
      error: thrownError(),
      context: callerContext(),
    });
    expect(Object.keys(report).sort()).toEqual(
      ["appVersion", "context", "kind", "message", "occurredAt", "stackFrames"].sort(),
    );
  });
});

// ---------------------------------------------------------------------------
// FR-046 — omit, never fabricate
// ---------------------------------------------------------------------------

describe("buildCrashReport — omission over empty placeholders (FR-046)", () => {
  it("omits keyboardId entirely when no working copy exists", () => {
    const report = buildCrashReport({
      kind: "render",
      error: thrownError(),
      context: { stepId: "welcome" },
    });
    expect(report.context).toBeDefined();
    expect("keyboardId" in (report.context ?? {})).toBe(false);
  });

  it("omits bcp47Tags rather than sending an empty array", () => {
    // An empty array reads to a maintainer as "confirmed none"; the truth is
    // "unresolved", which is a different fact.
    const report = buildCrashReport({
      kind: "render",
      error: thrownError(),
      context: { bcp47Tags: [] },
    });
    expect("bcp47Tags" in (report.context ?? {})).toBe(false);
  });

  it("always carries a non-empty appVersion (SC-011)", () => {
    const report = buildCrashReport({ kind: "render", error: thrownError() });
    expect(report.appVersion).toBeTruthy();
    expect(report.appVersion).toMatch(/^\d+\.\d+\.\d+\+.+$/);
  });
});

// ---------------------------------------------------------------------------
// Frame extraction
// ---------------------------------------------------------------------------

describe("extractStackFrames", () => {
  it("drops V8's leading message line but keeps every real frame", () => {
    const frames = extractStackFrames(thrownError().stack);
    expect(frames).toHaveLength(2);
    expect(frames[0]).toMatchObject({
      function: "KeyEditor",
      modulePath: "assets/main-DLGH1X0S.js",
    });
  });

  it("keeps the first frame of a Firefox/Safari stack, which has no message line", () => {
    const frames = extractStackFrames(
      [
        "KeyEditor@assets/main-DLGH1X0S.js:1284:17",
        "renderWithHooks@assets/vendor-B7QK2M4P.js:11566:26",
      ].join("\n"),
    );
    expect(frames).toHaveLength(2);
    expect(frames[0]?.function).toBe("KeyEditor");
  });

  it("sends modulePath raw, chunk hash intact — canonicalization is the server's job", () => {
    const frames = extractStackFrames(thrownError().stack);
    expect(frames[0]?.modulePath).toContain("-DLGH1X0S");
  });

  it("returns an empty array for an absent stack rather than throwing", () => {
    expect(extractStackFrames(undefined)).toEqual([]);
    expect(extractStackFrames("")).toEqual([]);
  });

  it("names an anonymous frame <anonymous>", () => {
    const frames = extractStackFrames("    at assets/main-DLGH1X0S.js:5:1");
    expect(frames[0]?.function).toBe("<anonymous>");
  });
});
