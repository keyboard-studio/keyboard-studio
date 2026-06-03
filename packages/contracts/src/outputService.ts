// see spec.md section 12 — output artifacts (zip download + GitHub OAuth PR)

import type { VirtualFS } from "./virtualFS";

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
   * Implementations apply criteria SS1's output-time transforms here:
   * strip compiled artifacts (`.kmx`, `.kvk`, `.js`), inject
   * `NEXT_STEPS.md`, etc., before producing the zip bytes. This is the
   * safe path; consumers cannot accidentally produce a non-compliant zip.
   *
   * @param fs - Virtual FS snapshot to serialize.
   * @returns Raw zip bytes.
   * @see spec.md §12 "Download .zip"
   */
  toZip(fs: VirtualFS): Promise<Uint8Array>;

  /**
   * Fork `keymanapp/keyboards`, push the virtual FS source tree to a new
   * branch, and open a draft PR.
   *
   * The commit includes only source files; `.kmx`, `.kvk`, and `.js`
   * artifacts are excluded (criteria SS1, §12). The PR is opened in
   * draft state so the author can review before requesting review.
   *
   * @param fs - Virtual FS snapshot to publish (source files only).
   * @param opts - GitHub OAuth credentials and PR metadata.
   * @returns URLs and commit SHA of the created PR.
   * @see spec.md §12 "GitHub OAuth fork+PR"
   */
  publishPR(fs: VirtualFS, opts: PublishPROptions): Promise<PublishPRResult>;
}
