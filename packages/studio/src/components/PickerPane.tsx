// PickerPane — shared left pane used by both PreviewScreen and OutputScreen.
//
// Renders: heading + description, mode toggle (open/scaffold), the picker
// component slot, the scaffold-form slot, the identity-panel slot, the
// KMN-editor slot, and the MetadataCard (open-mode only).
//
// Slots are passed as ReactNode so each screen can inject the already-created
// elements without PickerPane importing every child component.

import type { ReactNode } from "react";
import type { PreviewArtifact } from "../hooks/usePreviewArtifact.ts";
import { MetadataCard } from "./MetadataCard.tsx";

interface PickerPaneProps {
  artifact: PreviewArtifact;
  leftPct: number;
  dividerWidth: number;
  pickerSlot: ReactNode;
  scaffoldFormSlot: ReactNode;
  identityPanelSlot: ReactNode;
  kmnEditorSlot: ReactNode;
}

export function PickerPane({
  artifact,
  leftPct,
  dividerWidth,
  pickerSlot,
  scaffoldFormSlot,
  identityPanelSlot,
  kmnEditorSlot,
}: PickerPaneProps) {
  const { baseKeyboard, pickerMode, handlePickerModeChange } = artifact;

  return (
    <section
      aria-label="Picker pane"
      style={{
        flexBasis: `calc(${leftPct}% - ${dividerWidth / 2}px)`,
        flexShrink: 0,
        flexGrow: 0,
        display: "flex",
        flexDirection: "column",
        gap: 12,
        minHeight: 0,
        overflow: "auto",
        padding: 24,
        boxSizing: "border-box",
      }}
    >
      <h1 style={{ margin: 0, fontSize: "1.4rem", letterSpacing: "-0.01em" }}>
        Keyboard Studio
      </h1>
      <p style={{ margin: 0, color: "#9aa7b8", fontSize: 13 }}>
        Pick a base keyboard to start; the right pane shows the compiled result.
      </p>

      {/* Mode toggle: open base vs. scaffold new */}
      <div
        role="group"
        aria-label="Keyboard source mode"
        style={{ display: "flex", gap: 8, marginTop: 4 }}
      >
        <button
          type="button"
          onClick={() => { handlePickerModeChange("open"); }}
          aria-pressed={pickerMode === "open"}
          style={{
            flex: 1,
            padding: "6px 12px",
            fontSize: 12,
            fontFamily: "inherit",
            cursor: "pointer",
            borderRadius: 6,
            border: "1px solid #283040",
            background: pickerMode === "open" ? "#1f6feb" : "#161b22",
            color: pickerMode === "open" ? "#e6edf3" : "#9aa7b8",
            transition: "background 0.15s",
          }}
        >
          Open base
        </button>
        <button
          type="button"
          onClick={() => { handlePickerModeChange("scaffold"); }}
          aria-pressed={pickerMode === "scaffold"}
          style={{
            flex: 1,
            padding: "6px 12px",
            fontSize: 12,
            fontFamily: "inherit",
            cursor: "pointer",
            borderRadius: 6,
            border: "1px solid #283040",
            background: pickerMode === "scaffold" ? "#1f6feb" : "#161b22",
            color: pickerMode === "scaffold" ? "#e6edf3" : "#9aa7b8",
            transition: "background 0.15s",
          }}
        >
          New from base
        </button>
      </div>

      <div style={{ marginTop: 8 }}>{pickerSlot}</div>

      {scaffoldFormSlot}

      {identityPanelSlot}

      {kmnEditorSlot}

      {baseKeyboard !== null && pickerMode === "open" ? (
        <MetadataCard kb={baseKeyboard} />
      ) : null}
    </section>
  );
}
