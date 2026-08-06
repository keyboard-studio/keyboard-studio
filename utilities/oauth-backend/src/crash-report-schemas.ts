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

/** One decision-log entry, reduced to structural handles (data-model §3). */
export const DecisionTailEntrySchema = z.object({
  id: z.string().max(120),
  choice: z.string().max(120).optional(),
});

/** One breadcrumb-ring entry (data-model §4). */
export const BreadcrumbSchema = z.object({
  at: z.string().max(40),
  channel: z.enum([
    "console.error",
    "console.warn",
    "route",
    "step",
    "stage",
    "oauth",
    "locale",
  ]),
  label: z.string().max(200),
});

/**
 * Structural context (FR-040, data-model §3).
 *
 * The field list is EXHAUSTIVE, not illustrative (FR-041): no VirtualFS
 * snapshot and no raw file content, ever. zod strips unknown keys, so this
 * declaration is also the enforcement — a client that grew a tenth field would
 * find it dropped here rather than filed.
 *
 * CONTRACT NOTE: contracts/crash-report-api.md's request-body table names only
 * `browserUA` and `os` under `context`. That table under-specifies against
 * FR-040 and data-model §3, which require the structural set to reach the filed
 * issue — declaring only two fields would have zod silently strip the rest and
 * make FR-040 unsatisfiable. The two fields the contract does pin keep their
 * exact caps (300 / 100); the others follow the same cap discipline.
 */
export const CrashContextSchema = z.object({
  keyboardId: z.string().max(80).optional(),
  bcp47Tags: z.array(z.string().max(40)).max(10).optional(),
  stepId: z.string().max(80).optional(),
  keyCount: z.number().int().nonnegative().optional(),
  exemplarCount: z.number().int().nonnegative().optional(),
  decisionTail: z.array(DecisionTailEntrySchema).max(20).optional(),
  breadcrumbs: z.array(BreadcrumbSchema).max(50).optional(),
  browserUA: z.string().max(300).optional(),
  os: z.string().max(100).optional(),
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
  context: CrashContextSchema.optional(),
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
export type CrashContext = z.infer<typeof CrashContextSchema>;

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
  /**
   * Id of the comment this request added, when it added one.
   *
   * Required by the retraction contract (FR-076): a `"commented"` report is
   * retracted by removing ONLY this session's comment, and the client cannot
   * name that comment without being told its id. Absent for a `"created"`
   * report (nothing to remove — the issue itself is closed instead) and absent
   * when the comment was skipped by the cap.
   */
  commentId: z.number().int().positive().optional(),
});

export type CrashReportResponse = z.infer<typeof CrashReportResponseSchema>;

// ---------------------------------------------------------------------------
// POST /report/crash/retract — request body (FR-074 – FR-077)
// ---------------------------------------------------------------------------

/**
 * Retract a report this session just filed.
 *
 * A SEPARATE ROUTE, not a field on the report body. Retraction is a different
 * operation on a different resource — it names an issue by number rather than
 * describing a crash — and folding it into the report schema would mean a
 * single endpoint whose required fields depend on a mode flag, plus a body
 * shape where `message` is meaningless. The separation also keeps the report
 * route's `.refine()` (FR-081) about one thing.
 *
 * CONTRACT NOTE: contracts/crash-report-api.md lists the GitHub-side retraction
 * calls but defines no client-facing route for them, so FR-074 – FR-077 have no
 * way to reach the server as written. This route fills that gap, mirroring the
 * report route's structure, status vocabulary, and credential.
 */
export const CrashRetractBodySchema = z.object({
  issueNumber: z.number().int().positive(),
  /** What this session's report did — determines which retraction applies. */
  action: z.enum(["created", "commented", "reopened"]),
  /** Required to retract a comment; ignored for `"created"`. */
  commentId: z.number().int().positive().optional(),
});

export type CrashRetractBody = z.infer<typeof CrashRetractBodySchema>;
