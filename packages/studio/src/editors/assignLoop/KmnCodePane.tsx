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
// - Apply (spec 113 US8): the edit becomes one structural `CodeEdit` in the `kmn-edits`
//   decision, never a wholesale re-parsed IR. The gate runs in order: parse and lint, Layer A
//   validator errors, then ONE candidate compile on the author's click (no timer: D3). Any
//   error records nothing and is shown at its line. Then `diffIR(workingIr, parsed)` (empty =
//   formatting-only, nothing recorded), an owner confirm when the edit overrides another
//   editor's work, and `commitKmnEdit` (which applies the changes live and pushes undo kind `c`).
//   Monaco-local undo covers typing.

import "./touchBuilder/monacoSetup.ts";

import { useEffect, useMemo, useRef, useState } from "react";
import Editor, { type OnMount } from "@monaco-editor/react";
import { useLingui } from "@lingui/react/macro";
import { plural } from "@lingui/core/macro";
import { diffIR, emitKmn, findOwners, parseKmn, runAllChecks } from "@keyboard-studio/engine";
import type { IRChange, KeyboardIR, LintFinding, OwnerRef } from "@keyboard-studio/contracts";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { compileCandidateKmn } from "../../lib/compileCandidateKmn.ts";
import { loadAssignedKeys } from "../../lib/assignedKeys.ts";
import { anchorAssignedKeys } from "../../lib/claimedInputs.ts";
import { ConfirmDialog } from "./parts/ConfirmDialog.tsx";
import {
  lintKmnCodeText,
  type KmnCodeMarker,
  type KmnCodeMarkerSeverity,
} from "./kmnCodeLint.ts";

const LINT_DEBOUNCE_MS = 300;

/** A finding as an error marker on its line (line 1 when the finding carries none). */
function findingMarker(f: LintFinding): KmnCodeMarker {
  const line = Math.max(1, f.location?.line ?? 1);
  const column = Math.max(1, f.location?.column ?? 1);
  return {
    code: f.code,
    severity: "error",
    message: f.message,
    startLineNumber: line,
    startColumn: column,
    endLineNumber: f.location?.endLine ?? line,
    endColumn: f.location?.endColumn ?? column + 1,
  };
}

/** An Apply awaiting the owner confirm: what it would record, and who it overrides. */
interface PendingApply {
  readonly irAtClick: KeyboardIR;
  readonly changes: IRChange[];
  readonly overrides: OwnerRef[];
}
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

/**
 * The 1-based line to reveal for `nodeId`: the node's own line, or — for a
 * node the emitter gives no line (an opaque fragment it folded into a
 * group) — the header line of the group that owns it. `undefined` when the
 * id is unknown.
 */
export function lineForNode(
  ir: KeyboardIR,
  lineByNodeId: ReadonlyMap<string, number>,
  nodeId: string,
): number | undefined {
  const own = lineByNodeId.get(nodeId);
  if (own !== undefined) return own;
  const group = ir.groups.find((g) => g.rules.some((r) => r.nodeId === nodeId));
  return group === undefined ? undefined : lineByNodeId.get(group.nodeId);
}

export interface KmnCodePaneProps {
  /**
   * Scroll to, and select, the source line of this IR node (a rule, store,
   * group, or fragment id) once the editor has its text. Used by the Layout
   * tab's "view in code". Re-applied when the id changes.
   */
  readonly revealNodeId?: string;
}

export function KmnCodePane({ revealNodeId }: KmnCodePaneProps = {}) {
  const { t } = useLingui();
  const ir = useWorkingCopyStore((s) => s.ir);
  // parseKmn needs a keyboard id; the IR header name is the stable choice.
  const keyboardId = ir?.header.name ?? "keyboard";

  // The canonical text for the current IR, with the node-to-line map the
  // reveal uses.
  const emitted = useMemo(
    () => (ir === null ? null : emitKmn(ir, { lineMap: true })),
    [ir],
  );
  const canonical = emitted === null ? null : emitted.text;

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
  // The candidate compile is async: Apply is disabled while it runs, and its result is dropped
  // when the working copy changed in the meantime (or the pane unmounted).
  const [compiling, setCompiling] = useState(false);
  const [pending, setPending] = useState<PendingApply | null>(null);
  const mountedRef = useRef(true);

  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);
  const monacoRef = useRef<Parameters<OnMount>[1] | null>(null);
  const lintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const keyboardIdRef = useRef(keyboardId);
  keyboardIdRef.current = keyboardId;
  const [editorReady, setEditorReady] = useState(false);
  // The node id still waiting to be revealed; cleared once applied so a later
  // keystroke or Assign-tab edit never re-scrolls the editor.
  const pendingRevealRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    pendingRevealRef.current = revealNodeId;
  }, [revealNodeId]);

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
    const result = lintKmnCodeText(nextText, (t) => parseKmn(t, id));
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

  // Reveal once the editor is mounted and holds text. Uses the canonical
  // line map: it matches the editor text while the draft is clean, and is the
  // best available guess for a dirty one.
  const hasText = text !== null;
  useEffect(() => {
    const nodeId = pendingRevealRef.current;
    if (nodeId === undefined || !editorReady || !hasText) return;
    const editor = editorRef.current;
    if (editor === null || ir === null || emitted === null) return;
    const line = lineForNode(ir, emitted.lineByNodeId, nodeId);
    pendingRevealRef.current = undefined;
    if (line === undefined) return;
    editor.revealLineInCenter(line);
    editor.setSelection({
      startLineNumber: line,
      startColumn: 1,
      endLineNumber: line,
      endColumn: editor.getModel()?.getLineMaxColumn(line) ?? 1,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealNodeId, editorReady, hasText]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (lintTimerRef.current !== null) clearTimeout(lintTimerRef.current);
    };
  }, []);

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
    setEditorReady(true);
  };

  /** Show gate errors at their lines and in the alert region; nothing is recorded. */
  const showBlocked = (errors: readonly KmnCodeMarker[]) => {
    const next = [...markers.filter((m) => m.severity !== "error"), ...errors];
    setMarkers(next);
    applyMarkersToModel(next);
    const first = errors[0];
    const count = t({
      id: "editor.assignLoop.mechanisms.code.applyBlocked",
      message: plural(errors.length, {
        one: "Not applied: # error found.",
        other: "Not applied: # errors found.",
      }),
    });
    setApplyError(
      first === undefined
        ? count
        : `${count} ${t({
            id: "editor.assignLoop.mechanisms.code.errorAtLine",
            message: `Line ${{ line: first.startLineNumber }}: ${{ message: first.message }}`,
          })}`,
    );
  };

  const changedMeanwhile = () =>
    setApplyError(
      t({
        id: "editor.assignLoop.mechanisms.code.changedMeanwhile",
        message: "The keyboard changed while Apply was running. Nothing was applied; apply again.",
      }),
    );

  const commitPending = (p: PendingApply) => {
    const store = useWorkingCopyStore.getState();
    if (store.ir !== p.irAtClick) {
      changedMeanwhile();
      return;
    }
    // The live IR changes only through the store's commit: applyIRChanges under CODE_WRITES.
    justAppliedRef.current = true;
    const result = store.commitKmnEdit({ op: "code-apply", changes: p.changes, overrides: p.overrides });
    if (!result.ok) {
      justAppliedRef.current = false;
      setApplyError(
        t({
          id: "editor.assignLoop.mechanisms.code.applyRefused",
          message: "The edit could not be applied to the keyboard. Nothing was recorded.",
        }),
      );
      return;
    }
    setApplyError(null);
  };

  const handleApply = async () => {
    const current = textRef.current;
    if (compiling || current === null || canonical === null) return;
    const irAtClick = useWorkingCopyStore.getState().ir;
    if (irAtClick === null) return;
    const id = keyboardIdRef.current;
    // 1a. Parse and lint (synchronous: the debounced lint state may lag behind the text).
    const lint = lintKmnCodeText(current, (src) => parseKmn(src, id));
    if (!lint.parsed) {
      showBlocked(lint.markers.filter((m) => m.severity === "error"));
      return;
    }
    let after: ReturnType<typeof parseKmn>;
    try {
      after = parseKmn(current, id);
    } catch (err) {
      setApplyError(err instanceof Error ? err.message : String(err));
      return;
    }
    // 1b. Layer A validity errors.
    const layerA = runAllChecks(current).filter(
      (f) => f.layer === "A" && (f.severity === "error" || f.severity === "fatal"),
    );
    if (layerA.length > 0) {
      showBlocked(layerA.map(findingMarker));
      return;
    }
    // 2. The structural diff; empty means formatting-only, which records nothing.
    // The base is the working IR as the editor shows it: the emitted text, re-parsed. A comment the
    // working IR holds as freestanding (a blank line used to follow it) is re-parsed as leading a
    // store, so diffing the live IR itself would report an edit the author never made.
    const diffed = diffIR(parseKmn(emitKmn(irAtClick), id).ir, after.ir);
    if (diffed.length === 0) return;
    // Ruling 10: a rule on a key the Assign tab owns is anchored by key (before the compile gate
    // below, so the projection finds it) and flagged as overriding the Assign tab.
    let assignedKeys: Awaited<ReturnType<typeof loadAssignedKeys>> = [];
    try {
      assignedKeys = await loadAssignedKeys();
    } catch {
      assignedKeys = [];
    }
    if (!mountedRef.current) return;
    const { changes, overrides: assignOverrides } = anchorAssignedKeys(diffed, assignedKeys);
    // 1c. One candidate compile, on this click only.
    setCompiling(true);
    setApplyError(null);
    let compiled: Awaited<ReturnType<typeof compileCandidateKmn>>;
    try {
      compiled = await compileCandidateKmn(changes);
    } catch (err) {
      if (mountedRef.current) {
        setCompiling(false);
        setApplyError(err instanceof Error ? err.message : String(err));
      }
      return;
    }
    if (!mountedRef.current) return;
    setCompiling(false);
    if (useWorkingCopyStore.getState().ir !== irAtClick) {
      changedMeanwhile();
      return;
    }
    if (compiled.status === "unplaceable") {
      setApplyError(
        t({
          id: "editor.assignLoop.mechanisms.code.unplaceable",
          message: "Not applied: this edit does not fit the keyboard as it will be built, so the download would lose it.",
        }),
      );
      return;
    }
    if (compiled.status === "errors") {
      if (compiled.diagnostics.length === 0) {
        setApplyError(
          t({
            id: "editor.assignLoop.mechanisms.code.compileFailed",
            message: "Not applied: the keyboard does not compile.",
          }),
        );
      } else {
        showBlocked(compiled.diagnostics.map(findingMarker));
      }
      return;
    }
    // 3. Who does this override?
    const startIr = useWorkingCopyStore.getState().startIr;
    const overrides = [...(startIr === null ? [] : findOwners(irAtClick, startIr, changes)), ...assignOverrides];
    const candidate: PendingApply = { irAtClick, changes, overrides };
    if (overrides.length > 0) {
      setPending(candidate);
      return;
    }
    commitPending(candidate);
  };

  const ownerWords = (owner: OwnerRef["owner"]): string => {
    switch (owner) {
      case "deadkeys":
        return t({ id: "editor.assignLoop.mechanisms.code.owner.deadkeys", message: "the deadkey editor" });
      case "rules-step":
        return t({ id: "editor.assignLoop.mechanisms.code.owner.rulesStep", message: "the rules step" });
      case "layout-tab":
        return t({ id: "editor.assignLoop.mechanisms.code.owner.layoutTab", message: "the Layout tab" });
      case "code-tab":
        return t({ id: "editor.assignLoop.mechanisms.code.owner.codeTab", message: "an earlier Code tab edit" });
      case "identity":
        return t({ id: "editor.assignLoop.mechanisms.code.owner.identity", message: "the keyboard identity" });
      case "assign-tab":
        return t({ id: "editor.assignLoop.mechanisms.code.owner.assignTab", message: "the Assign tab" });
      case "another-step":
        return t({ id: "editor.assignLoop.mechanisms.code.owner.anotherStep", message: "another step" });
    }
  };

  const ownersText = [...new Set((pending?.overrides ?? []).map((o) => ownerWords(o.owner)))].join(", ");

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
          disabled={!dirty || !parsed || compiling}
          onClick={() => void handleApply()}
        >
          {t({
            id: "editor.assignLoop.mechanisms.code.apply",
            message: "Apply",
          })}
        </button>
        {compiling && (
          <span data-testid="kmn-code-compiling" role="status">
            {t({ id: "editor.assignLoop.mechanisms.code.compiling", message: "Checking that it compiles..." })}
          </span>
        )}
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
      <ConfirmDialog
        open={pending !== null}
        title={t({ id: "editor.assignLoop.mechanisms.code.confirm.title", message: "This edit overrides other work" })}
        body={
          <p data-testid="kmn-code-owner-confirm">
            {t({
              id: "editor.assignLoop.mechanisms.code.confirm.body",
              message: `This changes what was made by ${{ owners: ownersText }}. Your code edit wins, and it is flagged so you can review it.`,
            })}
          </p>
        }
        primaryLabel={t({ id: "editor.assignLoop.mechanisms.code.confirm.apply", message: "Apply anyway" })}
        secondaryLabel={t({ id: "editor.assignLoop.mechanisms.code.confirm.cancel", message: "Cancel" })}
        onPrimary={() => {
          const p = pending;
          setPending(null);
          if (p !== null) commitPending(p);
        }}
        onSecondary={() => setPending(null)}
      />
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
