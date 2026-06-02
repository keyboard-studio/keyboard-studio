// see spec.md section 7.1 - discovery axes A1..A7 plus sub-axes A2a, A7a

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

export type SpareKeyAvailability = "many" | "RAlt only" | "fully booked";

/** A7a - alphabetic-only sub-axis added in v1.0.1 (spec section 7.1). */
export type RemapPosture = "addition" | "full-remap";

export interface DiscoveryAxisVector {
  /** @see spec.md §7.1 A1 */
  scale: Scale;
  /** @see spec.md §7.1 A2 */
  scriptClass: ScriptClass;
  /**
   * A2a - abugida/abjad only; gates decision rule 2.
   * Used by rule 2 of the §7.2 decision tree. `undefined` (axis not asked)
   * and `false` (asked, no clusters) are treated equivalently for rule firing
   * — both mean rule 2 does not fire on cluster grounds.
   * @see spec.md §7.1 A2a
   */
  clusterSensitivity?: boolean;
  /** @see spec.md §7.1 A3 */
  phoneticIntuition: PhoneticIntuition;
  /** @see spec.md §7.1 A4 */
  diacriticBehavior: DiacriticBehavior;
  /** @see spec.md §7.1 A5 */
  multiMode: MultiMode;
  /** @see spec.md §7.1 A6 */
  constraintEnforcement: ConstraintEnforcement;
  /** @see spec.md §7.1 A7 */
  spareKeyAvailability: SpareKeyAvailability;
  /**
   * A7a - alphabetic only; gates decision rule 8.
   * @see spec.md §7.1 A7a
   */
  remapPosture?: RemapPosture;
}
