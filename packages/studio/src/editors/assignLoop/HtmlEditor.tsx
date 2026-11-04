/**
 * HtmlEditor — documentation editor step (after Help & Tips, Phase F).
 *
 * Edits the keyboard's `welcome.htm` file — HTML (verified on
 * keymanapp/keyboards: akan, basic_kbdus, khmer_angkor all start with
 * `<!DOCTYPE html>`). This is the full user manual.
 *
 * Features:
 * - Monaco editor for HTML (lazy-loaded)
 * - Live preview: the HTML rendered directly, side-by-side or toggleable
 * - `readme.htm`, `README.md`, and `.php` versions are generated exports
 *   from this source — the output pipeline handles them, not this editor
 * - On Continue: passes { html } via onComplete for the output pipeline
 */

import { lazy, Suspense, useState } from "react";
import { useLingui } from "@lingui/react/macro";
import type { EditorStepProps } from "../../steps/types.ts";

// Lazy-load the Monaco pane so it never lands in the main chunk.
const HtmlCodePane = lazy(() =>
  import("./HtmlCodePane.tsx").then((m) => ({ default: m.HtmlCodePane })),
);

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

type PreviewMode = "edit" | "preview" | "side-by-side";

export function HtmlEditor({ onComplete, onBack }: EditorStepProps) {
  const { t } = useLingui();

  const [html, setHtml] = useState("");
  const [previewMode, setPreviewMode] = useState<PreviewMode>("side-by-side");

  const handleApply = (newHtml: string) => {
    setHtml(newHtml);
  };

  const handleContinue = () => {
    // The output pipeline generates readme.htm, README.md, and .php from this source
    onComplete({ html });
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
        {t({ id: "editor.assignLoop.html.title", message: "Documentation" })}
      </h1>
      <p style={{ margin: 0, fontSize: 13, color: "var(--app-text-muted)" }}>
        {t({
          id: "editor.assignLoop.html.description",
          message:
            "Write the user documentation for your keyboard (welcome.htm). This is the full user manual — summaries and web versions are generated from it automatically.",
        })}
      </p>

      {/* Preview mode toggle */}
      <div style={{ display: "flex", gap: 8 }}>
        {(
          [
            ["edit", t({ id: "editor.assignLoop.html.previewMode.edit", message: "Edit" })],
            ["preview", t({ id: "editor.assignLoop.html.previewMode.preview", message: "Preview" })],
            ["side-by-side", t({ id: "editor.assignLoop.html.previewMode.sideBySide", message: "Side by side" })],
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
        {/* HTML Editor */}
        {(previewMode === "edit" || previewMode === "side-by-side") && (
          <div style={{ display: "flex", flexDirection: "column", minHeight: 300 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--app-text)", marginBottom: 8 }}>
              {t({ id: "editor.assignLoop.html.editorLabel", message: "HTML" })}
            </div>
            <div style={{ flex: 1, minHeight: 0 }}>
              <Suspense
                fallback={
                  <div style={{ padding: 16, color: "var(--app-text-muted)", fontSize: 13 }}>
                    {t({ id: "editor.assignLoop.html.code.loading", message: "Loading editor…" })}
                  </div>
                }
              >
                <HtmlCodePane initialText={html} onApply={handleApply} />
              </Suspense>
            </div>
          </div>
        )}

        {/* Preview */}
        {(previewMode === "preview" || previewMode === "side-by-side") && (
          <div
            style={{
              border: "1px solid var(--app-border)",
              borderRadius: 8,
              background: "var(--app-background)",
              overflow: "auto",
              minHeight: 300,
              padding: 16,
            }}
          >
            <div style={{ fontSize: 12, color: "var(--app-text-muted)", marginBottom: 12 }}>
              {t({ id: "editor.assignLoop.html.preview.label", message: "Preview" })}
            </div>
            {html.trim() === "" ? (
              <div style={{ color: "var(--app-text-muted)", fontSize: 13, fontStyle: "italic" }}>
                {t({
                  id: "editor.assignLoop.html.preview.empty",
                  message: "Nothing to preview yet — write some documentation on the left.",
                })}
              </div>
            ) : (
              // The file is HTML by definition — render it directly.
              // This is the author's own document preview, not untrusted content.
              <div dangerouslySetInnerHTML={{ __html: html }} />
            )}
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
            {t({ id: "editor.assignLoop.html.back", message: "Back" })}
          </button>
        )}
        <div style={{ flex: 1 }} />
        <button
          type="button"
          data-testid="html-continue"
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
          {t({ id: "editor.assignLoop.html.continue", message: "Continue" })}
        </button>
      </div>
    </div>
  );
}
