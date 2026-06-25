// see spec.md section 12 — output artifacts (zip download + GitHub OAuth PR)

import type { VirtualFS } from "./virtualFS";

/**
 * The ordered phases of the {@link OutputService.publishPR} fork+PR flow (§12).
 * `fork-create` fires ONLY when the fork does not yet exist — on a pre-existing
 * fork that phase is skipped and no event is emitted for it.
 */
export type PublishStepName =
  | "fork-check"
  | "fork-create"
  | "master-ref"
  | "parent-commit"
  | "tree"
  | "commit"
  | "branch"
  | "pr-open";

/**
 * Progress event emitted as `publishPR` enters each phase (see
 * {@link PublishPROptions.onProgress}). `index` is the phase's canonical
 * 1-based position in the full 8-phase flow — so when `fork-create` is skipped
 * the observed indices are 1,3,4,5,6,7,8 rather than a contiguous run.
 */
export interface PublishStep {
  /** Which phase is now starting. */
  name: PublishStepName;
  /** Canonical 1-based position of this phase in the 8-phase flow. */
  index: number;
  /** Total phases in the flow (always 8). */
  total: number;
}

/**
 * Options for the GitHub OAuth fork-and-PR delivery path.
 * @see spec.md §12 "GitHub OAuth fork+PR"
 */
export interface PublishPROptions {
  /** GitHub OAuth access token with `public_repo` scope. */
  token: string;
  /**
   * GitHub username or organization that owns the fork target.
   * The fork of `keymanapp/keyboards` is created under this owner.
   */
  forkOwner: string;
  /**
   * Branch name to create on the fork (e.g. "add/my_keyboard").
   * Convention from §12: `add/<keyboardId>`.
   */
  branchName: string;
  /**
   * Git commit message for the single commit that lands the virtual FS
   * source tree on the branch.
   */
  commitMessage: string;
  /**
   * PR title; typically the keyboard display name.
   * @example "Add My Keyboard 1.0"
   */
  prTitle: string;
  /**
   * Full auto-generated PR body (green check list, yellow items by
   * criteria section, red checklist, copyright attestation) as Markdown.
   * The caller (studio UI) assembles this from LintFinding[] and
   * Criterion[] before calling publishPR.
   * @see spec.md §12 PR body composition
   */
  prBody: string;
  /**
   * Optional "Import attribution" markdown block to append to the PR body.
   * Build this via buildImportAttributionBlock() from
   * packages/engine/src/output/import-attribution.ts.
   * Present only when the session was initialized from an imported release/ keyboard.
   * @see spec.md §12 line 1157
   */
  importAttribution?: string;
  /**
   * Optional progress sink, invoked synchronously as `publishPR` enters each
   * phase of the fork+PR flow (see {@link PublishStep}). Additive and
   * non-breaking — implementations that ignore it behave as before. Intended
   * for the studio to surface per-step progress on large source trees; a
   * console/log sink is a valid v1 consumer. Must not throw; implementations
   * are not required to guard against a throwing callback.
   */
  onProgress?: (step: PublishStep) => void;
}

/**
 * Result returned by a successful {@link OutputService.publishPR} call.
 */
export interface PublishPRResult {
  /** Full URL of the created draft PR on github.com. */
  prUrl: string;
  /** SHA of the commit pushed to the fork branch. */
  commitSha: string;
}

/**
 * Discriminated union of failure modes the publish-PR pipeline can hit.
 *
 * The UI surface differs sharply by `kind` — "auth" → re-auth button;
 * "scope" → "this token needs `public_repo`"; "rate-limit" → countdown;
 * "branch-exists" → branch-rename prompt; "network" → check connection
 * banner. Stringly-typed errors force the UI to pattern-match messages,
 * which is brittle.
 *
 * @see spec.md §12 "GitHub OAuth fork+PR"
 */
export type PublishPRError =
  | { kind: "auth"; message: string }
  | { kind: "scope"; message: string; required: readonly string[] }
  | { kind: "rate-limit"; message: string; retryAfterSeconds: number }
  | { kind: "branch-exists"; message: string; branchName: string }
  | { kind: "network"; message: string }
  | { kind: "unknown"; message: string; cause?: unknown };

/** Result returned by {@link OutputService.verifyToken}. */
export interface VerifyTokenResult {
  /** True when the token has all scopes needed for fork+PR. */
  ok: boolean;
  /** GitHub login (`X-OAuth-Scopes` header user) the token belongs to. */
  login?: string;
  /** OAuth scopes the token actually has. */
  scopes: readonly string[];
  /**
   * Scopes that are missing for fork+PR (i.e. `public_repo`). Empty
   * array when `ok: true`.
   */
  missingScopes: readonly string[];
}

/**
 * Service contract for the output / submit path.
 *
 * Two delivery modes (§12):
 *   1. `toZip` — serialize the virtual FS to a `.zip` archive for
 *      download. Works without a GitHub account. The studio appends
 *      `NEXT_STEPS.md` before calling this method.
 *   2. `publishPR` — GitHub OAuth fork+draft PR. Forks
 *      `keymanapp/keyboards`, creates branch `add/<id>`, commits the
 *      virtual FS source tree (compiled artifacts excluded per criteria
 *      SS1), and opens a draft PR.
 *
 * Implementations MUST NOT include compiled artifacts (`.kmx`, `.kvk`,
 * `.js`) in the PR commit — only source files (§12, criteria SS1).
 * Both methods read the VirtualFS without mutating it.
 *
 * @see spec.md §12
 */
export interface OutputService {
  /**
   * Serialize the virtual FS to a `.zip` archive as raw bytes.
   *
   * The returned `Uint8Array` can be wrapped in
   * `new Blob([bytes], { type: 'application/zip' })` at the browser
   * download site. The zip preserves the full virtual FS path structure
   * (§12 layout); binary entries are stored uncompressed, text entries
   * deflated.
   *
   * `toZip` is the ONLY supported path to serialize the virtual FS — direct
   * serialization is intentionally not exposed on `VirtualFS` (see #97).
   * For the download archive (§12 "Download .zip") the zip intentionally
   * includes compiled artifacts (`.kmx`, `.kvk`, `.js`) alongside source,
   * and injects `NEXT_STEPS.md`. Artifact stripping (criteria SS1) applies
   * ONLY to the `publishPR` path, not here — a downloaded zip is meant to be
   * a complete, runnable bundle, whereas a PR commits source only.
   *
   * @param fs - Virtual FS snapshot to serialize.
   * @returns Raw zip bytes.
   * @see spec.md §12 "Download .zip"
   */
  toZip(fs: VirtualFS): Promise<Uint8Array>;

  /**
   * Verify the OAuth token before invoking the destructive fork+PR flow.
   *
   * Calls GitHub's `GET /user` to read the authenticated login and the
   * `X-OAuth-Scopes` header. Returns a {@link VerifyTokenResult} the UI
   * can use to gate the submit button: when `ok: false`, surface a
   * "re-authenticate" or "add scope" prompt instead of starting the fork.
   *
   * Required scopes for fork+PR are `public_repo` (or `repo` for private
   * forks). Implementations enumerate the missing scopes in
   * {@link VerifyTokenResult.missingScopes} so the UI can show a precise
   * remediation message.
   *
   * @param token - GitHub OAuth access token to verify.
   * @returns Scope-verification result; never rejects on a valid HTTP
   *   response. Promise rejects only on network errors with a
   *   {@link PublishPRError} of kind `"network"`.
   * @see spec.md §12
   */
  verifyToken(token: string): Promise<VerifyTokenResult>;

  /**
   * Fork `keymanapp/keyboards`, push the virtual FS source tree to a new
   * branch, and open a draft PR.
   *
   * The commit includes only source files; `.kmx`, `.kvk`, and `.js`
   * artifacts are excluded (criteria SS1, §12). The PR is opened in
   * draft state so the author can review before requesting review.
   *
   * Pre-check the token with {@link verifyToken} before calling this —
   * scope/auth failures here cost a network round-trip and a half-started
   * fork.
   *
   * Pass {@link PublishPROptions.onProgress} to observe per-phase progress
   * (8 phases; `fork-create` only when the fork is new).
   *
   * @param fs - Virtual FS snapshot to publish (source files only).
   * @param opts - GitHub OAuth credentials and PR metadata.
   * @returns URLs and commit SHA of the created PR.
   * @throws Rejects with a {@link PublishPRError}-typed object so the UI
   *   can `switch` on `err.kind` to choose recovery. Implementations
   *   MUST reject with this shape (not bare `Error`) so callers don't
   *   have to string-match.
   * @see spec.md §12 "GitHub OAuth fork+PR"
   */
  publishPR(fs: VirtualFS, opts: PublishPROptions): Promise<PublishPRResult>;
}
