// Pre-mount crash path (spec 060, FR-036, FR-060 – FR-064, SC-007, SC-011).
//
// THE ONE CRASH CLASS AN ErrorBoundary STRUCTURALLY CANNOT CATCH. A boundary
// catches errors thrown by components it has already mounted. If `requireRoot()`
// throws because #root is missing, or the `await localeReady` rejects, or a
// bootstrap import fails, no boundary exists yet — React has not run. Without
// this path the author gets a permanently blank white page and the maintainer
// gets nothing at all, which is the worst possible combination: the failure is
// total AND invisible.
//
// EVERYTHING HERE IS DEPENDENCY-FREE ON PURPOSE. No React, no catalog, no
// store, no shared helper that might itself be the thing that failed to load.
// The payload is assembled by hand and sent with a bare `fetch`. That is why
// this does not reuse redact.ts or send.ts, despite the overlap: those are
// perfectly good modules, and this path cannot assume any module loaded.
//
// WHAT IT MUST NOT DO (FR-036, FR-063). It must not read localStorage or
// sessionStorage identity, and must not touch working-copy data. Not just
// "should not leak them" — must not READ them: at this point nothing has
// validated that state, and a reporter that reaches into storage while the app
// is failing to boot is one malformed entry away from throwing a second time.
//
// It targets the SAME endpoint as the ordinary path (FR-064) so the server has
// one route, one schema, and one dedupe mechanism regardless of which surface
// caught the crash.

/** Id of the static fallback element baked into index.html (FR-061). */
export const PRE_MOUNT_FALLBACK_ID = "pre-mount-crash";

/** Endpoint, duplicated from send.ts rather than imported — see the header. */
const ENDPOINT = "/report/crash";

/** Short budget: the page is already broken, so a hung POST helps nobody. */
const TIMEOUT_MS = 5_000;

/**
 * Reveal the static fallback element.
 *
 * Never throws. If the element is missing — an index.html edit removed it — the
 * author still gets a blank page, but the report below is unaffected. That
 * ordering is deliberate: telling the maintainer is more valuable than the
 * consolation message, so nothing about the message can prevent the report.
 */
export function revealPreMountFallback(): void {
  try {
    const el = document.getElementById(PRE_MOUNT_FALLBACK_ID);
    if (el !== null) el.removeAttribute("hidden");
  } catch {
    // Nothing to do — see above.
  }
}

/**
 * Compose the build identifier without importing buildVersion.ts.
 *
 * `__KS_COMMIT_SHA__` is a Vite `define`, so it is substituted into this source
 * text at compile time and needs no module to have executed (FR-114). SC-011
 * requires a non-empty value on EVERY path, pre-mount included — which is why
 * FR-062 was corrected in review cycle 4 to carry `appVersion` at all.
 */
function preMountAppVersion(): string {
  let sha = "dev";
  try {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (typeof __KS_COMMIT_SHA__ === "string" && __KS_COMMIT_SHA__.length > 0) {
      sha = __KS_COMMIT_SHA__;
    }
  } catch {
    // Not defined in this environment.
  }
  return `0.1.0+${sha.slice(0, 7)}`;
}

/**
 * Best-effort POST of `{ message, stack, appVersion }` (FR-062).
 *
 * No `kind`, no `stackFrames`, no `occurredAt` — the server defaults the absent
 * `kind` to `"pre-mount"` and derives frames from the raw `stack` (FR-081,
 * FR-081f). Every failure is swallowed: nothing in this path may throw a second
 * uncaught exception, because there is no handler left to catch it.
 */
export function sendPreMountReport(error: unknown): void {
  try {
    const message =
      error instanceof Error
        ? `${error.name}: ${error.message}`
        : String(error).slice(0, 4096);
    const stack = error instanceof Error ? error.stack : undefined;

    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, TIMEOUT_MS);

    void fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: message.slice(0, 4096),
        ...(stack !== undefined ? { stack: stack.slice(0, 8192) } : {}),
        appVersion: preMountAppVersion(),
      }),
      signal: controller.signal,
      credentials: "omit",
    })
      .catch(() => undefined)
      .finally(() => {
        clearTimeout(timer);
      });
  } catch {
    // Swallowed. There is no second chance here.
  }
}

/**
 * Reveal the fallback and file the report. The single entry point for
 * `main.tsx`'s top-level catch.
 */
export function handlePreMountCrash(error: unknown): void {
  revealPreMountFallback();
  sendPreMountReport(error);
}
