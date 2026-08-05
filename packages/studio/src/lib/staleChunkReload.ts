// Recovery for a lazy chunk that a deployment deleted out from under an open tab.
//
// Every hashed chunk name the app can lazily import (assets/main-<hash>.js for
// the kmc-kmn compiler, the exemplar index, a locale catalog, the engine
// barrel) is baked into the entry chunk at build time. A deployment replaces
// the whole assets/ directory, so a tab still running the PREVIOUS build asks
// for a hash that no longer exists on the server. Our SPA catch-all rewrite
// (vercel.json) answers that 404 with index.html, which is why the browser
// reports a MIME-type complaint rather than a missing file:
//
//   Failed to load module script: Expected a JavaScript-or-Wasm module script
//   but the server responded with a MIME type of "text/html".
//   kmc-kmn load failed: Failed to fetch dynamically imported module: .../assets/main-<hash>.js
//
// The tab cannot recover on its own — nothing in the code it is running knows
// the new hash — so every lazy path it has not already loaded stays broken for
// as long as the tab lives. That is why the symptom looks intermittent: it hits
// only sessions that were open across a deploy, and only at the first lazy
// import they reach afterwards (for the adapt track, the compiler).
//
// The fix is to reload, which re-fetches index.html (served
// `max-age=0, must-revalidate`) and with it the current chunk names. Before
// reloading we flush the active draft so the in-flight working copy survives
// the round trip rather than falling back to the last ~500 ms autosave.
//
// A reload is attempted at most once per tab per RELOAD_COOLDOWN_MS. If the
// import still fails after that (a genuinely broken deployment, or an offline
// client), the error surfaces through the caller's normal error path instead of
// putting the tab in a reload loop.

import { devLog } from "@keyboard-studio/contracts/dev-log";

/** sessionStorage key holding the epoch ms of this tab's last recovery reload. */
export const STALE_CHUNK_RELOAD_KEY = "ks.staleChunkReload.v1" as const;

/**
 * How long a recovery reload suppresses the next one. Long enough that a chunk
 * that is still missing after the reload reports its error instead of looping;
 * short enough that a second deploy later in the same session is still
 * recoverable without the author reloading by hand.
 */
export const RELOAD_COOLDOWN_MS = 60_000;

/**
 * Browser phrasings for "the module at this URL did not load as a module".
 * Chrome/Edge, Firefox and Safari each word it differently, and Vite's own
 * preload helper adds the CSS variant, so match on all of them rather than on
 * one engine's text.
 */
const STALE_CHUNK_PATTERNS: readonly RegExp[] = [
  /failed to fetch dynamically imported module/i,
  /error loading dynamically imported module/i,
  /failed to load module script/i,
  /importing a module script failed/i,
  /unable to preload css/i,
];

/** Longest `cause` chain we walk when unwrapping a rethrown load error. */
const MAX_CAUSE_DEPTH = 5;

/**
 * Run just before the recovery reload — main.tsx registers `flushActiveDraft`
 * here so the author's most recent edit is persisted rather than left to the
 * ~500 ms autosave debounce. Registered rather than imported: this module is
 * reachable from `services.ts`, which `draftPersistence.ts` reaches through the
 * survey store, so a direct import would close a dependency cycle.
 */
let beforeReload: (() => void) | null = null;

/**
 * True when `err` (or anything in its `cause` chain) is a module-load failure
 * of the kind a redeploy produces. Wrapped errors matter here: the engine
 * reports the compiler failure as `CompilerLoadError("kmc-kmn load failed:
 * <original message>")`, so the text is nested one level down by the time the
 * studio sees it.
 */
export function isStaleChunkError(err: unknown): boolean {
  let current: unknown = err;
  for (let depth = 0; depth <= MAX_CAUSE_DEPTH; depth += 1) {
    const text =
      current instanceof Error
        ? `${current.name}: ${current.message}`
        : typeof current === "string"
          ? current
          : "";
    if (STALE_CHUNK_PATTERNS.some((re) => re.test(text))) return true;
    if (!(current instanceof Error) || current.cause === undefined) return false;
    current = current.cause;
  }
  return false;
}

/** Read the last recovery-reload timestamp, tolerating a blocked sessionStorage. */
function lastReloadAt(): number | null {
  try {
    const raw = window.sessionStorage.getItem(STALE_CHUNK_RELOAD_KEY);
    if (raw === null) return null;
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    // Storage disabled (Safari private mode, strict cookie policy). Treat it as
    // "never reloaded": the cooldown cannot be remembered, so a chunk that is
    // still missing after the reload will reload again. Accepted rather than
    // engineered around — the studio already needs web storage for drafts, so a
    // session without it is degraded well before this path is reached.
    return null;
  }
}

/** Record this tab's recovery-reload timestamp. Best-effort. */
function markReloaded(now: number): void {
  try {
    window.sessionStorage.setItem(STALE_CHUNK_RELOAD_KEY, String(now));
  } catch {
    /* storage disabled — see lastReloadAt() */
  }
}

/**
 * Reload the tab when `err` is a stale-chunk failure and this tab has not
 * already reloaded for one inside the cooldown.
 *
 * @returns true when a reload was triggered — the caller's state update is
 *   about to be thrown away with the document, so callers may return early
 *   rather than rendering an error the author will never read.
 */
export function recoverFromStaleChunk(err: unknown): boolean {
  if (typeof window === "undefined") return false;
  if (!isStaleChunkError(err)) return false;

  const now = Date.now();
  const previous = lastReloadAt();
  if (previous !== null && now - previous < RELOAD_COOLDOWN_MS) {
    devLog.warn(
      "[staleChunkReload] module load still failing after a recovery reload; surfacing the error:",
      err,
    );
    return false;
  }

  markReloaded(now);
  devLog.warn(
    "[staleChunkReload] a lazily-loaded chunk is missing (deployment changed under this tab); reloading:",
    err,
  );
  // Persist the working copy before the document goes away. The autosave
  // debounce (~500 ms) may not have fired for the author's most recent edit.
  if (beforeReload !== null) {
    try {
      beforeReload();
    } catch (flushErr: unknown) {
      devLog.warn("[staleChunkReload] draft flush before reload failed:", flushErr);
    }
  }
  window.location.reload();
  return true;
}

/**
 * Run `load()`, reloading the tab if it fails because the chunk it wants no
 * longer exists on the server. The error is always rethrown so a caller that
 * survives (cooldown active, or a failure with an unrelated cause) still runs
 * its own error path.
 */
export async function importOrReload<T>(load: () => Promise<T>): Promise<T> {
  try {
    return await load();
  } catch (err: unknown) {
    recoverFromStaleChunk(err);
    throw err;
  }
}

/**
 * Install the global net: Vite's `vite:preloadError` (fired when a
 * `modulepreload` for a dynamic import 404s) and unhandled promise rejections.
 * Call sites that swallow their own load failures still need an explicit
 * `importOrReload` / `recoverFromStaleChunk` — this only catches what reaches
 * the window.
 *
 * `options.beforeReload` is invoked immediately before a recovery reload
 * (main.tsx passes the draft flush).
 *
 * @returns an uninstall function (used by tests; production never uninstalls).
 */
export function installStaleChunkRecovery(options?: {
  beforeReload?: () => void;
}): () => void {
  beforeReload = options?.beforeReload ?? null;
  if (typeof window === "undefined") return () => {};

  const onPreloadError = (event: Event): void => {
    const payload = (event as Event & { payload?: unknown }).payload;
    // Unless the event is cancelled, Vite rethrows the preload failure into the
    // importing code. When we have decided to reload, that rethrow only adds
    // noise to a document that is going away, so cancel it; when we have not
    // (cooldown active), let it through to the caller's own error path.
    if (recoverFromStaleChunk(payload ?? event)) event.preventDefault();
  };

  const onUnhandledRejection = (event: PromiseRejectionEvent): void => {
    recoverFromStaleChunk(event.reason);
  };

  window.addEventListener("vite:preloadError", onPreloadError);
  window.addEventListener("unhandledrejection", onUnhandledRejection);

  return () => {
    window.removeEventListener("vite:preloadError", onPreloadError);
    window.removeEventListener("unhandledrejection", onUnhandledRejection);
    beforeReload = null;
  };
}
