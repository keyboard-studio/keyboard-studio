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
 * (FR-051). Chrome, Firefox, and Safari each word it differently, and the
 * classifier only ever sees the text — which is exactly why FR-005a insists the
 * ORIGINAL rejection reaches here rather than a synthetic wrapper string.
 */
export const STALE_CHUNK_PATTERN =
  /failed to fetch dynamically imported module|error loading dynamically imported module|importing a module script failed/i;

/** Does this message look like a stale-deployment chunk failure? */
export function isStaleChunkFailure(message: string): boolean {
  return STALE_CHUNK_PATTERN.test(message);
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
  options: {
    /** Injectable so tests need no real navigation. */
    reload?: () => void;
    now?: number;
  } = {},
): boolean {
  if (!isStaleChunkFailure(message)) return false;

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

  const reload = options.reload ?? (() => { window.location.reload(); });
  reload();
  return true;
}

/** Clear the reload marker. Test seam. @internal */
export function _resetStaleChunkState(): void {
  try {
    sessionStorage.removeItem(STALE_CHUNK_RELOAD_KEY);
  } catch {
    // Nothing to clear.
  }
}
