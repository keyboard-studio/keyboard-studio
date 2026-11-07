// KmnCodePane — the Mechanical Gallery's "Code" tab.
//
// A Monaco editor over the `.kmn` source with syntax highlighting,
// following the TouchCodePane pattern ("view swap, not a fork"):
//
// - Text source: `emitKmn(ir)` where `ir` is the working-copy KeyboardIR —
//   canonical formatting, always coherent with the Assign tab.
//   `ir === null` renders the empty state.
// - Lint: debounced per keystroke through kmnCodeLint.ts (parseKmn;
//   syntax errors become positioned Monaco markers).
// - Apply: parse the edited KMN via `parseKmn`, write the resulting IR
//   back through `setWorkingIR` (overlay-preserving: the carve-deletion
//   overlay and undo stack survive a code-view Apply).
//   Monaco-local undo covers typing.

import "./touchBuilder/monacoSetup.ts";

import { useEffect, useMemo, useRef, useState } from "react";
import Editor, { type OnMount } from "@monaco-editor/react";
import { useLingui } from "@lingui/react/macro";
import { plural } from "@lingui/core/macro";
import { emitKmn, parseKmn } from "@keyboard-studio/engine";
import { findRawCtrlRules } from "@keymanapp/keyboard-lint";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { isOpenMode } from "../../lib/openMode.ts";
import { readVfsText } from "../../lib/vfsText.ts";
import {
  replaceStartingPointAndReplay,
  startingPointPath,
} from "../../lib/replaceStartingPoint.ts";
import {
  lintKmnCodeText,
  rawCtrlRuleKey,
  type KmnCodeMarker,
  type KmnCodeMarkerSeverity,
} from "./kmnCodeLint.ts";

const LINT_DEBOUNCE_MS = 300;
const MARKER_OWNER = "kmn-code-lint";

function monacoSeverity(
  monaco: Parameters<OnMount>[1],
  severity: KmnCodeMarkerSeverity,
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

export function KmnCodePane() {
  const { t } = useLingui();
  const ir = useWorkingCopyStore((s) => s.ir);
  const setWorkingIR = useWorkingCopyStore((s) => s.setWorkingIR);
  const mode = useWorkingCopyStore((s) => s.instantiationMode);
  const startVfs = useWorkingCopyStore((s) => s.startVfs);
  const startKeyboard = useWorkingCopyStore((s) => s.startKeyboard);
  // Open mode (spec 111 FR-009): the pane shows the file's own text and Apply
  // replaces the starting point with it.
  const openPath =
    isOpenMode(mode) && startKeyboard !== null
      ? startingPointPath(startKeyboard.id, "kmn")
      : null;
  const openText =
    openPath !== null && startVfs !== null ? readVfsText(startVfs, openPath) : undefined;
  // parseKmn needs a keyboard id; the IR header name is the stable choice
  // (Open: the keyboard's own id, which names its files).
  const keyboardId =
    openText !== undefined && startKeyboard !== null
      ? startKeyboard.id
      : (ir?.header.name ?? "keyboard");

  // The canonical text for the current IR (Open: the file's text, verbatim).
  const canonical = ir === null ? null : (openText ?? emitKmn(ir));

  // Raw-Ctrl baseline (issue #2359): the rules already in the working copy
  // never block Apply — only rules the edited text ADDS do. Content-keyed,
  // so editing an unrelated rule never reclassifies one as new.
  const baselineRawCtrl = useMemo(
    () =>
      ir === null
        ? new Set<string>()
        : new Set(findRawCtrlRules(ir, keyboardId).map(rawCtrlRuleKey)),
    [ir, keyboardId],
  );

  // Editor text. `null` until the first canonical text arrives.
  const [text, setText] = useState<string | null>(null);
  const textRef = useRef<string | null>(null);
  // The canonical text the current draft was last synced to / applied from.
  const lastAppliedRef = useRef<string | null>(null);
  // Set around Apply: the store update changes the IR, the new canonical
  // text then snaps the editor (and clears dirty) via the effect below.
  const justAppliedRef = useRef(false);

  const [markers, setMarkers] = useState<readonly KmnCodeMarker[]>([]);
  const [parsed, setParsed] = useState(true);
  const [applyError, setApplyError] = useState<string | null>(null);

  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);
  const monacoRef = useRef<Parameters<OnMount>[1] | null>(null);
  const lintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const keyboardIdRef = useRef(keyboardId);
  keyboardIdRef.current = keyboardId;

  const applyMarkersToModel = (next: readonly KmnCodeMarker[]) => {
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
    const id = keyboardIdRef.current;
    const result = lintKmnCodeText(nextText, (t) => parseKmn(t, id), {
      keyboardId: id,
      baselineRawCtrl,
    });
    setMarkers(result.markers);
    setParsed(result.parsed);
    applyMarkersToModel(result.markers);
  };

  // Follow the canonical text while clean; snap to it after Apply; keep a
  // dirty draft across external changes (Assign-tab edits).
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

  if (ir === null) {
    return (
      <div data-testid="kmn-code-pane">
        <div data-testid="kmn-code-pane-empty">
          <p>
            {t({
              id: "editor.assignLoop.mechanisms.code.emptyTitle",
              message: "No keyboard source to edit",
            })}
          </p>
          <p>
            {t({
              id: "editor.assignLoop.mechanisms.code.emptyBody",
              message:
                "The Code tab needs a keyboard in the working copy. Nothing to show yet.",
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
    const id = keyboardIdRef.current;
    // Synchronous gate: the debounced lint state may lag behind the text.
    if (
      !lintKmnCodeText(current, (t) => parseKmn(t, id), {
        keyboardId: id,
        baselineRawCtrl,
      }).parsed
    )
      return;
    let after: ReturnType<typeof parseKmn>;
    try {
      after = parseKmn(current, id);
    } catch (err) {
      setApplyError(err instanceof Error ? err.message : String(err));
      return;
    }
    if (openText !== undefined && openPath !== null) {
      // Open: a formatting-only change is still a change to the file.
      if (current === canonical) return;
      const result = replaceStartingPointAndReplay(openPath, current);
      if (!result.ok) {
        setApplyError(result.error);
        return;
      }
      justAppliedRef.current = true;
      setApplyError(null);
      return;
    }
    if (current === canonical) {
      // Formatting-only change: nothing to commit.
      return;
    }
    // Overlay-preserving write: the carve-deletion overlay and undo stack
    // survive a code-view Apply (unlike setIR's wholesale reset).
    setWorkingIR(after.ir);
    justAppliedRef.current = true;
    setApplyError(null);
  };

  return (
    <div
      data-testid="kmn-code-pane"
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
          data-testid="kmn-code-apply"
          disabled={!dirty || !parsed}
          onClick={handleApply}
        >
          {t({
            id: "editor.assignLoop.mechanisms.code.apply",
            message: "Apply",
          })}
        </button>
        {dirty && (
          <span data-testid="kmn-code-dirty">
            {t({
              id: "editor.assignLoop.mechanisms.code.unappliedChanges",
              message: "Unapplied changes",
            })}
          </span>
        )}
        {(errorCount > 0 || warningCount > 0) && (
          <span data-testid="kmn-code-issue-count">
            {t({
              id: "editor.assignLoop.mechanisms.code.issueCount",
              message: plural(errorCount + warningCount, {
                one: "# issue",
                other: "# issues",
              }),
            })}
          </span>
        )}
      </div>
      {applyError !== null && (
        <div data-testid="kmn-code-apply-error" role="alert">
          {applyError}
        </div>
      )}
      <div data-testid="kmn-code-editor" style={{ flex: 1, minHeight: 200 }}>
        <Editor
          value={text ?? canonical ?? ""}
          onChange={handleEditorChange}
          onMount={handleEditorMount}
          aria-label={t({
            id: "editor.assignLoop.mechanisms.code.editorLabel",
            message: "Keyboard source (.kmn)",
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
