// OpenKeyboardEntry — "Open an existing keyboard" on the start screen (spec 111).
//
// Searches the start-keyboard catalog by name, id or language (the same
// combobox the copy path uses) and, on Open, records the two decisions that
// make the walk an update of that keyboard: the starting keyboard
// (`base-keyboard`) and the authoring track (`authoring-track` = "adapt", the
// internal value Open keeps). StudioShell instantiates the working copy once
// both are recorded and the keyboard's source has loaded, exactly as it does
// for any other start; this component only supplies the choice.

import { useEffect, useState } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import type { SourceRef, StartKeyboard } from "@keyboard-studio/contracts";
import { StartKeyboardPicker } from "./StartKeyboardPicker.tsx";
import { confirmStartKeyboard } from "../survey/chooseStart/confirmStartKeyboard.ts";
import { useDecisionStore } from "../stores/decisionStore.ts";
import { useSurveySessionStore } from "../stores/surveySessionStore.ts";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { navigateTo } from "../lib/navigate.ts";
import { markVisited } from "../lib/firstVisit.ts";
import { isBasicKeyboard } from "../lib/basicKeyboard.ts";
import { recordAuthoringTrack } from "../lib/recordAuthoringTrack.ts";
import {
  forkIsNewer,
  replacesCuratedCopy,
  resolveSourceChoice,
  sourceRefFor,
  type SourceChoice,
  type SourceCopy,
  type SourceOwner,
} from "../lib/openSourceChoice.ts";
import { Button } from "../ui/Button.tsx";
import { BORDER, TEXT_DIM } from "../ui/theme.ts";
import { sectionHeading, surveyCard } from "../survey/surveyStyles.ts";

/**
 * Open `keyboard` for update: preview it, then record the starting keyboard
 * and the authoring track. Returns false (and records nothing) when the author
 * declines the rebase confirmation of an already-started project.
 */
export function openExistingKeyboard(keyboard: StartKeyboard, source: SourceRef | null = null): boolean {
  const confirmed = confirmStartKeyboard(keyboard, (value) => {
    // The repository choice is a starting-point fact, recorded with the working
    // copy rather than as a decision (data-model: Source choice). Set before the
    // decisions so the source load can never start without it.
    useWorkingCopyStore.getState().setStartSource(source);
    const decisions = useDecisionStore.getState();
    decisions.recordAll([
      { id: "base-keyboard", value, provenance: "asked", step: "open" },
      // Whether the keyboard is a basic one decides which walk pages apply (its physical
      // layout is fixed); gates read this decision, never the keyboard itself.
      { id: "open-basic-keyboard", value: isBasicKeyboard(keyboard), provenance: "derived", step: "open" },
    ]);
    // The authoring track, recorded alongside the base (same step, same
    // confirmation) — via the shared start-screen helper, not inline.
    recordAuthoringTrack("adapt", "open");
  });
  if (confirmed === null) return false;
  useSurveySessionStore.getState().setLocalStart(keyboard);
  // The identity-first screens are gated off on Open (registry.ts
  // `openHiddenScreens`), so the walk starts at its first page, the Languages
  // step (spec 111 FR-031). The working copy is instantiated by the survey
  // view's compile pipeline, which the walk route mounts; the Languages page
  // reads the keyboard's list from it as soon as it exists.
  useSurveySessionStore.setState({
    activeStepId: "open_languages",
    history: [],
    visited: ["identity", "layout", "choose_base", "attribution"],
  });
  // Opening a keyboard leaves the welcome screen, so the first-visit gate must lift
  // or the route would be forced back to welcome.
  markVisited();
  navigateTo("survey");
  return true;
}

function CopyDetail({ copy, label }: { copy: SourceCopy; label: string }): React.JSX.Element {
  const { t } = useLingui();
  const date = copy.committedAt.slice(0, 10);
  const sha = copy.commit.slice(0, 7);
  return (
    <>
      <strong>{label}</strong>
      <span style={{ color: TEXT_DIM }}>
        {" "}
        {t({ id: "open.entry.source.detail", message: `Last changed ${date}, commit ${sha}` })}
      </span>
    </>
  );
}

export function OpenKeyboardEntry(): React.JSX.Element {
  const { t } = useLingui();
  const [chosen, setChosen] = useState<StartKeyboard | null>(null);
  // `choice` is null while the two repositories are being checked.
  const [choice, setChoice] = useState<SourceChoice | null>(null);
  const [owner, setOwner] = useState<SourceOwner>("keymanapp");

  useEffect(() => {
    setChoice(null);
    if (chosen === null) return;
    let cancelled = false;
    void resolveSourceChoice(chosen).then((resolved) => {
      if (cancelled) return;
      setChoice(resolved);
      // Default to the copy that carries the newer work.
      setOwner(forkIsNewer(resolved) ? "keyboard-studio" : resolved.upstream !== null ? "keymanapp" : "keyboard-studio");
    });
    return () => {
      cancelled = true;
    };
  }, [chosen]);

  const checking = chosen !== null && choice === null;
  const sourceRef = chosen !== null && choice !== null ? sourceRefFor(choice, chosen, owner) : null;
  const showChoice = choice !== null && choice.differ && choice.upstream !== null && choice.fork !== null;
  const warnCurated = showChoice && replacesCuratedCopy(sourceRef);

  // Same composition as the survey steps (#2567): the accent-topped survey
  // card, not the old centred card with a plain 18px title this entry used
  // to render. The screen title lives on the StartScreen; this h2 is the
  // card's own section heading.
  return (
    <section aria-labelledby="open-entry-heading" style={surveyCard}>
      <h2 id="open-entry-heading" style={sectionHeading}>
        <Trans id="open.entry.title">Open an existing keyboard</Trans>
      </h2>
      <p style={{ margin: "0 0 12px", fontSize: 13, lineHeight: 1.6, color: TEXT_DIM }}>
        <Trans id="open.entry.intro">
          Update a keyboard in place. Its languages, documentation and formatting are kept, and only what you change is
          rewritten.
        </Trans>
      </p>
      <StartKeyboardPicker
        value={chosen}
        onChange={setChosen}
        label={t({ id: "open.entry.picker.label", message: "Keyboard to open" })}
      />
      {checking && (
        <p role="status" style={{ margin: "12px 0 0", fontSize: 13, color: TEXT_DIM }}>
          <Trans id="open.entry.source.checking">Checking both repositories for this keyboard...</Trans>
        </p>
      )}
      {showChoice && choice !== null && choice.upstream !== null && choice.fork !== null && (
        <fieldset style={{ margin: "12px 0 0", padding: 12, border: `1px solid ${BORDER}`, borderRadius: 6 }}>
          <legend style={{ fontSize: 13, padding: "0 4px" }}>
            <Trans id="open.entry.source.legend">
              The two repositories have different copies of this keyboard. Which one do you want to open?
            </Trans>
          </legend>
          {[choice.upstream, choice.fork].map((copy) => (
            <label key={copy.owner} style={{ display: "block", fontSize: 13, margin: "6px 0", cursor: "pointer" }}>
              <input
                type="radio"
                name="open-entry-source"
                value={copy.owner}
                checked={owner === copy.owner}
                onChange={() => setOwner(copy.owner)}
                style={{ marginRight: 8 }}
              />
              <CopyDetail
                copy={copy}
                label={
                  copy.owner === "keymanapp"
                    ? t({ id: "open.entry.source.upstream", message: "Upstream: keymanapp/keyboards" })
                    : t({ id: "open.entry.source.fork", message: "Studio copy: keyboard-studio/keyboards" })
                }
              />
              {sourceRef !== null && sourceRef.alternative?.owner === copy.owner && sourceRef.alternative.newer && (
                <span style={{ color: TEXT_DIM }}>
                  {" "}
                  ({t({ id: "open.entry.source.newer", message: "newer" })})
                </span>
              )}
            </label>
          ))}
        </fieldset>
      )}
      {warnCurated && (
        <p role="alert" style={{ margin: "8px 0 0", fontSize: 13, lineHeight: 1.5 }}>
          <Trans id="open.entry.source.curatedWarning">
            The studio copy has newer changes. Submitting the upstream copy will replace that curated work in
            keyboard-studio/keyboards.
          </Trans>
        </p>
      )}
      <Button
        variant="primary"
        disabled={chosen === null || checking}
        onClick={() => {
          if (chosen !== null) openExistingKeyboard(chosen, sourceRef);
        }}
        style={{ marginTop: 12 }}
      >
        <Trans id="open.entry.button">Open this keyboard</Trans>
      </Button>
    </section>
  );
}
