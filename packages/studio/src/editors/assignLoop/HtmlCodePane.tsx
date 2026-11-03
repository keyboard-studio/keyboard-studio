/**
 * HtmlCodePane — lazy-loaded Monaco editor for the HTML editor step.
 *
 * A Monaco editor over the keyboard's `welcome.htm` documentation file
 * (HTML). Follows the CssCodePane pattern:
 * - Lazy-loaded so Monaco never lands in the main chunk
 * - Debounced lint via htmlCodeLint.ts
 * - Dirty tracking: text !== lastApplied
 * - Apply commits via onApply callback
 */

import { useEffect, useRef, useState } from "react";
import Editor, { type OnMount } from "@monaco-editor/react";
import { useLingui } from "@lingui/react/macro";
import { lintHtmlText, type HtmlCodeMarker } from "./htmlCodeLint.ts";

const LINT_DEBOUNCE_MS = 300;
const MARKER_OWNER = "html-editor-lint";

function monacoSeverity(
  monaco: Parameters<OnMount>[1],
  severity: "error" | "warning",
): number {
  const MarkerSeverity = monaco.MarkerSeverity;
  return severity === "error" ? MarkerSeverity.Error : MarkerSeverity.Warning;
}

interface HtmlCodePaneProps {
  /** Initial HTML text (from working copy or empty). */
  initialText: string;
  /** Called with the HTML text when the user clicks Apply. */
  onApply: (html: string) => void;
  /** Whether Apply is currently disabled (e.g., lint errors). */
  applyDisabled?: boolean;
}

export function HtmlCodePane({ initialText, onApply, applyDisabled }: HtmlCodePaneProps) {
  const { t } = useLingui();
  const [text, setText] = useState(initialText);
  const [markers, setMarkers] = useState<readonly HtmlCodeMarker[]>([]);
  const [hasErrors, setHasErrors] = useState(false);

  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);
  const monacoRef = useRef<Parameters<OnMount>[1] | null>(null);
  const lintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastAppliedRef = useRef<string>(initialText);

  const isDirty = text !== lastAppliedRef.current;

  const applyMarkersToModel = (next: readonly HtmlCodeMarker[]) => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco) return;
    const model = editor.getModel();
    if (!model) return;
    monaco.editor.setModelMarkers(
      model,
      MARKER_OWNER,
      next.map((m) => ({
        startLineNumber: m.line,
        startColumn: m.column,
        endLineNumber: m.endLine ?? m.line,
        endColumn: m.endColumn ?? m.column + 1,
        message: m.message,
        severity: monacoSeverity(monaco, m.severity),
      })),
    );
  };

  // Debounced lint
  useEffect(() => {
    if (lintTimerRef.current) {
      clearTimeout(lintTimerRef.current);
    }
    lintTimerRef.current = setTimeout(() => {
      const next = lintHtmlText(text);
      setMarkers(next);
      setHasErrors(next.some((m) => m.severity === "error"));
      applyMarkersToModel(next);
    }, LINT_DEBOUNCE_MS);

    return () => {
      if (lintTimerRef.current) {
        clearTimeout(lintTimerRef.current);
      }
    };
  }, [text]);

  const handleMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    // Apply any pending markers
    if (markers.length > 0) {
      applyMarkersToModel(markers);
    }
  };

  const handleApply = () => {
    // Synchronous lint gate: don't apply with errors
    const next = lintHtmlText(text);
    if (next.some((m) => m.severity === "error")) {
      setMarkers(next);
      setHasErrors(true);
      applyMarkersToModel(next);
      return;
    }
    lastAppliedRef.current = text;
    onApply(text);
  };

  const errorCount = markers.filter((m) => m.severity === "error").length;
  const warningCount = markers.filter((m) => m.severity === "warning").length;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: 8 }}>
      <div style={{ flex: 1, minHeight: 200, border: "1px solid var(--app-border)", borderRadius: 6, overflow: "hidden" }}>
        <Editor
          height="100%"
          defaultLanguage="html"
          value={text}
          onChange={(value) => setText(value ?? "")}
          onMount={handleMount}
          options={{
            minimap: { enabled: false },
            fontSize: 13,
            wordWrap: "on",
            scrollBeyondLastLine: false,
          }}
        />
      </div>

      {/* Status bar: issue counts + Apply */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 12, color: "var(--app-text-muted)" }}>
        <span>
          {errorCount > 0 && (
            <span style={{ color: "var(--app-danger)", marginRight: 8 }}>
              {t({ id: "editor.assignLoop.html.code.errors", message: `{count, plural, one {# error} other {# errors}}` })}
            </span>
          )}
          {warningCount > 0 && (
            <span style={{ color: "var(--app-warning)" }}>
              {t({ id: "editor.assignLoop.html.code.warnings", message: `{count, plural, one {# warning} other {# warnings}}` })}
            </span>
          )}
          {errorCount === 0 && warningCount === 0 && (
            <span style={{ color: "var(--app-success)" }}>
              {t({ id: "editor.assignLoop.html.code.noIssues", message: "No issues" })}
            </span>
          )}
        </span>
        <div style={{ flex: 1 }} />
        {isDirty && (
          <span style={{ fontStyle: "italic" }}>
            {t({ id: "editor.assignLoop.html.code.unappliedChanges", message: "Unapplied changes" })}
          </span>
        )}
        <button
          type="button"
          onClick={handleApply}
          disabled={hasErrors || applyDisabled || !isDirty}
          style={{
            padding: "6px 16px",
            fontSize: 13,
            borderRadius: 6,
            border: "1px solid var(--app-accent)",
            background: "var(--app-accent-bg)",
            color: "var(--app-text)",
            cursor: hasErrors || !isDirty ? "not-allowed" : "pointer",
            opacity: hasErrors || !isDirty ? 0.5 : 1,
          }}
        >
          {t({ id: "editor.assignLoop.html.code.apply", message: "Apply" })}
        </button>
      </div>
    </div>
  );
}
