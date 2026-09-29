// SurveyPreviewPane — the survey's right pane: live OSK preview (or, for the
// Phase B build-list only, the interactive character map).
//
// Extracted from StudioShell's SurveyView (mobile adaptation #1853, Phase 2)
// so the OSK show/hide switch is independently testable — in particular the
// proof that hiding the preview unmounts the OSK iframe.
//
// OSK visibility (principle 9) is author-controlled: the switch in the pane
// header toggles `oskVisible`, and when it is false this component does NOT
// render OSKFrame — unmounting destroys the iframe and unloads KeymanWeb,
// showing remounts it through the normal init path. Host lifecycle only;
// the engine, iframe internals, and postMessage channel are untouched.

import type { CSSProperties } from "react";
import { Trans } from "@lingui/react/macro";
import type { BaseKeyboard } from "@keyboard-studio/contracts";
import type { Stage } from "../hooks/useKeyboardArtifact.ts";
import { TEXT_MAIN, FONT } from "../survey/surveyStyles.ts";
import { OSKFrame } from "./OSKFrame.tsx";
import { OskModeToggle, type OskMode } from "./OskModeToggle.tsx";
import { OskVisibilitySwitch } from "./OskVisibilitySwitch.tsx";
import { CharacterMapPane } from "../survey/CharacterMapPane.tsx";

export interface SurveyPreviewPaneProps {
  localBase: BaseKeyboard | null;
  oskMode: OskMode;
  onOskModeChange: (mode: OskMode) => void;
  /** Principle 9: false unmounts OSKFrame (iframe destroyed, KMW unloaded). */
  oskVisible: boolean;
  onOskVisibleChange: (visible: boolean) => void;
  /** Lifted from useKeyboardArtifact in the parent screen. */
  stage: Stage;
  /** Retry callback from useKeyboardArtifact in the parent. */
  retry: () => void;
  /** Phase B build-list only: swap the OSK preview for the character map. */
  showCharacterMap: boolean;
  activeStepId: string | null;
  /** Layout-provided flex styles (desktop split vs. narrow stacked). */
  style?: CSSProperties;
}

export function SurveyPreviewPane({
  localBase,
  oskMode,
  onOskModeChange,
  oskVisible,
  onOskVisibleChange,
  stage,
  retry,
  showCharacterMap,
  activeStepId,
  style,
}: SurveyPreviewPaneProps) {
  return (
    <section
      aria-label={showCharacterMap ? "Character map" : "Keyboard preview"}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
        minHeight: 0,
        overflow: "auto",
        padding: 24,
        boxSizing: "border-box",
        color: TEXT_MAIN,
        fontFamily: FONT,
        ...style,
      }}
    >
      {showCharacterMap ? (
        <CharacterMapPane
          scope={activeStepId === "punctuation" ? "punctuation" : "alphabet"}
        />
      ) : localBase === null ? (
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "column",
            gap: 12,
            color: "var(--app-text-subtle)",
            fontSize: 14,
            textAlign: "center",
          }}
        >
          {/* Decorative icon stand-in: aria-hidden (conveys nothing the next
              line doesn't). --app-text-muted clears AA on both themes on its
              own; see the original comment in StudioShell's SurveyView. */}
          <span
            aria-hidden="true"
            style={{
              fontSize: 32,
              fontFamily: "var(--app-font-mono)",
              color: "var(--app-text-muted)",
            }}
          >
            [kb]
          </span>
          <span>
            <Trans id="preview.empty.hint">
              Choose a base keyboard in the wizard to see a live preview here.
            </Trans>
          </span>
        </div>
      ) : (
        <>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <h2
              style={{
                margin: 0,
                fontSize: "1.1rem",
                color: "var(--app-accent-text)",
              }}
            >
              {localBase.displayName}
            </h2>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 16,
                flexWrap: "wrap",
              }}
            >
              <OskModeToggle value={oskMode} onChange={onOskModeChange} />
              <OskVisibilitySwitch
                checked={oskVisible}
                onCheckedChange={onOskVisibleChange}
              />
            </div>
          </div>
          {oskVisible ? (
            <OSKFrame
              baseKeyboard={localBase}
              oskMode={oskMode}
              stage={stage}
              retry={retry}
            />
          ) : (
            <p
              style={{
                margin: 0,
                fontSize: 13,
                color: "var(--app-text-muted)",
              }}
            >
              <Trans id="preview.hidden.hint">
                Keyboard preview hidden — toggle the switch above to bring it
                back.
              </Trans>
            </p>
          )}
        </>
      )}
    </section>
  );
}
