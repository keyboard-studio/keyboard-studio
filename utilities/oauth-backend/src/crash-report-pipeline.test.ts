// Crash-report pipeline: canonicalization, fingerprint stability, and the
// generated issue title (spec 060).
//
// The canonicalization tests pin FR-081d's worked example as an exact string,
// not just a shape. That matters because the fingerprint is the whole dedupe
// mechanism: if canonicalization drifts by one delimiter, every issue in the
// tracker forks and nothing that has already been filed is ever matched again.
// A test asserting only "the hash is 12 hex chars" would not notice.

import { describe, it, expect } from "vitest";
import {
  buildIssueTitle,
  canonicalizeCrashInput,
  canonicalizeModulePath,
  computeFingerprint,
  CRASH_REPORT_TITLE_MAX,
  fingerprintLabel,
  normalizeMessage,
  scrubText,
} from "./crash-report-pipeline.js";
import type { CrashReportBody } from "./crash-report-schemas.js";

// ---------------------------------------------------------------------------
// FR-081d — the worked example, pinned exactly
// ---------------------------------------------------------------------------

/** The FR-081d input: raw message, raw frames with line/column and chunk hashes. */
function workedExampleBody(): CrashReportBody {
  return {
    kind: "render",
    message:
      "TypeError: Cannot read properties of undefined (reading 'exemplarSet')",
    stackFrames: [
      {
        function: "KeyEditor",
        modulePath: "assets/main-DLGH1X0S.js",
        line: 1284,
        column: 17,
      },
      {
        function: "renderWithHooks",
        modulePath: "assets/vendor-B7QK2M4P.js",
        line: 11566,
        column: 26,
      },
    ],
    appVersion: "0.1.0+a1b2c3d",
  };
}

/** The exact canonical string FR-081d specifies for that input. */
const FR_081D_CANONICAL =
  "render|TypeError: Cannot read properties of undefined (reading <redacted>)|KeyEditor@assets/main.js|renderWithHooks@assets/vendor.js";

describe("canonicalization — FR-081d worked example", () => {
  it("produces the exact canonicalized string the spec pins", () => {
    const body = workedExampleBody();
    expect(
      canonicalizeCrashInput({
        kind: "render",
        message: body.message,
        frames: body.stackFrames ?? [],
      }),
    ).toBe(FR_081D_CANONICAL);
  });

  it("strips the quoted user-supplied substring from the message", () => {
    expect(
      normalizeMessage(
        "TypeError: Cannot read properties of undefined (reading 'exemplarSet')",
      ),
    ).toBe(
      "TypeError: Cannot read properties of undefined (reading <redacted>)",
    );
  });

  it("collapses a chunk-hash suffix", () => {
    expect(canonicalizeModulePath("assets/main-DLGH1X0S.js")).toBe(
      "assets/main.js",
    );
    expect(canonicalizeModulePath("assets/vendor-B7QK2M4P.js")).toBe(
      "assets/vendor.js",
    );
  });

  it("keeps a hyphenated module name, dropping only the hash", () => {
    expect(canonicalizeModulePath("assets/key-editor-DLGH1X0S.js")).toBe(
      "assets/key-editor.js",
    );
  });

  it("leaves a path with no chunk-hash suffix untouched", () => {
    expect(canonicalizeModulePath("assets/main.js")).toBe("assets/main.js");
  });
});

// ---------------------------------------------------------------------------
// Stability — the property the whole dedupe layer rests on (SC-014)
// ---------------------------------------------------------------------------

describe("fingerprint stability", () => {
  it("is a 12-character lowercase hex string", () => {
    const { fingerprint } = computeFingerprint(workedExampleBody());
    expect(fingerprint).toMatch(/^[0-9a-f]{12}$/);
  });

  it("is unchanged by a rebuild: different line, column, and chunk hash", () => {
    const before = computeFingerprint(workedExampleBody()).fingerprint;

    const rebuilt = workedExampleBody();
    rebuilt.stackFrames = [
      {
        function: "KeyEditor",
        // Different chunk hash, different position — same code, next deploy.
        modulePath: "assets/main-ZZ99XX11.js",
        line: 1299,
        column: 4,
      },
      {
        function: "renderWithHooks",
        modulePath: "assets/vendor-QQ00WW22.js",
        line: 11570,
        column: 31,
      },
    ];

    expect(computeFingerprint(rebuilt).fingerprint).toBe(before);
  });

  it("is unchanged by the build identifier (FR-081b)", () => {
    const before = computeFingerprint(workedExampleBody()).fingerprint;
    const nextDeploy = { ...workedExampleBody(), appVersion: "0.2.0+ffffff0" };
    expect(computeFingerprint(nextDeploy).fingerprint).toBe(before);
  });

  it("differs for a genuinely different message", () => {
    const before = computeFingerprint(workedExampleBody()).fingerprint;
    const other = { ...workedExampleBody(), message: "RangeError: invalid array length" };
    expect(computeFingerprint(other).fingerprint).not.toBe(before);
  });

  it("differs for a genuinely different top frame", () => {
    const before = computeFingerprint(workedExampleBody()).fingerprint;
    const other = workedExampleBody();
    other.stackFrames = [
      { function: "LayoutGrid", modulePath: "assets/main-DLGH1X0S.js", line: 1, column: 1 },
      { function: "renderWithHooks", modulePath: "assets/vendor-B7QK2M4P.js", line: 2, column: 2 },
    ];
    expect(computeFingerprint(other).fingerprint).not.toBe(before);
  });

  it("differs by kind, so the same message from two surfaces does not merge", () => {
    const render = computeFingerprint(workedExampleBody()).fingerprint;
    const rejection = computeFingerprint({
      ...workedExampleBody(),
      kind: "rejection",
    }).fingerprint;
    expect(rejection).not.toBe(render);
  });

  it("ignores a forged fingerprint-shaped extra field (SC-014)", () => {
    // The schema has no `fingerprint` field, so nothing reads one. This asserts
    // the pipeline derives the same value whether or not a caller tried.
    const forged = {
      ...workedExampleBody(),
      fingerprint: "000000000000",
    } as CrashReportBody;
    expect(computeFingerprint(forged).fingerprint).toBe(
      computeFingerprint(workedExampleBody()).fingerprint,
    );
  });

  it("labels the issue crash/fp-<hash12>", () => {
    const { fingerprint } = computeFingerprint(workedExampleBody());
    expect(fingerprintLabel(fingerprint)).toBe(`crash/fp-${fingerprint}`);
  });
});

// ---------------------------------------------------------------------------
// Generated title (FR-093a)
// ---------------------------------------------------------------------------

describe("buildIssueTitle", () => {
  it("uses the bug(studio) prefix from the repo's title grammar", () => {
    expect(buildIssueTitle("TypeError: boom")).toBe("bug(studio): TypeError: boom");
  });

  it("ellipsizes to the title budget", () => {
    const long = "TypeError: ".concat("x".repeat(200));
    const title = buildIssueTitle(long);
    expect(title.length).toBeLessThanOrEqual(CRASH_REPORT_TITLE_MAX);
    expect(title.endsWith("…")).toBe(true);
  });

  it("contains neither the kind, the fingerprint, nor the build id", () => {
    const body = workedExampleBody();
    const { fingerprint } = computeFingerprint(body);
    const title = buildIssueTitle(normalizeMessage(body.message));
    expect(title).not.toContain(fingerprint);
    expect(title).not.toContain("render");
    expect(title).not.toContain("0.1.0+a1b2c3d");
  });
});

// ---------------------------------------------------------------------------
// Server-side scrub (FR-033, FR-033a, FR-033b)
// ---------------------------------------------------------------------------

describe("scrubText", () => {
  it("redacts a GitHub token", () => {
    const out = scrubText("failed with ghp_0123456789abcdefghijABCDEFGHIJ");
    expect(out).not.toContain("ghp_0123456789abcdefghijABCDEFGHIJ");
    expect(out).toContain("<redacted-secret>");
  });

  it("redacts an email address", () => {
    expect(scrubText("author alice@example.com hit this")).toBe(
      "author <redacted-email> hit this",
    );
  });

  it("neutralizes an @mention without deleting the text (FR-033a)", () => {
    const out = scrubText("thrown inside @vitejs/plugin-react");
    // Still readable to a human; no longer a link GitHub will notify.
    expect(out).toContain("plugin-react");
    expect(out).not.toContain("@vitejs");
    expect(out).toContain("@​vitejs");
  });

  it("strips a markdown image to a plain-text reference (FR-033b)", () => {
    const out = scrubText("see ![shot](https://evil.example/x.png)");
    expect(out).not.toContain("![");
    expect(out).toContain("https://evil.example/x.png");
  });

  it("removes a raw <img> tag", () => {
    expect(scrubText('a <img src="https://evil.example/x.png"> b')).toBe(
      "a (image removed) b",
    );
  });

  it("redacts an email before mention-neutralization can half-cover it", () => {
    // Ordering regression: mention-first would leave `alice` exposed with only
    // the domain neutralized.
    const out = scrubText("alice@example.com");
    expect(out).toBe("<redacted-email>");
  });
});
