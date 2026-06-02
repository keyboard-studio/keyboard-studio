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

export type SpareKeyAvailability = "many" | "RAlt-only" | "fully-booked";

/** A7a - alphabetic-only sub-axis added in v1.0.1 (spec section 7.1). */
export type RemapPosture = "addition" | "full-remap";

export interface DiscoveryAxisVector {
  a1_scale: Scale;
  a2_scriptClass: ScriptClass;
  /** A2a - abugida/abjad only; gates decision rule 2. */
  a2a_clusterSensitivity?: boolean;
  a3_phoneticIntuition: PhoneticIntuition;
  a4_diacriticBehavior: DiacriticBehavior;
  a5_multiMode: MultiMode;
  a6_constraintEnforcement: ConstraintEnforcement;
  a7_spareKeyAvailability: SpareKeyAvailability;
  /** A7a - alphabetic only; gates decision rule 8. */
  a7a_remapPosture?: RemapPosture;
}
