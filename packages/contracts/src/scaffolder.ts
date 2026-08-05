// see spec.md section 11 — project scaffolder (template-cleanup pipeline)

import type { VirtualFS } from "./virtualFS";
import type { BaseKeyboard } from "./baseKeyboard";
import type { KeyboardIR } from "./keyboard-ir";
import type { KpsFontEntry, KpsStylesheetEntry } from "./fontEntry";
import type { Attribution } from "./attribution";

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

  /**
   * Pre-parsed KeyboardIR to scaffold over. When supplied, the scaffolder
   * runs the IR-native template-cleanup + identity-propagation pipeline
   * (§8 step 3) directly on this IR instead of re-parsing the fetched
   * base .kmn. Used by callers that already hold an IR — the imported
   * `release/` path and the carve gallery — so a single IR is the source
   * of truth across the session (decision D9).
   *
   * @see spec.md §8 step 3
   */
  ir?: KeyboardIR;

  /**
   * Who to attribute the keyboard to (spec 037 US1).
   *
   * When supplied this is the SINGLE source for the copyright holder across
   * `LICENSE.md`, `IRHeader.copyright` / `store(&COPYRIGHT)`, and the `.kps`
   * `<Copyright>`/`<Author>` fields, so the three cannot drift — 22 shipped
   * keyboards disagree between their `LICENSE.md` and `.kmn` precisely because
   * those were written independently.
   *
   * When OMITTED the scaffolder emits **no** copyright line and sets
   * {@link ScaffoldResult.attributionMissing} rather than inventing one. Naming the keyboard's own display name as the
   * rights holder — the behaviour before spec 037 — is a false attribution, and
   * a missing notice that lint flags is strictly better than a wrong one.
   */
  attribution?: Attribution;

  /**
   * Year to stamp on the new copyright line. Defaults to the current year.
   *
   * Injectable because a copyright notice records when the work was PUBLISHED
   * (spec 037 D2), and because tests must not read the clock — a time-dependent
   * suite breaks at a year boundary.
   */
  emitYear?: number;
}

/**
 * Result returned by {@link ScaffolderService.scaffold}.
 *
 * `warnings` is non-empty when the scaffolder fell back to stub-only output
 * (e.g. the base keyboard's source files were unreachable). The `vfs` is
 * always a complete, Layer-C-clean virtual FS regardless.
 */
export interface ScaffoldResult {
  vfs: VirtualFS;
  /** Non-fatal issues encountered during scaffolding (e.g. fetch failure). */
  warnings: string[];
  /** OSK font entries forwarded from fetchKeyboardSourceToVfs — same shape, see PR #405. */
  fonts: KpsFontEntry[];
  /** Per-keyboard CSS forwarded from fetchKeyboardSourceToVfs — same shape, see PR #405. */
  stylesheets: KpsStylesheetEntry[];
  /**
   * True when no attribution was supplied, so the emitted package carries NO
   * copyright notice (spec 037 US1).
   *
   * A dedicated signal rather than a `warnings` entry: `warnings` means "fell
   * back to stub-only output", and overloading it would make every
   * un-attributed scaffold look like a fetch failure.
   *
   * Callers that publish or download MUST gate on this — an unattributed package
   * is incomplete, and the pre-037 alternative (naming the keyboard's own display
   * name as rights holder) was a false attribution.
   */
  attributionMissing: boolean;
}

/**
 * Characters disallowed in a keyboard identifier (§10 Layer A check #1).
 * Shared between the real engine and the mock scaffolder so both validate
 * identically.
 */
export const KEYBOARD_ID_INVALID_CHARS = /[-\s(),[\]]/;

/**
 * Validate that `id` satisfies §10 Layer A check #1 (identifier rules:
 * 1-255 chars, no spaces / parens / brackets / commas / control chars).
 *
 * Returns `null` if `id` is valid; otherwise a short human-readable error
 * message describing the first failure.
 *
 * Named `validateScaffolderKeyboardId` to avoid a name collision with the
 * wizard-facing {@link validateKeyboardId} exported from `./keyboardId`.
 *
 * @see spec.md §10 Layer A check #1
 */
export function validateScaffolderKeyboardId(id: string): string | null {
  if (id.length === 0) return "keyboard id cannot be empty";
  if (id.length > 255) return "keyboard id is longer than 255 characters";
  if (KEYBOARD_ID_INVALID_CHARS.test(id)) {
    return "keyboard id contains a disallowed character (spaces, parens, brackets, commas, control chars are not allowed)";
  }
  return null;
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
 * anything: band-1 (scaffolder-bake) criteria from §14 Decision 4 are made
 * structurally impossible by the template-cleanup pipeline, so they cannot
 * exist in the returned VirtualFS. Band-2 (layer-c-enforce) criteria are the
 * lint engine's concern and enforced at phase exit or on explicit submit
 * (spec §14 Decision 4).
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
   * @see validateScaffolderKeyboardId
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
   * @returns A {@link ScaffoldResult} containing the scaffolded VFS (with all
   *   band-1 §14 Decision 4 criteria satisfied by construction) and any
   *   non-fatal warnings (e.g. base source files unreachable — stub-only output).
   *   Band-2 criteria are enforced at phase exit or on explicit submit — not on
   *   the 300 ms debounce cycle.
   * @see spec.md §11
   * @see spec.md §8 step 2
   * @see spec.md §9 (Three-group routing)
   * @see spec.md §14 Decision 4 (band-1 vs band-2 enforcement split)
   */
  scaffold(
    base: BaseKeyboard,
    keyboardId: string,
    displayName: string,
    opts?: ScaffoldOptions
  ): Promise<ScaffoldResult>;

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
