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
// needed-set (see CarveGallery's retainedSet).

import { useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import { plural } from "@lingui/core/macro";
import type { SurveyPhaseResult } from "@keyboard-studio/contracts";
import { buildProducedSet } from "@keyboard-studio/contracts";
import { surplusBasicLatinCandidates } from "@keyboard-studio/engine";
import type { ConvenienceCandidate } from "@keyboard-studio/engine";
import type { EditorStepProps } from "../../steps/types.ts";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { useSurveySessionStore } from "../../stores/surveySessionStore.ts";
import { useCarveNeededSet } from "../../hooks/useCarveNeededSet.ts";
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
// The computed gate (never rendered).
// ---------------------------------------------------------------------------

/**
 * `U+XXXX` for a character — a technical identifier, never translated (mirrors
 * `charCodepointLabel` in the carve gallery's RemovalBanner).
 */
function codepointLabel(ch: string): string {
  return `U+${ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}`;
}

export interface ConvenienceGateResult {
  /** True iff there is nothing to ask — the step completes without rendering. */
  skip: boolean;
  /** The case-folded letter pairs on offer, in a..z order. Empty when `skip`. */
  candidates: ConvenienceCandidate[];
}

/**
 * Compute the gate.
 *
 * Every "we cannot ask this" case resolves to `skip: true`, never to a
 * render-nothing-and-wait state — a spine step that renders null without
 * completing is a dead end the author cannot navigate out of. The one genuine
 * wait (the async CLDR lookup) is handled by the caller, and it always settles.
 *
 * `hasSignal` false means no orthography has been confirmed yet, so "not in
 * the alphabet" has no meaning and every letter would look surplus — the
 * question must stay silent rather than offer all 26.
 */
export function computeConvenienceGate(args: {
  produced: ReadonlySet<string>;
  needed: ReadonlySet<string>;
  hasSignal: boolean;
  /** False when no working copy has been instantiated — nothing to carve, nothing to ask. */
  instantiated: boolean;
}): ConvenienceGateResult {
  if (!args.instantiated || !args.hasSignal) return { skip: true, candidates: [] };
  const candidates = surplusBasicLatinCandidates({
    produced: args.produced,
    needed: args.needed,
  });
  return { skip: candidates.length === 0, candidates };
}

/**
 * The step's phase result. `[]` records "asked, kept nothing" — not "never
 * asked" (absent); see SurveyPhaseResult.retainedConvenienceChars.
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

// ---------------------------------------------------------------------------

const ConvenienceCharsStep: ComponentType<EditorStepProps> = (
  { onComplete, onBack }: EditorStepProps,
) => {
  const { t } = useLingui();
  const ir = useWorkingCopyStore((s) => s.ir);
  const instantiationMode = useWorkingCopyStore((s) => s.instantiationMode);
  const { neededSet, neededCharsResolved, hasSignal } = useCarveNeededSet();

  // The working copy, not baseIr: carve operates on `ir`, so the letters on
  // offer must be the ones carve will actually see. (Carve's own deletions are
  // an overlay, not an IR mutation, so re-entering this step after a carve
  // pass still offers the same list.)
  const produced = useMemo(
    () => (ir !== null ? buildProducedSet(ir) : new Set<string>()),
    [ir],
  );

  // Hold the gate until the CLDR/SLDR exemplars have settled — deciding early
  // would either skip a question that should have been asked or render a list
  // that silently shrinks under the author a moment later. This is the ONLY
  // state in which the step neither renders nor completes, and it always
  // settles (see the hook's `neededCharsResolved`, which is true immediately
  // when there is no language to look up).
  const ready = neededCharsResolved;
  const gate = useMemo(
    () => (ready
      ? computeConvenienceGate({
        produced,
        needed: neededSet,
        hasSignal,
        instantiated: instantiationMode !== null,
      })
      : { skip: false, candidates: [] as ConvenienceCandidate[] }),
    [ready, produced, neededSet, hasSignal, instantiationMode],
  );

  // Everything pre-checked (propose-then-confirm). Tracks what the author has
  // explicitly UNCHECKED, so a candidate absent from this set is checked by
  // construction and a re-seeded candidate list needs no sync effect.
  const [unchecked, setUnchecked] = useState<Set<string>>(() => new Set());

  // Stay TRANSPARENT in the direction of travel on a skip: complete forward,
  // but on a back-pop (the author pressed Back in the carve gallery) keep
  // popping backward instead of bouncing them forward again.
  const completedRef = useRef(false);
  useEffect(() => {
    if (ready && gate.skip && !completedRef.current) {
      completedRef.current = true;
      if (useSurveySessionStore.getState().lastNavigation === "pop" && onBack !== undefined) {
        onBack();
      } else {
        onComplete(convenienceResult([]));
      }
    }
  }, [ready, gate.skip, onComplete, onBack]);

  if (!ready || gate.skip) return null;

  const keptCount = gate.candidates.length - unchecked.size;

  function toggle(primary: string): void {
    setUnchecked((prev) => {
      const next = new Set(prev);
      if (next.has(primary)) next.delete(primary);
      else next.add(primary);
      return next;
    });
  }

  function complete(): void {
    if (completedRef.current) return;
    completedRef.current = true;
    const retained = gate.candidates
      .filter((c) => !unchecked.has(c.primary))
      .flatMap((c) => c.chars);
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
        <Trans id="survey.convenience.heading">Keep these letters for convenience?</Trans>
      </h2>

      <p style={mutedParaFlush}>
        {t({
          id: "survey.convenience.intro",
          message: plural(gate.candidates.length, {
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
        {gate.candidates.map((candidate) => {
          const checked = !unchecked.has(candidate.primary);
          const label = candidate.chars.join(" ");
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
          onClick={() => setUnchecked(new Set())}
          style={secondaryButton}
        >
          <Trans id="survey.convenience.keepAllButton">Keep all</Trans>
        </button>
        <button
          type="button"
          data-testid="convenience-keep-none"
          onClick={() => setUnchecked(new Set(gate.candidates.map((c) => c.primary)))}
          style={secondaryButton}
        >
          <Trans id="survey.convenience.keepNoneButton">Keep none</Trans>
        </button>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button
          type="button"
          data-testid="convenience-continue"
          onClick={complete}
          style={primaryButton(false)}
        >
          {keptCount === 0
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
