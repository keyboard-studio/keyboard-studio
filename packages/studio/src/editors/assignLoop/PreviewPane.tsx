// GalleryPreviewPane — shared right-pane for MechanismGallery and TouchGallery.
//
// Renders: heading row + OskModeToggle, warnings banner, loading/error/
// diagnostics blocks, and the OSKFrame. The two galleries differ only in:
//   - heading text ("Live preview" vs "Touch preview")
//   - default oskMode ("desktop" vs "touch")
//   - warning label ("Apply warnings:" vs "Preview warnings:")
//   - baseKeyboard prop nullability (MechanismGallery passes non-null; TouchGallery may pass null)
//
// Keeping BOTH defaultOskMode values explicit as props means the rendered
// behaviour is identical to the original local components — no silent defaults.

import { useState } from "react";
import type { BaseKeyboard } from "@keyboard-studio/contracts";
import type { Stage } from "../../hooks/useKeyboardArtifact.ts";
import { OSKFrame } from "../../components/OSKFrame.tsx";
import { OskModeToggle } from "../../components/OskModeToggle.tsx";
import type { OskMode } from "../../components/OskModeToggle.tsx";
import {
  ACCENT, FONT, TEXT_DIM, BG_CARD, BORDER,
} from "../../lib/galleryTheme.ts";

export interface GalleryPreviewPaneProps {
  baseKeyboard: BaseKeyboard | null;
  stage: Stage;
  retry: () => void;
  onKeyTap?: (keyId: string) => void;
  defaultOskMode: OskMode;
  heading: string;
  warningLabel?: string;
}

export function GalleryPreviewPane({
  baseKeyboard,
  stage,
  retry,
  onKeyTap,
  defaultOskMode,
  heading,
  warningLabel = "Warnings:",
}: GalleryPreviewPaneProps) {
  const [oskMode, setOskMode] = useState<OskMode>(defaultOskMode);

  const applyWarnings =
    stage.kind === "ready" && stage.scaffoldWarnings.length > 0
      ? stage.scaffoldWarnings
      : [];

  return (
    <section
      aria-label={`${heading} keyboard preview`}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 14,
        height: "100%",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 10,
        }}
      >
        <h2
          style={{
            margin: 0,
            fontSize: "1rem",
            fontWeight: 600,
            color: ACCENT,
            fontFamily: FONT,
          }}
        >
          {heading}
        </h2>
        <OskModeToggle
          value={oskMode}
          onChange={setOskMode}
          disabled={stage.kind !== "ready"}
        />
      </div>

      {applyWarnings.length > 0 && (
        <div
          role="alert"
          aria-live="polite"
          style={{
            background: "#2a1a00",
            border: "1px solid #f0883e",
            borderRadius: 6,
            padding: "8px 12px",
            fontSize: 12,
            color: "#f0883e",
            fontFamily: FONT,
          }}
        >
          <strong>{warningLabel}</strong>
          <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
            {applyWarnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {(stage.kind === "fetching" ||
        stage.kind === "vfs-loading" ||
        stage.kind === "compiling") && (
        <div
          role="status"
          aria-live="polite"
          aria-label="Loading keyboard preview"
          style={{
            padding: "24px 0",
            textAlign: "center",
            color: TEXT_DIM,
            fontSize: 13,
            fontFamily: FONT,
          }}
        >
          {stage.kind === "fetching"
            ? "Fetching keyboard source..."
            : stage.kind === "compiling"
              ? `Compiling${stage.isWarmCompile ? "" : " (loading WASM)"}...`
              : "Loading..."}
        </div>
      )}

      {stage.kind === "error" && (
        <div
          role="alert"
          aria-live="assertive"
          style={{
            padding: "16px 20px",
            background: "#2a0a0a",
            border: "1px solid #f85149",
            borderRadius: 8,
            color: "#f85149",
            fontSize: 13,
            fontFamily: FONT,
          }}
        >
          <strong>[ERROR]</strong> Preview failed ({stage.step}): {stage.message}
          <div style={{ marginTop: 10 }}>
            <button
              type="button"
              onClick={retry}
              style={{
                padding: "5px 12px",
                background: "transparent",
                border: "1px solid #f85149",
                borderRadius: 4,
                color: "#f85149",
                fontSize: 12,
                cursor: "pointer",
                fontFamily: FONT,
              }}
            >
              Retry
            </button>
          </div>
        </div>
      )}

      <div style={{ display: stage.kind === "error" ? "none" : "block" }}>
        <OSKFrame
          baseKeyboard={baseKeyboard}
          oskMode={oskMode}
          stage={stage}
          retry={retry}
          {...(onKeyTap !== undefined ? { onKeyTap } : {})}
        />
      </div>

      {stage.kind === "ready" && stage.compileResult.diagnostics.length > 0 && (
        <div
          role="status"
          aria-live="polite"
          aria-label={`${stage.compileResult.diagnostics.length} compiler diagnostic(s)`}
          style={{
            background: BG_CARD,
            border: `1px solid ${BORDER}`,
            borderRadius: 6,
            padding: "8px 12px",
            fontSize: 11,
            color: TEXT_DIM,
            fontFamily: "ui-monospace, 'Cascadia Code', Consolas, monospace",
          }}
        >
          <span style={{ color: "#d29922" }}>
            {stage.compileResult.diagnostics.length} compiler diagnostic(s).
          </span>
        </div>
      )}
    </section>
  );
}
