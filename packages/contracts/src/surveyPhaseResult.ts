// see spec.md section 8 - data flow (Phases A..G; "C-prime" is the reorder phase)

import type { AnswerType } from "./pattern";
import type { DiscoveryAxisVector } from "./axes";
import type { KeyboardIdentity } from "./keyboardIdentity";
import type { MechanismAssignment } from "./assignmentMap";
import type { ConfirmedAlphabet, OutputForm, PlacementWorklist } from "./confirmedAlphabet";

/**
 * Survey phase identifiers per spec §8.
 *
 * The literal `"C-prime"` is the ASCII-safe programmatic form of the spec's
 * `C'` notation (apostrophe; pronounced "C prime"). User-facing UI labels
 * should render this as `C'` to match the spec. The string-literal form
 * exists so grep and TS string narrowing don't have to deal with the
 * apostrophe character.
 *
 * @see spec.md §8 (data flow — Phases A..G with C-prime reorder)
 */
export type SurveyPhase = "A" | "B" | "C" | "C-prime" | "D" | "E" | "F" | "G";

// Maps each AnswerType to its runtime value shape. SurveyAnswer is derived by
// iterating over AnswerType so new members added to AnswerType automatically
// appear in SurveyAnswer. A missing AnswerValueMap entry produces value: never,
// making that variant impossible to construct and flagging the omission.
type AnswerValueMap = {
  "char-list": string[];
  "char-single": string;
  "key-name": string;
  "store-content": string;
  "boolean": boolean;
  "select": string;
  "text": string;
};

/** Discriminated union of all survey answer shapes keyed by {@link AnswerType}. Narrow on `answerType` to access the correctly-typed `value`. @see spec.md §8 */
export type SurveyAnswer = {
  [K in AnswerType]: {
    questionId: string;
    answerType: K;
    value: K extends keyof AnswerValueMap ? AnswerValueMap[K] : never;
  };
}[AnswerType];

export interface SurveyPhaseResult {
  phase: SurveyPhase;
  answers: SurveyAnswer[];
  /** Typed identity fields resolved from Phase A; undefined for phases B..G. */
  identity?: KeyboardIdentity;
  /** Axes resolved at this phase. Use {@link mergePhaseResults} (surveySession.ts) to build the full merged vector across all phases. */
  computedAxes?: Partial<DiscoveryAxisVector>;
  /** Pattern IDs selected from the gallery during this phase. */
  selectedPatternIds?: string[];
  /**
   * Scoped, multi-valued mechanism assignments produced by the gallery this
   * phase (spec §7.7). **Additive (issue #368)** — carried alongside the flat
   * `selectedPatternIds`, not replacing it; the breaking redesign that collapses
   * the two is the #5b joint-session deliverable. Merge across phases with
   * {@link mergeAssignments} (last-wins per modality+scope+target). `undefined`
   * for phases that produce no assignments (A/F and any gallery-free phase).
   */
  assignments?: MechanismAssignment[];
  /**
   * NFC graphemes the keyboard must produce, collected during the character-
   * discovery phase (spec §8 step 4). **Additive** — optional on each phase
   * result; populated by Phase B from manual-flow answers and other discovery
   * methods. Merge across phases with {@link mergePhaseResults} (deduped union,
   * first-appearance order, NFC-normalised, empties dropped). `undefined` for
   * phases that do not run character discovery (A, C..G).
   */
  confirmedInventory?: string[];
  /**
   * Multi-letter units the language's exemplar source wrote as `{..}` clusters
   * — Ewondo's `dz`, `kp`, `ng`, `nk`, `ts`; Hausa's `sh`, `ts`, `ny`.
   *
   * **Deliberately NOT part of `confirmedInventory`.** A digraph is not a
   * character to type: the keyboard produces it by typing its constituent
   * letters, which the exemplar parse already contributes individually
   * (`parseUnicodeSet` folds a `{dz}` cluster's `d` and `z` into `used` while
   * recording the cluster only here). Folding clusters into the inventory would
   * put "dz" on the placement worklist as if it needed a key of its own.
   *
   * Recorded because it is a real orthographic signal downstream operations
   * want and cannot recover once the parse is discarded — collation order,
   * the S-01 digraph strategy path (`LinguistInventory.digraphsAsPhonemeUnits`
   * is its author-declared counterpart), and any "is this two keystrokes or
   * one unit?" question. Nothing consumes it yet; it is stored so it is there
   * when something does.
   *
   * **Additive** — `undefined` for phases that run no character discovery, and
   * for a discovery run whose source attested no clusters. Merged across phases
   * by {@link mergePhaseResults} (deduped union, first-appearance order).
   */
  attestedDigraphs?: string[];
  /**
   * Three-store confirmed alphabet (bases / marks / attested stacks, spec 071).
   * **Additive** — the canonical model behind `confirmedInventory`, which is
   * derived from it via `deriveConfirmedInventory` (confirmedAlphabet.ts) and
   * never edited independently. Merge across phases with
   * {@link mergePhaseResults} (store-wise deduped union, order-preserving
   * stacks, last-wins declared roles). `undefined` for phases that do not run
   * character discovery.
   */
  alphabet?: ConfirmedAlphabet;
  /**
   * Marks-series exit state (spec 071): the placement classification the
   * mechanism gallery consumes. **Additive** — produced by the marks series
   * step (empty worklist on a skipped series); last phase carrying one wins in
   * {@link mergePhaseResults}. `undefined` for phases that do not run the series.
   */
  marksWorklist?: PlacementWorklist;
  /**
   * The S4 whole-keyboard output-form decision (spec 071): "ready-made" or
   * "base-plus-mark". **Additive** — previously a studio-local payload
   * extension (`MarksCompleteResult.marksOutputForm` in steps/reducer.ts);
   * promoted to the contract so carve's needed-set derivation
   * (`deriveCarveNeededSet`, engine/src/marks/carve-needed-set.ts) can read
   * it off the merged session rather than a studio-only shape. Last phase
   * carrying one wins in {@link mergePhaseResults} (mirrors `marksWorklist`).
   * `undefined` for phases that do not run the series, or before the series'
   * output-form station has been confirmed.
   */
  marksOutputForm?: OutputForm;
  /**
   * Base-keyboard characters the author chose to KEEP even though the
   * orthography does not use them — the loanword / email-address / web-address
   * convenience set (the pre-carve convenience question).
   *
   * **Deliberately NOT part of `confirmedInventory`.** These are not the
   * language's characters and must not become placement work: they are already
   * on keys the base keyboard provides, and folding them into the inventory
   * would put them on the mechanism gallery's worklist and inside the Phase F
   * "every character implemented" gate as if the author had declared them part
   * of the orthography. Their one job is to be *shielded from carve* — the
   * carve gallery unions this list into its needed-set so the characters stop
   * being proposed for removal.
   *
   * **Additive** — `undefined` for every phase that does not run the
   * convenience question, and for a run that retained nothing (which is
   * recorded as `[]`, not absent: an author who deliberately kept none is a
   * different state from a question never asked). Merged across phases by
   * {@link mergePhaseResults} (deduped union, first-appearance order,
   * NFC-normalised).
   */
  retainedConvenienceChars?: string[];
}
