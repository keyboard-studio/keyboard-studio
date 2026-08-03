/**
 * FR-004 authority: which package-relative paths a managed-PR submission may
 * commit, and where in the corpus tree a given keyboard's files must land.
 *
 * Pure and synchronous by design -- no I/O, no config, no imports from
 * anything but TypeScript itself. `submitManagedPR` (github-pipeline.ts) is
 * the only caller in the pipeline, and it decides that path *before* any
 * outbound GitHub call, so keeping this module free of async/config
 * dependencies means the authorization decision can never race, block on, or
 * be swayed by anything the pipeline talks to.
 *
 * RELATIONSHIP TO THE TWO EXISTING FILTERS (neither changes):
 *  - `isSourceFile` (packages/engine/src/output/github.ts:79) is a
 *    client-side *extension* filter -- a UX affordance that keeps obviously
 *    non-source files out of what the SPA proposes to submit. It is not a
 *    location control and this module does not rely on it: the backend
 *    trusts nothing the client filtered, only what it re-checks itself.
 *  - `safeEntryName` (packages/engine/src/output/zip.ts:83) is the
 *    segment-walking precedent this module's traversal handling is modelled
 *    on, but it *clamps* a dirty path into a safe one (drop `..`/`.`
 *    segments, strip a drive prefix) so a download always succeeds. FR-005
 *    forbids that here: a submitted path that would need clamping must
 *    reject the whole submission instead, never silently rewrite it. The zip
 *    path keeps clamping; this path rejects.
 *
 * LENGTH-AFTER-PREFIX CHOICE:
 *  The final rule -- total length <= 512 *after* prefixing -- cannot be
 *  evaluated by `validatePackagePaths` alone: prefixing is a function of
 *  `keyboardId`, which this call does not receive. Rather than change the
 *  locked exported signature, `validatePackagePaths` takes an *optional*
 *  second parameter, `prefixLength`, defaulting to `0`. A caller that already
 *  knows the keyboard id (the pipeline, via
 *  `deriveKeyboardPrefix(keyboardId).length`) passes it and gets the true
 *  post-prefix length check; a caller that does not (e.g. a conformance
 *  fixture exercising bare paths) still gets a correct check against the
 *  un-prefixed length. This keeps `validatePackagePaths` the single length
 *  authority -- `applyKeyboardPrefix` performs no validation of its own and
 *  must only be called once `validatePackagePaths` has returned `{ ok: true
 *  }` for the same keyboard's prefix length.
 */

// ---------------------------------------------------------------------------
// Result shape
// ---------------------------------------------------------------------------

/**
 * Why a path was rejected. Never paired with the offending path itself --
 * see `validatePackagePaths` below (US2 AC4 / FR-015).
 */
export type PathRejectionCategory = "absolute" | "traversal" | "metadata" | "malformed";

export type PathCheckResult =
  | { ok: true }
  | { ok: false; category: PathRejectionCategory };

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Total path length ceiling, evaluated after prefixing (see module docblock). */
const MAX_PATH_LENGTH = 512;

/** `keyboardId` shape already enforced by `ManagedPRBodySchema` (managed-pr-schemas.ts:20). */
const KEYBOARD_ID_PATTERN = /^[a-z0-9_]+$/;
const KEYBOARD_ID_MAX_LENGTH = 80;

const METADATA_FIRST_SEGMENTS = new Set(["release", ".github", ".git"]);

// ---------------------------------------------------------------------------
// Per-path check
// ---------------------------------------------------------------------------

/**
 * Check one path against the ordered rule set. Order is load-bearing (see
 * module docblock's cross-reference to data-model.md §2): the leading-`/`
 * check MUST run before the empty-segment check, because a leading `/`
 * produces an empty first segment when split on `/`, and the corpus pins
 * `/etc/passwd` -> `absolute`, not `malformed`. A later tidy-up must not
 * reorder these two.
 */
function checkOnePath(path: string, prefixLength: number): PathCheckResult {
  // Rule 1: non-empty after trimming.
  if (path.trim() === "") return { ok: false, category: "malformed" };

  // Rule 2: does not start with "/". Checked directly on the raw string
  // (not via segments) so it always runs before the empty-segment rule
  // below, regardless of how segments are later computed -- see the
  // ordering note above.
  if (path.startsWith("/")) return { ok: false, category: "absolute" };

  const segments = path.split("/");
  const firstSegment = segments[0] ?? "";

  // Rule 3: first segment is not a Windows drive letter (e.g. "C:/...").
  if (/^[A-Za-z]:$/.test(firstSegment)) return { ok: false, category: "absolute" };

  // Rule 4: contains no backslash.
  if (path.includes("\\")) return { ok: false, category: "malformed" };

  // Rule 5: contains no ".." segment.
  if (segments.includes("..")) return { ok: false, category: "traversal" };

  // Rule 6: contains no "." segment.
  if (segments.includes(".")) return { ok: false, category: "malformed" };

  // Rule 7: contains no empty segment (no "//", no trailing "/"). A leading
  // "/" would also produce an empty first segment, but rule 2 above already
  // rejected that case as "absolute" before we get here.
  if (segments.some((segment) => segment === "")) return { ok: false, category: "malformed" };

  // Rule 8: first segment is not repository metadata ("release", ".github", ".git").
  if (METADATA_FIRST_SEGMENTS.has(firstSegment)) return { ok: false, category: "metadata" };

  // Rule 9: total length <= 512 after prefixing.
  if (path.length + prefixLength > MAX_PATH_LENGTH) return { ok: false, category: "malformed" };

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Validate a whole submission's package-relative paths (FR-004).
 *
 * Any single failing path rejects the ENTIRE list (FR-005) -- this returns
 * on the first failure found, in list order; there is no per-file skip and
 * no partial acceptance. The offending path is never carried in the result,
 * only its rejection category (US2 AC4 / FR-015) -- do not add a `path`
 * field here, and do not log the path.
 *
 * `prefixLength` is optional and defaults to `0`, matching the length of an
 * empty prefix -- i.e. checking the path's own length only. Pass
 * `deriveKeyboardPrefix(keyboardId).length` to get the true post-prefix
 * length check (see the module docblock's "LENGTH-AFTER-PREFIX CHOICE").
 */
export function validatePackagePaths(
  paths: readonly string[],
  prefixLength = 0
): PathCheckResult {
  for (const path of paths) {
    const result = checkOnePath(path, prefixLength);
    if (!result.ok) return result;
  }
  return { ok: true };
}

/**
 * Derive the corpus tree prefix a keyboard's files must land under:
 * `release/<firstLetter>/<keyboardId>/`, matching the live corpus layout
 * enforced by corpus-scope.ts:26-29 and the placement instruction in
 * zip.ts:43.
 *
 * `keyboardId` is expected to already satisfy `ManagedPRBodySchema`'s
 * `/^[a-z0-9_]+$/`, length 1-80 constraint (managed-pr-schemas.ts:20). This
 * function asserts that invariant itself rather than trusting the caller
 * held it -- it is the authority here and may be exercised directly by a
 * conformance suite that bypasses the schema. A violation throws: an invalid
 * keyboardId reaching this point is a programming error, not a user-facing
 * rejection, so it must never become a `PathCheckResult`.
 */
export function deriveKeyboardPrefix(keyboardId: string): string {
  if (
    keyboardId.length < 1 ||
    keyboardId.length > KEYBOARD_ID_MAX_LENGTH ||
    !KEYBOARD_ID_PATTERN.test(keyboardId)
  ) {
    throw new Error(
      `deriveKeyboardPrefix: keyboardId must match ${KEYBOARD_ID_PATTERN} with length 1-${KEYBOARD_ID_MAX_LENGTH}`
    );
  }
  const firstLetter = keyboardId[0] ?? "";
  return `release/${firstLetter}/${keyboardId}/`;
}

/**
 * Prefix every path with the keyboard's permitted tree prefix.
 *
 * Call only after `validatePackagePaths` has returned `{ ok: true }` for
 * this same list -- this function performs no validation of its own (it
 * only re-derives the prefix, which itself asserts the keyboardId
 * invariant). Each `path` is expected to already satisfy the "does not
 * start with /" rule, so simple concatenation with the trailing-slash
 * prefix from `deriveKeyboardPrefix` cannot produce a double slash.
 */
export function applyKeyboardPrefix(keyboardId: string, paths: readonly string[]): string[] {
  const prefix = deriveKeyboardPrefix(keyboardId);
  return paths.map((path) => `${prefix}${path}`);
}
