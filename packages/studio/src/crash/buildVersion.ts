// Build identity for crash reports (spec 060, FR-110 – FR-114).
//
// `appVersion` is `<pkg.version>+<sha7>` — e.g. "0.1.0+a1b2c3d". It is carried
// as a payload field and deliberately EXCLUDED from the fingerprint hash
// (FR-081b): hashing it would fork a brand-new issue for every bug on every
// deploy, which is exactly the "one issue per bug" property the whole dedupe
// layer exists to provide.
//
// WHY A COMPILE-TIME CONSTANT, not `import.meta.env` through a helper. This
// value has to be readable from the pre-mount crash path (FR-114), which runs
// before any env-reading module has necessarily executed. `__KS_COMMIT_SHA__`
// is substituted into the source text by Vite's `define`, so by the time any
// code runs there is nothing left to resolve.

/**
 * The studio package version.
 *
 * Copied as a literal rather than imported from package.json on purpose:
 * `packages/studio/package.json` sits outside this package's tsconfig
 * `include`, and pulling the whole manifest into the client bundle to read one
 * field would add a module edge to the one path that must have none. The
 * drift guard in buildVersion.test.ts reads the real manifest and fails if the
 * two ever diverge — same idiom as `GITHUB_OAUTH_CLIENTS` in
 * utilities/oauth-backend/src/schemas.ts.
 */
export const STUDIO_PACKAGE_VERSION = "0.1.0";

/** Fallback SHA when no build stamped one in — a local `pnpm dev`, or a test run. */
const UNSTAMPED_SHA = "dev";

/**
 * Read `__KS_COMMIT_SHA__` without assuming it was defined.
 *
 * The Vite `define` exists in vite.config.ts but NOT in vitest.config.ts, and a
 * bare reference to an undeclared global throws a ReferenceError rather than
 * evaluating to `undefined`. A crash reporter that throws while composing its
 * own version string is worse than useless, so the read is guarded.
 */
function readCommitSha(): string {
  try {
    if (typeof __KS_COMMIT_SHA__ === "string" && __KS_COMMIT_SHA__.length > 0) {
      return __KS_COMMIT_SHA__;
    }
  } catch {
    // Not defined in this environment — fall through to the unstamped value.
  }
  return UNSTAMPED_SHA;
}

/**
 * The short (7-character) commit SHA, or `"dev"` on an unstamped build.
 *
 * A SHA shorter than 7 characters is returned whole rather than padded — the
 * point is a stable, non-empty identifier, not a fixed width.
 */
export function commitSha7(): string {
  return readCommitSha().slice(0, 7);
}

/**
 * Compose the build identifier carried on every crash report.
 *
 * MUST never return `undefined` or `""` (SC-011): every branch above resolves
 * to a non-empty string, and the package version is a source literal, so the
 * concatenation is non-empty by construction.
 */
export function appVersion(): string {
  return `${STUDIO_PACKAGE_VERSION}+${commitSha7()}`;
}
