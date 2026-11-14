// LayoutPane — the Layout tab: layer selector, desktop key grid, key detail (spec 117 US1,
// FR-010..FR-018). Read-only in this phase: it shows what every key really types and where that
// comes from, and links read-only behaviour to the Code tab. The edit controls of the next phase
// render directly under the grid, above the detail panel, so the selected key and its edit
// controls are jointly in view without scrolling down (at 150% zoom the detail panel's own
// height used to push them a viewport apart).
//
// Everything shown is derived: attribution of the layer over the compiled artifact
// (`useLayoutAttribution`, which starts no timer and calls no compile — decision D3), the base
// keyboards' fallback characters, and the working copy's contexts. The only state this pane
// owns is the selected layer, the selected key, the layers the author added this session, and
// whether the Add layer dialog is open.

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useLingui } from "@lingui/react/macro";
import { attributeLayer, listContexts } from "@keyboard-studio/engine";
import { listDeadkeys } from "@keyboard-studio/contracts";
import type { LayerCombo } from "@keyboard-studio/contracts";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { selectLayoutIr } from "./layoutIr.ts";
import { isLiveOpen } from "../../lib/openMode.ts";
import { usePickedWindowsLayouts } from "../../lib/layoutFamily.ts";
import { plainDiagnosticMessage } from "../../lib/plainDiagnosticMessage.ts";
import { groupDemoDiagnostics } from "../../components/rules/demoDiagnostics.ts";
import { BG_CARD, BORDER, TEXT_DIM, TEXT_MAIN, FONT } from "../../lib/galleryTheme.ts";
import { LayerSelector } from "../assignLoop/keyGrid/LayerSelector.tsx";
import type { LayoutPanelProps } from "./layoutPanelProps.ts";
import { baseFallbackCells } from "./baseFallbackCells.ts";
import { buildDesktopGridViewModel, countProvisional, fallbackClassOf } from "./desktopGridViewModel.ts";
import type { FallbackClass } from "./desktopGridViewModel.ts";
import type { DesktopCellViewModel } from "./desktopGridViewModel.ts";
import { AddLayerDialog } from "./AddLayerDialog.tsx";
import { AfterContextView } from "./AfterContextView.tsx";
import { DeadkeyList } from "./DeadkeyList.tsx";
import { DeadkeyTablePanel } from "./DeadkeyTablePanel.tsx";
import { deadkeyRefOf } from "./deadkeyTable.ts";
import { DesktopKeyGrid } from "./DesktopKeyGrid.tsx";
import { KeyDetailPanel } from "./KeyDetailPanel.tsx";
import { KeyEditPanel } from "./KeyEditPanel.tsx";
import { DEFAULT_LAYER_KEY, isUnsavedLayer, layerKey, listAvailableLayers } from "./layerList.ts";
import { DESKTOP_VKEYS, useLayoutAttribution } from "./useLayoutAttribution.ts";
import { useLayoutCopy } from "./useLayoutCopy.ts";

/** The most compile diagnostics listed in the banner. */
const MAX_BANNER_DIAGNOSTICS = 3;

/**
 * Classes whose fallback policy the author has confirmed (spec 109). Nothing stores that
 * confirmation yet, and the Layout tab never sets policy, so no class is confirmed here.
 */
const NO_CONFIRMED_CLASSES: ReadonlySet<FallbackClass> = new Set();

export function LayoutPane({ onViewInCode }: LayoutPanelProps) {
  const { t, i18n } = useLingui();
  const copy = useLayoutCopy();
  const ir = useWorkingCopyStore(selectLayoutIr);
  const startIr = useWorkingCopyStore((s) => s.startIr);
  const desktopLocked = useWorkingCopyStore((s) => s.desktopLocked);
  const bases = usePickedWindowsLayouts();
  // The top undo entry is a Layout edit: undo is offered here (the shared stack also holds the
  // carve and touch entries, which their own tabs undo).
  // On a keyboard opened for update the edit is in the file and the footer's Open undo takes it
  // back (one record per confirm), so this pane's own undo is not offered there.
  const live = useWorkingCopyStore((st) => isLiveOpen(st));
  const canUndoEdit = useWorkingCopyStore((st) => {
    const top = st.undoStack[st.undoStack.length - 1];
    return top !== undefined && (top.k === "l" || top.k === "lb" || top.k === "ld");
  });

  const [addedLayers, setAddedLayers] = useState<readonly LayerCombo[]>([]);
  const [layerId, setLayerId] = useState<string>(DEFAULT_LAYER_KEY);
  const [selectedVkey, setSelectedVkey] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  // The deadkey whose table is open, the one the grid is switched to "after", and the one just
  // made (its space row is proposed). All three are ids as contexts name them (`0001`).
  const [openDeadkey, setOpenDeadkey] = useState<string | null>(null);
  const [afterDeadkey, setAfterDeadkey] = useState<string | null>(null);
  // The "after typed text" view (literal contexts); mutually exclusive with `afterDeadkey`.
  const [afterLiteral, setAfterLiteral] = useState(false);
  const [newDeadkey, setNewDeadkey] = useState<string | null>(null);
  // The deadkey list is collapsed by default; closing a table expands it so the "Open its
  // table" button that focus returns to is in the DOM.
  const [deadkeyListExpanded, setDeadkeyListExpanded] = useState(false);
  const addButtonRef = useRef<HTMLButtonElement | null>(null);
  const paneRef = useRef<HTMLDivElement | null>(null);
  const editWrapRef = useRef<HTMLDivElement | null>(null);
  // The deadkey whose list row focus returns to when its table is closed.
  const closeFocusRef = useRef<string | null>(null);

  const layers = useMemo(() => listAvailableLayers(startIr, ir, addedLayers), [startIr, ir, addedLayers]);
  const layer: LayerCombo = layers.find((l) => layerKey(l) === layerId) ?? [];
  const layerIds = useMemo(() => layers.map(layerKey), [layers]);
  const unsaved = isUnsavedLayer(layer, ir);

  const attribution = useLayoutAttribution(layer);

  const fallback = useMemo(
    () => (ir === null ? new Map() : baseFallbackCells(ir, DESKTOP_VKEYS, layer, bases)),
    // `layer` is covered by `layerId`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ir, layerId, bases],
  );
  const contexts = useMemo(() => (ir === null ? [] : listContexts(ir)), [ir]);
  const deadkeys = useMemo(
    () =>
      ir === null
        ? []
        : listDeadkeys(ir).flatMap((info) => {
            const ref = deadkeyRefOf(info);
            return ref === null ? [] : [{ ref, label: info.displayChar ?? ref }];
          }),
    [ir],
  );

  const cells = useMemo((): DesktopCellViewModel[] => {
    const built = buildDesktopGridViewModel({
      layer,
      cells: attribution.cells,
      state: attribution.state,
      steps: attribution.steps,
      mnemonic: attribution.mnemonic,
      baseFallback: fallback,
      contexts,
      confirmedClasses: NO_CONFIRMED_CLASSES,
    }).cells;
    // A completed desktop step is read-only here as it is in the Assign tab.
    return desktopLocked ? built.map((c) => (c.editable ? { ...c, editable: false } : c)) : built;
    // `layer` is covered by `layerId`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attribution, fallback, contexts, desktopLocked, layerId]);

  // Provisional keys per layer (FR-030), shown as the layer's count. The open layer is counted from
  // its verified cells; the others from the working copy's own rules, as no other layer is compiled
  // and simulated here.
  const provisionalByLayer = useMemo(() => {
    const counts = new Map<string, number>();
    if (ir === null) return counts;
    for (const l of layers) {
      const key = layerKey(l);
      if (key === layerId) continue;
      const fb = baseFallbackCells(ir, DESKTOP_VKEYS, l, bases);
      const n = attributeLayer(ir, l, DESKTOP_VKEYS).filter((c) => {
        if (c.frame || c.plain !== null || !c.unhandled) return false;
        const cls = fallbackClassOf(fb.get(c.vkey));
        return cls === null || !NO_CONFIRMED_CLASSES.has(cls);
      }).length;
      counts.set(key, n);
    }
    counts.set(layerId, countProvisional(cells));
    return counts;
  }, [ir, layers, layerId, bases, cells]);

  const selected = cells.find((c) => c.vkey === selectedVkey) ?? null;

  // What the starting point typed on the selected key, shown when a hand-set value replaced it.
  const replaced = useMemo(() => {
    if (selected === null || selected.provenance !== "hand-set" || startIr === null) return null;
    const before = attributeLayer(startIr, layer, [selected.vkey])[0]?.plain ?? null;
    if (before === null || before.output === null) return null;
    return JSON.stringify(before.output) === JSON.stringify(selected.attribution.plain?.output) ? null : before.output;
    // `layer` is covered by `layerId`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, startIr, layerId]);

  const layerLabels = useMemo(() => {
    const labels = new Map<string, string>();
    for (const l of layers) {
      const name = copy.layerName(l);
      labels.set(
        layerKey(l),
        isUnsavedLayer(l, ir) ? t({ id: "editor.layout.layer.unsavedLabel", message: `${{ name }} (not saved)` }) : name,
      );
    }
    return labels;
    // `copy` and `t` are recreated each render but only read the active locale.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layers, ir, i18n.locale]);

  // Close a deadkey table and return focus to that deadkey's "Open its table" button. The
  // list is expanded first so the button is in the DOM; the effect below focuses it once the
  // table has unmounted. Closing does NOT clear `newDeadkey`: if the author closed without
  // deciding on the proposed space row, reopening the table proposes it again. Only an
  // explicit "Do not add it" clears it (see onSpaceDismissed below).
  function handleCloseDeadkey(): void {
    if (openDeadkey === null) return;
    closeFocusRef.current = openDeadkey;
    setDeadkeyListExpanded(true);
    setOpenDeadkey(null);
  }

  useEffect(() => {
    if (openDeadkey !== null) return;
    const id = closeFocusRef.current;
    if (id === null) return;
    closeFocusRef.current = null;
    // Match the row by attribute value, not by interpolating the id into a selector: a
    // named deadkey's name can hold characters that break a selector (and `CSS.escape`
    // is not available in this jsdom). If the row is gone (the deadkey was deleted
    // meanwhile) fall back to the list toggle.
    const list = paneRef.current?.querySelector('[data-testid="deadkey-list"]');
    const row = Array.from(list?.querySelectorAll("[data-deadkey]") ?? []).find(
      (el) => el.getAttribute("data-deadkey") === id,
    );
    const target = row?.querySelector('[data-testid="deadkey-list-open"]');
    if (target instanceof HTMLElement) target.focus();
    else paneRef.current?.querySelector<HTMLElement>('[data-testid="deadkey-list-toggle"]')?.focus();
  }, [openDeadkey, deadkeyListExpanded]);

  // Keep the selected key and its edit controls jointly in view. On selection (click or arrow
  // key) scroll the pane the minimum amount that fits the edit panel, capped so the selected
  // cell stays in view; when everything already fits, or there is no edit panel, do nothing —
  // so arrow-key navigation and manual scrolling are never yanked. At 150% zoom the edit
  // panel sits directly under the grid, so the two fit together with at most a small nudge;
  // this is the safety net for a taller edit panel (deadkey options, displacement, case
  // partner). The same check also runs when the edit panel resizes (its content grows while
  // typing, or the viewport zooms after the key was selected): a resize alone does not change
  // the selection, so the selection effect below would never fire.
  function ensureEditVisible(): void {
    if (selectedVkey === null || afterDeadkey !== null || afterLiteral) return;
    const pane = paneRef.current;
    const edit = editWrapRef.current;
    if (pane === null || edit === null || pane.clientHeight === 0) return;
    const cellEl = pane.querySelector(`[data-testid="layout-cell-${selectedVkey}"]`);
    if (!(cellEl instanceof HTMLElement)) return;
    const paneRect = pane.getBoundingClientRect();
    const overflow = edit.getBoundingClientRect().bottom - paneRect.bottom;
    if (overflow <= 0) return;
    const maxScroll = cellEl.getBoundingClientRect().top - paneRect.top - 8;
    if (maxScroll <= 0) return;
    pane.scrollTop += Math.min(overflow, maxScroll);
  }

  useLayoutEffect(() => {
    ensureEditVisible();
    // `selectedVkey` / `layerId` / the after-view are the triggers; the refs are stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedVkey, layerId, afterDeadkey, afterLiteral]);

  useEffect(() => {
    const edit = editWrapRef.current;
    if (edit === null) return;
    window.addEventListener("resize", ensureEditVisible);
    if (typeof ResizeObserver === "undefined") return () => window.removeEventListener("resize", ensureEditVisible);
    const observer = new ResizeObserver(() => ensureEditVisible());
    observer.observe(edit);
    return () => {
      window.removeEventListener("resize", ensureEditVisible);
      observer.disconnect();
    };
    // Re-observe when the edit panel remounts: a new key/layer, or returning from the
    // after-view (the panel unmounts while AfterContextView renders, so the observer
    // would otherwise keep watching the detached node).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedVkey, layerId, afterDeadkey, afterLiteral]);

  if (ir === null) {
    return (
      <div data-testid="layout-pane" style={{ padding: 24, color: TEXT_DIM, fontFamily: FONT }}>
        <p data-testid="layout-pane-empty" style={{ margin: 0 }}>
          {t({
            id: "editor.layout.pane.noKeyboard",
            message: "The Layout tab needs a keyboard in the working copy. Nothing to show yet.",
          })}
        </p>
      </div>
    );
  }

  // The first group's node: a place to open the Code tab at when there is no rule to point to.
  const codeEntryNodeId = ir.groups[0]?.nodeId;

  const openCodeButton =
    codeEntryNodeId === undefined ? null : (
      <button
        type="button"
        onClick={() => onViewInCode(codeEntryNodeId)}
        data-testid="layout-open-code"
        style={linkButtonStyle}
      >
        {t({ id: "editor.layout.pane.openCode", message: "Open the Code tab" })}
      </button>
    );

  const errorGroups = groupDemoDiagnostics(
    attribution.diagnostics.filter((d) => d.severity === "error" || d.severity === "fatal"),
  ).slice(0, MAX_BANNER_DIAGNOSTICS);
  const hasCompileProblem = attribution.errorMessage !== null || errorGroups.length > 0;

  function selectLayer(id: string): void {
    setLayerId(id);
  }

  function handleAddLayer(combo: LayerCombo): void {
    const key = layerKey(combo);
    setAddedLayers((prev) => (prev.some((l) => layerKey(l) === key) ? prev : [...prev, combo]));
    setLayerId(key);
    setAddOpen(false);
    addButtonRef.current?.focus();
  }

  function handleCancelAdd(): void {
    setAddOpen(false);
    addButtonRef.current?.focus();
  }

  return (
    <div
      ref={paneRef}
      data-testid="layout-pane"
      style={{ display: "flex", flexDirection: "column", gap: 12, padding: 12, fontFamily: FONT, color: TEXT_MAIN, overflow: "auto" }}
    >
      {attribution.mnemonic && (
        <div role="status" data-testid="layout-banner-mnemonic" style={bannerStyle}>
          <p style={bannerText}>{copy.readOnlyReasonText("mnemonic")}</p>
          {openCodeButton}
        </div>
      )}

      {desktopLocked && (
        <div role="status" data-testid="layout-banner-locked" style={bannerStyle}>
          <p style={bannerText}>
            {t({
              id: "editor.assignLoop.desktopLockedNote",
              message:
                "This desktop layout is complete. Editing it will flag your touch layout for re-review.",
            })}
          </p>
          <p style={bannerText}>
            {t({
              id: "editor.layout.pane.lockedFollows",
              message: "The Layout tab follows the same lock as the Assign tab, so every key is read-only for now.",
            })}
          </p>
        </div>
      )}

      {attribution.state === "not-compiled" && (
        <div role="status" data-testid="layout-banner-not-compiled" style={bannerStyle}>
          <p style={bannerText}>
            {hasCompileProblem
              ? t({
                  id: "editor.layout.pane.notCompiledError",
                  message:
                    "The keyboard does not compile, so there is no result to show yet. Every key is read-only, and nothing here is a guess.",
                })
              : t({
                  id: "editor.layout.pane.notCompiledWaiting",
                  message:
                    "The keyboard has not compiled yet. Every key is read-only until it does, and nothing here is a guess.",
                })}
          </p>
        </div>
      )}

      {attribution.state === "stale" && (
        <div role="status" data-testid="layout-banner-stale" style={bannerStyle}>
          <p style={bannerText}>
            {attribution.staleReason === "error"
              ? t({
                  id: "editor.layout.pane.staleError",
                  message:
                    "The keyboard does not compile right now. You are seeing the last result that did, so it may be out of date. Editing is blocked until the keyboard compiles.",
                })
              : t({
                  id: "editor.layout.pane.staleLoading",
                  message: "The keyboard is compiling again. You are seeing the previous result until it finishes.",
                })}
          </p>
        </div>
      )}

      {hasCompileProblem && attribution.state !== "ready" && (
        <div data-testid="layout-compile-errors" style={bannerStyle}>
          <p style={{ ...bannerText, fontWeight: 600 }}>
            {t({ id: "editor.layout.pane.compileErrorsHeading", message: "Compile errors" })}
          </p>
          {attribution.errorMessage !== null && (
            <p style={bannerText} data-testid="layout-compile-error-message">
              {attribution.errorMessage}
            </p>
          )}
          {errorGroups.length > 0 && (
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {errorGroups.map((g) => {
                const plain = plainDiagnosticMessage(g.representative, i18n);
                return (
                  <li key={g.code} style={bannerText} data-testid="layout-compile-error-row">
                    {plain.whatHappened} {plain.whatToTry}
                  </li>
                );
              })}
            </ul>
          )}
          {openCodeButton}
        </div>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
        <LayerSelector
          layerIds={layerIds}
          activeLayerId={layerId}
          onSelectLayer={selectLayer}
          findingCountsByLayerId={provisionalByLayer}
          countKind="provisional"
          layerLabels={layerLabels}
          hideGroupHeadings
          label={t({ id: "editor.layout.pane.layersLabel", message: "Layers" })}
        />
        <button
          type="button"
          ref={addButtonRef}
          onClick={() => setAddOpen(true)}
          data-testid="layout-add-layer"
          className="ks-focus-ring ks-hit-target ks-press"
          style={addButtonStyle}
        >
          {t({ id: "editor.layout.pane.addLayer", message: "Add layer" })}
        </button>
        {(
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
            {t({ id: "editor.layout.pane.afterLabel", message: "Show keys after" })}
            <select
              value={afterLiteral ? "__literal__" : (afterDeadkey ?? "")}
              onChange={(e) => {
                const v = e.target.value;
                setAfterLiteral(v === "__literal__");
                setAfterDeadkey(v === "" || v === "__literal__" ? null : v);
              }}
              data-testid="layout-after-select"
              className="ks-focus-ring"
              style={addButtonStyle}
            >
              <option value="">{t({ id: "editor.layout.pane.afterNone", message: "Nothing (the plain grid)" })}</option>
              <option value="__literal__">{t({ id: "editor.layout.pane.afterText", message: "Typed text" })}</option>
              {deadkeys.map((d) => (
                <option key={d.ref} value={d.ref}>
                  {t({ id: "editor.layout.pane.afterDeadkey", message: `Deadkey ${{ label: d.label }}` })}
                </option>
              ))}
            </select>
          </label>
        )}
        {!live && (
          <button
            type="button"
            onClick={() => useWorkingCopyStore.getState().undoKmnEdit()}
            disabled={!canUndoEdit}
            data-testid="layout-undo"
            className="ks-focus-ring ks-hit-target ks-press"
            style={addButtonStyle}
          >
            {t({ id: "editor.layout.pane.undo", message: "Undo last change" })}
          </button>
        )}
      </div>

      {unsaved && (
        <p role="status" data-testid="layout-unsaved-layer" style={{ margin: 0, fontSize: 12, color: TEXT_DIM }}>
          {t({
            id: "editor.layout.pane.unsavedLayer",
            message:
              "This layer is not saved until a key is set. It has no rules yet, so it does not exist in the keyboard.",
          })}
        </p>
      )}

      {afterDeadkey !== null || afterLiteral ? (
        <AfterContextView
          key={`${afterDeadkey ?? "literal"}|${layerId}`}
          {...(afterDeadkey !== null ? { deadkeyId: afterDeadkey } : {})}
          layer={layer}
          layers={layers}
          {...(afterDeadkey !== null && deadkeys.find((d) => d.ref.toLowerCase() === afterDeadkey.toLowerCase()) !== undefined
            ? { displayChar: deadkeys.find((d) => d.ref.toLowerCase() === afterDeadkey.toLowerCase())!.label }
            : {})}
          onFollow={(id) => {
            setAfterLiteral(false);
            setAfterDeadkey(id);
          }}
          onViewInCode={onViewInCode}
          onClose={() => {
            setAfterLiteral(false);
            setAfterDeadkey(null);
          }}
        />
      ) : (
        <>
          <DesktopKeyGrid
            cells={cells}
            selectedVkey={selectedVkey}
            onSelectVkey={setSelectedVkey}
            label={t({
              id: "editor.layout.pane.gridLabel",
              message: `Desktop layout, ${{ layer: copy.layerName(layer) }} layer`,
            })}
          />

          {selected !== null && selected.editable && (
            <div ref={editWrapRef}>
              <KeyEditPanel
                key={`${selected.vkey}|${layerId}`}
                cell={selected}
                onViewInCode={onViewInCode}
                onDeadkeyDefined={(id) => {
                  setNewDeadkey(id);
                  setOpenDeadkey(id);
                }}
              />
            </div>
          )}

          <KeyDetailPanel cell={selected} onViewInCode={onViewInCode} replaced={replaced} />
        </>
      )}

      {openDeadkey !== null && (
        <DeadkeyTablePanel
          key={openDeadkey}
          deadkeyId={openDeadkey}
          layers={layers}
          onViewInCode={onViewInCode}
          onShowAfter={(id) => {
            setAfterLiteral(false);
            setAfterDeadkey(id);
          }}
          proposeSpaceRow={newDeadkey === openDeadkey}
          onClose={handleCloseDeadkey}
          onSpaceDismissed={() => setNewDeadkey(null)}
        />
      )}

      <DeadkeyList
        layers={layers}
        openId={openDeadkey}
        selectedCell={selected}
        onOpen={setOpenDeadkey}
        onDeleted={(id) => {
          if (openDeadkey === id) setOpenDeadkey(null);
          if (afterDeadkey === id) setAfterDeadkey(null);
        }}
        expanded={deadkeyListExpanded}
        onExpandedChange={setDeadkeyListExpanded}
      />

      <AddLayerDialog
        open={addOpen}
        onCancel={handleCancelAdd}
        onConfirm={handleAddLayer}
        listedKeys={new Set(layerIds)}
      />
    </div>
  );
}

const bannerStyle = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  padding: "10px 12px",
  border: `1px solid ${BORDER}`,
  borderRadius: 6,
  background: BG_CARD,
} as const;

const bannerText = { margin: 0, fontSize: 13, color: TEXT_MAIN, lineHeight: 1.5 } as const;

const addButtonStyle = {
  padding: "5px 10px",
  background: "transparent",
  border: `1px solid ${BORDER}`,
  borderRadius: 6,
  color: TEXT_MAIN,
  fontSize: 12,
  cursor: "pointer",
  fontFamily: FONT,
} as const;

const linkButtonStyle = {
  alignSelf: "flex-start",
  background: "none",
  border: "none",
  padding: 0,
  color: "var(--app-accent-text)",
  textDecoration: "underline",
  cursor: "pointer",
  fontSize: 13,
  fontFamily: FONT,
} as const;
