// Stale-deployment carve-out (spec 060, FR-050 – FR-055, FR-130).
//
// THE PROBLEM THIS SOLVES. Vite emits content-hashed chunks. When a new build
// deploys, the old chunk filenames stop existing — but every browser tab still
// running the previous build holds the OLD filenames in its module graph. The
// next lazy import in those tabs 404s. Nothing is broken: the code is fine, the
// deploy is fine, the tab is simply out of date. A reload fixes it completely.
//
// Without this carve-out, every one of those tabs files a crash report within
// minutes of every deploy — a flood of identical, unactionable issues arriving
// precisely when maintainers are watching a release. That is the single
// highest-volume false positive the reporter could produce.
//
// THE ONE-SHOT RULE (FR-052). Reload once, then never again for the same
// window. Reloading unconditionally on a chunk 404 is a reload loop for anyone
// whose network genuinely cannot reach the asset — the reload re-runs the same
// import, which fails the same way, forever. So the first detection reloads and
// records when; a second detection inside the window means reloading did NOT
// help, so the failure is genuine and goes to ordinary filing (FR-053).
//
// NOT A D3 TIMER (FR-130). This is a single `sessionStorage` timestamp
// comparison, evaluated once at the moment of failure. It runs no interval,
// starts no debounce, validates nothing, and emits no diagnostic — so the
// studio's one 300 ms validation cycle remains the only validation cadence.
//
// TWO ENTRY POINTS, ONE GATE. `globalHandlers.ts` calls in with a flattened
// message for whatever reaches the window; import sites that catch their own
// rejection call in with the thrown value (`recoverFromStaleChunk`, or
// `importOrReload` around the load). Both funnel through the same one-shot
// gate, so a failure seen by both — Vite's `vite:preloadError` fires globally
// while the same rejection lands in the importing code's `catch` — still costs
// exactly one reload.

import { markRetryExhausted } from "./send.ts";

/**
 * How long after a reload a repeat failure counts as "reloading didn't help".
 *
 * Exported so tests assert against the constant rather than restating 60000
 * (contracts/client-surface.md).
 */
export const STALE_CHUNK_RELOAD_WINDOW_MS = 60_000;

/** `sessionStorage` key holding the epoch-ms of the last carve-out reload. */
export const STALE_CHUNK_RELOAD_KEY = "ks.staleChunkReloadedAt";

/**
 * The failure texts browsers produce for an unreachable dynamic import
 * (FR-051). Chrome, Firefox, and Safari each word it differently, Chrome's
 * module-script MIME complaint is a fourth wording of the same failure (the
 * `vercel.json` catch-all rewrite turns the missing chunk's 404 into a
 * `200 text/html`), and Vite's own preload helper adds a CSS-preload variant
 * — so match on all of them rather than on one engine's text. The classifier
 * only ever sees the text — which is exactly why FR-005a insists the ORIGINAL
 * rejection reaches here rather than a synthetic wrapper string.
 */
export const STALE_CHUNK_PATTERN =
  /failed to fetch dynamically imported module|error loading dynamically imported module|importing a module script failed|failed to load module script|unable to preload css/i;

/** Does this message look like a stale-deployment chunk failure? */
export function isStaleChunkFailure(message: string): boolean {
  return STALE_CHUNK_PATTERN.test(message);
}

/** Longest `cause` chain walked when unwrapping a rethrown load error. */
const MAX_CAUSE_DEPTH = 5;

/**
 * True when `err` (or anything in its `cause` chain) is a module-load failure
 * of the kind a redeploy produces. Wrapped errors matter here: the engine
 * reports the compiler failure as `CompilerLoadError("kmc-kmn load failed:
 * <original message>")`, so the text is nested one level down by the time the
 * studio sees it.
 *
 * `isStaleChunkFailure` above takes an already-flattened message string (what
 * `globalHandlers.ts`'s window-level net hands it); this instead takes the
 * thrown value itself, for call sites — `importOrReload`, the engine-load
 * catch in `useKeyboardArtifact.ts` — that only have the error object.
 */
export function isStaleChunkError(err: unknown): boolean {
  let current: unknown = err;
  for (let depth = 0; depth <= MAX_CAUSE_DEPTH; depth += 1) {
    const text =
      current instanceof Error ? current.message : typeof current === "string" ? current : "";
    if (isStaleChunkFailure(text)) return true;
    if (!(current instanceof Error) || current.cause === undefined) return false;
    current = current.cause;
  }
  return false;
}

/**
 * What a carve-out reload does.
 *
 * `main.tsx` registers a reload that flushes the active draft first, so the
 * author's in-flight working copy survives the round trip rather than falling
 * back to the last ~500 ms autosave. Registered rather than imported:
 * `draftPersistence.ts` is reachable from `services.ts`, which reaches this
 * module through `importOrReload`, so a direct import would close a dependency
 * cycle depcruise rejects — and the FR-013 self-containment gate keeps this
 * module's own graph deliberately small besides.
 */
let reloadTab: () => void = () => {
  window.location.reload();
};

/** Register the reload used when no explicit one is passed. @see reloadTab */
export function setStaleChunkReload(reload: () => void): void {
  reloadTab = reload;
}

function readReloadedAt(): number | null {
  try {
    const raw = sessionStorage.getItem(STALE_CHUNK_RELOAD_KEY);
    if (raw === null) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writeReloadedAt(at: number): void {
  try {
    sessionStorage.setItem(STALE_CHUNK_RELOAD_KEY, String(at));
  } catch {
    // Storage unavailable. Without the timestamp the next failure would reload
    // again, so the caller's reload is skipped entirely in that case — see
    // handleStaleChunkFailure.
  }
}

/** Injectable reload + clock, so tests need no real navigation. */
interface ReloadOptions {
  reload?: () => void;
  now?: number;
}

/**
 * The one-shot gate itself, once the caller has decided the failure IS stale.
 *
 * Both classifiers below funnel through here, which is the point: one
 * `sessionStorage` key, one cooldown, one reload for the whole failure class.
 * Two gates tracking the same class would each let a reload through and the tab
 * would reload twice for one deploy.
 */
function reloadOnce(options: ReloadOptions): boolean {
  const now = options.now ?? Date.now();
  const reloadedAt = readReloadedAt();

  if (reloadedAt !== null && now - reloadedAt < STALE_CHUNK_RELOAD_WINDOW_MS) {
    // Already reloaded once and it failed again. Not stale — unreachable.
    markRetryExhausted();
    return false;
  }

  writeReloadedAt(now);

  // Only reload if the timestamp actually persisted. Reloading without a
  // durable record of having done so is the reload loop this guard exists to
  // prevent.
  if (readReloadedAt() === null) return false;

  const reload = options.reload ?? reloadTab;
  reload();
  return true;
}

/**
 * Classify and, on a first detection, recover from a stale-deployment failure.
 *
 * Returns `true` when the failure was HANDLED and must NOT be reported —
 * i.e. a reload was triggered. Returns `false` in every other case, including
 * a repeat inside the window: that one is genuinely unreachable, so the retry
 * notice is raised (FR-053) and the failure falls through to ordinary filing.
 */
export function handleStaleChunkFailure(
  message: string,
  options: ReloadOptions = {},
): boolean {
  if (!isStaleChunkFailure(message)) return false;
  return reloadOnce(options);
}

/**
 * `handleStaleChunkFailure` for callers holding the thrown value rather than a
 * flattened message — an import site's own `catch`, where the `cause` chain is
 * still intact.
 *
 * Same gate, same key, same cooldown: a failure that reaches both this and the
 * window-level net costs exactly one reload, not two.
 */
export function recoverFromStaleChunk(
  err: unknown,
  options: ReloadOptions = {},
): boolean {
  if (typeof window === "undefined") return false;
  if (!isStaleChunkError(err)) return false;
  return reloadOnce(options);
}

/**
 * Run `load()`, reloading the tab when it fails because the chunk it wants no
 * longer exists on the server.
 *
 * The rejection is ALWAYS rethrown, so a caller that survives — cooldown
 * active, or a failure with an unrelated cause — still runs its own error path.
 * Wrap a lazy load at the site that owns it whenever that site swallows or
 * rewrites the rejection, because the window-level net in `globalHandlers.ts`
 * only ever sees what nobody caught.
 */
export async function importOrReload<T>(load: () => Promise<T>): Promise<T> {
  try {
    return await load();
  } catch (err: unknown) {
    recoverFromStaleChunk(err);
    throw err;
  }
}

/** Clear the reload marker and any registered reload. Test seam. @internal */
export function _resetStaleChunkState(): void {
  reloadTab = () => {
    window.location.reload();
  };
  try {
    sessionStorage.removeItem(STALE_CHUNK_RELOAD_KEY);
  } catch {
    // Nothing to clear.
  }
}
