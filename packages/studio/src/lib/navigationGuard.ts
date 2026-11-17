// navigationGuard -- the seam between route changes and the unapplied-text question
// (spec 111 FR-046). A leaf module (it imports nothing from the app), so `navigate.ts`,
// `jumpToLocation.ts`, `switchActiveProject.ts` and the history bridge can all use it without
// a cycle, and a test that mocks `navigate.ts` leaves it intact.

// The guard
// Every route change goes through here, so this is where a code view's unapplied
// text is asked about before the author leaves. The guard itself lives in
// `stores/unappliedTextStore.ts` (it needs the working copy); it registers
// itself here at load, so this module imports nothing from the stores.
// `run(proceed)` calls `proceed` now and returns true when nothing is unapplied,
// or holds `proceed` behind the question and returns false.
// ---------------------------------------------------------------------------

export interface NavigationGuard {
  run: (proceed: () => void) => boolean;
  /** True when a leave would ask. */
  dirty: () => boolean;
}

let navigationGuard: NavigationGuard | null = null;
let bypass = false;

/**
 * Run `fn` with the guard stepped aside. Only for code that is already past the guard (a held
 * jump that has just been answered): its own `navigateTo` must not ask a second time.
 */
export function withGuardBypassed(fn: () => void): void {
  const was = bypass;
  bypass = true;
  try {
    fn();
  } finally {
    bypass = was;
  }
}

export function setNavigationGuard(guard: NavigationGuard | null): void {
  navigationGuard = guard;
}

/** Run `proceed` now, or after the author's answer. True when it ran now. */
export function runGuardedNavigation(proceed: () => void): boolean {
  if (bypass || navigationGuard === null) {
    proceed();
    return true;
  }
  return navigationGuard.run(proceed);
}

/** True when leaving now would ask about unapplied text. */
export function navigationIsDirty(): boolean {
  return navigationGuard !== null && navigationGuard.dirty();
}

/** The hash the app last accepted; a browser Back/Forward or link click that moves off it is checked. */
let acceptedHash: string | null = null;

/**
 * Record `hash` as the route the app is on. Called by code that moves the hash on purpose
 * (`navigateTo`'s own write, a `replaceState` that rewrites it), so the change is not read as
 * the browser's Back or a link click.
 */
export function noteAccepted(hash: string): void {
  if (acceptedHash !== null) acceptedHash = hash;
}

/**
 * Work to run once a held route change is answered and made: the survey step pop that goes with a
 * browser Back that crossed routes. Set by the popstate bridge, which fires before `hashchange`.
 */
let afterHeldRoute: (() => void) | null = null;
export function holdAfterRouteChange(fn: () => void): void {
  afterHeldRoute = fn;
}

/** True when the address bar has moved off the last accepted route (read by the popstate bridge). */
export function routeChangedSinceAccepted(): boolean {
  return acceptedHash !== null && typeof window !== "undefined" && window.location.hash !== acceptedHash;
}

/**
 * Guard the route changes `navigateTo` cannot see: the browser's Back/Forward and plain
 * `<a href="#route">` links. When the hash moves while a code view holds unapplied text, the
 * previous hash is put back and the question is asked; Apply or Discard then goes to the hash
 * that was asked for. (Back/Forward has already moved the browser's position, so a kept edit
 * leaves that history entry showing the route the author stayed on.) Returns the cleanup.
 */
export function installHashGuard(): () => void {
  if (typeof window === "undefined") return () => undefined;
  acceptedHash = window.location.hash;
  const onHashChange = (): void => {
    const next = window.location.hash;
    const held = afterHeldRoute;
    afterHeldRoute = null;
    if (next === acceptedHash) return;
    if (navigationGuard === null || !navigationGuard.dirty()) {
      acceptedHash = next;
      return;
    }
    const previous = acceptedHash ?? "";
    window.history.replaceState(window.history.state, "", previous === "" ? window.location.pathname + window.location.search : previous);
    // The route components read the hash on `hashchange`, and replaceState fires none: say so, so
    // they show the route the author is still on.
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    navigationGuard.run(() => {
      acceptedHash = next;
      window.location.hash = next;
      held?.();
    });
  };
  window.addEventListener("hashchange", onHashChange);
  return () => {
    window.removeEventListener("hashchange", onHashChange);
    acceptedHash = null;
  };
}
