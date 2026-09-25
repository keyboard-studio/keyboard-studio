// ConvenienceCharsStep — the pre-carve "keep these for convenience?" question.
//
// One spine EditorStep between "marks" and "carve". The carve gallery is about
// to propose removing every base-keyboard character the orthography does not
// use, which is right for the language and wrong for the author: they still
// have to type borrowed words, email addresses, and web addresses on this
// keyboard. Asking here — once, before the gallery, with the answer already
// filled in — means the gallery arrives with those letters shielded instead of
// flagged, and the author never has to fight a screen of recommendations they
// disagree with. Defaults are the product (spec v1.3.1 §3c): everything is
// pre-checked, so "keep them" is one click and the question is skipped
// entirely when there is nothing to ask.
//
// A COMPUTED gate that never renders, mirroring the marks series' S0: when the
// base produces no surplus basic-Latin letters (a Latin-script orthography
// using all of a-z, or a non-Latin base with no A-Z at all), the step completes
// immediately with an empty retained list and the author never sees a screen.
//
// Scope is basic Latin only, by decision — see the engine's convenienceChars
// module for why a Cyrillic base's own surplus letters stay a pure carve
// decision. Digits and punctuation need no question: carve never proposes them.
//
// Editors are pure (Article IV / G2): this component reports completion via
// onComplete with a SurveyPhaseResult carrying `retainedConvenienceChars`; the
// manifest reducer path (StepHost.handleComplete -> recordPhase) owns the
// session merge. The carve gallery then unions the merged list into its
// needed-set (see CarveGalleryV2's retainedSet).

import { useEffect, useMemo, useRef, type ComponentType } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import { plural } from "@lingui/core/macro";
import type { SurveyPhaseResult } from "@keyboard-studio/contracts";
import { buildProducedSet } from "@keyboard-studio/contracts";
import type { EditorStepProps } from "../../steps/types.ts";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { useSurveySessionStore } from "../../stores/surveySessionStore.ts";
import { useSurveyAnswerStore } from "../../stores/surveyAnswerStore.ts";
import { offeredKey, convenienceKey } from "../../steps/evidence.ts";
import { useCarveNeededSet } from "../../hooks/useCarveNeededSet.ts";
import { computeConvenienceGate } from "./convenienceGate.ts";
import type { ConvenienceCandidate } from "@keyboard-studio/engine";
import {
  ACCENT,
  TEXT_MAIN,
  TEXT_DIM,
  FONT,
  phaseHeadingFlush,
  mutedParaFlush,
  secondaryButton,
  primaryButton,
  charChip,
  chipGlyph,
  chipCodepoint,
} from "../surveyStyles.ts";

// ---------------------------------------------------------------------------
// The computed gate. `computeConvenienceGate` itself lives in
// convenienceGate.ts (pure, React-free) so `steps/workToDo.ts`'s
// `selectWorkToDo()` can evaluate the SAME live gate for FR-067
// ("a `not-asked` step whose live gate now says `applies`") without this
// component. Re-exported here for tests and for anyone already importing it
// from this module.
// ---------------------------------------------------------------------------

export { computeConvenienceGate } from "./convenienceGate.ts";
export type { ConvenienceGateResult } from "./convenienceGate.ts";

/**
 * `U+XXXX` for a character — a technical identifier, never translated.
 */
function codepointLabel(ch: string): string {
  return `U+${ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}`;
}

/**
 * The step's "asked" phase result. `[]` records "asked, kept nothing" — not
 * "never asked" (absent); see SurveyPhaseResult.retainedConvenienceChars.
 *
 * `phase: "C"` mirrors the marks series, the other pre-carve step that emits a
 * derived-state-only result. This step is not a phase of its own in spec §8,
 * and the label carries no routing weight — the manifest orders steps, and
 * `mergePhaseResults` merges by FIELD, not by phase. Reusing marks' label keeps
 * the one place that does read a phase label (`find(p => p.phase === "C")` in
 * TouchGallery, for `assignments`) resolving to the same result it already did.
 */
function convenienceResult(retained: string[]): SurveyPhaseResult {
  return { phase: "C", answers: [], retainedConvenienceChars: retained };
}

/**
 * The `not-applicable` phase result (R-09): NO `retainedConvenienceChars` at
 * all — absent means "never asked", distinct from `[]`'s "asked, kept
 * nothing". The reason and evidence key live in `surveyAnswerStore`'s
 * `not-asked` status instead, not in this result.
 */
function convenienceNotAskedResult(): SurveyPhaseResult {
  return { phase: "C", answers: [] };
}

/** Stable reference for "nothing to offer" — see `candidates` below. */
const EMPTY_CANDIDATES: ConvenienceCandidate[] = [];

// ---------------------------------------------------------------------------

const ConvenienceCharsStep: ComponentType<EditorStepProps> = (
  { onComplete, onBack }: EditorStepProps,
) => {
  const { t } = useLingui();
  const ir = useWorkingCopyStore((s) => s.ir);
  const instantiationMode = useWorkingCopyStore((s) => s.instantiationMode);
  const { neededSet, neededCharsResolved, hasSignal } = useCarveNeededSet();
  const setStatus = useSurveyAnswerStore((s) => s.setStatus);

  // The working copy, not baseIr: carve operates on `ir`, so the letters on
  // offer must be the ones carve will actually see. (Carve's own deletions are
  // an overlay, not an IR mutation, so re-entering this step after a carve
  // pass still offers the same list.)
  const produced = useMemo(
    () => (ir !== null ? buildProducedSet(ir) : new Set<string>()),
    [ir],
  );

  // Hold the gate until the CLDR/SLDR exemplars have settled — deciding early
  // would either read a step as `unknown` that should have been `applies`, or
  // render a list that silently shrinks under the author a moment later. This
  // is the ONLY state in which the step neither renders nor completes, and it
  // always settles (see the hook's `neededCharsResolved`, which is true
  // immediately when there is no language to look up). It is NOT the same as
  // the gate's own `unknown` outcome below, which is a SETTLED "no signal at
  // all" state that must render, never wait silently (FR-064).
  const ready = neededCharsResolved;
  const gate = useMemo(
    () => (ready
      ? computeConvenienceGate({
        produced,
        needed: neededSet,
        hasSignal,
        instantiated: instantiationMode !== null,
      })
      : null),
    [ready, produced, neededSet, hasSignal, instantiationMode],
  );
  // A stable empty array reference when there is nothing to offer, so the
  // memos below do not recompute every render on a fresh `[]` literal.
  const candidates = useMemo(
    () => (gate?.kind === "applies" ? gate.candidates : EMPTY_CANDIDATES),
    [gate],
  );
  const unknown = gate?.kind === "unknown";

  // Store-backed (spec 079 T034): one boolean answer per candidate, keyed by
  // the candidate's `primary` char, in `surveyAnswerStore.steps.convenience`.
  // `unchecked` is DERIVED from those saved answers, not held in component
  // state — a toggle calls `saveAnswer` synchronously (FR-001), so the choice
  // survives an unmount (tab switch) exactly like every other survey answer.
  // Everything pre-checked (propose-then-confirm): a candidate with no saved
  // answer, or a saved answer of `true`, is checked by construction.
  const convenienceAnswers = useSurveyAnswerStore((s) => s.steps["convenience"]?.answers);
  const saveAnswer = useSurveyAnswerStore((s) => s.saveAnswer);
  const offeredPrimaries = useMemo(
    () => new Set(candidates.map((c) => c.primary)),
    [candidates],
  );
  const unchecked = useMemo(() => {
    const set = new Set<string>();
    for (const candidate of candidates) {
      const saved = convenienceAnswers?.[candidate.primary];
      if (saved !== undefined && saved.value === false) set.add(candidate.primary);
    }
    return set;
  }, [candidates, convenienceAnswers]);

  // Stay TRANSPARENT in the direction of travel on a `not-applicable` pass:
  // complete forward, but on a back-pop (the author pressed Back in the carve
  // gallery) keep popping backward instead of bouncing them forward again.
  // `unknown` never auto-completes here — FR-064 requires it to render.
  const completedRef = useRef(false);
  useEffect(() => {
    if (gate === null || gate.kind !== "not-applicable" || completedRef.current) return;
    completedRef.current = true;
    // FR-065: record "not asked" with its reason and the evidence key it was
    // judged against, so a later evidence change (surplus letters appear) is
    // read as a shape change (FR-067), not silently re-decided.
    setStatus("convenience", {
      kind: "not-asked",
      reason: gate.reason,
      evidenceKey: convenienceKey(hasSignal ? "known" : "unknown", []),
    });
    if (useSurveySessionStore.getState().lastNavigation === "pop" && onBack !== undefined) {
      onBack();
    } else {
      onComplete(convenienceNotAskedResult());
    }
  }, [gate, onComplete, onBack, hasSignal, setStatus]);

  if (gate === null || gate.kind === "not-applicable") return null;

  const keptCount = candidates.length - unchecked.size;

  function saveKept(primary: string, kept: boolean): void {
    saveAnswer("convenience", primary, {
      value: kept,
      answerType: "boolean",
      origin: "confirmed",
      stage: "draft",
      evidenceKey: offeredKey(primary, offeredPrimaries),
      screenId: "convenience",
    });
  }

  function toggle(primary: string): void {
    saveKept(primary, unchecked.has(primary));
  }

  function complete(): void {
    if (completedRef.current) return;
    completedRef.current = true;
    const retained = candidates
      .filter((c) => !unchecked.has(c.primary))
      .flatMap((c) => c.chars);
    // The step was genuinely asked (candidates offered) or its gap was
    // surfaced (`unknown`, nothing to offer) — either way the author has now
    // been through it, so the status moves past "in-progress" (data-model.md
    // §1). Nothing previously set this to `finished`.
    setStatus("convenience", { kind: "finished" });
    onComplete(convenienceResult(retained));
  }

  return (
    <div
      data-testid="convenience-chars"
      style={{
        display: "flex", flexDirection: "column", gap: 16, maxWidth: 640,
        fontFamily: FONT, color: TEXT_MAIN, padding: 16, overflow: "auto",
      }}
    >
      <button type="button" onClick={() => onBack?.()} style={{ alignSelf: "flex-start", ...secondaryButton }}>
        <Trans id="survey.convenience.backButton">Back</Trans>
      </button>

      <h2 style={{ ...phaseHeadingFlush, color: ACCENT }}>
        {unknown
          ? t({
            id: "survey.convenience.unknownEvidence.heading",
            message: "We don't know yet whether you have extra letters to keep",
          })
          : t({ id: "survey.convenience.heading", message: "Keep these letters for convenience?" })}
      </h2>

      {unknown ? (
        // FR-064: the gap is surfaced, never silently skipped. There is
        // nothing to offer yet (no orthography signal to compare the base
        // against), so the step still completes on Continue — with nothing
        // kept — but it is never auto-completed the way `not-applicable` is,
        // and the author sees why.
        <p style={mutedParaFlush} data-testid="convenience-unknown-notice">
          <Trans id="survey.convenience.unknownEvidence.body">
            We can't yet tell whether your base keyboard has extra letters your alphabet
            doesn't use — that depends on your alphabet being confirmed first. Continue for
            now; if it turns out there is something to keep, you'll be asked again later.
          </Trans>
        </p>
      ) : (
        <>
          <p style={mutedParaFlush}>
            {t({
              id: "survey.convenience.intro",
              message: plural(candidates.length, {
                one: "Your alphabet doesn't use # letter from the base keyboard. Keeping it lets you type borrowed words, email addresses, and web addresses without switching keyboards.",
                other: "Your alphabet doesn't use these # letters from the base keyboard. Keeping them lets you type borrowed words, email addresses, and web addresses without switching keyboards.",
              }),
            })}
          </p>
          <p style={{ ...mutedParaFlush, color: TEXT_DIM }}>
            <Trans id="survey.convenience.uncheckHint">
              Anything you uncheck will be offered for removal on the next screen.
              Capital and small letters are kept together.
            </Trans>
          </p>

          <ul
            aria-label={t({ id: "survey.convenience.listAriaLabel", message: "Letters to keep for convenience" })}
            style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexWrap: "wrap", gap: 8 }}
          >
            {candidates.map((candidate) => {
              const checked = !unchecked.has(candidate.primary);
              const label = candidate.chars.join(" ");
              return (
                <li key={candidate.primary}>
                  <label style={{ ...charChip(checked), position: "relative" }}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(candidate.primary)}
                      aria-label={t({ id: "survey.convenience.keepCheckboxAriaLabel", message: `Keep ${label}` })}
                      style={{ cursor: "pointer" }}
                    />
                    <span style={chipGlyph(checked)}>{label}</span>
                    <span style={chipCodepoint()}>{codepointLabel(candidate.chars[0]!)}</span>
                  </label>
                </li>
              );
            })}
          </ul>

          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              data-testid="convenience-keep-all"
              onClick={() => {
                for (const c of candidates) saveKept(c.primary, true);
              }}
              style={secondaryButton}
            >
              <Trans id="survey.convenience.keepAllButton">Keep all</Trans>
            </button>
            <button
              type="button"
              data-testid="convenience-keep-none"
              onClick={() => {
                for (const c of candidates) saveKept(c.primary, false);
              }}
              style={secondaryButton}
            >
              <Trans id="survey.convenience.keepNoneButton">Keep none</Trans>
            </button>
          </div>
        </>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button
          type="button"
          data-testid="convenience-continue"
          onClick={complete}
          style={primaryButton(false)}
        >
          {unknown
            ? t({ id: "survey.convenience.unknownEvidence.continueButton", message: "Continue" })
            : keptCount === 0
              ? t({ id: "survey.convenience.continueButtonNone", message: "Continue, keeping none" })
              : t({
                id: "survey.convenience.continueButton",
                message: plural(keptCount, {
                  one: "Continue, keeping # letter",
                  other: "Continue, keeping # letters",
                }),
              })}
        </button>
      </div>
    </div>
  );
};

export { ConvenienceCharsStep };
