// PreviewScreen — "try it" tab.
//
// Left pane: shared PickerPane (BaseKeyboardPicker, mode toggle, ScaffoldForm,
// TrackOneIdentityPanel, KmnEditor, MetadataCard).
// Right pane: OskModeToggle + OSKFrame + DiagnosticsPanel.
//
// NO Download button. NO SignUpPanel.

import { useState } from "react";
import { useResizablePanes } from "../hooks/useResizablePanes.ts";
import { usePreviewArtifact } from "../hooks/usePreviewArtifact.ts";
import { BaseKeyboardPicker } from "./BaseKeyboardPicker.tsx";
import { OskModeToggle, type OskMode } from "./OskModeToggle.tsx";
import { OSKFrame } from "./OSKFrame.tsx";
import { ScaffoldForm } from "./ScaffoldForm.tsx";
import { KmnEditor } from "./KmnEditor.tsx";
import { TrackOneIdentityPanel } from "./TrackOneIdentityPanel.tsx";
import { PickerPane } from "./PickerPane.tsx";
import { DiagnosticsPanel } from "./DiagnosticsPanel.tsx";
import { ResizeHandle } from "./ResizeHandle.tsx";
import { DIVIDER_WIDTH, LEFT_MIN_PCT, LEFT_MAX_PCT, LEFT_INIT_PCT } from "./previewOutputLayout.ts";

export function PreviewScreen() {
  // Each screen runs its own independent artifact pipeline — see usePreviewArtifact.ts module comment for why this is deliberate (do not "dedupe" across screens).
  const artifact = usePreviewArtifact();
  const [oskMode, setOskMode] = useState<OskMode>("desktop");
  const { containerRef, leftPct, handleHovered, onPointerDown, setHandleHovered } =
    useResizablePanes({ minPct: LEFT_MIN_PCT, maxPct: LEFT_MAX_PCT, initPct: LEFT_INIT_PCT });

  const rightPct = 100 - leftPct;

  return (
    <div
      ref={containerRef}
      style={{
        display: "flex",
        flexDirection: "row",
        height: "100%",
        width: "100%",
        background: "#0d1117",
        color: "#e6edf3",
        fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
        overflow: "hidden",
      }}
    >
      {/* Left pane: picker */}
      <PickerPane
        artifact={artifact}
        leftPct={leftPct}
        dividerWidth={DIVIDER_WIDTH}
        pickerSlot={
          <BaseKeyboardPicker
            value={artifact.baseKeyboard}
            onChange={artifact.handleBaseKeyboardChange}
          />
        }
        scaffoldFormSlot={
          artifact.pickerMode === "scaffold" && artifact.baseKeyboard !== null ? (
            <ScaffoldForm onSubmit={(spec) => { artifact.setScaffoldSpec(spec); }} />
          ) : null
        }
        identityPanelSlot={<TrackOneIdentityPanel />}
        kmnEditorSlot={
          artifact.stage.kind === "ready" ? (
            <KmnEditor vfs={artifact.stage.vfs} onRecompile={artifact.recompile} />
          ) : null
        }
      />

      {/* Drag handle */}
      <ResizeHandle
        onPointerDown={onPointerDown}
        hovered={handleHovered}
        onHoverChange={setHandleHovered}
      />

      {/* Right pane: live OSK preview + diagnostics */}
      <section
        aria-label="Preview pane"
        style={{
          flexBasis: `calc(${rightPct}% - ${DIVIDER_WIDTH / 2}px)`,
          flexGrow: 1,
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          gap: 12,
          minHeight: 0,
          overflow: "auto",
          padding: 24,
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <h2 style={{ margin: 0, fontSize: "1.1rem", color: "#6ea8fe" }}>
            Live preview
          </h2>
          <OskModeToggle value={oskMode} onChange={setOskMode} />
        </div>
        <OSKFrame
          baseKeyboard={artifact.baseKeyboard}
          oskMode={oskMode}
          stage={artifact.stage}
          retry={artifact.retry}
        />
        {artifact.baseKeyboard !== null && (
          <DiagnosticsPanel diagnostics={artifact.diagnostics} />
        )}
      </section>
    </div>
  );
}
