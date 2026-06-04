// see spec.md section 11 — project scaffolder (template-cleanup pipeline)

import type { VirtualFS } from "./virtualFS";
import type { BaseKeyboard } from "./baseKeyboard";

/**
 * Three-group routing identifier per spec §9. The scaffolder picks a
 * different template-cleanup pipeline variant per group (e.g. AZERTY
 * gets the full `&CasedKeys` block per §14 Decision 2; non-Roman omits
 * it by default).
 *
 * @see spec.md §9 (Three-group routing)
 */
export type RoutingGroup = "qwerty-qwertz" | "azerty" | "non-roman";

/** Options passed to {@link ScaffolderService.scaffold}. */
export interface ScaffoldOptions {
  /**
   * User-confirmed Three-group routing (§9). When omitted, the scaffolder
   * auto-detects from `base.script` + base id. Pass this when the Phase A
   * user-confirmation step overrides the auto-detection (e.g. the user
   * explicitly picks AZERTY when the heuristic chose QWERTY/QWERTZ, or
   * re-classifies a non-Roman base by script subfamily).
   *
   * @see spec.md §9
   */
  group?: RoutingGroup;
}

/**
 * Service contract for the project scaffolder.
 *
 * The scaffolder duplicates a chosen base keyboard into a fresh in-memory
 * virtual FS and applies the full template-cleanup pipeline:
 *   - Identity propagation: keyboard name, BCP47 tag, copyright, version
 *     reset to match the new keyboard being authored.
 *   - NCAPS strip: leftover NCAPS modifiers removed.
 *   - [CAPS] deletion: [CAPS ...] rules removed.
 *   - &CasedKeys insertion: appropriate CasedKeys store added per
 *     Three-group routing and Decision 2 (§14).
 *   - Touch-layout cleanup: blank or base-only touch-layout entries cleared.
 *
 * The output virtual FS is clean-by-construction before the user touches
 * anything; Layer C hygiene (§10) runs immediately after scaffolding to
 * confirm all band-1 criteria are satisfied (§14, Decision 4).
 *
 * @see spec.md §11
 * @see spec.md §8 step 2 (scaffolding is pipeline step 2)
 */
export interface ScaffolderService {
  /**
   * Validate that `id` satisfies §10 Layer A check #1 (identifier rules:
   * 1-255 chars, no spaces / parens / brackets / commas / control chars).
   *
   * Returns `null` if `id` is valid; otherwise a short human-readable error
   * message describing the first failure. Intended for live-validation in
   * the Phase A "what's the keyboard id" form before {@link scaffold} is
   * called — so the UI can show a real-time "this id won't work" hint
   * while the user is typing.
   *
   * {@link scaffold} performs the same check as a defensive backstop and
   * rejects the returned promise on invalid input. Pre-checking here is
   * the safer path because failures in scaffold come after fork/network
   * setup costs.
   *
   * @see spec.md §10 Layer A check #1
   */
  validateKeyboardId(id: string): string | null;

  /**
   * Create a fresh virtual FS from `base` and apply the full
   * template-cleanup pipeline.
   *
   * The returned FS contains the complete source tree layout (§12):
   * `source/<keyboardId>.kmn`, `.kps`, `.kvks`, `.keyman-touch-layout`,
   * `.ico`, `welcome.htm`, `readme.htm`, `help/<keyboardId>.php`,
   * `LICENSE.md`, `HISTORY.md`, `README.md`, and a skeletal test file.
   *
   * @param base - The chosen base keyboard; drives identity propagation
   *   and (when `opts.group` is omitted) Three-group routing auto-detection.
   * @param keyboardId - snake_case identifier for the new keyboard
   *   (e.g. "my_new_keyboard"). Must satisfy {@link validateKeyboardId};
   *   passing an invalid id rejects the returned promise.
   * @param displayName - Human-readable name written into the package
   *   descriptor and `welcome.htm`.
   * @param opts - Optional overrides. Pass `opts.group` when the Phase A
   *   user-confirmation step explicitly chose a routing different from the
   *   auto-detected one (e.g. user picks AZERTY when base.script suggests
   *   QWERTY/QWERTZ — spec §9).
   * @returns A fully scaffolded, Layer-C-clean virtual FS ready for
   *   Phase B of the survey.
   * @see spec.md §11
   * @see spec.md §8 step 2
   * @see spec.md §9 (Three-group routing)
   */
  scaffold(
    base: BaseKeyboard,
    keyboardId: string,
    displayName: string,
    opts?: ScaffoldOptions
  ): Promise<VirtualFS>;

  /**
   * List the internal template names available to the scaffolder.
   *
   * Template names correspond to base-layout families (e.g. "qwerty",
   * "azerty", "non-roman") used by the Three-group routing (§9) to
   * select the correct cleanup pipeline variant.
   *
   * @returns Ordered array of template name strings.
   * @see spec.md §9 (Three-group routing)
   * @see spec.md §11
   */
  listTemplates(): Promise<string[]>;
}
