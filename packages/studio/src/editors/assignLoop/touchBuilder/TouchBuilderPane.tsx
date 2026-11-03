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
// Every gesture decomposes per slice-spec §4 into the 8 `KeyEditOperation`
// kinds. Key-level ops only (Q1): no row/layer structural UI, no
// per-platform font editing.

import { useEffect, useRef, useState } from "react";
import { useLingui } from "@lingui/react/macro";
import {
  createKeyOccurrenceCounter,
  touchKeyAddress,
  type TouchKeyIR,
  type TouchLayoutIR,
} from "@keyboard-studio/contracts";
import { proposeSuppressFields } from "@keyboard-studio/engine";
import type { PendingKeyEditOperation } from "../../../stores/workingCopyStore.ts";
import {
  BUILDER_DEFAULT_KEY_WIDTH,
  BUILDER_KEY_MARGIN,
  BUILDER_MAX_KEY_WIDTH,
  BUILDER_MIN_KEY_WIDTH,
  BUILDER_PRESENTATIONS,
  BUILDER_ROW_HEIGHT,
  type FlickDirection,
  builderPresentationById,
  buildTemplateApplyOps,
  computeBuilderScale,
  defaultBuilderPresentationId,
  mintBuilderKeyId,
  parseBuilderTemplate,
  resolveBuilderKey,
  subKeyEntriesOf,
  type BuilderSubKeyEntry,
  type BuilderSubKeyKind,
} from "./touchBuilderModel.ts";
import {
  builderTemplateSources,
  type BuilderTemplateSource,
} from "./builderTemplates.ts";

export interface TouchBuilderPaneProps {
  /** The shared `effectiveKeyModeLayout` selector — read, never copied. */
  readonly layout: TouchLayoutIR | null;
  readonly activePlatformId: string | null;
  readonly onSelectPlatform: (platformId: string) => void;
  readonly activeLayerId: string;
  readonly onSelectLayer: (layerId: string) => void;
  readonly selectedKeyAddress: string | null;
  readonly onSelectKey: (address: string | null) => void;
  /** The bare-op commit entry point (`commitKeyEditOp`). */
  readonly commitOp: (op: PendingKeyEditOperation) => boolean;
  /**
   * The keyboard's font as a blob URL + CSS family (from the artifact
   * stage). Injected as a FontFace so keycaps render in the real typeface
   * instead of the UI font.
   */
  readonly fontFaceUrl?: string | undefined;
  readonly fontFaceFamily?: string | undefined;
}

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

/** Flick compass slot positions in the 3x3 square (row/col, 1-based). */
const FLICK_GRID: Record<FlickDirection, { row: number; col: number }> = {
  nw: { row: 1, col: 1 },
  n: { row: 1, col: 2 },
  ne: { row: 1, col: 3 },
  w: { row: 2, col: 1 },
  e: { row: 2, col: 3 },
  sw: { row: 3, col: 1 },
  s: { row: 3, col: 2 },
  se: { row: 3, col: 3 },
};

/**
 * Keycap font stack: the touch layout's per-platform configured `font`
 * (Noto / Charis SIL / Andika — TIKE's Keyboard Font dialog) first, then the
 * keyboard's loaded font, then the system UI stack.
 */
function keycapFontFamily(
  platformFont: string | undefined,
  loadedFamily: string | undefined,
): string {
  const families: string[] = [];
  if (platformFont !== undefined && platformFont !== "") families.push(`"${platformFont}"`);
  if (loadedFamily !== undefined && loadedFamily !== "" && loadedFamily !== platformFont) {
    families.push(`"${loadedFamily}"`);
  }
  families.push("system-ui", "-apple-system", "'Segoe UI'", "sans-serif");
  return families.join(", ");
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
    commitOp,
    fontFaceUrl,
    fontFaceFamily,
  } = props;

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

  // Per-platform presentation memory (TIKE `lastPresentations`).
  const [presentations, setPresentations] = useState<Record<string, string>>({});
  const [subSel, setSubSel] = useState<SubKeySelection | null>(null);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [fieldEpoch, setFieldEpoch] = useState(0);
  const [resizeDrag, setResizeDrag] = useState<{
    address: string;
    startClientX: number;
    startWidthUnits: number;
    previewWidthUnits: number;
    xscale: number;
  } | null>(null);
  const dragSrcRef = useRef<string | null>(null);

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

  const scale = computeBuilderScale(
    rowViews.map((row) => ({
      keys: row.map(({ key }) => ({
        id: key.id,
        width: key.width ?? BUILDER_DEFAULT_KEY_WIDTH,
        pad: key.pad ?? BUILDER_KEY_MARGIN,
      })),
    })),
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
  const layerOverrideOptions = Array.from(
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

  // -- drag reorder → direction-step `move` ops ------------------------------
  const handleDropOnKey = (targetAddress: string): void => {
    const srcAddress = dragSrcRef.current;
    dragSrcRef.current = null;
    if (srcAddress === null || srcAddress === targetAddress) return;
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
    // TIKE clamp (10–500 units); the studio validates width as integer > 0.
    const width = Math.min(
      BUILDER_MAX_KEY_WIDTH,
      Math.max(BUILDER_MIN_KEY_WIDTH, previewWidthUnits),
    );
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
    for (const op of ops) {
      commitOp(op);
    }
    setTemplateOpen(false);
  };

  const selectedKey = selectedOnActiveLayer?.key;
  const selectedSubKeyEntry: BuilderSubKeyEntry | undefined =
    selectedKey !== undefined && subSel !== null
      ? subKeyEntriesOf(selectedKey)[subSel.kind].find((e) =>
          e.kind === "flick" ? e.ref.id === subSel.id : e.key.id === subSel.id,
        )
      : undefined;

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

      {/* Layer switcher — switching only (Q1: no structural layer ops). */}
      <div
        role="tablist"
        aria-label={t({
          id: "editor.assignLoop.touch.builder.layerLabel",
          message: "Layer",
        })}
        style={{ display: "flex", gap: 4, flexWrap: "wrap" }}
      >
        {layerIds.map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={id === activeLayerId}
            data-testid={`touch-builder-layer-${id}`}
            onClick={() => onSelectLayer(id)}
            style={tabStyle(id === activeLayerId)}
          >
            {id}
          </button>
        ))}
      </div>

      {/* Key canvas — TIKE geometry: 100 units/row, default width 100,
          keyMargin 15 gap, widest row sets the scale. */}
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
          borderRadius: 8,
          padding: 12,
          overflowX: "auto",
        }}
      >
        {rowViews.map((row, r) => (
          <div key={r} style={{ display: "flex", alignItems: "stretch" }}>
            {row.map(({ key, address }) => {
              const isSelected = address === selectedKeyAddress;
              const colors = spColor(key.sp);
              const isSpacer = (key.sp ?? 0) === 10;
              const widthUnits =
                resizeDrag !== null && resizeDrag.address === address
                  ? resizeDrag.previewWidthUnits
                  : (key.width ?? BUILDER_DEFAULT_KEY_WIDTH);
              const widthPx = Math.max(8, widthUnits * scale.xscale);
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
                    onSelectKey(address);
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
                      onSelectKey(address);
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
                    marginLeft: `${(key.pad ?? BUILDER_KEY_MARGIN) * scale.xscale}px`,
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
                    outline: "none",
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

      {/* Key toolbar — one op per commit (TIKE `saveOnce` semantics). */}
      {selectedOnActiveLayer !== undefined && selectedKey !== undefined && (
        <KeyToolbar
          address={selectedKeyAddress!}
          targetKey={selectedKey}
          layerIds={layerIds}
          layerOverrideOptions={layerOverrideOptions}
          fieldEpoch={fieldEpoch}
          onInvalid={() => setFieldEpoch((n) => n + 1)}
          commitOp={commitOp}
        />
      )}

      {/* Subkey panel — longpress / flick compass / multitap. */}
      {selectedOnActiveLayer !== undefined && selectedKey !== undefined && (
        <SubkeyPanel
          address={selectedKeyAddress!}
          targetKey={selectedKey}
          layerIds={layerIds}
          layerOverrideOptions={layerOverrideOptions}
          selection={subSel}
          onSelect={setSubSel}
          fieldEpoch={fieldEpoch}
          onInvalid={() => setFieldEpoch((n) => n + 1)}
          commitOp={commitOp}
          layout={layout}
          keycapFont={keycapFont}
        />
      )}

      {/* Wedge controls (TIKE add-key-left/right, delete) — below the key
          and longpress sections. */}
      {selectedOnActiveLayer !== undefined && (
        <div style={{ display: "flex", gap: 8 }}>
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
      )}

      {templateOpen && (
        <TemplateDialog
          onClose={() => setTemplateOpen(false)}
          onApply={handleApplyTemplate}
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
}) {
  const { t } = useLingui();
  const { address, targetKey: key, layerIds, layerOverrideOptions, fieldEpoch, onInvalid, commitOp } = props;
  const set = (fields: Extract<PendingKeyEditOperation, { kind: "set" }>["fields"]): void => {
    commitOp({ address, kind: "set", fields });
  };
  const inputKey = (field: string): string => `${address}:${field}:${fieldEpoch}`;

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

  return (
    <section
      aria-label={t({
        id: "editor.assignLoop.touch.builder.keySection",
        message: "Key",
      })}
      style={sectionStyle}
    >
      <div style={fieldGridStyle}>
        <LabeledInput
          label={t({ id: "editor.assignLoop.touch.builder.textLabel", message: "Keycap text" })}
          testId="touch-builder-field-text"
          inputKey={inputKey("text")}
          defaultValue={key.text ?? ""}
          onCommit={(v) => set({ text: v })}
        />
        <LabeledInput
          label={t({ id: "editor.assignLoop.touch.builder.hintLabel", message: "Hint" })}
          testId="touch-builder-field-hint"
          inputKey={inputKey("hint")}
          defaultValue={key.hint ?? ""}
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
            set({ width: n });
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
    </section>
  );
}

/** Text/number input committing once per blur/Enter (TIKE `saveOnce`). */
function LabeledInput(props: {
  label: string;
  testId: string;
  inputKey: string;
  defaultValue: string;
  inputMode?: "numeric" | "text";
  onCommit: (value: string) => void;
}) {
  const { label, testId, inputKey, defaultValue, inputMode, onCommit } = props;
  return (
    <label style={fieldStyle}>
      <span style={labelStyle}>{label}</span>
      <input
        key={inputKey}
        type="text"
        inputMode={inputMode}
        data-testid={testId}
        defaultValue={defaultValue}
        onBlur={(e) => {
          if (e.target.value !== defaultValue) onCommit(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            (e.target as HTMLInputElement).blur();
          }
        }}
        style={inputStyle}
      />
    </label>
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
}) {
  const { t } = useLingui();
  const {
    address, targetKey: key, layerIds, layerOverrideOptions,
    selection, onSelect, fieldEpoch, onInvalid, commitOp, layout, keycapFont,
  } = props;
  const entries = subKeyEntriesOf(key);

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

  const renderChip = (entry: BuilderSubKeyEntry, label: string): React.ReactNode => {
    const isSelected =
      selection !== null &&
      selection.kind === entry.kind &&
      (entry.kind === "flick" ? selection.id === entry.ref.id : selection.id === entry.key.id);
    return (
      <button
        key={`${entry.kind}:${entry.kind === "flick" ? entry.ref.id : entry.key.id}`}
        type="button"
        data-testid={`touch-builder-subkey-${entry.kind}-${entry.kind === "flick" ? entry.ref.id : entry.key.id}`}
        aria-pressed={isSelected}
        onClick={() =>
          onSelect({
            kind: entry.kind,
            id: entry.kind === "flick" ? entry.ref.id : entry.key.id,
          })
        }
        style={{
          ...ghostBtn,
          borderColor: isSelected ? ACCENT : BORDER,
          background: isSelected ? "var(--app-accent-bg)" : "transparent",
          minWidth: 44,
          fontFamily: keycapFont,
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

  return (
    <section
      aria-label={t({
        id: "editor.assignLoop.touch.builder.subkeySection",
        message: "Subkeys",
      })}
      style={sectionStyle}
    >
      {/* Longpress group */}
      <SubkeyGroup
        title={t({
          id: "editor.assignLoop.touch.builder.longpressSection",
          message: "Longpress keys",
        })}
        testId="touch-builder-subkeys-sk"
        onAdd={() => handleAddSubKey("sk")}
        addLabel={t({ id: "editor.assignLoop.touch.builder.addSubkey", message: "Add" })}
      >
        {entries.sk.map((e) => renderChip(e, e.key.text || e.key.id))}
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
            return (
              <div
                key={direction}
                style={{
                  gridRow: pos.row,
                  gridColumn: pos.col,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 2,
                }}
              >
                <span style={{ fontSize: 9, color: TEXT_DIM, fontFamily: FONT }}>{direction}</span>
                {entry !== undefined ? (
                  renderChip(entry, entry.key.text || entry.key.id)
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

      {/* Multitap group */}
      <SubkeyGroup
        title={t({
          id: "editor.assignLoop.touch.builder.multitapSection",
          message: "Multitap keys",
        })}
        testId="touch-builder-subkeys-multitap"
        onAdd={() => handleAddSubKey("multitap")}
        addLabel={t({ id: "editor.assignLoop.touch.builder.addSubkey", message: "Add" })}
      >
        {entries.multitap.map((e) => renderChip(e, e.key.text || e.key.id))}
      </SubkeyGroup>

      {/* Selected subkey fields */}
      {selectedEntry !== undefined && (
        <div style={{ ...sectionStyle, marginTop: 8 }} data-testid="touch-builder-subkey-fields">
          <div style={fieldGridStyle}>
            <LabeledInput
              label={t({ id: "editor.assignLoop.touch.builder.textLabel", message: "Keycap text" })}
              testId="touch-builder-subkey-field-text"
              inputKey={`${address}:sub:${selectedEntry.kind}:${selectedEntry.ref.id}:text:${fieldEpoch}`}
              defaultValue={selectedEntry.key.text ?? ""}
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
                through the 8 op kinds (`default` is absent from
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
    </section>
  );
}

function SubkeyGroup(props: {
  title: string;
  testId: string;
  children: React.ReactNode;
  onAdd?: () => void;
  addLabel?: string;
}) {
  const { title, testId, children, onAdd, addLabel } = props;
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
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>{children}</div>
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
        background: "rgba(0,0,0,0.35)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
      }}
      onClick={onClose}
    >
      <div
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
