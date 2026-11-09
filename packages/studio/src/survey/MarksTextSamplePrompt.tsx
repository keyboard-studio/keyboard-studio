// MarksTextSamplePrompt — the #1784 interstitial between character
// discovery and the marks series.
//
// When the exemplar lists a language's diacritics only as bare combining
// marks (no letter+mark clusters), the confirmed alphabet has marks but no
// pairing evidence, and the marks series' attachment step would open with
// every row unchecked. This prompt asks for a large text sample first so the
// harvest can union letter+mark pairs into attestedStacks before the
// attachment proposals are built.
//
// Rendered by CharactersStep in place of PhaseB once its onComplete fires
// and marksLackingPairingEvidence() is non-empty. Harvesting reuses
// TextSampleAffordance (same draft, same "text" provenance); CharactersStep
// completes the deferred step once the predicate clears. Skipping records a
// dismissal answer and states the consequence (spec 071 FR-007's house
// rule: unchecked = unreachable).

import { useLingui } from "@lingui/react/macro";
import { plural } from "@lingui/core/macro";
import { usePublishStepNav } from "../hooks/usePublishStepNav.ts";
import { TextSampleAffordance } from "./TextSampleAffordance.tsx";
import { textSampleMarksLabel } from "./marksTextSample.ts";
import {
  surveyPageColumn,
  phaseHeading,
  leadParagraph,
  mutedParaFlush,
} from "./surveyStyles.ts";

export interface MarksTextSamplePromptProps {
  /** Marks with zero attested bases (marksLackingPairingEvidence), first-appearance order. */
  lackingMarks: string[];
  /** A text sample was already harvested but still doesn't cover the marks. */
  hadTextSample: boolean;
  /** Back to the build list without deciding (the prompt re-fires on Done). */
  onBack: () => void;
  /** Continue without a text sample; the consequence is stated below the button. */
  onSkip: () => void;
}

export function MarksTextSamplePrompt({
  lackingMarks,
  hadTextSample,
  onBack,
  onSkip,
}: MarksTextSamplePromptProps) {
  const { t } = useLingui();
  // Back / Continue render in the footer (spec 081): this prompt replaces
  // PhaseB while it is shown, so PhaseB's publisher is unmounted and the
  // footer would otherwise go empty while in-body buttons appear mid-page.
  // The skip is the forward action — it completes the step, with the
  // consequence stated in the body copy below.
  usePublishStepNav({
    back: {
      label: t({
        id: "survey.phaseB.buildList.marksTextSamplePrompt.backButton",
        message: "Back",
      }),
      onClick: onBack,
      testId: "marks-text-sample-prompt-back",
    },
    forward: {
      label: t({
        id: "survey.phaseB.buildList.marksTextSamplePrompt.skipButton",
        message: "Continue without a text sample",
      }),
      onClick: onSkip,
      testId: "marks-text-sample-prompt-skip",
    },
  });
  // Rendered on dotted-circle carriers so bare combining marks are visible
  // (the same displayChar the build list uses for lone marks; the rule lives
  // in marksTextSample.ts beside the prompt's other decisions).
  const marksText = textSampleMarksLabel(lackingMarks);

  return (
    <section
      data-testid="marks-text-sample-prompt"
      aria-label={t({
        id: "survey.phaseB.buildList.marksTextSamplePrompt.sectionLabel",
        message: "Mark pairings need a text sample",
      })}
      style={surveyPageColumn}
    >
      <h2 style={phaseHeading}>
        {t({
          id: "survey.phaseB.buildList.marksTextSamplePrompt.heading",
          message: plural(lackingMarks.length, {
            one: "Which letter does this mark go on?",
            other: "Which letters do these marks go on?",
          }),
        })}
      </h2>
      {/* aria-live: the harvest is async, and this line changes from the
          explainer to the still-missing variant when a sample doesn't cover
          the marks (a11y house rule 8). */}
      <p aria-live="polite" style={{ ...leadParagraph, maxWidth: "100%" }}>
        {hadTextSample
          ? t({
              id: "survey.phaseB.buildList.marksTextSamplePrompt.explainerAfterSample",
              message: `The text so far still doesn't show ${{ marks: marksText }} on any letter. Try a longer passage — rare pairs only appear in longer text — or continue without and tick the pairs by hand in the next step.`,
            })
          : t({
              id: "survey.phaseB.buildList.marksTextSamplePrompt.explainer",
              message: `Your language's character list includes these marks — ${{ marks: marksText }} — but doesn't show which letters they attach to. Without examples, the next step can't pre-select any letter+mark pairs, and you'd have to tick every pair by hand. Paste a long passage below (a chapter of scripture, a story, or a news article — the longer the better, since rare pairs only show up in longer text) and we'll learn the pairings from it.`,
            })}
      </p>
      <TextSampleAffordance />
      <p style={{ ...mutedParaFlush, marginTop: 20 }}>
        {t({
          id: "survey.phaseB.buildList.marksTextSamplePrompt.skipConsequence",
          message:
            "If you continue without a text sample, the attachment rows will start unchecked. An unchecked letter+mark pair won't be reachable by ordinary typing.",
        })}
      </p>
    </section>
  );
}
