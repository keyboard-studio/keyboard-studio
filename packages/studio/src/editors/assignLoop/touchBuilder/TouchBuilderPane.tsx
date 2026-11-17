// TouchBuilderPane — the visual touch-layout editor replacing the
// TouchGallery "By key" tab's old grid surface (TIKE touch-builder port,
// slice-spec §3.2).
//
// "View swap, not a fork" (FR-036a/b): the pane reads the shared
// `effectiveKeyModeLayout` selector (via the `layout` prop) and the store's
// selection state, and writes EXCLUSIVELY through `commitOp` (the
// `commitKeyEditOp` entry point) — it never holds a layout copy. Selection
// reuses the existing `touchKeyAddress` scheme; subkey selection is a
// secondary `{ kind, id }` held locally and reset whenever the main-key
// selection changes.
//
// Every gesture decomposes per slice-spec §4 into the 10 `KeyEditOperation`
// kinds. Key-level ops only (Q1): no row/layer structural UI, no
// per-platform font editing.

import { useEffect, useRef, useState } from "react";
import { plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { useIsNarrow } from "../../../hooks/useViewport.ts";
import {
  createKeyOccurrenceCounter,
  parseTouchKeyAddress,
  touchKeyAddress,
  type TouchKeyIR,
  type TouchLayoutIR,
} from "@keyboard-studio/contracts";
import { proposeSuppressFields } from "@keyboard-studio/engine";
import type { PendingKeyEditOperation } from "../../../stores/workingCopyStore.ts";
import {
  BUILDER_DEFAULT_KEY_WIDTH,
  BUILDER_KEY_MARGIN,
  BUILDER_PRESENTATIONS,
  BUILDER_ROW_HEIGHT,
  FLICK_GRID,
  type BulkKeyEditFields,
  type FlickDirection,
  buildBulkKeyEditOps,
  builderPresentationById,
  buildTemplateApplyOps,
  commonFieldValue,
  computeBuilderScale,
  defaultBuilderPresentationId,
  keycapFontFamily,
  mintBuilderKeyId,
  parseBuilderTemplate,
  rangeKeySelection,
  resolveBuilderKey,
  rightEdgeUnits,
  snapBuilderWidth,
  subKeyEntriesOf,
  suggestKeyIdFromText,
  toggleKeySelection,
  type BuilderSubKeyEntry,
  type BuilderSubKeyKind,
} from "./touchBuilderModel.ts";
import {
  builderTemplateSources,
  type BuilderTemplateSource,
} from "./builderTemplates.ts";
import { PlacementModal } from "./PlacementModal.tsx";
import { useTouchDrag } from "./useTouchDrag.ts";
import type { PlacementChoice } from "./placementOps.ts";
import {
  buildPanelDropOps,
  buildSubkeyMoveOps,
  parsePanelDropSpec,
  type PanelDropSpec,
  type SubkeyDragPayload,
} from "./placementOps.ts";
import { buildPlacementOps } from "./placementOps.ts";

export interface TouchBuilderPaneProps {
  /** The shared `effectiveKeyModeLayout` selector — read, never copied. */
  readonly layout: TouchLayoutIR | null;
  readonly activePlatformId: string | null;
  readonly onSelectPlatform: (platformId: string) => void;
  readonly activeLayerId: string;
  readonly onSelectLayer: (layerId: string) => void;
  readonly selectedKeyAddress: string | null;
  readonly onSelectKey: (address: string | null) => void;
  /**
   * The multi-selection set (#2596 item 2), owned by TouchGallery next to
   * the anchor. The pane always reads it through the render-time filter
   * (`selectedOnLayer` below) — the stored array may transiently hold
   * off-layer addresses after a layer switch, and the next gesture drops
   * them. `onSelectKeys` replaces the set AND the anchor together.
   */
  readonly selectedKeyAddresses: readonly string[];
  readonly onSelectKeys: (
    addresses: readonly string[],
    anchor: string | null,
  ) => void;
  /**
   * The bare-op commit entry point (`commitKeyEditOp`). Accepts the same
   * options object as `commitKeyEditOp` — bulk commits pass
   * `{ offerFamilyApply: false }` (see `handleBulkSet`).
   */
  readonly commitOp: (
    op: PendingKeyEditOperation,
    options?: { readonly offerFamilyApply?: boolean },
  ) => boolean;
  /**
   * Wraps a loop of sequential `commitOp` calls that is ONE author action, so a
   * keyboard opened for update writes it as one change (one undo record).
   * Omitted: the loop just runs.
   */
  readonly groupCommits?: (run: () => void) => void;
  /**
   * The keyboard's font as a blob URL + CSS family (from the artifact
   * stage). Injected as a FontFace so keycaps render in the real typeface
   * instead of the UI font.
   */
  readonly fontFaceUrl?: string | undefined;
  readonly fontFaceFamily?: string | undefined;
  /**
   * Placement-tray state, owned by TouchGallery (the bar lives in the locked
   * header): the tap-to-place selection and letters demoted back to the tray.
   */
  readonly trayLetter: string | null;
  readonly onSelectTrayLetter: (letter: string | null) => void;
  readonly onTrayReturnsChange: (updater: (prev: string[]) => string[]) => void;
  /**
   * The pane owns the placement modal + op planning, so it registers a drag
   * API for TouchGallery's header drags (which start outside the pane):
   * dropping a tray letter on a board key opens the modal; dropping one on
   * a subkey-panel area places it directly.
   */
  readonly onRegisterDragApi?: (api: BuilderPaneDragApi) => void;
  /**
   * Serialized panel drop spec under the finger during a header touch drag,
   * for drop-zone highlighting. Null when no drag is in flight.
   */
  readonly panelDropHover?: string | null;
  /**
   * Address of the key under the finger during a header touch drag, for
   * drop-target highlighting. Undefined when no drag is in flight.
   */
  readonly dropHoverAddress?: string | null;
}

/** Drag operations the builder pane exposes to TouchGallery. */
export interface BuilderPaneDragApi {
  readonly openPlacement: (letter: string, address: string) => void;
  readonly dropTrayOnPanel: (letter: string, spec: PanelDropSpec) => void;
}

/** What can be dropped onto a subkey-panel area: a tray letter or a subkey chip. */
export type SubkeyDropSource =
  | { type: "tray"; letter: string }
  | { type: "subkey"; payload: SubkeyDragPayload };

interface SubKeySelection {
  readonly kind: BuilderSubKeyKind;
  readonly id: string;
}

const FONT = "system-ui, -apple-system, 'Segoe UI', sans-serif";
// Theme-aware chrome via the semantic --app-* tokens (styles/colors.css):
// light values in :root, navy overrides under [data-theme="navy"].
// (2026-11-02: was hard-coded light-only — illegible button text on navy,
// the default theme.)
const TEXT_MAIN = "var(--app-text)";
const TEXT_DIM = "var(--app-text-muted)";
const BORDER = "var(--app-border)";
const BG_CARD = "var(--app-surface)";
const BG_CANVAS = "var(--app-surface-2)";
const ACCENT = "var(--app-accent)";
const SP_COLORS: Record<number, { bg: string; fg: string; border: string }> = {
  // Keycap colors follow the theme via semantic tokens (2026-11-02).
  // sp semantics: 0 normal, 1 special, 2 special-active, 8 deadkey, 9 blank,
  // 10 spacer.
  0: {
    bg: "var(--app-surface)",
    fg: "var(--app-text)",
    border: "var(--app-border-strong)",
  },
  1: {
    bg: "var(--app-accent-bg)",
    fg: "var(--app-accent-text)",
    border: "var(--app-accent)",
  },
  2: {
    bg: "var(--app-accent)",
    fg: "var(--app-text-on-accent)",
    border: "var(--app-accent)",
  },
  8: {
    bg: "var(--app-warning-bg)",
    fg: "var(--app-warning-text)",
    border: "var(--app-warning-border)",
  },
  9: {
    bg: "var(--app-surface-2)",
    fg: "var(--app-text-muted)",
    border: "var(--app-border)",
  },
  10: { bg: "transparent", fg: "transparent", border: "transparent" },
};

const MINIMAL_MODIFIER_COMBOS = ["default", "shift", "rightalt", "rightalt-shift", "caps"];

function spColor(sp: number | undefined): { bg: string; fg: string; border: string } {
  return SP_COLORS[sp ?? 0] ?? SP_COLORS[0]!;
}

export function TouchBuilderPane(props: TouchBuilderPaneProps) {
  const { t } = useLingui();
  const {
    layout,
    activePlatformId,
    onSelectPlatform,
    activeLayerId,
    onSelectLayer,
    selectedKeyAddress,
    onSelectKey,
    selectedKeyAddresses,
    onSelectKeys,
    commitOp,
    groupCommits,
    fontFaceUrl,
    fontFaceFamily,
    trayLetter,
    onSelectTrayLetter,
    onTrayReturnsChange,
    onRegisterDragApi,
    panelDropHover,
    dropHoverAddress,
  } = props;
  const groupAction = (run: () => void): void => (groupCommits !== undefined ? groupCommits(run) : run());

  // Load the keyboard's font into the document so keycaps render in the real
  // typeface. TIKE rendered keycaps in the platform's configured font; the
  // port was using the UI font, which shows tofu for scripts the UI font
  // lacks (the reported "weird font artifacts").
  useEffect(() => {
    if (fontFaceUrl === undefined || fontFaceFamily === undefined) return;
    if (typeof FontFace === "undefined" || typeof document === "undefined") return;
    const fonts = (document as Document).fonts;
    if (!fonts) return;
    let cancelled = false;
    let loaded: FontFace | null = null;
    const face = new FontFace(fontFaceFamily, `url(${fontFaceUrl})`);
    face.load().then(
      (f) => {
        if (cancelled) return;
        loaded = f;
        fonts.add(f);
      },
      () => {
        /* keep the system fallback stack */
      },
    );
    return () => {
      cancelled = true;
      if (loaded !== null) fonts.delete(loaded);
    };
  }, [fontFaceUrl, fontFaceFamily]);

  // Keycap typeface: the touch layout's per-platform configured `font`
  // (TIKE's Keyboard Font dialog), then the loaded keyboard font, then the
  // system stack. UI chrome keeps using FONT.
  const activePlatformFont = layout?.platforms.find((p) => p.id === activePlatformId)?.font;
  const keycapFont = keycapFontFamily(activePlatformFont, fontFaceFamily);

  // Narrow viewports skip the default inter-key margin — only an explicitly
  // set `pad` still separates keys (2026-11-02). Vertical rhythm is untouched.
  const isNarrow = useIsNarrow();
  const padUnits = (key: TouchKeyIR): number =>
    isNarrow ? (key.pad ?? 0) : (key.pad ?? BUILDER_KEY_MARGIN);

  // Per-platform presentation memory (TIKE `lastPresentations`).
  const [presentations, setPresentations] = useState<Record<string, string>>({});
  const [subSel, setSubSel] = useState<SubKeySelection | null>(null);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [fieldEpoch, setFieldEpoch] = useState(0);
  // Placement modal state. The tray itself (bar + tap selection + demoted
  // letters) lives in TouchGallery's locked header — see props.
  const [placement, setPlacement] = useState<{
    letter: string;
    address: string;
    key: TouchKeyIR;
  } | null>(null);
  const [resizeDrag, setResizeDrag] = useState<{
    address: string;
    startClientX: number;
    startWidthUnits: number;
    previewWidthUnits: number;
    xscale: number;
  } | null>(null);
  const dragSrcRef = useRef<string | null>(null);
  // Item 4: dragging a key over a layer tab dwells, then the display jumps
  // to that layer so the key can be dropped there. One timer at a time;
  // leaving the tab (or dropping) cancels it.
  const layerDwellTimer = useRef<{ id: string; timer: number } | null>(null);
  const clearLayerDwell = (): void => {
    if (layerDwellTimer.current !== null) {
      clearTimeout(layerDwellTimer.current.timer);
      layerDwellTimer.current = null;
    }
  };
  useEffect(() => clearLayerDwell, []);

  const openPlacement = (letter: string, address: string): void => {
    if (layout === null) return;
    const resolved = resolveBuilderKey(layout, address);
    if (resolved === undefined) return;
    setPlacement({ letter, address, key: resolved.key });
  };

  // A tray letter or dragged subkey dropped onto a subkey-panel area of the
  // SELECTED key. Tray letters place directly (no modal): longpress appends,
  // flick upserts its direction (displaced glyph back to the tray, never
  // silently demoted), multitap fills 2x then 3x, replacing 3x when full.
  // Subkey chips reorder (longpress/multitap) or move between flick
  // directions (swap when occupied). One undo batch via sequential commits.
  const applyPanelDrop = (source: SubkeyDropSource, spec: PanelDropSpec): void => {
    if (layout === null || selectedKeyAddress === null) return;
    const resolved = resolveBuilderKey(layout, selectedKeyAddress);
    if (resolved === undefined) return;
    const plan =
      source.type === "tray"
        ? buildPanelDropOps(selectedKeyAddress, resolved.key, source.letter, spec, mintBuilderKeyId(layout))
        : buildSubkeyMoveOps(
            selectedKeyAddress,
            resolved.key,
            source.payload,
            spec,
            mintBuilderKeyId(layout),
          );
    if (plan.ops.length === 0) return;
    groupAction(() => {
      for (const op of plan.ops) {
        if (!commitOp(op)) break;
      }
    });
    if (source.type === "subkey") {
      // A cross-kind move leaves the moved entry under a different kind (and
      // possibly a fresh id) — the subkey selection would dangle, so clear
      // it. Within-family moves keep the entry resolvable and keep it.
      const crossKind =
        (source.payload.kind === "sk" && spec.area !== "lp") ||
        (source.payload.kind === "flick" && spec.area !== "flick") ||
        (source.payload.kind === "multitap" && spec.area !== "mt");
      if (crossKind) setSubSel(null);
    }
    if (plan.displacedBackToTray !== null) {
      const back = plan.displacedBackToTray;
      onTrayReturnsChange((prev) => (prev.includes(back) ? prev : [...prev, back]));
    }
    if (source.type === "tray") {
      // The placed letter leaves the tray.
      onTrayReturnsChange((prev) => prev.filter((c) => c !== source.letter));
      onSelectTrayLetter(null);
    }
  };

  const dropTrayOnPanel = (letter: string, spec: PanelDropSpec): void =>
    applyPanelDrop({ type: "tray", letter }, spec);

  // The gallery's drags start in the locked header, outside this pane —
  // register the drag API so drops can land here. Ref-indirected so the
  // registered closures never go stale across renders.
  const dragApiRef = useRef<BuilderPaneDragApi | null>(null);
  dragApiRef.current = { openPlacement, dropTrayOnPanel };
  useEffect(() => {
    onRegisterDragApi?.({
      openPlacement: (letter, address) => dragApiRef.current?.openPlacement(letter, address),
      dropTrayOnPanel: (letter, spec) => dragApiRef.current?.dropTrayOnPanel(letter, spec),
    });
  }, [onRegisterDragApi]);

  const handlePlacementConfirm = (choice: PlacementChoice): void => {
    if (placement === null || layout === null) return;
    const { letter, address, key } = placement;
    const plan = buildPlacementOps(address, key, letter, choice, mintBuilderKeyId(layout));
    // One undo batch via sequential commits (slice-spec §4).
    groupAction(() => {
      for (const op of plan.ops) {
        if (!commitOp(op)) break;
      }
    });
    if (plan.displacedBackToTray !== null) {
      const back = plan.displacedBackToTray;
      onTrayReturnsChange((prev) => (prev.includes(back) ? prev : [...prev, back]));
    }
    // The placed letter leaves the tray: coverage recomputes unplacedChars,
    // and a returned-then-placed letter is dropped from trayReturns here.
    onTrayReturnsChange((prev) => prev.filter((c) => c !== letter));
    setPlacement(null);
    onSelectTrayLetter(null);
  };

  // Subkey selection is secondary to the main-key selection — reset it
  // whenever the main selection changes (never a parallel scheme).
  useEffect(() => {
    setSubSel(null);
  }, [selectedKeyAddress]);

  const platform = layout?.platforms.find((p) => p.id === activePlatformId) ?? undefined;
  const layer = platform?.layers.find((l) => l.id === activeLayerId) ?? undefined;
  const presentationId =
    (activePlatformId !== null && presentations[activePlatformId]) ||
    (activePlatformId !== null ? defaultBuilderPresentationId(activePlatformId) : "desktop");
  const presentation = builderPresentationById(presentationId);

  // The selected key, resolved against the CURRENT layout — only when it
  // lives on the active platform+layer.
  const selected =
    layout !== null && selectedKeyAddress !== null
      ? resolveBuilderKey(layout, selectedKeyAddress)
      : undefined;
  const selectedOnActiveLayer =
    selected !== undefined &&
    selected.parts.platform === activePlatformId &&
    selected.parts.layerId === activeLayerId
      ? selected
      : undefined;

  // Row-major key views with stable occurrence addresses (the same walk
  // `resolveKeyAddress` counts in).
  const rowViews: { key: TouchKeyIR; address: string }[][] = (() => {
    if (layer === undefined || activePlatformId === null) return [];
    const nextOccurrence = createKeyOccurrenceCounter();
    return layer.rows.map((row) =>
      row.keys.map((key) => ({
        key,
        address: touchKeyAddress(activePlatformId, layer.id, key.id, nextOccurrence(key.id)),
      })),
    );
  })();

  // Multi-selection, scoped to the active platform+layer (#2596 item 2):
  // the stored set may transiently hold addresses from another layer (a
  // layer switch, or a move/copy follow that legitimately leaves the anchor
  // elsewhere) — only the on-layer members are selectable, displayed, or
  // bulk-edited. Every gesture below operates on this filtered list, so a
  // stale address can never re-enter through a toggle or a range.
  const flatAddresses = rowViews.flat().map((v) => v.address);
  const selectedOnLayer = selectedKeyAddresses.filter((a) =>
    flatAddresses.includes(a),
  );
  const selectedOnLayerSet = new Set(selectedOnLayer);

  // Row geometry for the scaler. On narrow viewports the last key of shorter
  // rows stretches so every row matches the widest — like a real mobile
  // keyboard (2026-11-02).
  const geomRows: { id: string; width: number; pad: number }[][] = rowViews.map((row) =>
    row.map(({ key }) => ({
      id: key.id,
      width: key.width ?? BUILDER_DEFAULT_KEY_WIDTH,
      pad: padUnits(key),
    })),
  );
  const stretchUnits = new Map<string, number>();
  if (isNarrow) {
    const rowWidths = geomRows.map((keys) => keys.reduce((sum, k) => sum + k.width + k.pad, 0));
    const maxWidth = Math.max(0, ...rowWidths);
    rowViews.forEach((row, i) => {
      const deficit = maxWidth - (rowWidths[i] ?? 0);
      const lastEntry = row[row.length - 1];
      const lastGeom = geomRows[i]?.[geomRows[i].length - 1];
      if (deficit > 0 && lastEntry !== undefined && lastGeom !== undefined) {
        lastGeom.width += deficit;
        stretchUnits.set(lastEntry.address, deficit);
      }
    });
  }

  const scale = computeBuilderScale(
    geomRows.map((keys) => ({ keys })),
    presentation,
  );

  if (layout === null || platform === undefined || layer === undefined) {
    return (
      <div data-testid="touch-builder-pane" style={{ padding: 24 }}>
        <p style={{ margin: 0, fontSize: 13, color: TEXT_DIM, fontFamily: FONT }}>
          {t({
            id: "editor.assignLoop.touch.builder.notReady",
            message: "The key layout isn't ready yet.",
          })}
        </p>
      </div>
    );
  }

  const layerIds = platform.layers.map((l) => l.id);
  const _layerOverrideOptions = Array.from(
    new Set([...layerIds, ...MINIMAL_MODIFIER_COMBOS]),
  );

  const commitSet = (
    address: string,
    fields: Extract<PendingKeyEditOperation, { kind: "set" }>["fields"],
  ): boolean => commitOp({ address, kind: "set", fields });

  // -- wedge controls -------------------------------------------------------
  const handleAddKey = (position: "before" | "after"): void => {
    if (selectedOnActiveLayer === undefined || selectedKeyAddress === null) return;
    const id = mintBuilderKeyId(layout);
    // `commitKeyEditOp` follows the selection to the new key on `add`.
    commitOp({
      address: selectedKeyAddress,
      kind: "add",
      position,
      key: { id, text: "", sp: 0 },
    });
  };

  const handleDeleteKey = (): void => {
    if (selectedOnActiveLayer === undefined || selectedKeyAddress === null) return;
    // TIKE selects a neighbour after deletion — the committed address would
    // otherwise dangle.
    const flat = rowViews.flat();
    const idx = flat.findIndex((v) => v.address === selectedKeyAddress);
    const neighbour =
      idx >= 0 ? (flat[idx + 1] ?? flat[idx - 1] ?? null) : null;
    if (commitOp({ address: selectedKeyAddress, kind: "remove", outcome: "reflow" })) {
      onSelectKey(neighbour?.address ?? null);
    }
  };

  // -- move key to another layer (item 2) -------------------------------------
  const handleMoveKeyToLayer = (toLayer: string): void => {
    if (selectedOnActiveLayer === undefined || selectedKeyAddress === null) return;
    if (toLayer === activeLayerId) return;
    // `commitKeyEditOp` follows the selection to the moved key (TouchGallery).
    commitOp({ address: selectedKeyAddress, kind: "moveToLayer", toLayer });
  };

  // -- copy key to another layer (#2596 item 1) ------------------------------
  const handleCopyKeyToLayer = (toLayer: string): void => {
    if (selectedOnActiveLayer === undefined || selectedKeyAddress === null) return;
    if (toLayer === activeLayerId) return;
    // `copyToLayer` clones the whole key (subkeys included) onto the target
    // layer. Switch the display there so the author sees the copy;
    // selection-follow in TouchGallery tracks its address.
    if (commitOp({ address: selectedKeyAddress, kind: "copyToLayer", toLayer })) {
      onSelectLayer(toLayer);
    }
  };

  // -- drag reorder → direction-step `move` ops, or `moveToLayer` --------------
  const handleDropOnKey = (targetAddress: string): void => {
    const srcAddress = dragSrcRef.current;
    dragSrcRef.current = null;
    clearLayerDwell();
    if (srcAddress === null || srcAddress === targetAddress) return;
    const srcParts = parseTouchKeyAddress(srcAddress);
    const dstParts = parseTouchKeyAddress(targetAddress);
    // Cross-layer drop (after a layer-tab dwell switch, item 4): the key
    // moves to the target layer anchored at the drop key. Identity, subkeys
    // and provenance travel with it — `moveToLayer` splices, never rebuilds.
    if (
      srcParts !== undefined &&
      dstParts !== undefined &&
      (srcParts.platform !== dstParts.platform || srcParts.layerId !== dstParts.layerId)
    ) {
      commitOp({
        address: srcAddress,
        kind: "moveToLayer",
        toLayer: dstParts.layerId,
        anchorAddress: targetAddress,
        position: "before",
      });
      return;
    }
    const flat = rowViews.flat();
    const srcIdx = flat.findIndex((v) => v.address === srcAddress);
    const dstIdx = flat.findIndex((v) => v.address === targetAddress);
    if (srcIdx === -1 || dstIdx === -1) return;
    // Locate (row, index) in the CURRENT view for source and target.
    let srcRow = -1, srcCol = -1, dstRow = -1, dstCol = -1;
    rowViews.forEach((row, r) =>
      row.forEach((v, c) => {
        if (v.address === srcAddress) { srcRow = r; srcCol = c; }
        if (v.address === targetAddress) { dstRow = r; dstCol = c; }
      }),
    );
    if (srcRow === -1 || dstRow === -1) return;
    const steps: ("up" | "down" | "left" | "right")[] = [];
    let r = srcRow, c = srcCol;
    // Vertical moves first (the applier clamps the landing index into the
    // target row), then horizontal — each step re-resolves against the
    // post-commit state, so a direction never goes stale.
    while (r < dstRow) {
      steps.push("down"); r++;
      c = Math.min(c, Math.max(0, rowViews[r]!.length - 1));
    }
    while (r > dstRow) {
      steps.push("up"); r--;
      c = Math.min(c, Math.max(0, rowViews[r]!.length - 1));
    }
    while (c < dstCol) { steps.push("right"); c++; }
    while (c > dstCol) { steps.push("left"); c--; }
    // Never emit no-op moves: an empty step list commits nothing.
    for (const direction of steps) {
      commitOp({ address: srcAddress, kind: "move", direction });
    }
  };

  // -- layer-tab dwell + drop (item 4) ----------------------------------------
  // Holding a dragged key over a layer tab switches the display to that
  // layer after a short dwell, so the key can be dropped where wanted.
  // Dropping directly on the tab moves the key to that layer (appended).
  const handleLayerTabDragOver = (e: React.DragEvent, id: string): void => {
    if (dragSrcRef.current === null) return; // no key drag in flight
    if (id === activeLayerId) {
      clearLayerDwell();
      return;
    }
    e.preventDefault();
    if (layerDwellTimer.current?.id === id) return;
    clearLayerDwell();
    layerDwellTimer.current = {
      id,
      timer: window.setTimeout(() => {
        layerDwellTimer.current = null;
        onSelectLayer(id);
      }, 600),
    };
  };
  const handleLayerTabDrop = (e: React.DragEvent, id: string): void => {
    e.preventDefault();
    e.stopPropagation();
    clearLayerDwell();
    const srcAddress = dragSrcRef.current;
    dragSrcRef.current = null;
    if (srcAddress === null) return;
    const srcParts = parseTouchKeyAddress(srcAddress);
    if (srcParts === undefined) return;
    if (srcParts.layerId === id && srcParts.platform === activePlatformId) return;
    commitOp({ address: srcAddress, kind: "moveToLayer", toLayer: id });
  };

  // -- resize (east handle) → `set` {width} ----------------------------------
  const handleResizePointerDown = (
    e: React.PointerEvent<HTMLDivElement>,
    address: string,
    key: TouchKeyIR,
  ): void => {
    e.stopPropagation();
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setResizeDrag({
      address,
      startClientX: e.clientX,
      startWidthUnits: key.width ?? BUILDER_DEFAULT_KEY_WIDTH,
      previewWidthUnits: key.width ?? BUILDER_DEFAULT_KEY_WIDTH,
      xscale: scale.xscale,
    });
  };
  const handleResizePointerMove = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (resizeDrag === null) return;
    const deltaUnits = (e.clientX - resizeDrag.startClientX) / resizeDrag.xscale;
    const preview = Math.round(resizeDrag.startWidthUnits + deltaUnits);
    setResizeDrag({ ...resizeDrag, previewWidthUnits: preview });
  };
  const handleResizePointerUp = (): void => {
    if (resizeDrag === null) return;
    const { address, previewWidthUnits } = resizeDrag;
    setResizeDrag(null);
    // Snap to the 10-unit alignment grid (#2596 item 4), clamped to TIKE's
    // 10–500 range; the studio validates width as integer > 0.
    const width = snapBuilderWidth(previewWidthUnits);
    const resolved = resolveBuilderKey(layout, address);
    if (resolved === undefined || resolved.key.width === width) return;
    commitSet(address, { width });
  };

  // -- template apply ---------------------------------------------------------
  const handleApplyTemplate = (source: BuilderTemplateSource): void => {
    let template;
    try {
      template = parseBuilderTemplate(source.jsonText);
    } catch {
      setTemplateOpen(false);
      return;
    }
    const ops = buildTemplateApplyOps(layout, template);
    // One undo batch via sequential `commitKeyEdit` calls (slice-spec §4).
    groupAction(() => {
      for (const op of ops) {
        commitOp(op);
      }
    });
    setTemplateOpen(false);
  };

  const selectedKey = selectedOnActiveLayer?.key;

  // The on-layer members of the multi-selection, resolved against the
  // CURRENT layout — the bulk-commit population (see `handleBulkSet`).
  // `layout` is non-null here (the early return above).
  const selectedEntriesOnLayer = selectedOnLayer
    .map((address) => {
      const resolved = resolveBuilderKey(layout, address);
      return resolved === undefined
        ? undefined
        : { address, key: resolved.key };
    })
    .filter(
      (e): e is { address: string; key: TouchKeyIR } => e !== undefined,
    );
  const showMulti = selectedEntriesOnLayer.length >= 2;

  // -- bulk apply (#2596 item 2) -------------------------------------------
  // One op per key, sequential commits = one undo batch (slice-spec §4,
  // same pattern as template apply). Family-apply is suppressed: a
  // width/pad `set` is family-parallelism-affecting, so each commit would
  // otherwise pop the family-apply dialog once per key — and bulk apply IS
  // the fan-out. Stop at the first failed commit; the selection stays so
  // the author can retry.
  const handleBulkSet = (fields: BulkKeyEditFields): void => {
    const ops = buildBulkKeyEditOps(selectedEntriesOnLayer, fields);
    groupAction(() => {
      for (const op of ops) {
        if (!commitOp(op, { offerFamilyApply: false })) break;
      }
    });
  };

  // Right-edge position of the selected key (#2596 item 4): the running
  // width+pad sum of its row up to and including it, in units — the number
  // an author lines rows up against. `geomRows` already carries the
  // narrow-aware pad, so this matches the rendered row.
  const selectedRowIndex = rowViews.findIndex((row) =>
    row.some((v) => v.address === selectedKeyAddress),
  );
  const selectedColIndex =
    selectedRowIndex >= 0
      ? rowViews[selectedRowIndex]!.findIndex((v) => v.address === selectedKeyAddress)
      : -1;
  const selectedRightEdge =
    selectedRowIndex >= 0 && selectedColIndex >= 0
      ? rightEdgeUnits(geomRows[selectedRowIndex]!, selectedColIndex)
      : null;
  const _selectedSubKeyEntry: BuilderSubKeyEntry | undefined =
    selectedKey !== undefined && subSel !== null
      ? subKeyEntriesOf(selectedKey)[subSel.kind].find((e) =>
          e.kind === "flick" ? e.ref.id === subSel.id : e.key.id === subSel.id,
        )
      : undefined;

  // Key canvas as a render function so the wide folder-tab layout (item 6)
  // can place it beside the vertical layer tabs.
  const renderCanvas = (folderTabs: boolean): React.ReactNode => (
    <>
          {/* Key canvas — TIKE geometry: 100 units/row, default width 100,
              keyMargin 15 gap, widest row sets the scale. */}
          {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions -- background click deselects; keyboard users use Escape on the selected key */}
          <div
            data-testid="touch-builder-canvas"
            role="group"
            aria-label={t({
              id: "editor.assignLoop.touch.builder.canvasLabel",
              message: "Touch layout canvas",
            })}
            onClick={() => onSelectKey(null)}
            style={{
              background: BG_CANVAS,
              border: `1px solid ${BORDER}`,
              borderRadius: folderTabs ? "0 8px 8px 8px" : 8,
              padding: 12,
              overflowX: "auto",
            }}
          >
            {rowViews.map((row, r) => (
              <div key={r} style={{ display: "flex", alignItems: "stretch" }}>
                {row.map(({ key, address }) => {
                  const isSelected = selectedOnLayerSet.has(address);
                  const colors = spColor(key.sp);
                  const isSpacer = (key.sp ?? 0) === 10;
                  const widthUnits =
                    resizeDrag !== null && resizeDrag.address === address
                      ? resizeDrag.previewWidthUnits
                      : (key.width ?? BUILDER_DEFAULT_KEY_WIDTH) + (stretchUnits.get(address) ?? 0);
                  const widthPx = Math.max(8, widthUnits * scale.xscale);
                  // Touch-drag drop target: the key under the finger lights up so
                  // the landing spot is obvious while the ghost floats above.
                  const isDropTarget = dropHoverAddress === address;
                  return (
                    <div
                      key={address}
                      role="button"
                      tabIndex={0}
                      data-testid="touch-builder-key"
                      data-address={address}
                      aria-label={key.text || key.id}
                      aria-pressed={isSelected}
                      draggable
                      onClick={(e) => {
                        e.stopPropagation();
                        if (trayLetter !== null) {
                          openPlacement(trayLetter, address);
                        } else if (e.ctrlKey || e.metaKey) {
                          // Ctrl/Cmd+click toggles this key in the
                          // multi-selection (#2596 item 2). The anchor
                          // becomes the toggled key when added; when
                          // removed, the last remaining key (else null).
                          const next = toggleKeySelection(selectedOnLayer, address);
                          onSelectKeys(
                            next,
                            next.includes(address)
                              ? address
                              : (next[next.length - 1] ?? null),
                          );
                        } else if (e.shiftKey) {
                          // Shift+click extends the selection from the
                          // anchor, row-major inclusive.
                          const next = rangeKeySelection(
                            flatAddresses,
                            selectedKeyAddress,
                            address,
                          );
                          onSelectKeys(next, address);
                        } else {
                          onSelectKey(address);
                        }
                      }}
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        // Double-click with nextlayer jumps to that layer —
                        // navigation only (TIKE `selectLayerByName`).
                        const target = key.nextlayer;
                        if (target !== undefined && target !== "" && layerIds.includes(target)) {
                          onSelectLayer(target);
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          if (e.ctrlKey || e.metaKey) {
                            // Keyboard twin of Ctrl+click (spec 056: a
                            // selection feature needs a keyboard path).
                            const next = toggleKeySelection(selectedOnLayer, address);
                            onSelectKeys(
                              next,
                              next.includes(address)
                                ? address
                                : (next[next.length - 1] ?? null),
                            );
                          } else if (e.shiftKey) {
                            // Keyboard twin of Shift+click.
                            const next = rangeKeySelection(
                              flatAddresses,
                              selectedKeyAddress,
                              address,
                            );
                            onSelectKeys(next, address);
                          } else {
                            onSelectKey(address);
                          }
                        } else if (e.key === "Escape") {
                          // Escape on a focused key clears the whole
                          // multi-selection (the pane comment's promised
                          // keyboard deselect, which had no handler).
                          if (selectedOnLayer.length > 0) {
                            e.preventDefault();
                            onSelectKeys([], null);
                          }
                        }
                      }}
                      onDragStart={(e) => {
                        dragSrcRef.current = address;
                        e.dataTransfer.effectAllowed = "move";
                        try {
                          e.dataTransfer.setData("text/plain", address);
                        } catch {
                          /* some browsers restrict setData to specific types */
                        }
                      }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = "move";
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleDropOnKey(address);
                      }}
                      onDragEnd={() => {
                        dragSrcRef.current = null;
                      }}
                      style={{
                        position: "relative",
                        flex: "0 0 auto",
                        width: `${widthPx}px`,
                        height: `${BUILDER_ROW_HEIGHT * scale.yscale}px`,
                        marginLeft: `${padUnits(key) * scale.xscale}px`,
                        marginTop: `${BUILDER_KEY_MARGIN * scale.yscale}px`,
                        background: isSpacer ? "transparent" : colors.bg,
                        color: colors.fg,
                        border: isSelected
                          ? `2px solid ${ACCENT}`
                          : `1px ${isSpacer ? "dashed" : "solid"} ${colors.border}`,
                        borderRadius: 6,
                        boxSizing: "border-box",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        cursor: "pointer",
                        opacity: isSpacer ? 0.45 : 1,
                        outline: isDropTarget ? `3px solid ${ACCENT}` : "none",
                        outlineOffset: isDropTarget ? 1 : 0,
                        fontFamily: FONT,
                        overflow: "hidden",
                      }}
                    >
                      <span
                        style={{
                          fontSize: 10,
                          color: TEXT_DIM,
                          maxWidth: "100%",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {key.id}
                      </span>
                      <span
                        style={{
                          fontSize: 15,
                          fontWeight: 600,
                          fontFamily: keycapFont,
                          maxWidth: "100%",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {key.text || " "}
                      </span>
                      {key.hint !== undefined && key.hint !== "" && (
                        <span
                          style={{
                            position: "absolute",
                            right: 3,
                            bottom: 2,
                            fontSize: 9,
                            color: TEXT_DIM,
                          }}
                        >
                          {key.hint}
                        </span>
                      )}
                      {/* TIKE corner badges: subkey annotations. */}
                      <span
                        style={{ position: "absolute", left: 3, top: 2, fontSize: 9, color: TEXT_DIM }}
                        title={[
                          (key.sk?.length ?? 0) > 0
                            ? t({
                                id: "editor.assignLoop.touch.builder.hasLongpress",
                                message: "Has longpress keys",
                              })
                            : "",
                          key.flick !== undefined && Object.keys(key.flick).length > 0
                            ? t({
                                id: "editor.assignLoop.touch.builder.hasFlick",
                                message: "Has flick keys",
                              })
                            : "",
                          (key.multitap?.length ?? 0) > 0
                            ? t({
                                id: "editor.assignLoop.touch.builder.hasMultitap",
                                message: "Has multitap keys",
                              })
                            : "",
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      >
                        {(key.sk?.length ?? 0) > 0 ? "◈" : ""}
                        {key.flick !== undefined && Object.keys(key.flick).length > 0 ? "✥" : ""}
                        {(key.multitap?.length ?? 0) > 0 ? "⋯" : ""}
                      </span>
                      {/* East resize handle (TIKE `makeKeyResizable`) — on the
                          selected key only, like TIKE. */}
                      {isSelected && !isSpacer && (
                        <div
                          role="separator"
                          aria-orientation="vertical"
                          aria-label={t({
                            id: "editor.assignLoop.touch.builder.resizeHandleLabel",
                            message: "Resize key",
                          })}
                          data-testid="touch-builder-resize-handle"
                          onPointerDown={(e) => handleResizePointerDown(e, address, key)}
                          onPointerMove={handleResizePointerMove}
                          onPointerUp={handleResizePointerUp}
                          onPointerCancel={() => setResizeDrag(null)}
                          style={{
                            position: "absolute",
                            right: 0,
                            top: 0,
                            bottom: 0,
                            width: 8,
                            cursor: "ew-resize",
                            background: "transparent",
                          }}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          {/* Multi-select hint (#2596 item 2): the modifiers are not
              discoverable from the keys themselves. */}
          <p style={{ margin: "8px 0 0", fontSize: 12, color: TEXT_DIM, fontFamily: FONT }}>
            {t({
              id: "editor.assignLoop.touch.builder.multiSelectHint",
              message:
                "Ctrl+click (or Ctrl+Enter) adds a key to the selection; Shift+click selects a range.",
            })}
          </p>
    </>
  );

  // One layer tab button. `folderTab` renders the wide-screen folder-tab
  // look (item 6); otherwise the compact horizontal tab. Both carry the
  // drag-dwell handlers (item 4): holding a dragged key over a tab switches
  // the display to that layer, and dropping on the tab moves the key there.
  const renderLayerTab = (id: string, folderTab: boolean): React.ReactNode => {
    const active = id === activeLayerId;
    return (
      <button
        key={id}
        type="button"
        role="tab"
        aria-selected={active}
        data-testid={`touch-builder-layer-${id}`}
        onClick={() => onSelectLayer(id)}
        onDragOver={(e) => handleLayerTabDragOver(e, id)}
        onDragLeave={clearLayerDwell}
        onDrop={(e) => handleLayerTabDrop(e, id)}
        style={folderTab ? folderTabStyle(active) : tabStyle(active)}
      >
        {id}
      </button>
    );
  };

  const layerAriaLabel = t({
    id: "editor.assignLoop.touch.builder.layerLabel",
    message: "Layer",
  });

  return (
    <div
      data-testid="touch-builder-pane"
      style={{ display: "flex", flexDirection: "column", gap: 12 }}
    >
      {/* Platform switcher + presentation selector (TIKE platform-controls). */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div
          role="tablist"
          aria-label={t({
            id: "editor.assignLoop.touch.builder.platformLabel",
            message: "Platform",
          })}
          style={{ display: "flex", gap: 4 }}
        >
          {layout.platforms.map((p) => (
            <button
              key={p.id}
              type="button"
              role="tab"
              aria-selected={p.id === activePlatformId}
              data-testid={`touch-builder-platform-${p.id}`}
              onClick={() => onSelectPlatform(p.id)}
              style={tabStyle(p.id === activePlatformId)}
            >
              {p.id}
            </button>
          ))}
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: TEXT_DIM, fontFamily: FONT }}>
          {t({
            id: "editor.assignLoop.touch.builder.presentationLabel",
            message: "Preview",
          })}
          <select
            data-testid="touch-builder-presentation"
            value={presentationId}
            onChange={(e) => {
              if (activePlatformId !== null) {
                setPresentations((prev) => ({ ...prev, [activePlatformId]: e.target.value }));
              }
            }}
            style={selectStyle}
          >
            {BUILDER_PRESENTATIONS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          data-testid="touch-builder-template-button"
          onClick={() => setTemplateOpen(true)}
          style={ghostBtn}
        >
          {t({
            id: "editor.assignLoop.touch.builder.templateButton",
            message: "Apply template…",
          })}
        </button>
      </div>

      {/* Layer switcher — folder tabs on wide screens (item 6), a horizontal
          tab row on narrow ones. Drag-dwell (item 4) lives on the tabs. */}
      {isNarrow ? (
        <div
          role="tablist"
          aria-label={layerAriaLabel}
          style={{ display: "flex", gap: 4, flexWrap: "wrap" }}
        >
          {layerIds.map((id) => renderLayerTab(id, false))}
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "stretch" }}>
          <div
            role="tablist"
            aria-label={layerAriaLabel}
            aria-orientation="vertical"
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 2,
              paddingTop: 14,
              zIndex: 1,
            }}
          >
            {layerIds.map((id) => renderLayerTab(id, true))}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>{renderCanvas(true)}</div>
        </div>
      )}
      {isNarrow && renderCanvas(false)}

      {/* Key section — fields, wedge controls, move-to-layer, and the nested
          subkey child block. One op per commit (TIKE `saveOnce` semantics).
          With ≥2 keys selected (#2596 item 2) the multi-key inspector
          replaces the single-key inspector wholesale. */}
      {selectedOnActiveLayer !== undefined && selectedKey !== undefined && (
        <section
          aria-label={
            showMulti
              ? t({
                  id: "editor.assignLoop.touch.builder.multiKeySection",
                  message: "Multiple keys",
                })
              : t({
                  id: "editor.assignLoop.touch.builder.keySection",
                  message: "Key",
                })
          }
          style={sectionStyle}
        >
          {showMulti ? (
            <MultiKeyToolbar
              entries={selectedEntriesOnLayer}
              layerIds={layerIds}
              layerOverrideOptions={_layerOverrideOptions}
              fieldEpoch={fieldEpoch}
              onInvalid={() => setFieldEpoch((n) => n + 1)}
              commitBulk={handleBulkSet}
              onClearSelection={() => onSelectKeys([], null)}
            />
          ) : (
            <>
          <KeyToolbar
            address={selectedKeyAddress!}
            targetKey={selectedKey}
            layerIds={layerIds}
            layerOverrideOptions={_layerOverrideOptions}
            fieldEpoch={fieldEpoch}
            onInvalid={() => setFieldEpoch((n) => n + 1)}
            commitOp={commitOp}
            keycapFont={keycapFont}
          />

          {/* Wedge controls (TIKE add-key-left/right, delete) — item 1: at
              the bottom of the Key section's own box, no longer disconnected
              below it. */}
          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            <button
              type="button"
              data-testid="touch-builder-add-left"
              onClick={() => handleAddKey("before")}
              style={ghostBtn}
            >
              {t({
                id: "editor.assignLoop.touch.builder.addKeyLeft",
                message: "Add key left",
              })}
            </button>
            <button
              type="button"
              data-testid="touch-builder-add-right"
              onClick={() => handleAddKey("after")}
              style={ghostBtn}
            >
              {t({
                id: "editor.assignLoop.touch.builder.addKeyRight",
                message: "Add key right",
              })}
            </button>
            <button
              type="button"
              data-testid="touch-builder-delete-key"
              onClick={handleDeleteKey}
              style={ghostBtn}
            >
              {t({
                id: "editor.assignLoop.touch.builder.deleteKey",
                message: "Delete key",
              })}
            </button>
          </div>

          {/* Move key to another layer — item 2. */}
          <KeyToLayerControl
            currentLayerId={activeLayerId}
            layerIds={layerIds}
            testIdPrefix="touch-builder-move-layer"
            label={t({
              id: "editor.assignLoop.touch.builder.moveKeyToLabel",
              message: "Move key to…",
            })}
            placeholder={t({
              id: "editor.assignLoop.touch.builder.moveKeyToPlaceholder",
              message: "Select layer",
            })}
            applyLabel={t({
              id: "editor.assignLoop.touch.builder.moveKeyToApply",
              message: "Apply",
            })}
            onTransfer={handleMoveKeyToLayer}
          />

          {/* Copy key to another layer — #2596 item 1: the whole key, subkeys
              included, cloned onto the target layer; the original stays. */}
          <KeyToLayerControl
            currentLayerId={activeLayerId}
            layerIds={layerIds}
            testIdPrefix="touch-builder-copy-layer"
            label={t({
              id: "editor.assignLoop.touch.builder.copyKeyToLabel",
              message: "Copy key to…",
            })}
            placeholder={t({
              id: "editor.assignLoop.touch.builder.copyKeyToPlaceholder",
              message: "Select layer",
            })}
            applyLabel={t({
              id: "editor.assignLoop.touch.builder.copyKeyToApply",
              message: "Apply",
            })}
            onTransfer={handleCopyKeyToLayer}
          />

          {/* Right-edge position (#2596 item 4): where this key ends in its
              row, so rows line up without trial and error. */}
          {selectedRightEdge !== null && (
            <p
              data-testid="touch-builder-right-edge"
              style={{ margin: "12px 0 0", fontSize: 12, color: TEXT_DIM, fontFamily: FONT }}
            >
              {t({
                id: "editor.assignLoop.touch.builder.rightEdge",
                message: `Right edge: ${selectedRightEdge} units`,
              })}
            </p>
          )}

          {/* Subkeys — item 3: a visually nested child of the Key section,
              the three groups side by side. */}
          <div style={nestedChildStyle}>
            <SubkeyPanel
              address={selectedKeyAddress!}
              targetKey={selectedKey}
              layerIds={layerIds}
              layerOverrideOptions={_layerOverrideOptions}
              selection={subSel}
              onSelect={setSubSel}
              fieldEpoch={fieldEpoch}
              onInvalid={() => setFieldEpoch((n) => n + 1)}
              commitOp={commitOp}
              layout={layout}
              keycapFont={keycapFont}
              applyPanelDrop={applyPanelDrop}
              panelDropHover={panelDropHover}
              nested
            />
          </div>
            </>
          )}
        </section>
      )}

      {templateOpen && (
        <TemplateDialog
          onClose={() => setTemplateOpen(false)}
          onApply={handleApplyTemplate}
        />
      )}

      {placement !== null && (
        <PlacementModal
          letter={placement.letter}
          targetKey={placement.key}
          keycapFont={keycapFont}
          onClose={() => setPlacement(null)}
          onConfirm={handlePlacementConfirm}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Key toolbar
// ---------------------------------------------------------------------------

function KeyToolbar(props: {
  address: string;
  targetKey: TouchKeyIR;
  layerIds: readonly string[];
  layerOverrideOptions: readonly string[];
  fieldEpoch: number;
  onInvalid: () => void;
  commitOp: (op: PendingKeyEditOperation) => boolean;
  /** Keycap typeface (platform configured font → loaded keyboard font → system). */
  keycapFont: string;
}) {
  const { t } = useLingui();
  const { address, targetKey: key, layerIds, layerOverrideOptions, fieldEpoch, onInvalid, commitOp, keycapFont } = props;
  const set = (fields: Extract<PendingKeyEditOperation, { kind: "set" }>["fields"]): void => {
    commitOp({ address, kind: "set", fields });
  };
  const inputKey = (field: string): string => `${address}:${field}:${fieldEpoch}`;

  // Key-id suggestion (#2596 item 5): a fresh `T_new_N` key whose text is a
  // single plain character can take its id from that text
  // (`suggestKeyIdFromText` — combining marks and multi-character strings
  // get no suggestion, per spec 104 FR-005).
  const suggestedId =
    /^T_new_\d+$/i.test(key.id) ? suggestKeyIdFromText(key.text ?? "") : null;

  const handleSpChange = (value: string): void => {
    const sp = parseInt(value, 10);
    if (sp === 9 || sp === 10) {
      // Key Type → Blank/Spacer is the compound `suppress` op — never split
      // into `set` halves (FR-029c).
      const { spClass, sentinelId } = proposeSuppressFields(
        sp === 9 ? "keycap-hole" : "spacer",
      );
      commitOp({ address, kind: "suppress", spClass, sentinelId });
      return;
    }
    if (sp === 0 || sp === 1 || sp === 2 || sp === 8) {
      set({ sp });
    }
  };

  // Renders the field grid only — the surrounding Key <section> (with the
  // wedge controls, move-to-layer, and nested subkey child block) is
  // composed by the caller (items 1–3).
  return (
    <div style={fieldGridStyle}>
        <LabeledInput
          label={t({ id: "editor.assignLoop.touch.builder.textLabel", message: "Keycap text" })}
          testId="touch-builder-field-text"
          inputKey={inputKey("text")}
          defaultValue={key.text ?? ""}
          glyphFont={keycapFont}
          onCommit={(v) => set({ text: v })}
        />
        <LabeledInput
          label={t({ id: "editor.assignLoop.touch.builder.hintLabel", message: "Hint" })}
          testId="touch-builder-field-hint"
          inputKey={inputKey("hint")}
          defaultValue={key.hint ?? ""}
          glyphFont={keycapFont}
          onCommit={(v) => set({ hint: v })}
        />
        <LabeledInput
          label={t({ id: "editor.assignLoop.touch.builder.widthLabel", message: "Width" })}
          testId="touch-builder-field-width"
          inputKey={inputKey("width")}
          defaultValue={key.width !== undefined ? String(key.width) : ""}
          inputMode="numeric"
          onCommit={(v) => {
            const n = parseInt(v, 10);
            if (!Number.isInteger(n) || n <= 0) { onInvalid(); return; }
            // Snap to the 10-unit alignment grid (#2596 item 4).
            set({ width: snapBuilderWidth(n) });
          }}
        />
        <LabeledInput
          label={t({ id: "editor.assignLoop.touch.builder.padLabel", message: "Left padding" })}
          testId="touch-builder-field-pad"
          inputKey={inputKey("pad")}
          defaultValue={key.pad !== undefined ? String(key.pad) : ""}
          inputMode="numeric"
          onCommit={(v) => {
            const n = parseInt(v, 10);
            if (!Number.isInteger(n) || n < 0) { onInvalid(); return; }
            set({ pad: n });
          }}
        />
        <label style={fieldStyle}>
          <span style={labelStyle}>
            {t({ id: "editor.assignLoop.touch.builder.spLabel", message: "Key type" })}
          </span>
          <select
            data-testid="touch-builder-field-sp"
            value={String(key.sp ?? 0)}
            onChange={(e) => handleSpChange(e.target.value)}
            style={selectStyle}
          >
            <option value="0">{t({ id: "editor.assignLoop.touch.builder.spLetter", message: "Letter" })}</option>
            <option value="1">{t({ id: "editor.assignLoop.touch.builder.spSpecial", message: "Special" })}</option>
            <option value="2">{t({ id: "editor.assignLoop.touch.builder.spSpecialActive", message: "Special (active)" })}</option>
            <option value="8">{t({ id: "editor.assignLoop.touch.builder.spDeadkey", message: "Deadkey" })}</option>
            <option value="9">{t({ id: "editor.assignLoop.touch.builder.spBlank", message: "Blank" })}</option>
            <option value="10">{t({ id: "editor.assignLoop.touch.builder.spSpacer", message: "Spacer" })}</option>
          </select>
        </label>
        <LabeledInput
          label={t({ id: "editor.assignLoop.touch.builder.idLabel", message: "Key ID" })}
          testId="touch-builder-field-id"
          inputKey={inputKey("id")}
          defaultValue={key.id}
          onCommit={(v) => {
            // Rename is identity, not a field — the `rename` op (never `set`).
            if (v !== key.id) commitOp({ address, kind: "rename", toId: v });
          }}
        />
        {/* Suggest the key id from the keycap text (#2596 item 5). Offered
            as a button, never auto-applied: identity changes are presented,
            never silent. */}
        {suggestedId !== null && suggestedId !== key.id && (
          <button
            type="button"
            data-testid="touch-builder-suggest-id"
            title={t({
              id: "editor.assignLoop.touch.builder.suggestIdTitle",
              message: `Suggest key ID ${suggestedId} from the keycap text`,
            })}
            onClick={() => commitOp({ address, kind: "rename", toId: suggestedId })}
            style={{ ...ghostBtn, alignSelf: "end" }}
          >
            {t({ id: "editor.assignLoop.touch.builder.suggestId", message: "Suggest ID" })}
          </button>
        )}
        <label style={fieldStyle}>
          <span style={labelStyle}>
            {t({ id: "editor.assignLoop.touch.builder.nextLayerLabel", message: "Next layer" })}
          </span>
          <select
            data-testid="touch-builder-field-nextlayer"
            value={key.nextlayer ?? ""}
            onChange={(e) => {
              if (e.target.value !== (key.nextlayer ?? "")) set({ nextlayer: e.target.value });
            }}
            style={selectStyle}
          >
            <option value="">
              {t({ id: "editor.assignLoop.touch.builder.noneOption", message: "None" })}
            </option>
            {layerIds.map((id) => (
              <option key={id} value={id}>{id}</option>
            ))}
          </select>
        </label>
        <label style={fieldStyle}>
          <span style={labelStyle}>
            {t({ id: "editor.assignLoop.touch.builder.layerOverrideLabel", message: "Layer override" })}
          </span>
          <select
            data-testid="touch-builder-field-layer"
            value={key.layer ?? key.layerAnnotation ?? ""}
            onChange={(e) => {
              if (e.target.value !== (key.layer ?? key.layerAnnotation ?? "")) {
                set({ layer: e.target.value });
              }
            }}
            style={selectStyle}
          >
            <option value="">
              {t({ id: "editor.assignLoop.touch.builder.noneOption", message: "None" })}
            </option>
            {layerOverrideOptions.map((id) => (
              <option key={id} value={id}>{id}</option>
            ))}
          </select>
        </label>
      </div>
  );
}

// ---------------------------------------------------------------------------
// Multi-key toolbar (#2596 item 2, keymanapp/keyman#3611)
// ---------------------------------------------------------------------------

/**
 * The bulk fields for several selected keys: the five attributes that are
 * meaningful identical across keys (see `BulkKeyEditFields`). Text, hint,
 * id, subkeys, and structural ops stay single-key. A field whose values
 * disagree across the selection shows "Mixed" and commits only when the
 * author types/chooses a value — never silently overwriting the differing
 * values with a stale common one.
 */
function MultiKeyToolbar(props: {
  entries: readonly { readonly address: string; readonly key: TouchKeyIR }[];
  layerIds: readonly string[];
  layerOverrideOptions: readonly string[];
  fieldEpoch: number;
  onInvalid: () => void;
  commitBulk: (fields: BulkKeyEditFields) => void;
  onClearSelection: () => void;
}) {
  const { t } = useLingui();
  const { entries, layerIds, layerOverrideOptions, fieldEpoch, onInvalid, commitBulk, onClearSelection } = props;
  const keys = entries.map((e) => e.key);
  const inputKey = (field: string): string =>
    `multi:${field}:${fieldEpoch}:${entries.map((e) => e.address).join(",")}`;
  const mixedLabel = t({
    id: "editor.assignLoop.touch.builder.mixedValues",
    message: "Mixed values",
  });

  const width = commonFieldValue(keys.map((k) => k.width ?? BUILDER_DEFAULT_KEY_WIDTH));
  const pad = commonFieldValue(keys.map((k) => k.pad));
  const sp = commonFieldValue(keys.map((k) => k.sp ?? 0));
  const nextlayer = commonFieldValue(keys.map((k) => k.nextlayer ?? ""));
  const layer = commonFieldValue(keys.map((k) => k.layer ?? k.layerAnnotation ?? ""));

  const handleSpChange = (value: string): void => {
    if (value === "__mixed__") return;
    const next = parseInt(value, 10);
    if (next === 0 || next === 1 || next === 2 || next === 8 || next === 9 || next === 10) {
      commitBulk({ sp: next as 0 | 1 | 2 | 8 | 9 | 10 });
    }
  };

  return (
    <>
      <p
        role="status"
        aria-live="polite"
        data-testid="touch-builder-multi-summary"
        style={{ margin: "0 0 12px", fontSize: 13, fontWeight: 600, color: TEXT_MAIN, fontFamily: FONT }}
      >
        {t({
          id: "editor.assignLoop.touch.builder.multiSelected",
          message: plural(entries.length, {
            one: "# key selected",
            other: "# keys selected",
          }),
        })}
      </p>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button
          type="button"
          data-testid="touch-builder-clear-selection"
          onClick={onClearSelection}
          style={ghostBtn}
        >
          {t({
            id: "editor.assignLoop.touch.builder.clearSelection",
            message: "Clear selection",
          })}
        </button>
      </div>
      <div style={fieldGridStyle}>
        <LabeledInput
          label={t({ id: "editor.assignLoop.touch.builder.widthLabel", message: "Width" })}
          testId="touch-builder-multi-field-width"
          inputKey={inputKey("width")}
          defaultValue={width.mixed ? "" : String(width.value ?? "")}
          placeholder={width.mixed ? mixedLabel : undefined}
          inputMode="numeric"
          onCommit={(v) => {
            const n = parseInt(v, 10);
            if (!Number.isInteger(n) || n <= 0) { onInvalid(); return; }
            commitBulk({ width: n });
          }}
        />
        <LabeledInput
          label={t({ id: "editor.assignLoop.touch.builder.padLabel", message: "Left padding" })}
          testId="touch-builder-multi-field-pad"
          inputKey={inputKey("pad")}
          defaultValue={pad.mixed || pad.value === undefined ? "" : String(pad.value)}
          placeholder={pad.mixed ? mixedLabel : undefined}
          inputMode="numeric"
          onCommit={(v) => {
            const n = parseInt(v, 10);
            if (!Number.isInteger(n) || n < 0) { onInvalid(); return; }
            commitBulk({ pad: n });
          }}
        />
        <label style={fieldStyle}>
          <span style={labelStyle}>
            {t({ id: "editor.assignLoop.touch.builder.spLabel", message: "Key type" })}
          </span>
          <select
            data-testid="touch-builder-multi-field-sp"
            value={sp.mixed ? "__mixed__" : String(sp.value ?? 0)}
            onChange={(e) => handleSpChange(e.target.value)}
            style={selectStyle}
          >
            {sp.mixed && (
              <option value="__mixed__" disabled>
                {mixedLabel}
              </option>
            )}
            <option value="0">{t({ id: "editor.assignLoop.touch.builder.spLetter", message: "Letter" })}</option>
            <option value="1">{t({ id: "editor.assignLoop.touch.builder.spSpecial", message: "Special" })}</option>
            <option value="2">{t({ id: "editor.assignLoop.touch.builder.spSpecialActive", message: "Special (active)" })}</option>
            <option value="8">{t({ id: "editor.assignLoop.touch.builder.spDeadkey", message: "Deadkey" })}</option>
            <option value="9">{t({ id: "editor.assignLoop.touch.builder.spBlank", message: "Blank" })}</option>
            <option value="10">{t({ id: "editor.assignLoop.touch.builder.spSpacer", message: "Spacer" })}</option>
          </select>
        </label>
        <label style={fieldStyle}>
          <span style={labelStyle}>
            {t({ id: "editor.assignLoop.touch.builder.nextLayerLabel", message: "Next layer" })}
          </span>
          <select
            data-testid="touch-builder-multi-field-nextlayer"
            value={nextlayer.mixed ? "__mixed__" : (nextlayer.value ?? "")}
            onChange={(e) => {
              if (e.target.value !== "__mixed__") commitBulk({ nextlayer: e.target.value });
            }}
            style={selectStyle}
          >
            {nextlayer.mixed && (
              <option value="__mixed__" disabled>
                {mixedLabel}
              </option>
            )}
            <option value="">
              {t({ id: "editor.assignLoop.touch.builder.noneOption", message: "None" })}
            </option>
            {layerIds.map((id) => (
              <option key={id} value={id}>{id}</option>
            ))}
          </select>
        </label>
        <label style={fieldStyle}>
          <span style={labelStyle}>
            {t({ id: "editor.assignLoop.touch.builder.layerOverrideLabel", message: "Layer override" })}
          </span>
          <select
            data-testid="touch-builder-multi-field-layer"
            value={layer.mixed ? "__mixed__" : (layer.value ?? "")}
            onChange={(e) => {
              if (e.target.value !== "__mixed__") commitBulk({ layer: e.target.value });
            }}
            style={selectStyle}
          >
            {layer.mixed && (
              <option value="__mixed__" disabled>
                {mixedLabel}
              </option>
            )}
            <option value="">
              {t({ id: "editor.assignLoop.touch.builder.noneOption", message: "None" })}
            </option>
            {layerOverrideOptions.map((id) => (
              <option key={id} value={id}>{id}</option>
            ))}
          </select>
        </label>
      </div>
    </>
  );
}

/** Text/number input committing once per blur/Enter (TIKE `saveOnce`). */
function LabeledInput(props: {
  label: string;
  testId: string;
  inputKey: string;
  defaultValue: string;
  inputMode?: "numeric" | "text";
  /** Placeholder shown instead of a value — the multi-inspector's "Mixed". */
  placeholder?: string | undefined;
  /** When set, the input accepts glyphs and renders in this typeface. */
  glyphFont?: string;
  onCommit: (value: string) => void;
}) {
  const { label, testId, inputKey, defaultValue, inputMode, placeholder, glyphFont, onCommit } = props;
  return (
    <label style={fieldStyle}>
      <span style={labelStyle}>{label}</span>
      <input
        key={inputKey}
        type="text"
        inputMode={inputMode}
        data-testid={testId}
        defaultValue={defaultValue}
        placeholder={placeholder}
        onBlur={(e) => {
          if (e.target.value !== defaultValue) onCommit(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            (e.target as HTMLInputElement).blur();
          }
        }}
        style={glyphFont !== undefined ? { ...inputStyle, fontFamily: glyphFont } : inputStyle}
      />
    </label>
  );
}

// ---------------------------------------------------------------------------
// Move / copy a key to another layer (item 2; copy is #2596 item 1)
// ---------------------------------------------------------------------------

/**
 * One layer-transfer control: a target-layer select + Apply. Shared by
 * "Move key to…" and "Copy key to…" — same chrome, different op behind
 * `onTransfer`. The dropdown resets whenever the selected key's layer
 * changes.
 */
function KeyToLayerControl(props: {
  currentLayerId: string;
  layerIds: readonly string[];
  testIdPrefix: string;
  label: string;
  placeholder: string;
  applyLabel: string;
  onTransfer: (toLayer: string) => void;
}) {
  const { currentLayerId, layerIds, testIdPrefix, label, placeholder, applyLabel, onTransfer } = props;
  const [target, setTarget] = useState("");
  // The dropdown resets whenever the selected key's layer changes.
  useEffect(() => setTarget(""), [currentLayerId]);
  const options = layerIds.filter((id) => id !== currentLayerId);
  return (
    <div
      style={{
        marginTop: 12,
        display: "flex",
        alignItems: "center",
        gap: 8,
        flexWrap: "wrap",
      }}
    >
      <span style={labelStyle}>{label}</span>
      <select
        data-testid={`${testIdPrefix}-select`}
        aria-label={label}
        value={target}
        onChange={(e) => setTarget(e.target.value)}
        style={selectStyle}
      >
        <option value="">{placeholder}</option>
        {options.map((id) => (
          <option key={id} value={id}>
            {id}
          </option>
        ))}
      </select>
      <button
        type="button"
        data-testid={`${testIdPrefix}-apply`}
        disabled={target === ""}
        onClick={() => onTransfer(target)}
        style={ghostBtn}
      >
        {applyLabel}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Subkey panel
// ---------------------------------------------------------------------------

function SubkeyPanel(props: {
  address: string;
  targetKey: TouchKeyIR;
  layerIds: readonly string[];
  layerOverrideOptions: readonly string[];
  selection: SubKeySelection | null;
  onSelect: (sel: SubKeySelection | null) => void;
  fieldEpoch: number;
  onInvalid: () => void;
  commitOp: (op: PendingKeyEditOperation) => boolean;
  layout: TouchLayoutIR;
  /** Keycap typeface (platform configured font → loaded keyboard font → system). */
  keycapFont: string;
  /** Drop a tray letter or dragged subkey onto a panel area. */
  applyPanelDrop: (source: SubkeyDropSource, spec: PanelDropSpec) => void;
  /** Serialized panel spec under the finger during a header tray drag. */
  panelDropHover?: string | null | undefined;
  /**
   * Render as the Key section's nested child (item 3): no outer card, the
   * three groups side by side. The caller provides the nesting chrome.
   */
  nested?: boolean;
}) {
  const { t } = useLingui();
  const {
    address, targetKey: key, layerIds, layerOverrideOptions: _layerOverrideOptions,
    selection, onSelect, fieldEpoch, onInvalid, commitOp, layout, keycapFont,
    applyPanelDrop, panelDropHover, nested,
  } = props;
  const entries = subKeyEntriesOf(key);

  // Subkey drag + drop: chips reorder (longpress/multitap) or move between
  // flick directions; tray letters drop straight onto the areas. All pointer
  // types use the shared pointer drag (immediate, any direction — chips take
  // touch-action: none).
  const [subHover, setSubHover] = useState<string | null>(null);
  /** Drop-zone highlight: this drag's hover wins, else the header tray drag's. */
  const zoneHover = subHover ?? panelDropHover ?? null;
  const zoneOutline = (spec: string): React.CSSProperties =>
    zoneHover === spec ? { outline: `2px solid ${ACCENT}`, outlineOffset: 1 } : {};

  const subDrag = useTouchDrag<SubkeyDragPayload>({
    directional: false,
    onDragMove: (_payload, x, y) => {
      const zone = document.elementFromPoint(x, y)?.closest("[data-panel-drop]");
      setSubHover(zone?.getAttribute("data-panel-drop") ?? null);
    },
    onDrop: (payload, x, y) => {
      const zone = document.elementFromPoint(x, y)?.closest("[data-panel-drop]");
      const spec = parsePanelDropSpec(zone?.getAttribute("data-panel-drop"));
      if (spec !== null) applyPanelDrop({ type: "subkey", payload }, spec);
    },
    onDragEnd: () => setSubHover(null),
  });

  const subkeyDragLabel = (payload: SubkeyDragPayload): string => {
    if (payload.kind === "sk") {
      const e = entries.sk.find((en) => en.key.id === payload.id);
      return e?.key.text || e?.key.id || payload.id;
    }
    if (payload.kind === "flick") {
      const e = entries.flick.find((en) => en.ref.id === payload.direction);
      return e?.key.text || payload.direction;
    }
    const e = entries.multitap[payload.index];
    return e?.key.text || e?.key.id || `#${payload.index + 1}`;
  };

  const handleAddSubKey = (kind: BuilderSubKeyKind, flickDirection?: string): void => {
    // TIKE appends new subkeys with `T_new_N` ids; `setSubKey` is an upsert
    // (spec 065 T042 / FR-026), so naming a fresh id creates the entry.
    const id = flickDirection ?? mintBuilderKeyId(layout);
    const sub = (flickDirection !== undefined
      ? { kind: "flick", id: flickDirection }
      : { kind, id }) as BuilderSubKeyEntry["ref"];
    if (
      commitOp({
        address,
        kind: "setSubKey",
        sub,
        fields: { id, text: "", sp: 0 },
      })
    ) {
      onSelect({ kind, id: flickDirection ?? id });
    }
  };

  const handleDeleteSubKey = (entry: BuilderSubKeyEntry): void => {
    if (commitOp({ address, kind: "removeSubKey", sub: entry.ref })) {
      onSelect(null);
    }
  };

  const renderChip = (
    entry: BuilderSubKeyEntry,
    label: string,
    dragPayload: SubkeyDragPayload,
    dropSpec: string | null,
  ): React.ReactNode => {
    const isSelected =
      selection !== null &&
      selection.kind === entry.kind &&
      (entry.kind === "flick" ? selection.id === entry.ref.id : selection.id === entry.key.id);
    return (
      <button
        key={`${entry.kind}:${entry.kind === "flick" ? entry.ref.id : entry.key.id}`}
        type="button"
        data-testid={`touch-builder-subkey-${entry.kind}-${entry.kind === "flick" ? entry.ref.id : entry.key.id}`}
        data-panel-drop={dropSpec ?? undefined}
        aria-pressed={isSelected}
        {...subDrag.bindSource(dragPayload)}
        onContextMenu={(e) => e.preventDefault()}
        onClick={() => {
          if (subDrag.consumeClick()) return;
          onSelect({
            kind: entry.kind,
            id: entry.kind === "flick" ? entry.ref.id : entry.key.id,
          });
        }}
        style={{
          ...ghostBtn,
          borderColor: isSelected ? ACCENT : BORDER,
          background: isSelected ? "var(--app-accent-bg)" : "transparent",
          minWidth: 44,
          fontFamily: keycapFont,
          cursor: "grab",
          touchAction: "none",
          userSelect: "none",
          WebkitTouchCallout: "none",
          ...(dropSpec !== null && zoneHover === dropSpec
            ? { outline: `2px solid ${ACCENT}`, outlineOffset: 1 }
            : {}),
        }}
      >
        {label}
        {entry.kind === "sk" && entry.key.default === true && (
          <span
            style={{ marginLeft: 4, fontSize: 9, color: TEXT_DIM }}
            title={t({
              id: "editor.assignLoop.touch.builder.defaultLabel",
              message: "Default",
            })}
          >
            ●
          </span>
        )}
      </button>
    );
  };

  const selectedEntry: BuilderSubKeyEntry | undefined =
    selection === null
      ? undefined
      : [...entries.sk, ...entries.flick, ...entries.multitap].find((e) =>
          e.kind === "flick"
            ? selection.kind === "flick" && e.ref.id === selection.id
            : selection.kind === e.kind && e.key.id === selection.id,
        );

  const subkeyAriaLabel = t({
    id: "editor.assignLoop.touch.builder.subkeySection",
    message: "Subkeys",
  });

  // Item 3: nested mode renders no outer card — the caller nests this block
  // inside the Key section — and the three groups sit side by side (wrapping
  // on narrow widths) instead of stacked.
  const groupsEl = (
    <div
      style={{
        display: "flex",
        gap: 16,
        flexWrap: "wrap",
        alignItems: "flex-start",
      }}
    >
      {/* Longpress group — chips reorder via drag; tray letters append. */}
      <SubkeyGroup
        title={t({
          id: "editor.assignLoop.touch.builder.longpressSection",
          message: "Longpress keys",
        })}
        testId="touch-builder-subkeys-sk"
        onAdd={() => handleAddSubKey("sk")}
        addLabel={t({ id: "editor.assignLoop.touch.builder.addSubkey", message: "Add" })}
        dropSpec="lp"
        zoneHover={zoneHover === "lp"}
      >
        {entries.sk.map((e) =>
          renderChip(e, e.key.text || e.key.id, { kind: "sk", id: e.key.id }, `lp:${e.key.id}`),
        )}
      </SubkeyGroup>

      {/* Flick compass — 3x3 square (TIKE placeholder-per-direction). */}
      <SubkeyGroup
        title={t({
          id: "editor.assignLoop.touch.builder.flickSection",
          message: "Flick keys",
        })}
        testId="touch-builder-subkeys-flick"
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, auto)",
            gap: 4,
            justifyContent: "start",
            alignItems: "center",
          }}
        >
          {(Object.keys(FLICK_GRID) as FlickDirection[]).map((direction) => {
            const entry = entries.flick.find((e) => e.ref.id === direction);
            const pos = FLICK_GRID[direction];
            const spec = `flick:${direction}`;
            return (
              <div
                key={direction}
                data-panel-drop={spec}
                style={{
                  gridRow: pos.row,
                  gridColumn: pos.col,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 2,
                  padding: 2,
                  borderRadius: 6,
                  ...zoneOutline(spec),
                }}
              >
                <span style={{ fontSize: 9, color: TEXT_DIM, fontFamily: FONT }}>{direction}</span>
                {entry !== undefined ? (
                  renderChip(entry, entry.key.text || entry.key.id, { kind: "flick", direction }, spec)
                ) : (
                  <button
                    type="button"
                    data-testid={`touch-builder-add-flick-${direction}`}
                    aria-label={`${t({ id: "editor.assignLoop.touch.builder.addSubkey", message: "Add" })} ${direction}`}
                    onClick={() => handleAddSubKey("flick", direction)}
                    style={{ ...ghostBtn, minWidth: 32 }}
                  >
                    +
                  </button>
                )}
              </div>
            );
          })}
          {/* Center: the key being flicked from. */}
          <div
            aria-hidden="true"
            style={{
              gridRow: 2,
              gridColumn: 2,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              minWidth: 32,
              minHeight: 24,
              fontSize: 12,
              color: TEXT_DIM,
              fontFamily: keycapFont,
            }}
          >
            {key.text || key.id}
          </div>
        </div>
      </SubkeyGroup>

      {/* Multitap group — chips reorder via drag; tray letters fill 2x/3x. */}
      <SubkeyGroup
        title={t({
          id: "editor.assignLoop.touch.builder.multitapSection",
          message: "Multitap keys",
        })}
        testId="touch-builder-subkeys-multitap"
        onAdd={() => handleAddSubKey("multitap")}
        addLabel={t({ id: "editor.assignLoop.touch.builder.addSubkey", message: "Add" })}
        dropSpec="mt"
        zoneHover={zoneHover === "mt"}
      >
        {entries.multitap.map((e, i) =>
          renderChip(e, e.key.text || e.key.id, { kind: "multitap", index: i }, `mt:${i}`),
        )}
      </SubkeyGroup>
    </div>
  );

  // The selected-subkey editor + drag ghost are shared by both modes.
  const selectedSubkeyEl = (
    <>
      {/* Selected subkey fields */}
      {selectedEntry !== undefined && (
        <div style={{ ...sectionStyle, marginTop: 8 }} data-testid="touch-builder-subkey-fields">
          <div style={fieldGridStyle}>
            <LabeledInput
              label={t({ id: "editor.assignLoop.touch.builder.textLabel", message: "Keycap text" })}
              testId="touch-builder-subkey-field-text"
              inputKey={`${address}:sub:${selectedEntry.kind}:${selectedEntry.ref.id}:text:${fieldEpoch}`}
              defaultValue={selectedEntry.key.text ?? ""}
              glyphFont={keycapFont}
              onCommit={(v) =>
                commitOp({ address, kind: "setSubKey", sub: selectedEntry.ref, fields: { text: v } })
              }
            />
            <LabeledInput
              label={t({ id: "editor.assignLoop.touch.builder.idLabel", message: "Key ID" })}
              testId="touch-builder-subkey-field-id"
              inputKey={`${address}:sub:${selectedEntry.kind}:${selectedEntry.ref.id}:id:${fieldEpoch}`}
              defaultValue={selectedEntry.key.id}
              onCommit={(v) => {
                if (v !== selectedEntry.key.id) {
                  commitOp({ address, kind: "setSubKey", sub: selectedEntry.ref, fields: { id: v } });
                }
              }}
            />
            <label style={fieldStyle}>
              <span style={labelStyle}>
                {t({ id: "editor.assignLoop.touch.builder.spLabel", message: "Key type" })}
              </span>
              <select
                data-testid="touch-builder-subkey-field-sp"
                value={String(selectedEntry.key.sp ?? 0)}
                onChange={(e) => {
                  const sp = parseInt(e.target.value, 10);
                  if (sp === 0 || sp === 1 || sp === 2 || sp === 8) {
                    commitOp({ address, kind: "setSubKey", sub: selectedEntry.ref, fields: { sp } });
                  } else {
                    onInvalid();
                  }
                }}
                style={selectStyle}
              >
                <option value="0">{t({ id: "editor.assignLoop.touch.builder.spLetter", message: "Letter" })}</option>
                <option value="1">{t({ id: "editor.assignLoop.touch.builder.spSpecial", message: "Special" })}</option>
                <option value="2">{t({ id: "editor.assignLoop.touch.builder.spSpecialActive", message: "Special (active)" })}</option>
                <option value="8">{t({ id: "editor.assignLoop.touch.builder.spDeadkey", message: "Deadkey" })}</option>
              </select>
            </label>
            <label style={fieldStyle}>
              <span style={labelStyle}>
                {t({ id: "editor.assignLoop.touch.builder.nextLayerLabel", message: "Next layer" })}
              </span>
              <select
                data-testid="touch-builder-subkey-field-nextlayer"
                value={selectedEntry.key.nextlayer ?? ""}
                onChange={(e) =>
                  commitOp({
                    address,
                    kind: "setSubKey",
                    sub: selectedEntry.ref,
                    fields: { nextlayer: e.target.value },
                  })
                }
                style={selectStyle}
              >
                <option value="">
                  {t({ id: "editor.assignLoop.touch.builder.noneOption", message: "None" })}
                </option>
                {layerIds.map((id) => (
                  <option key={id} value={id}>{id}</option>
                ))}
              </select>
            </label>
            {/* The `default` longpress preselect is readable but NOT writable
                through the 10 op kinds (`default` is absent from
                `EditableKeyFields`) — the checkbox reflects state and stays
                disabled until the contract admits the field. */}
            {selectedEntry.kind === "sk" && (
              <label
                style={{ ...fieldStyle, flexDirection: "row", alignItems: "center", gap: 6 }}
                title={t({
                  id: "editor.assignLoop.touch.builder.defaultUnavailable",
                  message:
                    "Setting the default longpress key needs a contract extension — read-only for now.",
                })}
              >
                <input
                  type="checkbox"
                  data-testid="touch-builder-subkey-field-default"
                  checked={selectedEntry.key.default === true}
                  disabled
                  onChange={() => {}}
                />
                <span style={labelStyle}>
                  {t({ id: "editor.assignLoop.touch.builder.defaultLabel", message: "Default" })}
                </span>
              </label>
            )}
          </div>
          <div style={{ marginTop: 8 }}>
            <button
              type="button"
              data-testid="touch-builder-subkey-delete"
              onClick={() => handleDeleteSubKey(selectedEntry)}
              style={ghostBtn}
            >
              {t({ id: "editor.assignLoop.touch.builder.deleteSubkey", message: "Delete" })}
            </button>
          </div>
        </div>
      )}
      {/* Touch-drag ghost for subkey chips. */}
      {subDrag.ghost !== null && (
        <div
          aria-hidden="true"
          style={{
            position: "fixed",
            left: subDrag.ghost.x - 22,
            top: subDrag.ghost.y - 72,
            zIndex: 2000,
            pointerEvents: "none",
            minWidth: 44,
            minHeight: 32,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "4px 8px",
            fontSize: 14,
            fontFamily: keycapFont,
            color: TEXT_MAIN,
            background: "var(--app-surface)",
            border: `2px solid ${ACCENT}`,
            borderRadius: 8,
            boxShadow: "var(--app-shadow)",
            opacity: 0.95,
          }}
        >
          {subkeyDragLabel(subDrag.ghost.payload)}
        </div>
      )}
    </>
  );

  if (nested === true) {
    // Item 3: the caller's nested child block carries the visual nesting;
    // this renders the groups + selected-subkey editor directly under the
    // shared "Subkeys" label.
    return (
      <div aria-label={subkeyAriaLabel}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: TEXT_MAIN,
            fontFamily: FONT,
            marginBottom: 8,
          }}
        >
          {subkeyAriaLabel}
        </div>
        {groupsEl}
        {selectedSubkeyEl}
      </div>
    );
  }

  return (
    <section aria-label={subkeyAriaLabel} style={sectionStyle}>
      {groupsEl}
      {selectedSubkeyEl}
    </section>
  );
}

function SubkeyGroup(props: {
  title: string;
  testId: string;
  children: React.ReactNode;
  onAdd?: () => void;
  addLabel?: string;
  /** Drop-zone spec for the chip row (tray letters land, subkey chips reorder). */
  dropSpec?: string;
  zoneHover?: boolean;
}) {
  const { title, testId, children, onAdd, addLabel, dropSpec, zoneHover } =
    props;
  return (
    <div style={{ marginBottom: 8 }} data-testid={testId}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: TEXT_MAIN, fontFamily: FONT }}>
          {title}
        </span>
        {onAdd !== undefined && (
          <button type="button" onClick={onAdd} style={{ ...ghostBtn, padding: "2px 8px" }} aria-label={addLabel}>
            +
          </button>
        )}
      </div>
      <div
        data-panel-drop={dropSpec}
        style={{
          display: "flex",
          gap: 4,
          flexWrap: "wrap",
          padding: 2,
          borderRadius: 6,
          ...(zoneHover === true ? { outline: `2px solid ${ACCENT}`, outlineOffset: 1 } : {}),
        }}
      >
        {children}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Template picker dialog
// ---------------------------------------------------------------------------

function TemplateDialog(props: {
  onClose: () => void;
  onApply: (source: BuilderTemplateSource) => void;
}) {
  const { t } = useLingui();
  const { onClose, onApply } = props;
  const [sources] = useState(builderTemplateSources);
  const [selectedId, setSelectedId] = useState<BuilderTemplateSource["id"]>(
    sources[0]!.id,
  );
  const [confirmed, setConfirmed] = useState(false);
  const selected = sources.find((s) => s.id === selectedId)!;

  // Literal t() calls — the Lingui macro cannot analyze dynamic ids, so the
  // template names/descriptions are a static switch, not a table lookup.
  const templateName = (id: BuilderTemplateSource["id"]): string => {
    switch (id) {
      case "basic":
        return t({
          id: "editor.assignLoop.touch.builder.template.basicName",
          message: "Basic",
        });
      case "latin":
        return t({
          id: "editor.assignLoop.touch.builder.template.latinName",
          message: "Latin",
        });
      case "traditional":
        return t({
          id: "editor.assignLoop.touch.builder.template.traditionalName",
          message: "Traditional",
        });
    }
  };
  const templateDescription = (id: BuilderTemplateSource["id"]): string => {
    switch (id) {
      case "basic":
        return t({
          id: "editor.assignLoop.touch.builder.template.basicDescription",
          message: "Minimal phone layout",
        });
      case "latin":
        return t({
          id: "editor.assignLoop.touch.builder.template.latinDescription",
          message: "Full tablet and phone Latin layout",
        });
      case "traditional":
        return t({
          id: "editor.assignLoop.touch.builder.template.traditionalDescription",
          message: "Traditional desktop-style layout",
        });
    }
  };

  return (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions -- backdrop click closes; Escape handled by the dialog's focus trap
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t({
        id: "editor.assignLoop.touch.builder.templateTitle",
        message: "Select touch layout template",
      })}
      data-testid="touch-builder-template-dialog"
      style={{
        position: "fixed",
        inset: 0,
        background: "var(--app-backdrop)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
      }}
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <div
        role="presentation"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: BG_CARD,
          border: `1px solid ${BORDER}`,
          borderRadius: 8,
          padding: 20,
          minWidth: 360,
          maxWidth: 480,
          fontFamily: FONT,
        }}
      >
        <h2 style={{ margin: "0 0 12px", fontSize: 15, color: TEXT_MAIN }}>
          {t({
            id: "editor.assignLoop.touch.builder.templateTitle",
            message: "Select touch layout template",
          })}
        </h2>
        <div role="radiogroup" style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
          {sources.map((source) => (
            <label
              key={source.id}
              aria-label={templateName(source.id)}
              style={{ display: "flex", gap: 8, alignItems: "flex-start", cursor: "pointer", fontSize: 13, color: TEXT_MAIN }}
            >
              <input
                type="radio"
                name="builder-template"
                checked={source.id === selectedId}
                onChange={() => {
                  setSelectedId(source.id);
                  setConfirmed(false);
                }}
              />
              <span>
                <strong>{templateName(source.id)}</strong>
                <br />
                <span style={{ color: TEXT_DIM, fontSize: 12 }}>
                  {templateDescription(source.id)}
                </span>
              </span>
            </label>
          ))}
        </div>
        {/* TIKE's PromptChange confirmation: applying over an existing layout
            may lose data for keys the template does not carry. Two-step:
            Continue reveals the consequence, Apply commits. */}
        <p style={{ fontSize: 12, color: TEXT_DIM, margin: "0 0 12px" }}>
          {t({
            id: "editor.assignLoop.touch.builder.templateConfirm",
            message:
              "Changing template may lose some layout data if keys are not present on the new template. Continue?",
          })}
        </p>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" onClick={onClose} style={ghostBtn}>
            {t({ id: "editor.assignLoop.touch.builder.templateCancel", message: "Cancel" })}
          </button>
          {/* eslint-disable no-restricted-syntax -- not step nav: a two-step template confirm — first click arms it ("Continue"), second applies; the step's own nav stays in the footer. */}
          <button
            type="button"
            data-testid="touch-builder-template-apply"
            onClick={() => {
              if (!confirmed) {
                setConfirmed(true);
                return;
              }
              onApply(selected);
            }}
            style={primaryBtn}
          >
            {confirmed
              ? t({ id: "editor.assignLoop.touch.builder.templateApply", message: "Apply" })
              : t({ id: "editor.assignLoop.touch.builder.templateContinue", message: "Continue" })}
          </button>
          {/* eslint-enable no-restricted-syntax */}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const tabStyle = (active: boolean): React.CSSProperties => ({
  fontFamily: FONT,
  fontSize: 12,
  padding: "6px 12px",
  borderRadius: 6,
  border: `1px solid ${active ? ACCENT : BORDER}`,
  background: active ? "var(--app-accent-bg)" : "transparent",
  color: active ? "var(--app-accent-text)" : TEXT_MAIN,
  cursor: "pointer",
  fontWeight: active ? 600 : 400,
});

// Wide-screen folder tabs (item 6): the active tab shares the canvas's
// background and overlaps its left border by 1px so the two read as one
// connected surface, like a folder tab.
const folderTabStyle = (active: boolean): React.CSSProperties => ({
  fontFamily: FONT,
  fontSize: 12,
  padding: "10px 14px",
  borderRadius: "8px 0 0 8px",
  border: `1px solid ${active ? BORDER : "transparent"}`,
  borderRight: active ? `1px solid ${BG_CANVAS}` : undefined,
  background: active ? BG_CANVAS : "transparent",
  color: active ? TEXT_MAIN : TEXT_DIM,
  cursor: "pointer",
  fontWeight: active ? 600 : 400,
  marginRight: active ? -1 : 0,
  textAlign: "left",
  whiteSpace: "nowrap",
});

const ghostBtn: React.CSSProperties = {
  fontFamily: FONT,
  fontSize: 12,
  padding: "6px 12px",
  borderRadius: 6,
  border: `1px solid ${BORDER}`,
  background: "transparent",
  color: TEXT_MAIN,
  cursor: "pointer",
};

const primaryBtn: React.CSSProperties = {
  ...ghostBtn,
  background: ACCENT,
  borderColor: ACCENT,
  color: "var(--app-text-on-accent)",
  fontWeight: 600,
};

const selectStyle: React.CSSProperties = {
  fontFamily: FONT,
  fontSize: 12,
  padding: "5px 8px",
  borderRadius: 6,
  border: `1px solid ${BORDER}`,
  background: BG_CARD,
  color: TEXT_MAIN,
};

const inputStyle: React.CSSProperties = {
  fontFamily: FONT,
  fontSize: 12,
  padding: "5px 8px",
  borderRadius: 6,
  border: `1px solid ${BORDER}`,
  background: BG_CARD,
  color: TEXT_MAIN,
  width: "100%",
  boxSizing: "border-box",
};

const sectionStyle: React.CSSProperties = {
  background: BG_CARD,
  border: `1px solid ${BORDER}`,
  borderRadius: 8,
  padding: 12,
};

// Item 3: the subkey child block — visually nested inside the Key section via
// the accent left border + inset surface, so the parent/child relationship
// reads at a glance.
const nestedChildStyle: React.CSSProperties = {
  marginTop: 12,
  background: BG_CANVAS,
  border: `1px solid ${BORDER}`,
  borderLeft: `3px solid ${ACCENT}`,
  borderRadius: 6,
  padding: 10,
};

const fieldGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
  gap: 10,
};

const fieldStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  fontSize: 12,
  color: TEXT_MAIN,
  fontFamily: FONT,
};

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: TEXT_DIM,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};
