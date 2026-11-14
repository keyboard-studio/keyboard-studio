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
// - Apply: parse the edited KMN via `parseKmn`, write the resulting IR
//   back through `setWorkingIR` (overlay-preserving: the carve-deletion
//   overlay and undo stack survive a code-view Apply).
//   Apply operates on the working-IR base: the projection builds from
//   `startIr` + overlays, so an edit to a projection-generated rule
//   (an assignment, a mark guard, a caps rule) is regenerated away on the
//   next projection, and an edit to a base rule lands in the working IR
//   (visible in the gallery) but does not reach the preview/download —
//   the pre-existing Apply limitation, now visible in the pane instead of
//   hidden behind a stale emit. Because the projection does not move on a
//   `setWorkingIR`, Apply resyncs the draft bookkeeping directly
//   (`lastAppliedRef = applied text`) so the dirty badge clears and the
//   editor keeps the applied text; a later canonical change then snaps
//   this clean editor to the projection, per the dirty-draft rule.
//   Apply never writes projected text back
//   into `ir` as a starting point and never touches `startIr`, so a later
//   carve restore still resurrects the rule in preview, download, gallery,
//   and code view.
//   Monaco-local undo covers typing.

import "./touchBuilder/monacoSetup.ts";

import { useEffect, useMemo, useRef, useState } from "react";
import Editor, { type OnMount } from "@monaco-editor/react";
import { useLingui } from "@lingui/react/macro";
import { plural } from "@lingui/core/macro";
import { createVirtualFS, type Pattern } from "@keyboard-studio/contracts";
import { devLog } from "@keyboard-studio/contracts/dev-log";
import { emitKmn, parseKmn, OUTPUT_FORM_SEAM_PATTERN_IDS } from "@keyboard-studio/engine";
import { findRawCtrlRules } from "@keymanapp/keyboard-lint";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { useWorkingCopyTransform } from "../../hooks/useWorkingCopyTransform.ts";
import { applyCarveMutate } from "../../steps/editorMutate.ts";
import { physicalAssignmentsOf } from "../../lib/physicalAssignments.ts";
import { findKmnPath } from "../../lib/findKmnPath.ts";
import { getPatternByIdSync } from "../../lib/services.ts";
import { isLiveOpen, isOpenMode } from "../../lib/openMode.ts";
import { useApplyOnOpen } from "../../components/OpenApplyHost.tsx";
import { readVfsText } from "../../lib/vfsText.ts";
import {
  CODE_VIEW_EDIT_LABEL,
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
  const applyOnOpen = useApplyOnOpen();
  // Open mode (spec 111 FR-009): the pane shows the file's own text and Apply
  // replaces the starting point with it.
  // isOpenMode here (the Open VIEW, also for a descriptor-less older draft); the live-files apply below is gated on isLiveOpen.
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
  //
  // Projected `.kmn` (primary): the same projection the preview and the
  // download run, applied to a clone of `startVfs` so the base is never
  // mutated. The pattern map is resolved synchronously from the recorded
  // assignments (plus the output-form seam ids, mirroring
  // `serializeWorkingCopy` step 3) so mechanism assignments are reflected
  // too — `useWorkingCopyTransform` without a pattern map would skip them.
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
  const vfsTransform = useWorkingCopyTransform({
    patternMap: patternMap.size > 0 ? patternMap : null,
    previewedStartId: startKeyboard?.id ?? null,
  });
  const startIr = useWorkingCopyStore((s) => s.startIr);
  const deletedNodeIds = useWorkingCopyStore((s) => s.deletedNodeIds);
  const deletedItemIds = useWorkingCopyStore((s) => s.deletedItemIds);
  const carveChars = useWorkingCopyStore((s) => s.carveChars);
  const projectedKmn = useMemo(() => {
    if (vfsTransform === null || startVfs === null || startKeyboard === null)
      return null;
    try {
      // Shallow-entry clone: the projection replaces whole entries via
      // vfs.set() rather than mutating entry buffers in place (the same
      // clone contract `serializeWorkingCopy` relies on).
      const clone = createVirtualFS(startVfs.entries());
      vfsTransform(clone, startKeyboard.id);
      const kmnPath = findKmnPath(clone);
      if (kmnPath === undefined) return null;
      return readVfsText(clone, kmnPath) ?? null;
    } catch (err) {
      devLog.warn(
        "[KmnCodePane] projected .kmn unavailable; showing carve-filtered emit",
        err,
      );
      return null;
    }
  }, [vfsTransform, startVfs, startKeyboard]);
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
  // The canonical text the current draft was last synced to / applied from.
  const lastAppliedRef = useRef<string | null>(null);
  // Set around Apply in open mode only: the starting-point replacement
  // changes the file text, so the new canonical snaps the editor (and
  // clears dirty) via the effect below. The non-open path does NOT use
  // this flag: its canonical derives from `startIr` + overlays, not from
  // `ir`, so `setWorkingIR` never moves it and the effect would never
  // re-run to consume the flag — instead `handleApply` resyncs
  // `lastAppliedRef` directly (see there).
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
      if (isLiveOpen({ instantiationMode: mode, startVfs, startKeyboard })) {
        // Live files (spec 111 FR-041/FR-045): the text goes into the file
        // through the apply seam, so it is one undo step and gets the same
        // post-checks as every other change. Nothing is replayed over it.
        // The flag is raised BEFORE the write: the store update re-renders the
        // pane and the canonical-text effect consumes it; it is lowered again
        // when nothing was written.
        justAppliedRef.current = true;
        void applyOnOpen({
          kind: "files",
          files: { [openPath]: current },
          label: CODE_VIEW_EDIT_LABEL,
          labelKey: "code-view",
        }).then((result) => {
          if (result.status === "applied") {
            setApplyError(null);
            return;
          }
          justAppliedRef.current = false;
          if (result.status === "failed") setApplyError(result.reason);
        });
        return;
      }
      // A keyboard opened without its descriptor (an older draft): the earlier behaviour.
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
    // Resync the draft bookkeeping directly. The projected / carve-fallback
    // canonical derives from `startIr` + overlays, not from `ir`, so this
    // write does not change `canonical` and the [canonical]-keyed snap
    // effect above never re-runs — without this, the "Unapplied changes"
    // badge would stay stuck after a successful Apply (a regression vs
    // the old `emitKmn(ir)` canonical, which the write did move). The
    // applied text is now clean, and the editor keeps showing it.
    // No `justAppliedRef` here: a dangling flag would snap — and wipe — a
    // later dirty draft on the next canonical change, breaking the
    // dirty-draft protection. On the emit path (no startVfs/startIr) the
    // new IR does move the canonical, and the effect's clean-sync branch
    // (text === lastApplied) snaps the editor to the re-emitted text,
    // which is the old behaviour.
    // TRADE-OFF (accepted, option (a)): the applied text is "clean" while
    // the pane's canonical still does not contain a base-rule edit, so a
    // later canonical change (e.g. a recorded assignment) snaps this clean
    // editor to the projection text and the edit vanishes from view. That
    // is the existing dirty-draft rule applied consistently — only dirty
    // drafts are protected from snapping; an applied edit is clean — and
    // the edit itself is not lost: it is committed in the working IR and
    // visible in the gallery. The alternative (keep the draft but clear
    // the badge) would conflate "applied" with "matches canonical" and
    // leave the pane drifting from the preview with no signal.
    lastAppliedRef.current = current;
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
