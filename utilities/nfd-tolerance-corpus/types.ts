// Shared result vocabulary for the NFC/NFD context-tolerance corpus harness.
//
// The whole point of this tool is that a keyboard is bucketed by the
// BEHAVIOUR the transform produces, never by the SHAPE of the rules it
// wrote. A shape-counting script scores a keyboard "fixed" the moment a
// decomposed-context rule appears in the emitted .kmn; it cannot see that
// the rule bakes the wrong accent. So every bucket below is reached only
// through a simulate() comparison of the compiled before/after keyboards.

import type { SimKeyInput } from "@keyboard-studio/contracts";

/**
 * Per-(context, key) verdict. `bNFC`/`bNFD` are the baseline keyboard's
 * outputs for the precomposed and canonically-decomposed seeds; `fNFC`/
 * `fNFD` the transformed keyboard's. The five outcomes partition every
 * combination of those four strings — see `classifyProbe`.
 */
export type ProbeOutcome =
  /** Baseline already tolerant and the transform left it alone. */
  | "no-gap"
  /** Baseline diverged; after the transform both forms agree on the baseline's composed answer. */
  | "gap-fixed"
  /** Baseline diverged and the decomposed path is byte-identical afterwards — the transform declined or missed it. */
  | "gap-remaining"
  /**
   * Baseline diverged, the transform CHANGED the decomposed path, and it
   * still does not agree with the composed one. The keyboard now emits a
   * well-formed but different character where it used to emit visible
   * garbage — the `sil_yoruba8` class, and the reason this harness exists.
   */
  | "gap-miscorrected"
  /** The transform changed a composed path that was already correct. */
  | "regressed-composed"
  /** Baseline agreed on both forms; after the transform it does not. */
  | "regressed-decomposed";

/** Probe outcomes that mean the transform made the keyboard worse. */
export const HARMFUL_OUTCOMES: readonly ProbeOutcome[] = [
  "gap-miscorrected",
  "regressed-composed",
  "regressed-decomposed",
];

/** One (preceding-context character, keystroke) pair to compare before and after. */
export interface ProbeCase {
  /** `nodeId` of the rule this pair was enumerated from. */
  ruleId: string;
  /** 1-based line of that rule in the source .kmn, when the IR carries one. */
  line: number;
  /** The preceding-context character, as the keyboard's own store spells it. */
  contextChar: string;
  /** The keystroke after `+`. Every member of an `any(store)` key part yields its own probe. */
  key: SimKeyInput;
}

/** A probe plus the four measured outputs and the verdict they imply. */
export interface ProbeResult extends ProbeCase {
  outcome: ProbeOutcome;
  /** `U+XXXX ...` renderings — readable in the JSON without a codepoint decoder. */
  baselinePrecomposed: string;
  baselineDecomposed: string;
  transformedPrecomposed: string;
  transformedDecomposed: string;
}

/** Per-keyboard bucket. Assigned by worst-outcome precedence — see `bucketFor`. */
export type Bucket =
  /** No probe found a composed/decomposed divergence, and none regressed. */
  | "no-gap"
  /** Every divergence the harness found now agrees, and nothing regressed. */
  | "gap-fixed"
  /** At least one divergence survives the transform. Nothing regressed. */
  | "gap-remaining"
  /** At least one probe was miscorrected or regressed. */
  | "regressed"
  /** The baseline or the transformed keyboard would not compile. */
  | "compile-failed"
  /**
   * Nothing was probeable: every rule that could have carried a gap was
   * refused by an internal gate. `refusals` names which. This is an
   * "unknown", not a clean bill of health.
   */
  | "refused"
  /** parse(), simulate() or the transform threw. `error` carries the message. */
  | "harness-error";

/** One keyboard's full record in the JSON report. */
export interface KeyboardResult {
  id: string;
  /** Corpus-relative path of the analysed .kmn. */
  path: string;
  bucket: Bucket;
  /** Header stores this harness stripped before compiling — see README "The &LAYOUTFILE workaround". */
  strippedAssetStores: string[];
  /** Gate id -> number of rules the transform refused for that reason. */
  refusals: Record<string, number>;
  /** Rules `computeContextTolerance` itself flagged as behavioural gaps. */
  diagnosedGapRules: number;
  /** `ContextVariant`s `proposeContextVariants` produced. */
  generatedVariants: number;
  probeCounts: Record<ProbeOutcome, number>;
  /** Every probe whose outcome was not `no-gap`. Clean pairs are counted, not listed. */
  notableProbes: ProbeResult[];
  /** True when the per-keyboard probe cap truncated enumeration. */
  probeCapReached: boolean;
  /** Set when `bucket` is `compile-failed` or `harness-error`. */
  detail?: string;
}

/** The `--out` JSON document. */
export interface CorpusReport {
  /** Schema marker, bumped when the shape changes. */
  schema: "nfd-tolerance-corpus/1";
  generatedAt: string;
  corpusRoot: string;
  /** `git rev-parse HEAD` of the corpus checkout, or `"unknown"`. */
  corpusCommit: string;
  maxProbesPerKeyboard: number;
  buckets: Record<Bucket, number>;
  /** Gate id -> total refused rules across the whole run. */
  refusals: Record<string, number>;
  keyboards: KeyboardResult[];
}
