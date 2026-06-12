// see spec.md section 7.1 - discovery axes A1..A7 plus sub-axes A2a, A3a, A7a

export type Scale = "tiny" | "small" | "medium" | "large" | "massive";

export type ScriptClass =
  | "alphabetic"
  | "abugida"
  | "abjad"
  | "syllabary"
  | "logographic";

export type PhoneticIntuition = "strong" | "weak";

export type DiacriticBehavior =
  | "none"
  | "stacking-combining"
  | "replacing-cycling"
  | "multi-family";

export type MultiMode = "single" | "two-orthography";

export type ConstraintEnforcement = "none" | "soft" | "loud";

/**
 * A7 — physical-keyboard spare-key availability.
 * Literal values are spec §7.1 prose strings verbatim — DISPLAY strings, not
 * programmatic identifiers. Do not use them as object/map keys, URL query
 * params, or YAML keys without quoting; downstream code that needs a
 * normalized key form should map: "many" -> "many", "RAlt only" -> "ralt-only",
 * "fully booked" -> "fully-booked" (or similar) at the boundary.
 */
export type SpareKeyAvailability = "many" | "RAlt only" | "fully booked";

/** A7a - alphabetic-only sub-axis added in v1.0.1 (spec section 7.1). */
export type RemapPosture = "addition" | "full-remap";

/** A3a — mark-input order sub-axis (alphabetic scripts only). Parent axis: A3 (phoneticIntuition). */
export type MarkInputOrder = "prefix" | "postfix";

export interface DiscoveryAxisVector {
  /** @see spec.md §7.1 A1 */
  scale: Scale;
  /** @see spec.md §7.1 A2 */
  scriptClass: ScriptClass;
  /**
   * A2a — cluster sensitivity (abugida/abjad only). Parent axis: A2 (scriptClass).
   *
   * Three valid states, all semantically distinct:
   * - `undefined` — axis not yet elicited (survey incomplete for abugida/abjad
   *   scripts, or A2 is alphabetic/syllabary/logographic so A2a is N/A).
   * - `false` — elicited; user answered "no clusters needed".
   * - `true` — elicited; user answered "clusters needed".
   *
   * §7.2 decision rule 2 (`A2=abjad OR (A2=abugida AND cluster sensitivity=yes)`)
   * fires ONLY when this field is exactly `true`. Both `undefined` and `false`
   * leave rule 2 dormant on cluster grounds — but consumers managing survey
   * state must distinguish them (resumability, LLM context, completeness
   * validation). See companion helper `gatesRule2OnClusters` / `isAxisElicited`
   * if/when those are added.
   *
   * @see spec.md §7.1 A2a
   */
  clusterSensitivity?: boolean;
  /** @see spec.md §7.1 A3 */
  phoneticIntuition: PhoneticIntuition;
  /**
   * A3a — mark-input order sub-axis (alphabetic scripts only). Parent axis: A3 (phoneticIntuition),
   * also gated by A2=alphabetic.
   *
   * Three valid states, all semantically distinct (same shape as
   * {@link clusterSensitivity} and {@link remapPosture}):
   * - `undefined` — not yet elicited (survey incomplete, A2 is non-alphabetic, or A3=weak
   *   so A3a is N/A).
   * - `"prefix"` — elicited; community uses mark-then-letter (press the accent key first,
   *   then the base letter — classic deadkey / S-02 flow, e.g. ´ + a → á).
   * - `"postfix"` — elicited; community uses letter-then-mark (type the base letter first,
   *   then the suffix key — sequence-replace / S-03 flow, e.g. a + ´ → á).
   *
   * Elicitation gate: ask when A2=alphabetic AND A3=strong. When A3=weak or A2≠alphabetic,
   * leave this field `undefined` — the question is N/A for shape-based or non-alphabetic
   * keyboards.
   *
   * Decision-tree impact: when `markInputOrder="postfix"`, decision-tree rule 3a fires
   * (before rules 5 and 7) and routes primary to S-03 (sequence replace) + S-04,
   * overriding the A3=strong heuristic that would otherwise select S-02 (rule 7) or
   * S-05 (rule 5). This closes the §7.5 IPA mismatch (sequence-modifier preference).
   *
   * @see spec.md §7.1 A3a
   * @see spec.md §7.2 rule 3a
   */
  markInputOrder?: MarkInputOrder;
  /** @see spec.md §7.1 A4 */
  diacriticBehavior: DiacriticBehavior;
  /** @see spec.md §7.1 A5 */
  multiMode: MultiMode;
  /** @see spec.md §7.1 A6 */
  constraintEnforcement: ConstraintEnforcement;
  /** @see spec.md §7.1 A7 */
  spareKeyAvailability: SpareKeyAvailability;
  /**
   * A7a — full-remap detection (alphabetic only). Parent axis: A7 (spareKeyAvailability),
   * gated also by A2=alphabetic.
   *
   * Three valid states, all semantically distinct (same shape as
   * {@link clusterSensitivity} above):
   * - `undefined` — axis not yet elicited (survey incomplete for alphabetic
   *   scripts, or A2 is non-alphabetic so A7a is N/A).
   * - `"addition"` — elicited; most base keys unchanged (Akan-style additive).
   * - `"full-remap"` — elicited; every base key reassigned (Russian/Armenian/
   *   Greek mnemonic style).
   *
   * §7.2 decision rule 8 (`A2=alphabetic AND A7a=full-remap`) fires ONLY when
   * this field is exactly `"full-remap"`. Both `undefined` and `"addition"`
   * leave rule 8 dormant — but consumers managing survey state must
   * distinguish elicited-as-addition from unelicited.
   *
   * @see spec.md §7.1 A7a
   */
  remapPosture?: RemapPosture;
}
