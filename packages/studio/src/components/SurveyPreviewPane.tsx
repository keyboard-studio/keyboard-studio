// SurveyPreviewPane — the survey's right pane: live OSK preview (or, for the
// Phase B build-list only, the interactive character map).
//
// Extracted from StudioShell's SurveyView (mobile adaptation, Phase 2).
//
// OSK visibility (principle 9) is a host-lifecycle question, not a switch in
// this pane: on desktop the pane is always beside the questions; on narrow
// viewports it is rendered inside a PreviewSheet, so it (and its OSK iframe)
// is mounted only while the author has the sheet open. `compact` is that
// sheet layout: no side gutter, so the keyboard spans the full width.

import type { CSSProperties } from "react";
import { Trans } from "@lingui/react/macro";
import type { BaseKeyboard } from "@keyboard-studio/contracts";
import type { Stage } from "../hooks/useKeyboardArtifact.ts";
import { TEXT_MAIN, FONT } from "../survey/surveyStyles.ts";
import { OSKFrame } from "./OSKFrame.tsx";
import { OskModeToggle, type OskMode } from "./OskModeToggle.tsx";
import { CharacterMapPane } from "../survey/CharacterMapPane.tsx";

export interface SurveyPreviewPaneProps {
  localBase: BaseKeyboard | null;
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
  localBase,
  oskMode,
  onOskModeChange,
  stage,
  retry,
  showCharacterMap,
  activeStepId,
  compact = false,
  style,
}: SurveyPreviewPaneProps) {
  // Compact: text rows keep a 12px inset; the keyboard itself does not.
  const inset = compact ? "0 12px" : 0;
  return (
    <section
      aria-label={showCharacterMap ? "Character map" : "Keyboard preview"}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
        minHeight: 0,
        overflow: "auto",
        padding: compact ? 0 : 24,
        boxSizing: "border-box",
        color: TEXT_MAIN,
        fontFamily: FONT,
        ...style,
      }}
    >
      {showCharacterMap ? (
        <div style={{ padding: inset }}>
          <CharacterMapPane
            scope={activeStepId === "punctuation" ? "punctuation" : "alphabet"}
          />
        </div>
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
            </div>
          </div>
          <OSKFrame
            baseKeyboard={localBase}
            oskMode={oskMode}
            stage={stage}
            retry={retry}
            // Compact = the narrow PreviewSheet the author just opened.
            autoFocus={compact}
          />
        </>
      )}
    </section>
  );
}
