// SurveyPreviewPane — the survey's right pane: live OSK preview (or, for the
// Phase B build-list only, the interactive character map).
//
// Extracted from StudioShell's SurveyView (mobile adaptation, Phase 2).
//
// OSK visibility (principle 9) is a host-lifecycle question, not a switch in
// this pane: on desktop the pane is always beside the questions; on narrow
// viewports it is rendered inside a PreviewSheet, so it (and its OSK iframe)
// is mounted only while the author has the sheet open. `compact` is that
// sheet layout. At every width the keyboard spans the full width of the
// pane (#1898, the mobile treatment applied to desktop): the pane carries
// no side gutter of its own, and the text rows inset themselves — 12px in
// the compact sheet, 24px on desktop (the pane's former side padding, so
// desktop text alignment is unchanged).

import type { CSSProperties } from "react";
import { Trans } from "@lingui/react/macro";
import type { StartKeyboard } from "@keyboard-studio/contracts";
import type { Stage } from "../hooks/useKeyboardArtifact.ts";
import { TEXT_MAIN, FONT } from "../survey/surveyStyles.ts";
import { OSKFrame } from "./OSKFrame.tsx";
import { OskModeToggle, type OskMode } from "./OskModeToggle.tsx";
import { isTouchPreviewAvailable } from "../steps/advance.ts";
import { CharacterMapPane } from "../survey/CharacterMapPane.tsx";

export interface SurveyPreviewPaneProps {
  localStart: StartKeyboard | null;
  oskMode: OskMode;
  onOskModeChange: (mode: OskMode) => void;
  /** Lifted from useKeyboardArtifact in the parent screen. */
  stage: Stage;
  /** Retry callback from useKeyboardArtifact in the parent. */
  retry: () => void;
  /** Phase B build-list only: swap the OSK preview for the character map. */
  showCharacterMap: boolean;
  activeStepId: string | null;
  /** Narrow-viewport sheet layout: edge-to-edge keyboard, inset text only. */
  compact?: boolean;
  /** Layout-provided flex styles (desktop split). */
  style?: CSSProperties;
}

export function SurveyPreviewPane({
  localStart,
  oskMode,
  onOskModeChange,
  stage,
  retry,
  showCharacterMap,
  activeStepId,
  compact = false,
  style,
}: SurveyPreviewPaneProps) {
  // Text rows keep an inset (12px compact, 24px desktop); the keyboard
  // itself does not — it spans the pane edge to edge at every width.
  const inset = compact ? "0 12px" : "0 24px";
  // Before the Touch gallery the mobile preview is hidden and the pane falls
  // back to desktop for display only; the stored preference is left alone so
  // it is honoured again on reaching the Touch gallery.
  const touchAvailable = isTouchPreviewAvailable(activeStepId);
  const shownOskMode: OskMode = touchAvailable ? oskMode : "desktop";
  return (
    <section
      aria-label={showCharacterMap ? "Character map" : "Keyboard preview"}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
        minHeight: 0,
        overflow: "auto",
        padding: compact ? 0 : "24px 0",
        boxSizing: "border-box",
        color: TEXT_MAIN,
        fontFamily: FONT,
        ...style,
      }}
    >
      {showCharacterMap ? (
        <div style={{ padding: inset }}>
          <CharacterMapPane
            scope={
              activeStepId === "punctuation"
                ? "punctuation"
                : activeStepId === "invisibles"
                  ? "invisibles"
                  : "alphabet"
            }
          />
        </div>
      ) : localStart === null ? (
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "column",
            gap: 12,
            padding: inset,
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
            <Trans id="preview.empty.chooseStartingHint">
              Choose a starting keyboard in the wizard to see a live preview here.
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
              padding: inset,
            }}
          >
            <h2
              style={{
                margin: 0,
                fontSize: "1.1rem",
                color: "var(--app-accent-text)",
              }}
            >
              {localStart.displayName}
            </h2>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 16,
                flexWrap: "wrap",
              }}
            >
              <OskModeToggle
                value={shownOskMode}
                onChange={onOskModeChange}
                hideTouch={!touchAvailable}
              />
            </div>
          </div>
          <OSKFrame
            startKeyboard={localStart}
            oskMode={shownOskMode}
            stage={stage}
            retry={retry}
            // Compact = the narrow PreviewSheet the author just opened.
            autoFocus={compact}
            // The OSK spans the full width of the pane at every width
            // (#1898); the rows above inset themselves instead.
            fullBleed
          />
        </>
      )}
    </section>
  );
}
