// envFlag — shared "import.meta.env flag, with a ?param URL-query fallback"
// helper. Consolidates the pattern previously duplicated across
// lib/e2eHook.ts (VITE_E2E / ?e2e=1), stores/debugPinsStore.ts
// (VITE_KM_DEBUG / ?debug=1), and flags/mutateFlag.ts (VITE_KM_MUTATE_SEAM,
// no URL fallback).

/**
 * Read a boolean feature flag: `import.meta.env[envKey] === "1"`, with an
 * optional `?urlParam=1` runtime override.
 *
 * Precedence: env flag first, then (if `urlParam` is given) the URL query
 * param — either being exactly `"1"` returns `true`.
 *
 * SSR/Node-CI safety differs by whether a URL fallback is requested:
 *   - When `urlParam` is omitted (e.g. mutateFlag, which has no URL
 *     override), the only browser API touched is `import.meta.env`, so the
 *     try/catch around that read is sufficient — the env check still runs
 *     even outside a browser (e.g. a bare Node import where `import.meta.env`
 *     is undefined and the property access throws, caught below).
 *   - When `urlParam` is given, reading it requires `window.location`, so we
 *     guard the whole call with `typeof window === "undefined"` up front —
 *     matching the original e2eHook/debugPinsStore behavior of returning
 *     `false` outright (without even checking the env var) in SSR/Node-CI.
 */
export function readEnvFlag(envKey: string, urlParam?: string): boolean {
  if (urlParam !== undefined && typeof window === "undefined") return false;

  try {
    if (import.meta.env[envKey] === "1") return true;
  } catch {
    // Not in a Vite context — fall through to the URL check (if any).
  }

  if (urlParam === undefined) return false;

  try {
    return new URLSearchParams(window.location.search).get(urlParam) === "1";
  } catch {
    return false;
  }
}
