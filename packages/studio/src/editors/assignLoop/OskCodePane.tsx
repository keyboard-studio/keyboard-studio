// OskCodePane — the OSK editor's "Code" tab.
//
// A Monaco editor over the `.kvks` XML with syntax highlighting, following
// the TouchCodePane pattern ("view swap, not a fork"):
//
// - Text source: `emitKvks(effectiveKvks)` — canonical formatting, always
//   coherent with the Visual tab. `kvks === null` renders the empty state.
// - Lint: debounced per keystroke through oskCodeLint.ts (XML
//   well-formedness; parseKvks itself is regex-lenient so the
//   well-formedness check is the syntax gate).
// - Apply: parse the edited XML via `parseKvks`, hand the KvksIR to
//   `onApply` (the OskEditor's commit helper — one undo entry).
//   Monaco-local undo covers typing; the shared history covers Apply.

import "./touchBuilder/monacoSetup.ts";

import { useEffect, useRef, useState } from "react";
import Editor, { type OnMount } from "@monaco-editor/react";
import { useLingui } from "@lingui/react/macro";
import { plural } from "@lingui/core/macro";
import { emitKvks, parseKvks } from "@keyboard-studio/engine";
import type { KvksIR } from "@keyboard-studio/contracts";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { isOpenMode } from "../../lib/openMode.ts";
import { readVfsText } from "../../lib/vfsText.ts";
import {
  lintOskCodeText,
  type OskCodeMarker,
  type OskCodeMarkerSeverity,
} from "./oskCodeLint.ts";

const LINT_DEBOUNCE_MS = 300;
const MARKER_OWNER = "osk-code-lint";

function monacoSeverity(
  monaco: Parameters<OnMount>[1],
  severity: OskCodeMarkerSeverity,
): number {
  const MarkerSeverity = monaco.MarkerSeverity;
  switch (severity) {
    case "error":
      return MarkerSeverity.Error;
    case "warning":
      return MarkerSeverity.Warning;
    case "info":
      return MarkerSeverity.Info;
    case "hint":
      return MarkerSeverity.Hint;
  }
}

export function OskCodePane({
  kvks,
  onApply,
}: {
  kvks: KvksIR | null;
  onApply: (kvks: KvksIR) => void;
}) {
  const { t } = useLingui();

  const mode = useWorkingCopyStore((s) => s.instantiationMode);
  const startVfs = useWorkingCopyStore((s) => s.startVfs);
  const startKeyboard = useWorkingCopyStore((s) => s.startKeyboard);
  // Open mode (spec 111 FR-009): show the file's own text; Apply writes it back
  // verbatim. A keyboard with no `.kvks` keeps the generated text.
  const openPath =
    isOpenMode(mode) && startKeyboard !== null
      ? `source/${startKeyboard.id}.kvks`
      : null;
  const openText =
    openPath !== null && startVfs !== null ? readVfsText(startVfs, openPath) : undefined;

  // The canonical text for the current KvksIR (Open: the file's text).
  const canonical = kvks === null ? null : (openText ?? emitKvks(kvks));

  // Editor text. `null` until the first canonical text arrives.
  const [text, setText] = useState<string | null>(null);
  const textRef = useRef<string | null>(null);
  // The canonical text the current draft was last synced to / applied from.
  const lastAppliedRef = useRef<string | null>(null);
  // Set around Apply: the commit changes the KvksIR, the new canonical
  // text then snaps the editor (and clears dirty) via the effect below.
  const justAppliedRef = useRef(false);

  const [markers, setMarkers] = useState<readonly OskCodeMarker[]>([]);
  const [parsed, setParsed] = useState(true);
  const [applyError, setApplyError] = useState<string | null>(null);

  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);
  const monacoRef = useRef<Parameters<OnMount>[1] | null>(null);
  const lintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const applyMarkersToModel = (next: readonly OskCodeMarker[]) => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (editor === null || monaco === null) return;
    const model = editor.getModel();
    if (model === null) return;
    monaco.editor.setModelMarkers(
      model,
      MARKER_OWNER,
      next.map((m) => ({
        ...m,
        severity: monacoSeverity(monaco, m.severity),
      })),
    );
  };

  const runLint = (nextText: string) => {
    const result = lintOskCodeText(nextText);
    setMarkers(result.markers);
    setParsed(result.parsed);
    applyMarkersToModel(result.markers);
  };

  // Follow the canonical text while clean; snap to it after Apply; keep a
  // dirty draft across external changes (undo in the Visual tab).
  useEffect(() => {
    if (canonical === null) return;
    if (justAppliedRef.current) {
      justAppliedRef.current = false;
      lastAppliedRef.current = canonical;
      textRef.current = canonical;
      setText(canonical);
      setApplyError(null);
      runLint(canonical);
      return;
    }
    if (textRef.current === null || textRef.current === lastAppliedRef.current) {
      lastAppliedRef.current = canonical;
      if (textRef.current !== canonical) {
        textRef.current = canonical;
        setText(canonical);
        runLint(canonical);
      }
    }
    // Dirty draft: kept as-is.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canonical]);

  useEffect(
    () => () => {
      if (lintTimerRef.current !== null) clearTimeout(lintTimerRef.current);
    },
    [],
  );

  if (kvks === null) {
    return (
      <div data-testid="osk-code-pane">
        <div data-testid="osk-code-pane-empty">
          <p>
            {t({
              id: "editor.assignLoop.osk.code.emptyTitle",
              message: "No visual keyboard to edit",
            })}
          </p>
          <p>
            {t({
              id: "editor.assignLoop.osk.code.emptyBody",
              message:
                "The Code tab needs a generated OSK for this keyboard. Nothing to show yet.",
            })}
          </p>
        </div>
      </div>
    );
  }

  const dirty = text !== null && text !== lastAppliedRef.current;
  const errorCount = markers.filter((m) => m.severity === "error").length;
  const warningCount = markers.filter((m) => m.severity === "warning").length;

  const handleEditorChange = (value: string | undefined) => {
    const next = value ?? "";
    textRef.current = next;
    setText(next);
    setApplyError(null);
    if (lintTimerRef.current !== null) clearTimeout(lintTimerRef.current);
    lintTimerRef.current = setTimeout(() => runLint(next), LINT_DEBOUNCE_MS);
  };

  const handleEditorMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    applyMarkersToModel(markers);
  };

  const handleApply = () => {
    const current = textRef.current;
    if (current === null || canonical === null) return;
    // Synchronous gate: the debounced lint state may lag behind the text.
    if (!lintOskCodeText(current).parsed) return;
    let after: KvksIR;
    try {
      after = parseKvks(current);
    } catch (err) {
      // parseKvks is regex-lenient and should not throw, but the handler
      // must not throw if it ever does.
      setApplyError(err instanceof Error ? err.message : String(err));
      return;
    }
    if (current === canonical) {
      // Formatting-only change: nothing to commit (Open: a formatting-only
      // change is a change, and the file text below differs from `canonical`
      // whenever it is).
      return;
    }
    onApply(after);
    if (openText !== undefined && openPath !== null) {
      // After onApply so the author's text, not a re-emit, is what the file holds.
      const result = useWorkingCopyStore.getState().replaceStartingPointFromText(openPath, current);
      if (!result.ok) {
        setApplyError(result.error);
        return;
      }
    }
    justAppliedRef.current = true;
    setApplyError(null);
  };

  return (
    <div
      data-testid="osk-code-pane"
      style={{ display: "flex", flexDirection: "column", height: "100%" }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "6px 8px",
        }}
      >
        <button
          type="button"
          data-testid="osk-code-apply"
          disabled={!dirty || !parsed}
          onClick={handleApply}
        >
          {t({
            id: "editor.assignLoop.osk.code.apply",
            message: "Apply",
          })}
        </button>
        {dirty && (
          <span data-testid="osk-code-dirty">
            {t({
              id: "editor.assignLoop.osk.code.unappliedChanges",
              message: "Unapplied changes",
            })}
          </span>
        )}
        {(errorCount > 0 || warningCount > 0) && (
          <span data-testid="osk-code-issue-count">
            {t({
              id: "editor.assignLoop.osk.code.issueCount",
              message: plural(errorCount + warningCount, {
                one: "# issue",
                other: "# issues",
              }),
            })}
          </span>
        )}
      </div>
      {applyError !== null && (
        <div data-testid="osk-code-apply-error" role="alert">
          {applyError}
        </div>
      )}
      <div data-testid="osk-code-editor" style={{ flex: 1, minHeight: 200 }}>
        <Editor
          language="xml"
          value={text ?? canonical ?? ""}
          onChange={handleEditorChange}
          onMount={handleEditorMount}
          aria-label={t({
            id: "editor.assignLoop.osk.code.editorLabel",
            message: "Visual keyboard XML",
          })}
          options={{
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            automaticLayout: true,
          }}
        />
      </div>
    </div>
  );
}
