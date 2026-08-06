// Crash payload builder (spec 060, FR-030 – FR-032a, FR-035, FR-046).
//
// THIS MODULE DOES THE DELIBERATE OPPOSITE OF github-pipeline.ts (FR-032a).
//
// `buildCommitMessage` and `buildPrBody` in
// utilities/oauth-backend/src/github-pipeline.ts exist to ATTACH the author's
// name and email to what gets published: a PR needs a `Co-authored-by` trailer
// and a provenance block so keymanapp maintainers have a reachability channel
// for licensing follow-up. That is correct there and it is the exact inverse of
// what is correct here. A crash report is diagnostic telemetry an author did
// not choose to send; nothing in it may identify them.
//
// If you are reading this file next to that one and thinking "these could share
// a builder" — they could not, and the similarity is the trap. Any refactor
// that unifies them will, by default, carry attribution into the crash payload.
//
// ALLOWLIST, AT CONSTRUCTION — NOT STRIP-AT-SEND (FR-030, FR-035).
//
// Every field below is a named primitive read off an approved source. There is
// no `...spread` of an Attribution, an IdentitySession, a working copy, or a
// store snapshot anywhere in this file, and there must never be. The difference
// matters: a strip-at-send design holds the disallowed values in an
// intermediate object first, so every later change to the payload shape — a new
// log line, a serialization for a retry queue, a debugger pause — is a fresh
// chance to leak them. Values that were never copied cannot leak.
//
// The type system cannot express this invariant. redact.test.ts asserts it
// directly (SC-005): it builds a payload from a fixture carrying real
// Attribution and identity-session values and asserts none of them appears
// anywhere in the serialized output.

import { appVersion } from "./buildVersion.ts";
import { readBreadcrumbs } from "./breadcrumbs.ts";
import type {
  CrashContext,
  CrashKind,
  CrashReport,
  StackFrame,
} from "./types.ts";

/** Max frames carried on the wire (data-model §2). */
export const MAX_STACK_FRAMES = 20;

/** Max message length carried on the wire. */
export const MAX_MESSAGE_LENGTH = 4096;

const MAX_FUNCTION_LENGTH = 200;
const MAX_MODULE_PATH_LENGTH = 300;

/**
 * V8 (`    at fn (path:line:col)`) and Firefox/Safari (`fn@path:line:col`)
 * frame shapes in one pattern — the same rule the server applies to a raw
 * `stack` string (FR-081f).
 */
const FRAME_RE =
  /^\s*(?:at\s+)?(?:(?<fn>[^\s@()]+)\s*[@(]\s*)?(?<path>[^\s():]+):(?<line>\d+):(?<col>\d+)\)?\s*$/;

/** Substituted when a frame carries no function name (FR-081f step 4). */
const ANONYMOUS = "<anonymous>";

/**
 * Extract structured frames from an `Error.stack` string.
 *
 * The first line is discarded when it is not itself a frame: V8 prepends the
 * error's own message line, Firefox and Safari do not. Dropping it
 * unconditionally would eat a real frame in those browsers.
 */
export function extractStackFrames(stack: string | undefined): StackFrame[] {
  if (stack === undefined || stack === "") return [];
  const lines = stack.split("\n");
  const first = lines[0];
  if (first !== undefined && !FRAME_RE.test(first)) lines.shift();

  const frames: StackFrame[] = [];
  for (const line of lines) {
    if (frames.length >= MAX_STACK_FRAMES) break;
    const match = FRAME_RE.exec(line);
    if (match?.groups === undefined) continue;
    const { fn, path, line: ln, col } = match.groups;
    // `path` is the one mandatory group; a match without it is not a frame.
    if (path === undefined) continue;
    frames.push({
      function: (fn ?? ANONYMOUS).slice(0, MAX_FUNCTION_LENGTH),
      // Sent RAW, chunk hash intact — canonicalization is the server's job.
      modulePath: path.slice(0, MAX_MODULE_PATH_LENGTH),
      line: Number(ln),
      column: Number(col),
    });
  }
  return frames;
}

/** Reduce a thrown value to a message string without assuming it is an Error. */
function messageOf(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  if (typeof error === "string") return error;
  try {
    return String(error);
  } catch {
    return "unknown error";
  }
}

/** Coarse OS label derived from the UA string — a bucket, never a device id. */
function detectOs(userAgent: string): string | undefined {
  if (/Windows/i.test(userAgent)) return "Windows";
  if (/Mac OS X|Macintosh/i.test(userAgent)) return "macOS";
  if (/Android/i.test(userAgent)) return "Android";
  if (/iPhone|iPad|iPod/i.test(userAgent)) return "iOS";
  if (/Linux/i.test(userAgent)) return "Linux";
  return undefined;
}

/**
 * Read the environment facts the payload is allowed to carry.
 *
 * Guarded because this runs on the crash path: a reporter that throws while
 * reading `navigator` has replaced one unreported crash with two.
 */
function environmentContext(): Pick<CrashContext, "browserUA" | "os"> {
  try {
    const ua = globalThis.navigator?.userAgent;
    if (typeof ua !== "string" || ua === "") return {};
    const os = detectOs(ua);
    return { browserUA: ua.slice(0, 300), ...(os !== undefined ? { os } : {}) };
  } catch {
    return {};
  }
}

/**
 * Merge caller-supplied structural context with the environment facts this
 * module can read for itself.
 *
 * Every field is OMITTED rather than emitted empty (FR-046). An empty
 * `bcp47Tags` array or a `keyboardId` of `""` reads to a maintainer as
 * "confirmed none" when the truth is "no working copy existed" — a different
 * fact, and the wrong one to act on.
 */
function buildContext(supplied: CrashContext | undefined): CrashContext | undefined {
  const context: CrashContext = { ...environmentContext() };

  if (supplied !== undefined) {
    if (supplied.keyboardId !== undefined && supplied.keyboardId !== "") {
      context.keyboardId = supplied.keyboardId;
    }
    if (supplied.bcp47Tags !== undefined && supplied.bcp47Tags.length > 0) {
      context.bcp47Tags = supplied.bcp47Tags;
    }
    if (supplied.stepId !== undefined && supplied.stepId !== "") {
      context.stepId = supplied.stepId;
    }
    if (supplied.keyCount !== undefined) context.keyCount = supplied.keyCount;
    if (supplied.exemplarCount !== undefined) {
      context.exemplarCount = supplied.exemplarCount;
    }
    if (supplied.decisionTail !== undefined && supplied.decisionTail.length > 0) {
      context.decisionTail = supplied.decisionTail;
    }
  }

  const breadcrumbs = readBreadcrumbs();
  if (breadcrumbs.length > 0) context.breadcrumbs = breadcrumbs;

  return Object.keys(context).length > 0 ? context : undefined;
}

/**
 * Build the crash payload.
 *
 * `context` is passed IN by the caller as plain data — this module never
 * imports the stores it comes from (FR-012, FR-042). That is not a style
 * preference: `decisionLogStore.ts` value-imports `@keyboard-studio/engine`,
 * and a failed engine chunk is one of the crash classes being reported. See
 * engine-reachability.test.ts.
 */
export function buildCrashReport(input: {
  kind: CrashKind;
  error: unknown;
  /** Structural context read by the caller (callerContext.ts). */
  context?: CrashContext;
  /** Pre-extracted frames, when the caller already has them. */
  stackFrames?: StackFrame[];
}): CrashReport {
  const message = messageOf(input.error).slice(0, MAX_MESSAGE_LENGTH);
  const stackFrames =
    input.stackFrames ??
    extractStackFrames(
      input.error instanceof Error ? input.error.stack : undefined,
    );
  const context = buildContext(input.context);

  // Named fields only. No spread of any source object — see the header.
  return {
    kind: input.kind,
    message,
    stackFrames: stackFrames.slice(0, MAX_STACK_FRAMES),
    appVersion: appVersion(),
    occurredAt: new Date().toISOString(),
    ...(context !== undefined ? { context } : {}),
  };
}
