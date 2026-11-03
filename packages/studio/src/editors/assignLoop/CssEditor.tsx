/**
 * CssEditor — custom CSS editor step (after Touch Gallery).
 *
 * An optional step for authoring the keyboard's custom CSS
 * (`&KMW_EMBEDCSS` stylesheet, `.css` file in the package).
 *
 * Features:
 * - Monaco editor for CSS (lazy-loaded)
 * - Live preview: Touch layout and Desktop OSK side-by-side or toggleable,
 *   with the custom CSS applied via a <style> tag
 * - Optional: "Skip" / "No custom CSS" — if empty, no .css file is written
 * - On Continue: passes { css } via onComplete for the output pipeline
 *
 * CSS affects mostly touch, but possibly the desktop OSK too — so preview both.
 */

import { lazy, Suspense, useMemo, useState } from "react";
import { useLingui } from "@lingui/react/macro";
import { generateKvksFromIR } from "@keyboard-studio/engine";
import type { KvksIR, TouchLayoutIR } from "@keyboard-studio/contracts";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import type { EditorStepProps } from "../../steps/types.ts";

// Lazy-load the Monaco pane so it never lands in the main chunk.
const CssCodePane = lazy(() =>
  import("./CssCodePane.tsx").then((m) => ({ default: m.CssCodePane })),
);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PreviewMode = "touch" | "desktop" | "side-by-side";

// ---------------------------------------------------------------------------
// Preview components
// ---------------------------------------------------------------------------

/** Simplified touch layout preview — renders phone platform keys. */
function TouchPreview({ layout, customCss }: { layout: TouchLayoutIR | null; customCss: string }) {
  const { t } = useLingui();
  if (!layout) {
    return (
      <div style={{ padding: 16, color: "var(--app-text-muted)", fontSize: 13 }}>
        {t({ id: "editor.assignLoop.css.preview.noTouch", message: "No touch layout available." })}
      </div>
    );
  }

  const phone = layout.platforms.find((p) => p.id === "phone") ?? layout.platforms[0];
  if (!phone) {
    return (
      <div style={{ padding: 16, color: "var(--app-text-muted)", fontSize: 13 }}>
        {t({ id: "editor.assignLoop.css.preview.noTouch", message: "No touch layout available." })}
      </div>
    );
  }

  const layer = phone.layers[0];
  if (!layer) return null;

  return (
    <div className="css-preview-touch" style={{ padding: 12 }}>
      <style>{customCss}</style>
      <div style={{ fontSize: 12, color: "var(--app-text-muted)", marginBottom: 8 }}>
        {t({ id: "editor.assignLoop.css.preview.touchLabel", message: "Touch (phone)" })}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {layer.rows.map((row, ri) => (
          <div key={ri} style={{ display: "flex", gap: 4 }}>
            {row.keys.map((key) => (
              <div
                key={key.id}
                className="kmw-key"
                style={{
                  flex: 1,
                  minHeight: 44,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "var(--app-surface)",
                  border: "1px solid var(--app-border)",
                  borderRadius: 6,
                  fontSize: 16,
                  color: "var(--app-text)",
                }}
              >
                {key.text ?? key.id}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Simplified desktop OSK preview — renders KvksIR layers. */
function DesktopPreview({ kvks, customCss }: { kvks: KvksIR | null; customCss: string }) {
  const { t } = useLingui();
  if (!kvks || kvks.layers.length === 0) {
    return (
      <div style={{ padding: 16, color: "var(--app-text-muted)", fontSize: 13 }}>
        {t({ id: "editor.assignLoop.css.preview.noDesktop", message: "No desktop OSK available." })}
      </div>
    );
  }

  const layer = kvks.layers[0];
  if (!layer) return null;

  // Simple grid: 10 keys per row
  const rows: Array<typeof layer.keys> = [];
  for (let i = 0; i < layer.keys.length; i += 10) {
    rows.push(layer.keys.slice(i, i + 10));
  }

  return (
    <div className="css-preview-desktop" style={{ padding: 12 }}>
      <style>{customCss}</style>
      <div style={{ fontSize: 12, color: "var(--app-text-muted)", marginBottom: 8 }}>
        {t({ id: "editor.assignLoop.css.preview.desktopLabel", message: "Desktop OSK" })}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {rows.map((rowKeys, ri) => (
          <div key={ri} style={{ display: "flex", gap: 4 }}>
            {rowKeys.map((key) => (
              <div
                key={key.vkey}
                className="kmw-key"
                style={{
                  flex: 1,
                  minHeight: 40,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "var(--app-surface)",
                  border: "1px solid var(--app-border)",
                  borderRadius: 6,
                  fontSize: 14,
                  color: "var(--app-text)",
                }}
              >
                {key.label || key.vkey}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function CssEditor({ onComplete, onBack }: EditorStepProps) {
  const { t } = useLingui();
  const ir = useWorkingCopyStore((s) => s.ir);
  const touchLayoutJson = useWorkingCopyStore((s) => s.touchLayoutJson);
  const kbdname = useWorkingCopyStore((s) => s.ir?.header.name ?? "keyboard");

  const [css, setCss] = useState("");
  const [previewMode, setPreviewMode] = useState<PreviewMode>("side-by-side");
  const [skipped, setSkipped] = useState(false);

  // Parse touch layout
  const touchLayout = useMemo<TouchLayoutIR | null>(() => {
    if (!touchLayoutJson) return null;
    try {
      return JSON.parse(touchLayoutJson) as TouchLayoutIR;
    } catch {
      return null;
    }
  }, [touchLayoutJson]);

  // Generate desktop OSK
  const kvks = useMemo<KvksIR | null>(() => {
    if (!ir) return null;
    try {
      return generateKvksFromIR(ir, kbdname);
    } catch {
      return null;
    }
  }, [ir, kbdname]);

  const handleApply = (newCss: string) => {
    setCss(newCss);
    setSkipped(false);
  };

  const handleSkip = () => {
    setSkipped(true);
    setCss("");
  };

  const handleContinue = () => {
    // If skipped or empty, pass empty css (no .css file written)
    // Otherwise pass the CSS for the output pipeline
    onComplete({ css: skipped ? "" : css });
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 16,
        padding: 24,
        height: "100%",
        overflowY: "auto",
      }}
    >
      <h1 style={{ margin: 0, fontSize: 20, color: "var(--app-text)" }}>
        {t({ id: "editor.assignLoop.css.title", message: "Custom CSS" })}
      </h1>
      <p style={{ margin: 0, fontSize: 13, color: "var(--app-text-muted)" }}>
        {t({
          id: "editor.assignLoop.css.description",
          message:
            "Add custom CSS to style your keyboard. This affects the touch layout and desktop on-screen keyboard. Leave empty to skip.",
        })}
      </p>

      {/* Preview mode toggle */}
      <div style={{ display: "flex", gap: 8 }}>
        {(
          [
            ["touch", t({ id: "editor.assignLoop.css.previewMode.touch", message: "Touch" })],
            ["desktop", t({ id: "editor.assignLoop.css.previewMode.desktop", message: "Desktop" })],
            ["side-by-side", t({ id: "editor.assignLoop.css.previewMode.sideBySide", message: "Side by side" })],
          ] as Array<[PreviewMode, string]>
        ).map(([mode, label]) => (
          <button
            key={mode}
            type="button"
            onClick={() => setPreviewMode(mode)}
            aria-pressed={previewMode === mode}
            style={{
              padding: "6px 12px",
              fontSize: 13,
              borderRadius: 6,
              border: `1px solid ${previewMode === mode ? "var(--app-accent)" : "var(--app-border)"}`,
              background: previewMode === mode ? "var(--app-accent-bg)" : "var(--app-surface)",
              color: "var(--app-text)",
              cursor: "pointer",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Editor + Preview */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: previewMode === "side-by-side" ? "1fr 1fr" : "1fr",
          gap: 16,
          flex: 1,
          minHeight: 0,
        }}
      >
        {/* CSS Editor */}
        <div style={{ display: "flex", flexDirection: "column", minHeight: 300 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--app-text)", marginBottom: 8 }}>
            {t({ id: "editor.assignLoop.css.editorLabel", message: "CSS" })}
          </div>
          <div style={{ flex: 1, minHeight: 0 }}>
            <Suspense
              fallback={
                <div style={{ padding: 16, color: "var(--app-text-muted)", fontSize: 13 }}>
                  {t({ id: "editor.assignLoop.css.code.loading", message: "Loading editor…" })}
                </div>
              }
            >
              <CssCodePane initialText={css} onApply={handleApply} />
            </Suspense>
          </div>
          <button
            type="button"
            onClick={handleSkip}
            style={{
              marginTop: 8,
              padding: "6px 12px",
              fontSize: 13,
              borderRadius: 6,
              border: "1px solid var(--app-border)",
              background: "var(--app-surface)",
              color: "var(--app-text-muted)",
              cursor: "pointer",
              alignSelf: "flex-start",
            }}
          >
            {t({ id: "editor.assignLoop.css.skip", message: "No custom CSS (skip)" })}
          </button>
        </div>

        {/* Preview */}
        {(previewMode === "touch" || previewMode === "side-by-side") && (
          <div
            style={{
              border: "1px solid var(--app-border)",
              borderRadius: 8,
              background: "var(--app-surface)",
              overflow: "auto",
              minHeight: 300,
            }}
          >
            <TouchPreview layout={touchLayout} customCss={css} />
          </div>
        )}
        {(previewMode === "desktop" || previewMode === "side-by-side") && (
          <div
            style={{
              border: "1px solid var(--app-border)",
              borderRadius: 8,
              background: "var(--app-surface)",
              overflow: "auto",
              minHeight: 300,
            }}
          >
            <DesktopPreview kvks={kvks} customCss={css} />
          </div>
        )}
      </div>

      {/* Footer */}
      <div
        style={{
          display: "flex",
          gap: 8,
          paddingTop: 16,
          borderTop: "1px solid var(--app-border)",
        }}
      >
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            style={{
              padding: "10px 20px",
              fontSize: 14,
              borderRadius: 6,
              border: "1px solid var(--app-border)",
              background: "var(--app-surface)",
              color: "var(--app-text)",
              cursor: "pointer",
            }}
          >
            {t({ id: "editor.assignLoop.css.back", message: "Back" })}
          </button>
        )}
        <div style={{ flex: 1 }} />
        <button
          type="button"
          onClick={handleContinue}
          style={{
            padding: "10px 24px",
            fontSize: 14,
            borderRadius: 6,
            border: "1px solid var(--app-accent)",
            background: "var(--app-accent-bg)",
            color: "var(--app-text)",
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          {t({ id: "editor.assignLoop.css.continue", message: "Continue" })}
        </button>
      </div>
    </div>
  );
}
