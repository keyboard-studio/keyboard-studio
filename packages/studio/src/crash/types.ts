// Client-side crash payload types (spec 060, FR-021, data-model §1).
//
// Deliberately free of any @keyboard-studio/* import, including `import type`.
// The type-only form would be erased and cost the bundle nothing, but keeping
// even the type edge out means nobody has to reason about which imports in this
// directory survive compilation — the gate in engine-reachability.test.ts and
// the plain reading of this file agree.
//
// NOTE THE ABSENCE: there is no `fingerprint`, `hash`, or `dedupeKey` field on
// CrashReport, and there never will be. The client computes a fingerprint
// (fingerprint.ts) strictly as a sessionStorage cache key; the server computes
// its own authoritative one from the raw fields below. A client that cannot
// name a fingerprint on the wire cannot redirect a report onto an issue its own
// content does not hash to (FR-021, P0-1).

/**
 * Which capture surface caught the crash (FR-006).
 *
 * `"pre-mount"` is deliberately NOT a member: the client never sends it. The
 * pre-mount path (FR-062) omits `kind` entirely and the server defaults the
 * absent value to `"pre-mount"`, which is what keeps that classification
 * server-authoritative rather than a string any caller could assert.
 */
export type CrashKind = "render" | "onerror" | "rejection";

/** One extracted stack frame. `line`/`column` are sent, then dropped by canonicalization. */
export interface StackFrame {
  /** Max 200. `<anonymous>` when the frame has no name. */
  function: string;
  /** Max 300. Sent RAW, chunk hash intact — canonicalization is the server's job. */
  modulePath: string;
  line?: number;
  column?: number;
}

/** Channels the breadcrumb ring records. Structural facts only — never free text. */
export type BreadcrumbChannel =
  | "console.error"
  | "console.warn"
  | "route"
  | "step"
  | "stage"
  | "oauth"
  | "locale";

/** One ring-buffer entry (data-model §4). */
export interface Breadcrumb {
  /** ISO-8601. */
  at: string;
  channel: BreadcrumbChannel;
  /** Structural only, bounded length (FR-047). */
  label: string;
}

/** A bounded, structural projection of one decision-log entry. */
export interface DecisionTailEntry {
  /** Step or decision id — a structural handle, never author-authored prose. */
  id: string;
  /** The chosen option's id, where one was recorded. */
  choice?: string;
}

/**
 * Structural context (data-model §3). Every field is optional and every field
 * is OMITTED rather than sent empty: an empty `bcp47Tags` array would read as
 * "confirmed none" when the truth is "unresolved" (FR-046).
 *
 * This list is EXHAUSTIVE, not illustrative (FR-041). No VirtualFS snapshot and
 * no raw file content, ever. Nothing here may be or contain an
 * `Attribution`/`IdentitySession` value (FR-047).
 */
export interface CrashContext {
  keyboardId?: string;
  bcp47Tags?: string[];
  stepId?: string;
  keyCount?: number;
  exemplarCount?: number;
  decisionTail?: DecisionTailEntry[];
  breadcrumbs?: Breadcrumb[];
  browserUA?: string;
  os?: string;
}

/**
 * The wire payload, built by redact.ts as an allowlist and serialized straight
 * to the POST body. Never persisted, never held in a store.
 */
export interface CrashReport {
  kind: CrashKind;
  /** Raw and unnormalized; truncated to 4096 before send. Normalization is the server's job. */
  message: string;
  /** Max 20 entries. */
  stackFrames: StackFrame[];
  /** `<pkg.version>+<sha7>`. Never empty (SC-011). */
  appVersion: string;
  /** ISO-8601, client clock, advisory only. */
  occurredAt?: string;
  context?: CrashContext;
}

/** What the server returns on a successful file (contracts/crash-report-api.md). */
export interface CrashReportResponse {
  issueUrl: string;
  issueNumber: number;
  action: "created" | "commented" | "reopened";
}
