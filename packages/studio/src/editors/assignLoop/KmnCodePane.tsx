// KmnCodePane — the Mechanical Gallery's "Code" tab.
//
// A Monaco editor over the `.kmn` source with syntax highlighting,
// following the TouchCodePane pattern ("view swap, not a fork"):
//
// - Text source: the PROJECTED `.kmn` — the same text the preview compiles
//   and the download ships. The pane clones `startVfs`, applies the shared
//   working-copy transform (`useWorkingCopyTransform` → `projectWorkingCopyVfs`,
//   the single projection the OSK preview and `serializeWorkingCopy` both use),
//   and reads the `.kmn` back out of the projected VFS. Carve deletions,
//   mechanism assignments, identity, mark guards, caps handling, deadkey ops,
//   context-tolerance fixes and rules-step additions are all reflected, so the
//   pane is always coherent with the Assign tab and the preview — the
//   `emitKvks(effectiveKvks)` precedent OskCodePane already follows.
//   When no `startVfs` is available (not yet instantiated), the pane falls
//   back to the carve floor: `emitKmn(applyCarveMutate(startIr, …))`.
//   `ir === null` renders the empty state.
// - Lint: debounced per keystroke through kmnCodeLint.ts (parseKmn;
//   syntax errors become positioned Monaco markers).
// - Apply (spec 117 US8): the edit becomes one structural `CodeEdit` in the `kmn-edits`
//   decision, never a wholesale re-parsed IR. On Copy the pane shows the keyboard as it will be
//   built, so the diff base is the parse of the text the author was shown (the projected `.kmn`),
//   not the working IR: `diffIR(parse(shown), parse(edited))`. The gate runs in order: parse and
//   lint, Layer A validator errors, a refusal when the diff touches `&TARGETS` (the build forces it
//   to `any` on Copy), a prediction of the build with the entry included (a later step that
//   overrides the edit refuses it), then ONE candidate compile on the author's
//   click (no timer: D3). The shown text and the stage texts it was classified against are one
//   snapshot of one projection; if the build changed under a dirty draft, Apply refuses and offers
//   to reload the current text (the draft stays in the editor until then). Apply is not
//   re-entrant: a second click while one runs does nothing. Any error records nothing and is shown at its line. Then an empty diff
//   (formatting-only) records nothing, an owner confirm when the edit overrides another editor's
//   work or changes a rule a generating step made (mark guards, context tolerance, caps handling:
//   the confirm names the step; the owner ruling of 2026-11-13, research R15: those rules are
//   ordinary text by the time the author edits, and the entry replays after those steps), and
//   `commitKmnEdit` (which applies the changes live and pushes undo kind `c`). The
//   recorded entry changes the projection, so the pane snaps to the new built text and the edit
//   stays visible because it is now in the build. On Open the pane shows the file text and Apply
//   replaces the starting point with it.
//   Monaco-local undo covers typing.

import "./touchBuilder/monacoSetup.ts";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Editor, { type OnMount } from "@monaco-editor/react";
import { useLingui } from "@lingui/react/macro";
import { plural } from "@lingui/core/macro";
import { createVirtualFS, type Pattern } from "@keyboard-studio/contracts";
import { devLog } from "@keyboard-studio/contracts/dev-log";
import {
  diffIR,
  emitKmn,
  findOwners,
  parseKmn,
  runAllChecks,
  OUTPUT_FORM_SEAM_PATTERN_IDS,
} from "@keyboard-studio/engine";
import type { IRChange, KeyboardIR, LintFinding, OwnerRef } from "@keyboard-studio/contracts";
import { findRawCtrlRules } from "@keymanapp/keyboard-lint";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { useWorkingCopyTransform } from "../../hooks/useWorkingCopyTransform.ts";
import { applyCarveMutate } from "../../steps/editorMutate.ts";
import { physicalAssignmentsOf } from "../../lib/physicalAssignments.ts";
import { findKmnPath } from "../../lib/findKmnPath.ts";
import { getPatternByIdSync } from "../../lib/services.ts";
import { compileCandidateKmn } from "../../lib/compileCandidateKmn.ts";
import { nextCodeEdit } from "../../lib/nextCodeEdit.ts";
import { loadAssignedKeys } from "../../lib/assignedKeys.ts";
import { anchorAssignedKeys } from "../../lib/claimedInputs.ts";
import {
  buildRevealLines,
  findBuildMismatch,
  findGeneratedRuleTouches,
  type GeneratedSource,
  type KmnStageTexts,
} from "../../lib/builtKmnView.ts";
import type { KmnStage } from "../../lib/projectWorkingCopyVfs.ts";
import { ConfirmDialog } from "./parts/ConfirmDialog.tsx";
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

function sameStages(a: KmnStageTexts, b: KmnStageTexts): boolean {
  if (a.size !== b.size) return false;
  for (const [k, v] of a) if (b.get(k) !== v) return false;
  return true;
}

/** An Apply awaiting the owner confirm: what it would record, and who it overrides. */
/** The build steps that generate rules a kept edit may change (`&TARGETS` is refused, not confirmed). */
type GeneratingStep = Exclude<GeneratedSource, "targets">;

interface PendingApply {
  readonly irAtClick: KeyboardIR;
  /** The built text on screen when Apply was clicked: the edit was made against it. */
  readonly canonicalAtClick: string;
  readonly changes: IRChange[];
  readonly overrides: OwnerRef[];
  /** The generating step each change that touches a generated rule came from, by change index. */
  readonly generated: ReadonlyMap<number, GeneratingStep>;
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
  // parseKmn needs a keyboard id; the IR header name is the stable choice.
  const keyboardId =
    openText !== undefined && startKeyboard !== null
      ? startKeyboard.id
      : (ir?.header.name ?? "keyboard");

  // The canonical text for the current IR (Open: the file's text, verbatim).
  //
  // Projected `.kmn` (primary): the same projection the preview and the
  // download run, applied to a clone of `startVfs` so the base is never
  // mutated. The pattern map is resolved synchronously from the recorded
  // assignments (plus the output-form seam ids, mirroring
  // `serializeWorkingCopy` step 3) so mechanism assignments are reflected
  // too — `useWorkingCopyTransform` without a pattern map would skip them.
  // The sync library cache is the memoized index the preview's async
  // `getById` wraps, so it is never colder than the preview's map.
  // `previewedStartId` is the store's own base id: this call site only ever
  // renders the committed base, so the F4 gate never suppresses the overlay.
  const phaseResults = useWorkingCopyStore((s) => s.phaseResults);
  const patternMap = useMemo(() => {
    const ids = new Set(
      physicalAssignmentsOf(phaseResults).flatMap((a) =>
        a.mechanisms.map((m) => m.patternId),
      ),
    );
    for (const id of OUTPUT_FORM_SEAM_PATTERN_IDS) ids.add(id);
    const map = new Map<string, Pattern>();
    for (const id of ids) {
      const pattern = getPatternByIdSync(id);
      if (pattern !== undefined) map.set(id, pattern);
    }
    return map;
  }, [phaseResults]);
  // The projection reports the `.kmn` after each step that can write rules at or after the
  // `kmn-edits` replay. Each run collects them into its own map, handed back with the text, so the
  // stage texts and the text they came from are one value (nothing persists from render: the
  // collector is set only around the synchronous projection call).
  const stageCollectorRef = useRef<Map<KmnStage, string> | null>(null);
  const stageTap = useCallback((stage: KmnStage, text: string) => {
    stageCollectorRef.current?.set(stage, text);
  }, []);
  const vfsTransform = useWorkingCopyTransform({
    patternMap: patternMap.size > 0 ? patternMap : null,
    previewedStartId: startKeyboard?.id ?? null,
    kmnStageTap: stageTap,
  });
  const startIr = useWorkingCopyStore((s) => s.startIr);
  const deletedNodeIds = useWorkingCopyStore((s) => s.deletedNodeIds);
  const deletedItemIds = useWorkingCopyStore((s) => s.deletedItemIds);
  const carveChars = useWorkingCopyStore((s) => s.carveChars);
  const projection = useMemo((): { text: string; stages: KmnStageTexts } | null => {
    if (vfsTransform === null || startVfs === null || startKeyboard === null)
      return null;
    const stages = new Map<KmnStage, string>();
    stageCollectorRef.current = stages;
    try {
      // Shallow-entry clone: the projection replaces whole entries via
      // vfs.set() rather than mutating entry buffers in place (the same
      // clone contract `serializeWorkingCopy` relies on).
      const clone = createVirtualFS(startVfs.entries());
      vfsTransform(clone, startKeyboard.id);
      const kmnPath = findKmnPath(clone);
      if (kmnPath === undefined) return null;
      const text = readVfsText(clone, kmnPath);
      return text === undefined ? null : { text, stages };
    } catch (err) {
      devLog.warn(
        "[KmnCodePane] projected .kmn unavailable; showing carve-filtered emit",
        err,
      );
      return null;
    } finally {
      stageCollectorRef.current = null;
    }
  }, [vfsTransform, startVfs, startKeyboard]);
  const projectedKmn = projection?.text ?? null;
  // Carve floor (no `startVfs` yet): the carve-applied working IR through
  // the mutate seam — the same derivation the projection's step 1 runs.
  const carveFallback = useMemo(() => {
    if (ir === null || startIr === null) return null;
    return emitKmn(
      applyCarveMutate(startIr, deletedNodeIds, deletedItemIds, carveChars),
    );
  }, [ir, startIr, deletedNodeIds, deletedItemIds, carveChars]);
  const canonical =
    ir === null
      ? null
      : (openText ?? projectedKmn ?? carveFallback ?? emitKmn(ir));

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
  // The canonical text the current draft was last synced to / applied from, and the stage texts of
  // the projection that text came from: the one snapshot Apply diffs and classifies against.
  const lastAppliedRef = useRef<string | null>(null);
  const shownStagesRef = useRef<KmnStageTexts>(new Map());
  // The stage texts of the newest projection, kept after each render (never written during one).
  const latestStagesRef = useRef<KmnStageTexts>(new Map());
  const projectionStages = projection?.stages;
  useEffect(() => {
    latestStagesRef.current = projectionStages ?? new Map();
    // The same text from a projection whose stages moved is still a clean follow of the build.
    if (canonical !== null && lastAppliedRef.current === canonical) shownStagesRef.current = latestStagesRef.current;
  });
  // Apply in flight: set synchronously at the top of Apply, cleared in `finally`, so a double
  // click cannot start a second Apply before the first has reached its own `compiling` state.
  const applyingRef = useRef(false);
  const [revealMissing, setRevealMissing] = useState(false);
  // Set by a successful Apply (Open: the starting-point replacement; Copy: the recorded
  // `kmn-edits` entry). Either moves what is built, so the new canonical snaps the editor (and
  // clears dirty) via the effect below. `appliedTick` re-runs that effect when the built text
  // came out identical, so the flag is always consumed by the render right after the Apply and a
  // later dirty draft is never wiped by a stale flag.
  const justAppliedRef = useRef(false);
  const [appliedTick, setAppliedTick] = useState(0);
  // The canonical at render time, for Apply's "did the keyboard change meanwhile" guards.
  const canonicalRef = useRef<string | null>(null);
  canonicalRef.current = canonical;

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
  const snapToCanonical = (next: string) => {
    justAppliedRef.current = false;
    lastAppliedRef.current = next;
    shownStagesRef.current = latestStagesRef.current;
    textRef.current = next;
    setText(next);
    setApplyError(null);
    runLint(next);
  };
  useEffect(() => {
    if (canonical === null) return;
    if (justAppliedRef.current) {
      snapToCanonical(canonical);
      return;
    }
    if (textRef.current === null || textRef.current === lastAppliedRef.current) {
      lastAppliedRef.current = canonical;
      shownStagesRef.current = latestStagesRef.current;
      if (textRef.current !== canonical) {
        textRef.current = canonical;
        setText(canonical);
        runLint(canonical);
      }
    }
    // Dirty draft: kept as-is.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canonical]);
  // An Apply that left the built text exactly as it was (the entry's replay changed nothing the
  // view shows) does not move `canonical`, so the effect above would not run; this one consumes
  // the flag. A formatting-only Apply bumps the tick too, without the flag: it only re-renders.
  useEffect(() => {
    if (justAppliedRef.current && canonical !== null) snapToCanonical(canonical);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appliedTick]);

  // Reveal once the editor is mounted and holds text. The lines come from the
  // canonical text: they match the editor while the draft is clean, and are the
  // best available guess for a dirty one.
  const hasText = text !== null;
  useEffect(() => {
    const nodeId = pendingRevealRef.current;
    if (nodeId === undefined || !editorReady || !hasText) return;
    const editor = editorRef.current;
    if (editor === null || ir === null || canonical === null) return;
    // The line in the shown text (the built keyboard, or the file on Open), found by content.
    const lines = buildRevealLines(ir, canonical, keyboardId);
    const line = lineForNode(ir, lines, nodeId);
    pendingRevealRef.current = undefined;
    // No line of its own in the built text (a step replaced the rule): say so, whatever is revealed.
    setRevealMissing(!lines.has(nodeId));
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
  // A dirty draft whose built text moved on (an assignment, a Layout-tab edit): the draft was made
  // against text that is no longer what is built, so Apply refuses until the author reloads.
  const draftStale = dirty && openText === undefined && canonical !== null && canonical !== lastAppliedRef.current;
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
    if (store.ir !== p.irAtClick || canonicalRef.current !== p.canonicalAtClick) {
      changedMeanwhile();
      return;
    }
    // The live IR changes only through the store's commit: applyIRChanges under CODE_WRITES.
    justAppliedRef.current = true;
    // The built text can name a rule the working IR lacks (an Assign-tab rule); the projection
    // places it, so the live IR skips what it cannot anchor instead of refusing the entry.
    const result = store.commitKmnEdit(
      { op: "code-apply", changes: p.changes, overrides: p.overrides },
      { skipLiveMisses: true },
    );
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
    setAppliedTick((n) => n + 1);
  };

  /** Replace the draft with the text that is built now (the author chose this; nothing else wipes a draft). */
  const reloadCurrent = () => {
    const now = canonicalRef.current;
    if (now !== null) snapToCanonical(now);
  };

  const staleMessage = () =>
    setApplyError(
      t({
        id: "editor.assignLoop.mechanisms.code.draftStale",
        message:
          "The keyboard changed underneath your draft (another tab changed what is built). Nothing was applied. Reload the current text, then make your edit again.",
      }),
    );

  const handleApply = async () => {
    if (applyingRef.current) return;
    applyingRef.current = true;
    try {
      await runApply();
    } finally {
      applyingRef.current = false;
    }
  };

  const runApply = async () => {
    const current = textRef.current;
    if (compiling || current === null || canonical === null) return;
    const irAtClick = useWorkingCopyStore.getState().ir;
    if (irAtClick === null) return;
    const id = keyboardIdRef.current;
    // 1a. Parse and lint (synchronous: the debounced lint state may lag behind the text).
    const lint = lintKmnCodeText(current, (src) => parseKmn(src, id), {
      keyboardId: id,
      baselineRawCtrl,
    });
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
    if (openText !== undefined && openPath !== null) {
      // Open: a formatting-only change is still a change to the file.
      if (current === canonical) return;
      const result = replaceStartingPointAndReplay(openPath, current);
      if (!result.ok) {
        setApplyError(result.error);
        return;
      }
      justAppliedRef.current = true;
      setAppliedTick((n) => n + 1);
      setApplyError(null);
      return;
    }
    if (current === lastAppliedRef.current) {
      // Nothing typed since the text was shown: nothing to commit.
      return;
    }
    const markFormattingOnlyApplied = () => {
      // Nothing to record, and the built text is the truth, so this draft is as applied as it will
      // get: clear the badge, keep the text. A later change to the built text snaps it, as for any
      // clean editor.
      lastAppliedRef.current = current;
      setApplyError(null);
      setAppliedTick((n) => n + 1);
    };
    // 2. The structural diff; empty means formatting-only, which records nothing.
    // The base is the text the author was shown (the built keyboard), re-parsed: the edit is the
    // difference from that view. A comment the shown text holds as freestanding is parsed the same
    // way on both sides, so a formatting-only change never reports an edit the author did not make.
    const shownText = lastAppliedRef.current ?? canonical;
    // One snapshot: the text the author was shown and the stage texts of that same projection. If
    // the build has moved on since, the draft's base is gone and classifying against the newest
    // stages would be wrong, so refuse (the simpler of the two sound options) and let the author
    // reload; the draft stays in the editor until then.
    if (canonical !== shownText || !sameStages(latestStagesRef.current, shownStagesRef.current)) {
      staleMessage();
      return;
    }
    let shownIr: KeyboardIR;
    try {
      shownIr = parseKmn(shownText, id).ir;
    } catch (err) {
      setApplyError(err instanceof Error ? err.message : String(err));
      return;
    }
    const diffed = diffIR(shownIr, after.ir);
    if (diffed.length === 0) {
      markFormattingOnlyApplied();
      return;
    }
    // Generated rules (mark guards, context tolerance, caps handling) are ordinary text by the time
    // the author edits, and a kept edit replays after those steps, so an edit to one is allowed and
    // asks for the owner confirm. `&TARGETS` is the exception: the build forces it to `any`.
    const touches = findGeneratedRuleTouches(diffed, shownStagesRef.current, shownText, id);
    const targetsTouch = touches.find((tt) => tt.source === "targets");
    if (targetsTouch !== undefined) {
      showBlocked([
        {
          code: "kmn-code-built-rule",
          severity: "error",
          message: t({
            id: "editor.assignLoop.mechanisms.code.targetsForced",
            message:
              "The target platforms are always set to any when the keyboard is built, so an edit to the &TARGETS store cannot be kept.",
          }),
          startLineNumber: targetsTouch.line,
          startColumn: 1,
          endLineNumber: targetsTouch.line,
          endColumn: 2,
        },
      ]);
      return;
    }
    const generated = new Map<number, GeneratingStep>();
    for (const tt of touches) if (tt.source !== "targets") generated.set(tt.change, tt.source);
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
    // The build with this entry included must be the text the author applied: a later step that
    // rewrites the edited rule (caps, mark guards, context tolerance) would otherwise override it
    // and the pane would snap back with the edit silently lost.
    if (vfsTransform !== null && startVfs !== null && startKeyboard !== null) {
      let predictedText: string | undefined;
      try {
        const clone = createVirtualFS(startVfs.entries());
        vfsTransform(clone, startKeyboard.id, nextCodeEdit(changes));
        const kmnPath = findKmnPath(clone);
        predictedText = kmnPath === undefined ? undefined : readVfsText(clone, kmnPath);
      } catch (err) {
        // The prediction is a safeguard, not a gate of its own: without it the compile gate remains.
        devLog.warn("[KmnCodePane] could not predict the build with the edit", err);
        predictedText = undefined;
      }
      const mismatch = predictedText === undefined ? null : findBuildMismatch(predictedText, current, id);
      if (mismatch !== null) {
        showBlocked([
          {
            code: "kmn-code-overridden",
            severity: "error",
            message: t({
              id: "editor.assignLoop.mechanisms.code.overriddenByBuild",
              message:
                "A later build step changes this back, so the keyboard as built would not match what you wrote. Change it in the step that produces it instead.",
            }),
            startLineNumber: mismatch,
            startColumn: 1,
            endLineNumber: mismatch,
            endColumn: 2,
          },
        ]);
        return;
      }
    }
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
    if (useWorkingCopyStore.getState().ir !== irAtClick || canonicalRef.current !== canonical) {
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
    // A change to a generated rule is flagged for review like any override: the owner is "another
    // step" and `step` names the generating step, so the confirm and the review list say which.
    for (const [index, step] of generated) {
      const existing = overrides.findIndex((o) => o.change === index);
      if (existing === -1) overrides.push({ change: index, owner: "another-step", step });
      else if (overrides[existing]?.owner === "another-step") overrides[existing] = { change: index, owner: "another-step", step };
    }
    const candidate: PendingApply = { irAtClick, canonicalAtClick: canonical, changes, overrides, generated };
    if (overrides.length > 0) {
      setPending(candidate);
      return;
    }
    commitPending(candidate);
  };

  const stepWords = (source: GeneratingStep): string => {
    switch (source) {
      case "mark-guards":
        return t({ id: "editor.assignLoop.mechanisms.code.lateSource.markGuards", message: "the marks step" });
      case "context-tolerance":
        return t({ id: "editor.assignLoop.mechanisms.code.lateSource.contextTolerance", message: "the context-tolerance fix" });
      case "caps":
        return t({ id: "editor.assignLoop.mechanisms.code.lateSource.caps", message: "the caps handling choice" });
    }
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

  const ownersText = [
    ...new Set([
      ...(pending?.overrides ?? []).filter((o) => !pending?.generated.has(o.change)).map((o) => ownerWords(o.owner)),
      ...[...(pending?.generated.values() ?? [])].map(stepWords),
    ]),
  ].join(", ");

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
      {draftStale && (
        <div data-testid="kmn-code-draft-stale" role="status">
          <span>
            {t({
              id: "editor.assignLoop.mechanisms.code.draftStaleNotice",
              message: "The keyboard changed since you started editing, so this draft is out of date.",
            })}
          </span>{" "}
          <button type="button" data-testid="kmn-code-reload" onClick={reloadCurrent}>
            {t({ id: "editor.assignLoop.mechanisms.code.reloadCurrent", message: "Reload the current text" })}
          </button>
        </div>
      )}
      {revealMissing && (
        <div data-testid="kmn-code-reveal-missing" role="status">
          {t({
            id: "editor.assignLoop.mechanisms.code.revealMissing",
            message: "That rule is not in the keyboard as it will be built, so no line matches it. Another step replaced it.",
          })}
        </div>
      )}
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
