// Window-level capture surfaces (spec 060, FR-002, FR-003, FR-007, FR-008).
//
// An ErrorBoundary sees render, lifecycle, and constructor errors and nothing
// else. Everything thrown from an event handler, a `setTimeout`, or an
// un-awaited promise goes straight past it to the window — which is where the
// majority of real studio failures actually surface. These two handlers are
// that catch.
//
// WHAT MUST NOT REACH THEM (FR-008). The studio deliberately swallows several
// rejections, and every one of them must keep being invisible here:
//
//   - `void warmExemplarSource().catch(() => {})` in main.tsx. The `.catch`
//     handles the rejection, so `unhandledrejection` never fires for it. This
//     is load-bearing: the exemplar chunk is ~1.3 MB and 404s for anyone
//     offline, so without that `.catch` every offline visitor would file a
//     crash report for a warm-up the app is designed to survive.
//   - The stale-chunk carve-out (staleChunk.ts), which routes a post-deploy
//     chunk 404 to a reload instead of a report (FR-050).
//
// The rule those share: a rejection with a handler is not unhandled, and
// `unhandledrejection` fires only for rejections with no handler at all. So
// "does this reach the reporter?" is answered by "did anyone `.catch` it?", not
// by anything this module decides.

import { pushBreadcrumb } from "./breadcrumbs.ts";
import { reportCrash } from "./send.ts";
import type { CrashContext } from "./types.ts";

/**
 * Reads structural context at the call site.
 *
 * Injected as a callback rather than imported, because the collector imports
 * the stores and the stores reach `@keyboard-studio/engine` — an import this
 * module is forbidden (FR-012, engine-reachability.test.ts).
 */
export type CrashContextReader = () => CrashContext | undefined;

/**
 * Classifies a failure as a stale deployment rather than a bug.
 *
 * Injected for the same reason: the carve-out owns the `sessionStorage` reload
 * gate and this module only needs the yes/no. Returns true when the failure was
 * handled by reloading and must NOT be reported (FR-050).
 */
export type StaleChunkHandler = (message: string) => boolean;

let installed = false;

/**
 * Install the `error` and `unhandledrejection` handlers.
 *
 * Idempotent: a second call is a no-op, so a double-install cannot double-file.
 */
export function installGlobalCrashHandlers(options: {
  readContext?: CrashContextReader;
  handleStaleChunk?: StaleChunkHandler;
} = {}): void {
  if (installed) return;
  installed = true;

  const { readContext, handleStaleChunk } = options;

  const contextOrNothing = (): { context?: CrashContext } => {
    const context = readContext?.();
    return context !== undefined ? { context } : {};
  };

  window.addEventListener("error", (event: ErrorEvent) => {
    // `event.error` is the thrown value where one exists; `event.message` is
    // all there is for a cross-origin script error ("Script error."), which
    // carries no stack and no useful location.
    const error: unknown = event.error ?? event.message;
    const message = typeof error === "string" ? error : (event.message ?? "");

    if (handleStaleChunk?.(message) === true) {
      pushBreadcrumb("stage", "crash: stale chunk handled, not reported");
      return;
    }

    reportCrash({ kind: "onerror", error, ...contextOrNothing() });
  });

  window.addEventListener(
    "unhandledrejection",
    (event: PromiseRejectionEvent) => {
      const reason: unknown = event.reason;
      const message =
        reason instanceof Error
          ? reason.message
          : typeof reason === "string"
            ? reason
            : "";

      if (handleStaleChunk?.(message) === true) {
        pushBreadcrumb("stage", "crash: stale chunk handled, not reported");
        return;
      }

      reportCrash({ kind: "rejection", error: reason, ...contextOrNothing() });
    },
  );
}

/** Test seam: allow a fresh install in the next test. @internal */
export function _resetGlobalCrashHandlers(): void {
  installed = false;
}
