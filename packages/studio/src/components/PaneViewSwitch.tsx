// PaneViewSwitch — narrow-viewport Questions | Preview segmented control
// (mobile adaptation #1853, Phase 2).
//
// Under 479px the survey's two panes can't sit side-by-side, so this switch
// picks which one fills the viewport. It renders only when `useIsNarrow()`
// is true — desktop keeps the resizable split and never sees it.
//
// The selection is session-persisted in viewStateStore (`surveyPaneView`):
// a device preference in the spirit of `lib/theme.ts`'s doctrine, answering
// the epic's open question 4.

import type { CSSProperties } from "react";
import { useLingui } from "@lingui/react/macro";
import { useIsNarrow } from "../hooks/useViewport.ts";
import type { SurveyPaneView } from "../stores/viewStateStore.ts";

export interface PaneViewSwitchProps {
  value: SurveyPaneView;
  onChange: (next: SurveyPaneView) => void;
}

const GROUP_STYLE: CSSProperties = {
  display: "flex",
  flexShrink: 0,
  borderBottom: "1px solid var(--app-border)",
  background: "var(--app-surface)",
};

function optionStyle(active: boolean): CSSProperties {
  return {
    flex: "1 1 0",
    minHeight: "var(--app-touch-target)",
    padding: "8px 12px",
    border: "none",
    borderBottom: active
      ? "2px solid var(--app-accent)"
      : "2px solid transparent",
    background: "transparent",
    color: active ? "var(--app-accent-text)" : "var(--app-text)",
    fontWeight: active ? 700 : 500,
    fontSize: 14,
    fontFamily: "var(--app-font)",
    cursor: "pointer",
    boxSizing: "border-box",
  };
}

export function PaneViewSwitch({ value, onChange }: PaneViewSwitchProps) {
  const { t } = useLingui();
  const isNarrow = useIsNarrow();
  if (!isNarrow) return null;

  const option = (view: SurveyPaneView, label: string) => (
    <button
      key={view}
      type="button"
      aria-pressed={value === view}
      onClick={() => onChange(view)}
      style={optionStyle(value === view)}
    >
      {label}
    </button>
  );

  return (
    <div
      role="group"
      aria-label={t({
        id: "paneViewSwitch.groupLabel",
        message: "Survey pane view",
      })}
      style={GROUP_STYLE}
    >
      {option(
        "questions",
        t({ id: "paneViewSwitch.questions", message: "Questions" }),
      )}
      {option(
        "preview",
        t({ id: "paneViewSwitch.preview", message: "Preview" }),
      )}
    </div>
  );
}
