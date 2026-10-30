// convenienceContinue — the Convenience letters step's gate, value and
// completion as pure functions (spec 107 FR-040), lifted out of
// ConvenienceCharsStep so the component and the headless author compute the
// same thing.
//
// Inputs are plain data: the working copy's IR and instantiation mode, the
// needed set (lib/carveNeededSet.ts), the offered candidates, and the recorded
// value. The functions are pure; the caller records the returned value (through
// the gallery host's onChange) and status (recordConvenienceStatus) and
// completes the step with the returned result.

import type { ConvenienceCandidate } from "@keyboard-studio/engine";
import { buildProducedSet } from "@keyboard-studio/contracts";
import type { KeyboardIR, SurveyPhaseResult } from "@keyboard-studio/contracts";
import type { StepStatus } from "../../steps/answerTypes.ts";
import { convenienceKey } from "../../steps/evidence.ts";
import { useSurveyAnswerStore } from "../../stores/surveyAnswerStore.ts";
import type { InstantiationMode } from "../../stores/workingCopyStore.ts";
import { computeConvenienceGate, type ConvenienceGateResult } from "./convenienceGate.ts";
import type { RetainedConvenienceChar, RetainedConvenienceCharsValue } from "./convenienceValue.ts";

/**
 * The step's "asked" phase result. `[]` records "asked, kept nothing" — not
 * "never asked" (absent); see SurveyPhaseResult.retainedConvenienceChars.
 *
 * `phase: "C"` mirrors the marks series, the other pre-carve step that emits a
 * derived-state-only result. This step is not a phase of its own in spec §8,
 * and the label carries no routing weight — the manifest orders steps, and
 * `mergePhaseResults` merges by FIELD, not by phase.
 */
export function convenienceResult(retained: string[]): SurveyPhaseResult {
  return { phase: "C", answers: [], retainedConvenienceChars: retained };
}

/**
 * The `not-applicable` phase result (R-09): NO `retainedConvenienceChars` at
 * all — absent means "never asked", distinct from `[]`'s "asked, kept
 * nothing". The reason and evidence key live in `surveyAnswerStore`'s
 * `not-asked` status instead, not in this result.
 */
export function convenienceNotAskedResult(): SurveyPhaseResult {
  return { phase: "C", answers: [] };
}

/**
 * The tri-state gate over the working copy. The letters on offer come from the
 * working copy's IR, not startIr: carve operates on `ir`, so the letters on
 * offer must be the ones carve will actually see.
 */
export function convenienceGateFor(args: {
  ir: KeyboardIR | null;
  instantiationMode: InstantiationMode;
  needed: { neededSet: ReadonlySet<string>; hasSignal: boolean };
}): ConvenienceGateResult {
  return computeConvenienceGate({
    produced: args.ir !== null ? buildProducedSet(args.ir) : new Set<string>(),
    needed: args.needed.neededSet,
    hasSignal: args.needed.hasSignal,
    instantiated: args.instantiationMode !== null,
  });
}

/** The candidates on offer: the gate's list when it applies, none otherwise. */
export function gateCandidates(gate: ConvenienceGateResult | null): ConvenienceCandidate[] {
  return gate?.kind === "applies" ? gate.candidates : [];
}

/** The candidate primaries the recorded value's `rejected` list un-keeps. */
export function uncheckedPrimaries(
  candidates: readonly ConvenienceCandidate[],
  value: RetainedConvenienceCharsValue | undefined,
): Set<string> {
  const rejected = new Set(value?.rejected ?? []);
  const set = new Set<string>();
  for (const candidate of candidates) {
    if (rejected.has(candidate.primary)) set.add(candidate.primary);
  }
  return set;
}

/** The primaries kept: every candidate not unchecked (everything is pre-checked). */
export function keptPrimaries(
  candidates: readonly ConvenienceCandidate[],
  unchecked: ReadonlySet<string>,
): Set<string> {
  return new Set(candidates.filter((c) => !unchecked.has(c.primary)).map((c) => c.primary));
}

/**
 * Build the value for a kept-primary set. Candidates the author acted on in
 * this call carry `asked` provenance; the rest keep their recorded provenance,
 * or the proposal's (`extracted`) on a first record.
 */
export function buildRetainedValue(
  candidates: readonly ConvenienceCandidate[],
  kept: ReadonlySet<string>,
  acted: ReadonlySet<string>,
  value: RetainedConvenienceCharsValue | undefined,
): RetainedConvenienceCharsValue {
  const retainedByChar = new Map((value?.retained ?? []).map((i) => [i.char, i.provenance]));
  const provenanceFor = (candidate: ConvenienceCandidate): RetainedConvenienceChar["provenance"] => {
    for (const ch of candidate.chars) {
      const p = retainedByChar.get(ch);
      if (p !== undefined) return p;
    }
    return "extracted";
  };
  const retained: RetainedConvenienceChar[] = [];
  const rejected: string[] = [];
  for (const c of candidates) {
    if (kept.has(c.primary)) {
      const provenance = acted.has(c.primary) ? "asked" : provenanceFor(c);
      for (const ch of c.chars) retained.push({ char: ch, provenance });
    } else {
      rejected.push(c.primary);
    }
  }
  return { retained, rejected };
}

/** Record the step's status in the survey answer store. */
export function recordConvenienceStatus(status: StepStatus): void {
  useSurveyAnswerStore.getState().setStatus("convenience", status);
}

/** What pressing Continue does with the offered candidates. */
export interface ConvenienceContinue {
  /** The value to record, or null when the recorded value already matches. */
  record: RetainedConvenienceCharsValue | null;
  /** The step was genuinely asked (or its gap surfaced): it moves past "in-progress". */
  status: StepStatus;
  /** What the component hands `onComplete`. */
  result: SurveyPhaseResult;
}

/**
 * Continue: the completion result is computed FROM the recorded value —
 * reconcile the record to the current candidate set first (a toggle-built
 * record already matches; a never-touched pass has no record yet, and a shape
 * change may have added candidates since the last toggle).
 */
export function continueConvenience(
  candidates: readonly ConvenienceCandidate[],
  value: RetainedConvenienceCharsValue | undefined,
): ConvenienceContinue {
  const kept = keptPrimaries(candidates, uncheckedPrimaries(candidates, value));
  const retained = candidates.filter((c) => kept.has(c.primary)).flatMap((c) => c.chars);
  const next = buildRetainedValue(candidates, kept, new Set(), value);
  return {
    record: JSON.stringify(next) !== JSON.stringify(value ?? null) ? next : null,
    status: { kind: "finished" },
    result: convenienceResult(retained),
  };
}

/** What a `not-applicable` gate does: record "not asked" and complete with no retained list. */
export interface ConvenienceSkip {
  status: StepStatus;
  result: SurveyPhaseResult;
}

/**
 * FR-065: record "not asked" with its reason and the evidence key it was judged
 * against, so a later evidence change (surplus letters appear) is read as a
 * shape change (FR-067), not silently re-decided.
 */
export function skipConvenience(
  gate: Extract<ConvenienceGateResult, { kind: "not-applicable" }>,
  hasSignal: boolean,
): ConvenienceSkip {
  return {
    status: {
      kind: "not-asked",
      reason: gate.reason,
      evidenceKey: convenienceKey(hasSignal ? "known" : "unknown", []),
    },
    result: convenienceNotAskedResult(),
  };
}
