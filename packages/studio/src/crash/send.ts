// Fire-and-forget crash send (spec 060, FR-078, FR-101, research D6).
//
// THREE THINGS LIVE HERE, AND ALL THREE ARE DELIBERATELY UN-REACTIVE.
//
// 1. The POST itself, with a short timeout, whose every failure is swallowed
//    (FR-078). A network failure, a 5xx, or a 503 MUST NOT surface to the
//    author as an actionable error, and MUST NOT be retried in a loop — a
//    retry loop IS the flood the whole flood-control layer exists to prevent.
//    The author already has a real problem on screen; a second one about the
//    telemetry helps nobody.
//
// 2. A per-session dedupe cache in `sessionStorage`, keyed by the client-local
//    fingerprint (FR-101). This is the first of four flood-control layers and
//    the only one that costs nothing — it stops the same bug re-POSTing on
//    every re-render before a request is ever made.
//
// 3. A module-scope subscribable (subscribe/getSnapshot, for
//    `useSyncExternalStore`) carrying the send status. NOT a zustand store:
//    `src/stores/` is where the engine-importing modules live, and this module
//    must stay reachable when the engine chunk is the thing that failed
//    (research D6, engine-reachability.test.ts). `useSyncExternalStore` is the
//    React-supported way to read an external mutable source, so no reactivity
//    is lost by staying out of the store layer.
//
// CRASH-IN-THE-CRASH-REPORTER (FR-017, Edge Cases). The entire capture-and-send
// path is wrapped so that any internal failure is swallowed — at most pushed to
// the breadcrumb ring — and can never escape as a second unhandled rejection.
// Without that wrap, a reporter that throws inside the `unhandledrejection`
// handler re-enters the same handler with its own failure, and the two feed
// each other until the tab dies. `reportCrash` therefore returns `void` and has
// no rejecting path at all.

import { pushBreadcrumb } from "./breadcrumbs.ts";
import { computeClientFingerprint } from "./fingerprint.ts";
import { buildCrashReport } from "./redact.ts";
import type {
  CrashContext,
  CrashKind,
  CrashReport,
  CrashReportResponse,
  StackFrame,
} from "./types.ts";

/** The endpoint. Same origin — the vercel.json rewrite maps it to the function. */
export const CRASH_REPORT_ENDPOINT = "/report/crash";

/** Abort budget for the POST. Long enough for a cold function, short enough to not hang a dying tab. */
export const CRASH_SEND_TIMEOUT_MS = 8_000;

/** `sessionStorage` key prefix for the per-fingerprint dedupe cache (FR-101). */
export const DEDUPE_KEY_PREFIX = "ks.crashSent.";

// ---------------------------------------------------------------------------
// Send status — module-scope subscribable for useSyncExternalStore
// ---------------------------------------------------------------------------

export interface CrashSendState {
  status: "idle" | "sending" | "sent" | "failed";
  issueUrl?: string;
  issueNumber?: number;
  action?: CrashReportResponse["action"];
  /** True when the stale-chunk carve-out already reloaded once for this failure. */
  retryExhausted?: boolean;
}

const IDLE: CrashSendState = { status: "idle" };

let state: CrashSendState = IDLE;
const listeners = new Set<() => void>();

function setState(next: CrashSendState): void {
  // `retryExhausted` is sticky across the send lifecycle. FR-053 says the retry
  // notice is raised and THEN the failure is allowed through to ordinary
  // filing — so the send that follows must not overwrite the flag and flip the
  // author's message from "reloading didn't help" back to the generic
  // "a report has been sent".
  state =
    state.retryExhausted === true && next.retryExhausted === undefined
      ? { ...next, retryExhausted: true }
      : next;
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      // A subscriber that throws must not stop the others being notified, and
      // must certainly not propagate back into the crash path.
    }
  }
}

/** Subscribe to send-state changes. Returns an unsubscribe function. */
export function subscribeCrashSend(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Read the current send state.
 *
 * Returns a stable reference between changes — `useSyncExternalStore` compares
 * snapshots by identity and would loop forever on a fresh object each call.
 */
export function getCrashSendSnapshot(): CrashSendState {
  return state;
}

/** Reset to idle. Used when the notice is dismissed, and by tests. */
export function resetCrashSendState(): void {
  // Assigned directly rather than through setState, which would preserve the
  // sticky `retryExhausted` flag and make a reset not reset.
  state = IDLE;
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      // See setState.
    }
  }
}

/**
 * Drive the send state directly.
 *
 * Test seam only. Component tests need to render the notice in its "sent"
 * state without standing up a fetch stub, a fingerprint, and a dedupe cache
 * just to reach it.
 *
 * @internal
 */
export function _setCrashSendStateForTest(next: CrashSendState): void {
  setState(next);
}

/** Publish the "reloading didn't help" state the retry notice renders (FR-053). */
export function markRetryExhausted(): void {
  setState({ ...state, retryExhausted: true });
}

// ---------------------------------------------------------------------------
// Per-session dedupe cache (FR-101)
// ---------------------------------------------------------------------------

/**
 * Has this fingerprint already been sent this session?
 *
 * Any `sessionStorage` failure (disabled storage, quota, a privacy mode that
 * throws on access) resolves to "not seen" — the dedupe cache is an
 * optimization, and failing it open costs a duplicate report while failing it
 * closed would silently drop every report in that browser.
 */
function alreadySent(fingerprint: string): boolean {
  try {
    return sessionStorage.getItem(`${DEDUPE_KEY_PREFIX}${fingerprint}`) !== null;
  } catch {
    return false;
  }
}

function markSent(fingerprint: string): void {
  try {
    sessionStorage.setItem(`${DEDUPE_KEY_PREFIX}${fingerprint}`, "1");
  } catch {
    // See above — best effort.
  }
}

// ---------------------------------------------------------------------------
// The POST
// ---------------------------------------------------------------------------

/**
 * POST the payload. Resolves to the server's response on success and `null` on
 * any failure whatsoever. Never rejects.
 */
async function postCrashReport(
  report: CrashReport,
): Promise<CrashReportResponse | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, CRASH_SEND_TIMEOUT_MS);

  try {
    const res = await fetch(CRASH_REPORT_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(report),
      signal: controller.signal,
      // The report carries no identity and needs no cookie (FR-036).
      credentials: "omit",
    });
    if (!res.ok) return null;
    return (await res.json()) as CrashReportResponse;
  } catch {
    // Offline, aborted, CORS, malformed JSON — all the same non-event.
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// The public entry point
// ---------------------------------------------------------------------------

/**
 * Capture, fingerprint, redact, and send — swallowing everything.
 *
 * Returns `void`, not a promise, on purpose: there is no outcome a caller on
 * the crash path could act on, and handing back a promise invites an
 * un-awaited rejection at the exact moment the `unhandledrejection` handler is
 * armed (FR-017).
 */
export function reportCrash(input: {
  kind: CrashKind;
  error: unknown;
  context?: CrashContext;
  stackFrames?: StackFrame[];
}): void {
  void runReport(input).catch(() => {
    // Unreachable — runReport has no rejecting path — but this is the crash
    // reporter: the one place where "unreachable" is not a good enough reason
    // to leave a promise unguarded.
  });
}

async function runReport(input: {
  kind: CrashKind;
  error: unknown;
  context?: CrashContext;
  stackFrames?: StackFrame[];
}): Promise<void> {
  try {
    const report = buildCrashReport(input);

    // The fingerprint is LOCAL — a cache key and nothing else. It is not on
    // `report` and never reaches the wire (FR-021).
    const fingerprint = await computeClientFingerprint({
      kind: report.kind,
      message: report.message,
      frames: report.stackFrames,
    });

    if (fingerprint !== null && alreadySent(fingerprint)) {
      pushBreadcrumb("console.warn", "crash: deduped in session");
      return;
    }

    setState({ status: "sending" });
    const response = await postCrashReport(report);

    if (response === null) {
      // Fire-and-forget: the author is told nothing and nothing is retried.
      setState({ status: "failed" });
      pushBreadcrumb("console.warn", "crash: send failed (swallowed)");
      return;
    }

    if (fingerprint !== null) markSent(fingerprint);
    setState({
      status: "sent",
      issueUrl: response.issueUrl,
      issueNumber: response.issueNumber,
      action: response.action,
    });
  } catch {
    // The whole capture-and-send path is inside this try. A failure here is a
    // crash IN the crash reporter; it gets a breadcrumb and nothing else, so it
    // can never escape as a second unhandled rejection re-entering the same
    // handler (Edge Cases, "crash-in-the-crash-reporter").
    try {
      pushBreadcrumb("console.error", "crash: reporter failed (swallowed)");
      setState({ status: "failed" });
    } catch {
      // Even the breadcrumb is optional at this point.
    }
  }
}
