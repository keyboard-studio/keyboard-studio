// Wire-schema conformance for POST /report/crash (spec 060 — FR-081, SC-018,
// SC-020).
//
// TWO REGRESSIONS ARE PINNED HERE, and both were introduced by a previous
// revision of this very schema rather than by application code:
//
//   P0-B (SC-018). Review cycle 2 made `kind` a required enum. FR-062's
//   pre-mount body has no `kind` field to supply, so every pre-mount report
//   400'd — silently disabling the one crash class an ErrorBoundary
//   structurally cannot catch. Nothing failed loudly; the reports simply
//   stopped existing.
//
//   SC-020. Making `stackFrames`/`stack` unconditionally optional to fix the
//   above would let a malformed POST-mount body validate on `kind` + `message`
//   alone. With no frame portion, canonicalization reduces to kind + message,
//   so unrelated bugs sharing a generic message ("Network request failed")
//   collapse onto one issue.
//
// The `.refine()` threads both: the pre-mount exemption applies only when
// `kind` is absent or explicitly "pre-mount".

import { describe, it, expect } from "vitest";
import { CrashReportBodySchema } from "./crash-report-schemas.js";
import { kindForBody, framesForBody } from "./crash-report-pipeline.js";

// ---------------------------------------------------------------------------
// SC-018 — the pre-mount body
// ---------------------------------------------------------------------------

describe("pre-mount body (FR-062, SC-018)", () => {
  /** The exact FR-062 shape: no kind, no stackFrames, no occurredAt. */
  const preMount = {
    message: "Studio bootstrap: #root element missing from index.html",
    stack: "requireRoot@assets/main-DLGH1X0S.js:3:11",
    appVersion: "0.1.0+a1b2c3d",
  };

  it("validates", () => {
    expect(CrashReportBodySchema.safeParse(preMount).success).toBe(true);
  });

  it("defaults an absent kind to pre-mount", () => {
    const parsed = CrashReportBodySchema.parse(preMount);
    expect(parsed.kind).toBeUndefined();
    expect(kindForBody(parsed)).toBe("pre-mount");
  });

  it("derives frames from the raw stack, so canonicalization has one path", () => {
    const parsed = CrashReportBodySchema.parse(preMount);
    const frames = framesForBody(parsed);
    expect(frames).toHaveLength(1);
    expect(frames[0]?.function).toBe("requireRoot");
  });

  it("validates with neither stackFrames nor stack", () => {
    // A pre-mount throw may have no usable stack at all.
    expect(
      CrashReportBodySchema.safeParse({ message: "boom", appVersion: "0.1.0+dev" })
        .success,
    ).toBe(true);
  });

  it("validates an explicit kind: pre-mount with no frames", () => {
    expect(
      CrashReportBodySchema.safeParse({ kind: "pre-mount", message: "boom" }).success,
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// SC-020 — the conditional rule
// ---------------------------------------------------------------------------

describe("post-mount conditional validation (SC-020)", () => {
  it.each(["render", "onerror", "rejection"])(
    "rejects kind %s carrying neither stackFrames nor stack",
    (kind) => {
      const result = CrashReportBodySchema.safeParse({ kind, message: "boom" });
      expect(result.success).toBe(false);
    },
  );

  it("accepts a post-mount body with stackFrames", () => {
    expect(
      CrashReportBodySchema.safeParse({
        kind: "render",
        message: "boom",
        stackFrames: [{ function: "f", modulePath: "assets/main.js" }],
      }).success,
    ).toBe(true);
  });

  it("accepts a post-mount body with a raw stack instead", () => {
    expect(
      CrashReportBodySchema.safeParse({
        kind: "render",
        message: "boom",
        stack: "f@assets/main.js:1:1",
      }).success,
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Deliberate absences (P0-1)
// ---------------------------------------------------------------------------

describe("fields that do not exist in the schema", () => {
  it("strips a client-supplied fingerprint rather than rejecting it", () => {
    // Not "rejected" — the field simply does not exist, so nothing reads it.
    const parsed = CrashReportBodySchema.parse({
      kind: "render",
      message: "boom",
      stack: "f@assets/main.js:1:1",
      fingerprint: "deadbeefcafe",
    });
    expect("fingerprint" in parsed).toBe(false);
  });

  it("strips a client-supplied title", () => {
    const parsed = CrashReportBodySchema.parse({
      kind: "render",
      message: "boom",
      stack: "f@assets/main.js:1:1",
      title: "please file this as my own title",
    });
    expect("title" in parsed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Caps
// ---------------------------------------------------------------------------

describe("caps", () => {
  it("rejects a message over 4096 characters", () => {
    expect(
      CrashReportBodySchema.safeParse({
        message: "x".repeat(4097),
        stack: "f@assets/main.js:1:1",
      }).success,
    ).toBe(false);
  });

  it("rejects more than 20 stack frames", () => {
    expect(
      CrashReportBodySchema.safeParse({
        kind: "render",
        message: "boom",
        stackFrames: Array.from({ length: 21 }, () => ({
          function: "f",
          modulePath: "assets/main.js",
        })),
      }).success,
    ).toBe(false);
  });

  it("rejects a stack over 8192 characters", () => {
    expect(
      CrashReportBodySchema.safeParse({
        message: "boom",
        stack: "x".repeat(8193),
      }).success,
    ).toBe(false);
  });

  it("rejects a negative line number", () => {
    expect(
      CrashReportBodySchema.safeParse({
        kind: "render",
        message: "boom",
        stackFrames: [{ function: "f", modulePath: "assets/main.js", line: -1 }],
      }).success,
    ).toBe(false);
  });
});
