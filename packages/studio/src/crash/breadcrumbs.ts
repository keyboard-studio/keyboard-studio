// Breadcrumb ring buffer (spec 060, FR-043 – FR-047, data-model §4).
//
// A fixed-size module-scope circular buffer — plumbing in the same category as
// `window.__ksE2E__`. Deliberately NOT React state and NOT a zustand store:
// this has to keep working while the React tree is on fire, and `src/stores/`
// is where the engine-importing modules live (research D6).
//
// WHAT MAY GO IN HERE. Structural facts only — step ids, route hashes, stage
// names (FR-047). No author-authored text, no file content, no identity. The
// redaction allowlist in redact.ts is worthless if a breadcrumb smuggles an
// email through a different layer, so the constraint is enforced here at the
// push site (labels are truncated and callers pass structural handles) rather
// than being audited at send time.

import type { Breadcrumb, BreadcrumbChannel } from "./types.ts";

/** Ring capacity. Enough to cover the run-up to a crash without unbounded growth. */
export const BREADCRUMB_RING_SIZE = 50;

/** Hard cap on a single label, so one runaway console.error cannot bloat a payload. */
export const BREADCRUMB_LABEL_MAX = 200;

// Preallocated ring + write cursor. `count` saturates at the capacity and is
// what distinguishes "ring not yet full" from "ring wrapped".
const ring: Array<Breadcrumb | undefined> = new Array<Breadcrumb | undefined>(
  BREADCRUMB_RING_SIZE,
);
let cursor = 0;
let count = 0;

/** Push one entry, overwriting the oldest at capacity. Never throws. */
export function pushBreadcrumb(channel: BreadcrumbChannel, label: string): void {
  try {
    ring[cursor] = {
      at: new Date().toISOString(),
      channel,
      label: label.slice(0, BREADCRUMB_LABEL_MAX),
    };
    cursor = (cursor + 1) % BREADCRUMB_RING_SIZE;
    if (count < BREADCRUMB_RING_SIZE) count += 1;
  } catch {
    // A breadcrumb is a debugging convenience. It must never be the reason a
    // crash goes unreported.
  }
}

/** Snapshot the ring oldest-first. Returns a copy; the ring itself is never exposed. */
export function readBreadcrumbs(): Breadcrumb[] {
  const out: Breadcrumb[] = [];
  const start = count < BREADCRUMB_RING_SIZE ? 0 : cursor;
  for (let i = 0; i < count; i += 1) {
    const entry = ring[(start + i) % BREADCRUMB_RING_SIZE];
    if (entry !== undefined) out.push(entry);
  }
  return out;
}

/** Drop every entry. Test seam; not used by the app. */
export function _resetBreadcrumbs(): void {
  ring.fill(undefined);
  cursor = 0;
  count = 0;
}

// ---------------------------------------------------------------------------
// console instrumentation (FR-044)
// ---------------------------------------------------------------------------

type ConsoleMethod = (...args: unknown[]) => void;

let originalError: ConsoleMethod | undefined;
let originalWarn: ConsoleMethod | undefined;

/**
 * Reduce console arguments to a bounded, structural label.
 *
 * Only the first argument is read and only its shape is kept — an Error's
 * `name` and `message`, or a short prefix of a string. Objects collapse to
 * their constructor name rather than being serialized: `console.error("saving",
 * workingCopy)` must not put a working copy in the ring.
 */
function labelFor(args: unknown[]): string {
  const first = args[0];
  if (first instanceof Error) return `${first.name}: ${first.message}`;
  if (typeof first === "string") return first;
  if (first === null || first === undefined) return String(first);
  if (typeof first === "object") return `[${first.constructor.name}]`;
  return String(first);
}

/**
 * Wrap `console.error` and `console.warn` so each call is recorded.
 *
 * MUST call the original AND push (FR-044) — never replace. Swallowing a
 * console.error to feed the ring would make the crash reporter the reason a
 * developer cannot see their own logs, which is a strictly worse trade than no
 * breadcrumbs at all. Idempotent: a second call is a no-op, so a double-install
 * cannot double-wrap and double-push.
 */
export function installConsoleBreadcrumbs(): void {
  if (originalError !== undefined) return;

  originalError = console.error.bind(console) as ConsoleMethod;
  originalWarn = console.warn.bind(console) as ConsoleMethod;

  console.error = (...args: unknown[]): void => {
    (originalError as ConsoleMethod)(...args);
    pushBreadcrumb("console.error", labelFor(args));
  };
  console.warn = (...args: unknown[]): void => {
    (originalWarn as ConsoleMethod)(...args);
    pushBreadcrumb("console.warn", labelFor(args));
  };
}

/** Restore the original console methods. Test seam; not used by the app. */
export function _uninstallConsoleBreadcrumbs(): void {
  if (originalError !== undefined) console.error = originalError;
  if (originalWarn !== undefined) console.warn = originalWarn;
  originalError = undefined;
  originalWarn = undefined;
}
