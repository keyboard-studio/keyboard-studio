// TouchCodePane — the touch step's "Code" tab (TIKE touch-builder port,
// Phase 2).
//
// A Monaco editor over the `.keyman-touch-layout` JSON with syntax
// highlighting and the 18-x keyboard-lint pipeline, replacing the Phase 0
// stub. Reads the shared layout state only — it never holds a layout copy
// ("view swap, not a fork", FR-036a/b):
//
// - Text source: `emitTouchLayout(effectiveKeyModeLayout)` (Q3) — canonical
//   formatting, always coherent with the visual tab including uncommitted
//   overlay ops. `layout === null` renders the empty/disabled state.
// - Lint: debounced per keystroke through touchCodeLint.ts (JSON syntax →
//   the eight layout-only 18-x checks). Findings are file-level markers:
//   the checks run on the parsed IR and carry no source positions
//   (keyboard-lint's makeLocation placeholder), so there is nothing finer
//   to map.
// - Apply (Q2/Q4): diff the edited JSON against the effective layout,
//   decompose into KeyEditOperations, commit via `commitKeyEditBatch` as ONE
//   undo entry. Monaco-local undo covers typing; the shared stack covers
//   Apply. Structural edits the contract cannot express (row/layer/platform
//   changes, cross-row moves, duplicate-id edits, unexpressible fields)
//   surface as named apply errors — never silently dropped.

import "./monacoSetup.ts";

import { useEffect, useRef, useState } from "react";
import Editor, { type OnMount } from "@monaco-editor/react";
import { useLingui } from "@lingui/react/macro";
import { plural } from "@lingui/core/macro";
import { emitTouchLayout } from "@keyboard-studio/engine";
import {
  parseTouchLayoutString,
  type TouchLayoutIR,
} from "@keyboard-studio/contracts";
import { useWorkingCopyStore } from "../../../stores/workingCopyStore.ts";
import { isOpenMode } from "../../../lib/openMode.ts";
import { readVfsText } from "../../../lib/vfsText.ts";
import {
  lintTouchLayoutText,
  type TouchCodeMarker,
  type TouchCodeMarkerSeverity,
} from "./touchCodeLint.ts";
import {
  diffTouchLayouts,
  type TouchCodeDiffRejected,
} from "./touchCodeDiff.ts";

const LINT_DEBOUNCE_MS = 300;
const MARKER_OWNER = "touch-code-lint";

function monacoSeverity(
  monaco: Parameters<OnMount>[1],
  severity: TouchCodeMarkerSeverity,
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

export function TouchCodePane({ layout }: { layout: TouchLayoutIR | null }) {
  const { t } = useLingui();
  const commitKeyEditBatch = useWorkingCopyStore((s) => s.commitKeyEditBatch);

  const mode = useWorkingCopyStore((s) => s.instantiationMode);
  const startVfs = useWorkingCopyStore((s) => s.startVfs);
  const startKeyboard = useWorkingCopyStore((s) => s.startKeyboard);
  // Open mode (spec 111 FR-009, research R7): the pane shows the file's own
  // text and Apply replaces the file, bypassing the structural-edit refusal --
  // the author is editing the real file, not composing key operations.
  // isOpenMode, not isLiveOpen: a descriptor-less older Open draft still gets the Open view; its Apply goes through the store (the seam move is T087).
  const openPath =
    isOpenMode(mode) && startKeyboard !== null
      ? `source/${startKeyboard.id}.keyman-touch-layout`
      : null;
  const openText =
    openPath !== null && startVfs !== null ? readVfsText(startVfs, openPath) : undefined;

  // The canonical text for the current layout (Q3 text source; Open: the file).
  const canonical = layout === null ? null : (openText ?? emitTouchLayout(layout));

  // Editor text. `null` until the first canonical text arrives.
  const [text, setText] = useState<string | null>(null);
  const textRef = useRef<string | null>(null);
  // The canonical text the current draft was last synced to / applied from.
  // Dirty = text !== lastAppliedRef.current (Q4 hybrid undo).
  const lastAppliedRef = useRef<string | null>(null);
  // Set around Apply: the commit changes the overlay, the new canonical
  // text then snaps the editor (and clears dirty) via the effect below.
  const justAppliedRef = useRef(false);

  const [markers, setMarkers] = useState<readonly TouchCodeMarker[]>([]);
  const [parsed, setParsed] = useState(true);
  const [applyError, setApplyError] = useState<string | null>(null);

  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);
  const monacoRef = useRef<Parameters<OnMount>[1] | null>(null);
  const lintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const applyMarkersToModel = (next: readonly TouchCodeMarker[]) => {
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
    const result = lintTouchLayoutText(nextText);
    setMarkers(result.markers);
    setParsed(result.parsed);
    applyMarkersToModel(result.markers);
  };

  // Follow the canonical text while clean; snap to it after Apply; keep a
  // dirty draft across external changes (undo in another tab, visual edits)
  // — Apply always diffs the draft against the CURRENT layout.
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
    // Dirty draft: kept as-is (see the header comment).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canonical]);

  useEffect(
    () => () => {
      if (lintTimerRef.current !== null) clearTimeout(lintTimerRef.current);
    },
    [],
  );

  if (layout === null) {
    return (
      <div data-testid="touch-code-pane">
        <div data-testid="touch-code-pane-empty">
          <p>
            {t({
              id: "editor.assignLoop.touch.code.emptyTitle",
              message: "No touch layout to edit",
            })}
          </p>
          <p>
            {t({
              id: "editor.assignLoop.touch.code.emptyBody",
              message:
                "The Code tab needs a touch layout for this keyboard. Nothing to show yet.",
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

  const rejectionMessage = (r: TouchCodeDiffRejected): string => {
    // Each branch is its own literal t({id, message}) call so Lingui's
    // static extractor sees every variant (same discipline as the undo
    // affordance labels in TouchGallery).
    switch (r.kind) {
      case "platform-structure":
        return t({
          id: "editor.assignLoop.touch.code.rejection.platformStructure",
          message: `Apply can't change the platform set — key edits only (${{ detail: r.detail }}).`,
        });
      case "layer-structure":
        return t({
          id: "editor.assignLoop.touch.code.rejection.layerStructure",
          message: `Apply can't add, remove, or rename layers — key edits only (${{ detail: r.detail }}).`,
        });
      case "row-structure":
        return t({
          id: "editor.assignLoop.touch.code.rejection.rowStructure",
          message: `Apply can't change the row structure — key edits only (${{ detail: r.detail }}).`,
        });
      case "cross-row-move":
        return t({
          id: "editor.assignLoop.touch.code.rejection.crossRowMove",
          message: `Apply can't move a key across rows (${{ detail: r.detail }}). Move it within its row, or use the visual tab.`,
        });
      case "duplicate-id-edit":
        return t({
          id: "editor.assignLoop.touch.code.rejection.duplicateIdEdit",
          message: `Apply can't edit duplicated key ids (${{ detail: r.detail }}). Use the visual tab.`,
        });
      case "unexpressible-field":
        return t({
          id: "editor.assignLoop.touch.code.rejection.unexpressibleField",
          message: `Apply can't change this (${{ detail: r.detail }}): no key-edit operation carries it.`,
        });
      case "unknown-top-level-key":
        return t({
          id: "editor.assignLoop.touch.code.rejection.unknownTopLevelKey",
          message: `Apply doesn't recognize the top-level key "${{ detail: r.detail }}". Only phone, tablet, and desktop are supported.`,
        });
    }
  };

  const handleApply = () => {
    const current = textRef.current;
    if (current === null || canonical === null) return;
    let raw: unknown;
    try {
      raw = JSON.parse(current);
    } catch {
      // Unreachable via the UI (Apply is disabled while unparsed), but the
      // handler must not throw if it ever fires.
      return;
    }
    let after: TouchLayoutIR;
    try {
      after = parseTouchLayoutString(current);
    } catch (err) {
      setApplyError(
        err instanceof Error ? err.message : String(err),
      );
      return;
    }
    if (openText !== undefined && openPath !== null) {
      // Open: a formatting-only change is still a change to the file.
      if (current === canonical) return;
      const result = useWorkingCopyStore.getState().replaceStartingPointFromText(openPath, current);
      if (!result.ok) {
        setApplyError(result.error);
        return;
      }
      justAppliedRef.current = true;
      setApplyError(null);
      return;
    }
    const diff = diffTouchLayouts(layout, after, raw);
    if (!diff.ok) {
      setApplyError(rejectionMessage(diff));
      return;
    }
    if (diff.ops.length === 0) {
      // Formatting-only change: nothing to commit — snap to canonical,
      // which also clears dirty.
      lastAppliedRef.current = canonical;
      textRef.current = canonical;
      setText(canonical);
      setApplyError(null);
      runLint(canonical);
      return;
    }
    // Q2: one Apply = one undo batch on the shared stack.
    commitKeyEditBatch(diff.ops);
    justAppliedRef.current = true;
    setApplyError(null);
  };

  return (
    <div
      data-testid="touch-code-pane"
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
          data-testid="touch-code-apply"
          disabled={!dirty || !parsed}
          onClick={handleApply}
        >
          {t({
            id: "editor.assignLoop.touch.code.apply",
            message: "Apply",
          })}
        </button>
        {dirty && (
          <span data-testid="touch-code-dirty">
            {t({
              id: "editor.assignLoop.touch.code.unappliedChanges",
              message: "Unapplied changes",
            })}
          </span>
        )}
        {(errorCount > 0 || warningCount > 0) && (
          <span data-testid="touch-code-issue-count">
            {t({
              id: "editor.assignLoop.touch.code.issueCount",
              message: plural(errorCount + warningCount, {
                one: "# issue",
                other: "# issues",
              }),
            })}
          </span>
        )}
      </div>
      {applyError !== null && (
        <div data-testid="touch-code-apply-error" role="alert">
          {applyError}
        </div>
      )}
      <div data-testid="touch-code-editor" style={{ flex: 1, minHeight: 200 }}>
        <Editor
          language="json"
          value={text ?? canonical ?? ""}
          onChange={handleEditorChange}
          onMount={handleEditorMount}
          aria-label={t({
            id: "editor.assignLoop.touch.code.editorLabel",
            message: "Touch layout JSON",
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
