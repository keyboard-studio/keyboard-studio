/**
 * The §7.5 seed fixture set — the 13-row hand table from
 * specs/007-strategy-selection/spec.md §7.5, encoded as data (issue #297:
 * "The 13-row §7.5 hand table becomes the seed fixture set").
 *
 * Each row carries the documented axis vector, the documented tree output
 * (rule → primary + secondaries), and the keyboard's actual dominant
 * strategy, so the regression gate can assert BOTH halves of the table:
 * the tree reproduces its documented pick, and the agreement test (tree
 * primary, or a tree secondary, equals the actual dominant) reproduces the
 * documented ✓/✗ column — including the one remaining intentional
 * EuroLatin mismatch. (The IPA mismatch was closed by rule 3a in v1.1.1;
 * its row now agrees.)
 *
 * The tree-output half is also pinned by the engine's own
 * strategy-selector tests; this set is the corpus-eval gate, which adds
 * the agreement half the engine suite does not assert.
 */

import type { DiscoveryAxisVector, PrimaryRuleNumber, StrategyId } from "@keyboard-studio/contracts";

export interface SeedRow {
  /** Exemplar name as in the §7.5 table. */
  name: string;
  /** Corpus path as in the §7.5 table (`release/<vendor>/<id>/`). */
  corpusPath: string;
  /** The documented axis vector (A2a/A3a absent where the table shows —). */
  axes: DiscoveryAxisVector;
  /** Documented "Tree → strategy" rule. */
  expectRule: PrimaryRuleNumber;
  /** Documented "Tree → strategy" primary. */
  expectPrimary: StrategyId;
  /** Documented "Tree → strategy" secondaries. */
  expectSecondaries: StrategyId[];
  /** The keyboard's actual dominant strategy ("Actual primary" column). */
  actualPrimary: StrategyId;
  /** Documented agreement: true = ✓, false = the intentional mismatch. */
  expectAgreement: boolean;
}

export const SEED_ROWS: SeedRow[] = [
  {
    name: "akan",
    corpusPath: "release/a/akan/",
    axes: { scale: "tiny", scriptClass: "alphabetic", phoneticIntuition: "strong", diacriticBehavior: "none", multiMode: "single", constraintEnforcement: "none", spareKeyAvailability: "many", remapPosture: "addition" },
    expectRule: 11, expectPrimary: "S-01", expectSecondaries: [],
    actualPrimary: "S-01", expectAgreement: true,
  },
  {
    name: "sil_euro_latin",
    corpusPath: "release/sil/sil_euro_latin/",
    axes: { scale: "large", scriptClass: "alphabetic", phoneticIntuition: "strong", diacriticBehavior: "multi-family", multiMode: "single", constraintEnforcement: "none", spareKeyAvailability: "RAlt only", remapPosture: "addition" },
    expectRule: 5, expectPrimary: "S-05", expectSecondaries: ["S-04"],
    // Actual: S-02 dominant with S-04/S-08 — the one remaining intentional
    // mismatch in the table (✗).
    actualPrimary: "S-02", expectAgreement: false,
  },
  {
    name: "sil_ipa",
    corpusPath: "release/sil/sil_ipa/",
    axes: { scale: "medium", scriptClass: "alphabetic", phoneticIntuition: "strong", markInputOrder: "postfix", diacriticBehavior: "none", multiMode: "single", constraintEnforcement: "none", spareKeyAvailability: "many", remapPosture: "addition" },
    expectRule: "3a", expectPrimary: "S-03", expectSecondaries: ["S-04"],
    actualPrimary: "S-03", expectAgreement: true,
  },
  {
    name: "sil_devanagari_phonetic",
    corpusPath: "release/sil/sil_devanagari_phonetic/",
    axes: { scale: "medium", scriptClass: "abugida", clusterSensitivity: true, phoneticIntuition: "strong", diacriticBehavior: "none", multiMode: "single", constraintEnforcement: "none", spareKeyAvailability: "many" },
    expectRule: 2, expectPrimary: "S-09", expectSecondaries: ["S-05"],
    actualPrimary: "S-09", expectAgreement: true,
  },
  {
    name: "vietnamese_telex",
    corpusPath: "release/v/vietnamese_telex/",
    axes: { scale: "medium", scriptClass: "alphabetic", phoneticIntuition: "strong", diacriticBehavior: "replacing-cycling", multiMode: "single", constraintEnforcement: "none", spareKeyAvailability: "many", remapPosture: "addition" },
    expectRule: 3, expectPrimary: "S-07", expectSecondaries: ["S-04"],
    actualPrimary: "S-07", expectAgreement: true,
  },
  {
    name: "sil_yoruba8",
    corpusPath: "release/sil/sil_yoruba8/",
    axes: { scale: "medium", scriptClass: "alphabetic", phoneticIntuition: "strong", diacriticBehavior: "multi-family", multiMode: "two-orthography", constraintEnforcement: "none", spareKeyAvailability: "many", remapPosture: "addition" },
    expectRule: 4, expectPrimary: "S-11", expectSecondaries: [],
    actualPrimary: "S-11", expectAgreement: true,
  },
  {
    name: "armenian_mnemonic_r",
    corpusPath: "release/a/armenian_mnemonic_r/",
    axes: { scale: "medium", scriptClass: "alphabetic", phoneticIntuition: "weak", diacriticBehavior: "none", multiMode: "single", constraintEnforcement: "none", spareKeyAvailability: "RAlt only", remapPosture: "full-remap" },
    expectRule: 8, expectPrimary: "S-06", expectSecondaries: ["S-04", "S-08"],
    actualPrimary: "S-06", expectAgreement: true,
  },
  {
    name: "el_pasifika",
    corpusPath: "release/el/el_pasifika/",
    axes: { scale: "small", scriptClass: "alphabetic", phoneticIntuition: "strong", diacriticBehavior: "stacking-combining", multiMode: "single", constraintEnforcement: "loud", spareKeyAvailability: "many", remapPosture: "addition" },
    expectRule: 7, expectPrimary: "S-02", expectSecondaries: ["S-04", "S-10"],
    actualPrimary: "S-02", expectAgreement: true,
  },
  {
    name: "cs_pinyin",
    corpusPath: "release/c/cs_pinyin/",
    axes: { scale: "massive", scriptClass: "logographic", phoneticIntuition: "weak", diacriticBehavior: "none", multiMode: "single", constraintEnforcement: "none", spareKeyAvailability: "many" },
    expectRule: 1, expectPrimary: "S-12", expectSecondaries: [],
    actualPrimary: "S-12", expectAgreement: true,
  },
  {
    name: "itrans_devanagari_hindi",
    corpusPath: "release/itrans/itrans_devanagari_hindi/",
    axes: { scale: "large", scriptClass: "abugida", clusterSensitivity: true, phoneticIntuition: "strong", diacriticBehavior: "none", multiMode: "two-orthography", constraintEnforcement: "none", spareKeyAvailability: "many" },
    expectRule: 2, expectPrimary: "S-09", expectSecondaries: ["S-05", "S-11"],
    actualPrimary: "S-09", expectAgreement: true,
  },
  {
    name: "sil_pan_africa_mnemonic",
    corpusPath: "release/sil/sil_pan_africa_mnemonic/",
    axes: { scale: "large", scriptClass: "alphabetic", phoneticIntuition: "weak", diacriticBehavior: "multi-family", multiMode: "single", constraintEnforcement: "none", spareKeyAvailability: "many", remapPosture: "addition" },
    expectRule: 6, expectPrimary: "S-06", expectSecondaries: ["S-04"],
    actualPrimary: "S-06", expectAgreement: true,
  },
  {
    name: "arabic_izza",
    corpusPath: "release/a/arabic_izza/",
    axes: { scale: "medium", scriptClass: "abjad", phoneticIntuition: "weak", diacriticBehavior: "none", multiMode: "single", constraintEnforcement: "none", spareKeyAvailability: "many" },
    expectRule: 2, expectPrimary: "S-09", expectSecondaries: [],
    actualPrimary: "S-09", expectAgreement: true,
  },
  {
    name: "russian_mnemonic_r",
    corpusPath: "release/r/russian_mnemonic_r/",
    axes: { scale: "medium", scriptClass: "alphabetic", phoneticIntuition: "weak", diacriticBehavior: "none", multiMode: "single", constraintEnforcement: "none", spareKeyAvailability: "RAlt only", remapPosture: "full-remap" },
    expectRule: 8, expectPrimary: "S-06", expectSecondaries: ["S-04", "S-08"],
    actualPrimary: "S-06", expectAgreement: true,
  },
];
