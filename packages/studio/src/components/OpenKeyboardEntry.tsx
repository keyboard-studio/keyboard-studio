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
import {
  forkIsNewer,
  replacesCuratedCopy,
  resolveSourceChoice,
  sourceRefFor,
  type SourceChoice,
  type SourceCopy,
  type SourceOwner,
} from "../lib/openSourceChoice.ts";
import { BG_CARD, BORDER, TEXT_DIM, TEXT_MAIN, FONT, galleryForwardBtnStyle } from "../lib/galleryTheme.ts";

/**
 * Open `keyboard` for update: preview it, then record the starting keyboard
 * and the authoring track. Returns false (and records nothing) when the author
 * declines the rebase confirmation of an already-started project.
 */
export function openExistingKeyboard(keyboard: StartKeyboard, source: SourceRef | null = null): boolean {
  const confirmed = confirmStartKeyboard(keyboard, (value) => {
    const decisions = useDecisionStore.getState();
    decisions.recordAll([
      { id: "base-keyboard", value, provenance: "asked", step: "open" },
      { id: "authoring-track", value: "adapt", provenance: "asked", step: "open" },
    ]);
  });
  if (confirmed === null) return false;
  // The repository choice is a starting-point fact, recorded with the working
  // copy rather than as a decision (data-model: Source choice).
  useWorkingCopyStore.getState().setStartSource(source);
  useSurveySessionStore.getState().setLocalStart(keyboard);
  // The identity-first screens are gated off on Open (registry.ts
  // `openHiddenScreens`), so the walk starts at its first page, the Languages
  // step (spec 111 FR-031). The working copy is instantiated by the survey
  // view's compile pipeline, which the walk route mounts; the Languages page
  // reads the keyboard's list from it as soon as it exists.
  useSurveySessionStore.setState({
    activeStepId: "open_languages",
    history: [],
    visited: ["identity", "layout", "choose_base", "track", "attribution"],
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

  return (
    <section
      aria-labelledby="open-entry-heading"
      style={{
        maxWidth: 560,
        margin: "24px auto",
        padding: 20,
        background: BG_CARD,
        border: `1px solid ${BORDER}`,
        borderRadius: 8,
        fontFamily: FONT,
        color: TEXT_MAIN,
      }}
    >
      <h2 id="open-entry-heading" style={{ margin: "0 0 8px", fontSize: 18 }}>
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
      <button
        type="button"
        disabled={chosen === null || checking}
        onClick={() => {
          if (chosen !== null) openExistingKeyboard(chosen, sourceRef);
        }}
        style={{
          ...galleryForwardBtnStyle,
          marginTop: 12,
          cursor: chosen === null || checking ? "not-allowed" : "pointer",
          opacity: chosen === null || checking ? 0.6 : 1,
        }}
      >
        <Trans id="open.entry.button">Open this keyboard</Trans>
      </button>
    </section>
  );
}
