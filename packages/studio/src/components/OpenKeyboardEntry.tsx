// OpenKeyboardEntry — "Open an existing keyboard" on the welcome screen (spec 111).
//
// Searches the start-keyboard catalog by name, id or language (the same
// combobox the copy path uses) and, on Open, records the two decisions that
// make the walk an update of that keyboard: the starting keyboard
// (`base-keyboard`) and the authoring track (`authoring-track` = "adapt", the
// internal value Open keeps). StudioShell instantiates the working copy once
// both are recorded and the keyboard's source has loaded, exactly as it does
// for any other start; this component only supplies the choice.

import { useState } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import type { StartKeyboard } from "@keyboard-studio/contracts";
import { StartKeyboardPicker } from "./StartKeyboardPicker.tsx";
import { confirmStartKeyboard } from "../survey/chooseStart/confirmStartKeyboard.ts";
import { useDecisionStore } from "../stores/decisionStore.ts";
import { useSurveySessionStore } from "../stores/surveySessionStore.ts";
import { navigateTo } from "../lib/navigate.ts";
import { BG_CARD, BORDER, TEXT_DIM, TEXT_MAIN, FONT, galleryForwardBtnStyle } from "../lib/galleryTheme.ts";

/**
 * Open `keyboard` for update: preview it, then record the starting keyboard
 * and the authoring track. Returns false (and records nothing) when the author
 * declines the rebase confirmation of an already-started project.
 */
export function openExistingKeyboard(keyboard: StartKeyboard): boolean {
  const confirmed = confirmStartKeyboard(keyboard, (value) => {
    const decisions = useDecisionStore.getState();
    decisions.recordAll([
      { id: "base-keyboard", value, provenance: "asked", step: "open" },
      { id: "authoring-track", value: "adapt", provenance: "asked", step: "open" },
    ]);
  });
  if (confirmed === null) return false;
  useSurveySessionStore.getState().setLocalStart(keyboard);
  // The identity-first screens are gated off on Open (registry.ts
  // `openHiddenScreens`), so the walk starts at the first screen that applies.
  useSurveySessionStore.setState({
    activeStepId: "attribution",
    history: [],
    visited: ["identity", "layout", "choose_base", "track", "attribution"],
  });
  // Open lands on the criteria page: what was already wrong, before any edit.
  navigateTo("criteria");
  return true;
}

export function OpenKeyboardEntry(): React.JSX.Element {
  const { t } = useLingui();
  const [chosen, setChosen] = useState<StartKeyboard | null>(null);

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
      <button
        type="button"
        disabled={chosen === null}
        onClick={() => {
          if (chosen !== null) openExistingKeyboard(chosen);
        }}
        style={{
          ...galleryForwardBtnStyle,
          marginTop: 12,
          cursor: chosen === null ? "not-allowed" : "pointer",
          opacity: chosen === null ? 0.6 : 1,
        }}
      >
        <Trans id="open.entry.button">Open this keyboard</Trans>
      </button>
    </section>
  );
}
