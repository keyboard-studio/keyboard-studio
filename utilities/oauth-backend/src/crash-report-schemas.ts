/**
 * Zod request schema for POST /report/crash (spec 060, FR-081).
 *
 * Caps mirror the existing discipline in managed-pr-schemas.ts.
 *
 * NOTE WHAT IS NOT HERE. There is no `fingerprint` field and no `title` field
 * (P0-1). Both are computed server-side in crash-report-pipeline.ts from the
 * raw fields below. A body carrying either is not "rejected" — the fields
 * simply do not exist in the schema, so nothing reads them, and no caller can
 * influence which issue a report lands on or what it is titled.
 *
 * BUNDLE SAFETY: this module value-imports nothing from `@keyboard-studio/*`.
 * It is traced into the api/report/crash.ts function bundle, where a workspace
 * value-import fails at ESM module load and turns every request into a
 * platform-level FUNCTION_INVOCATION_FAILED. Enforced by api/bundle-safety.test.ts.
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// POST /report/crash — request body
// ---------------------------------------------------------------------------

/**
 * Which capture surface caught the crash (FR-006).
 *
 * `"pre-mount"` is a member so the value round-trips once the server has
 * defaulted it, but the client never sends it: the pre-mount path (FR-062)
 * omits `kind` entirely.
 */
export const CrashKindSchema = z.enum([
  "render",
  "onerror",
  "rejection",
  "pre-mount",
]);

export const StackFrameSchema = z.object({
  function: z.string().max(200),
  /** Raw, chunk hash intact — canonicalization happens server-side (FR-081a). */
  modulePath: z.string().max(300),
  line: z.number().int().nonnegative().optional(),
  column: z.number().int().nonnegative().optional(),
});

const CrashReportBodyShape = z.object({
  /**
   * OPTIONAL, and that is load-bearing (P0-B). The review-cycle-2 schema made
   * this required; FR-062's pre-mount body has no `kind` field to supply, so
   * every pre-mount report 400'd — silently disabling the one crash class an
   * ErrorBoundary structurally cannot catch. An absent `kind` is defaulted to
   * `"pre-mount"` by the pipeline before canonicalization runs.
   */
  kind: CrashKindSchema.optional(),
  /** Raw and unnormalized. Normalization happens during canonicalization. */
  message: z.string().max(4096),
  stackFrames: z.array(StackFrameSchema).max(20).optional(),
  /**
   * Raw, unparsed `Error.stack`. Accepted specifically so the pre-mount path
   * can send something before any frame-extraction machinery has loaded; the
   * pipeline parses it into the same frame shape via FR-081f.
   */
  stack: z.string().max(8192).optional(),
  appVersion: z.string().max(40).optional(),
  occurredAt: z.string().datetime().optional(),
  context: z
    .object({
      browserUA: z.string().max(300).optional(),
      os: z.string().max(100).optional(),
    })
    .optional(),
});

/**
 * The wire contract, with the conditional rule from FR-081 / SC-020.
 *
 * Making `stackFrames` and `stack` unconditionally optional would let a
 * malformed POST-mount report validate on `kind` + `message` alone. With no
 * frame portion, canonicalization reduces to kind + message — so unrelated bugs
 * sharing a generic message ("Network request failed") would over-collide onto
 * a single issue. The refine keeps the pre-mount exemption narrow: it applies
 * only when `kind` is absent or explicitly `"pre-mount"`.
 */
export const CrashReportBodySchema = CrashReportBodyShape.refine(
  (body) =>
    body.kind === undefined ||
    body.kind === "pre-mount" ||
    body.stackFrames !== undefined ||
    body.stack !== undefined,
  {
    message: "a post-mount report must carry stackFrames or stack",
    path: ["stackFrames"],
  },
);

export type CrashReportBody = z.infer<typeof CrashReportBodySchema>;
export type CrashStackFrame = z.infer<typeof StackFrameSchema>;
export type CrashKind = z.infer<typeof CrashKindSchema>;

// ---------------------------------------------------------------------------
// POST /report/crash — 200 response
// ---------------------------------------------------------------------------

/**
 * `issueUrl` and `issueNumber` are read back from GitHub's own create/comment/
 * reopen response at request time — runtime values, never literals in source
 * (spec §18).
 */
export const CrashReportResponseSchema = z.object({
  issueUrl: z.string().url(),
  issueNumber: z.number().int().positive(),
  action: z.enum(["created", "commented", "reopened"]),
});

export type CrashReportResponse = z.infer<typeof CrashReportResponseSchema>;
