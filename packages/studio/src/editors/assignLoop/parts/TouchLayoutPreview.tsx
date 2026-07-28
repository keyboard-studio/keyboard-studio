// TouchLayoutPreview — presentational touch-layout renderer shared by the
// touch_seed_source live preview (spec 035 R4a amendment) and any future
// caller that needs a lightweight, read-only rendering of a
// platforms -> layers -> rows -> keys shape.
//
// Presentational only: no engine calls, no store reads, no editing. Callers
// adapt their own data source (raw `.keyman-touch-layout` JSON, or a real
// `TouchLayoutIR`) into the `TouchLayoutPreviewData` shape below via their
// own small mapper, then hand it to this component.
//
// Features:
//   - multi-layer support via a lightweight tab strip, defaulting to the
//     "default" layer id when present, else the first layer.
//   - subkeys (`sk`) surface as a small badge on the host key; hover/focus
//     reveals an expandable strip of the subkey labels (read-only — no
//     click-to-apply, this is a preview, not an editor).
//   - `emptyMessage` is rendered instead of a grid when `data` is null or has
//     no layers, so callers never need a second guard clause.

import { useState, type CSSProperties, type ReactNode } from "react";
import { useLingui } from "@lingui/react/macro";
import type { TouchLayoutIR, TouchKeyIR } from "@keyboard-studio/contracts";
import { KeyCap } from "./KeyCap.tsx";
import { BORDER, TEXT_DIM, ACCENT, FONT } from "../../../lib/galleryTheme.ts";

// ---------------------------------------------------------------------------
// Shape + platform-preference helpers (shared by both adapters)
// ---------------------------------------------------------------------------

export interface TouchPreviewKey {
  id: string;
  label: string;
  /** Small longpress-menu-exists corner label, from TouchKeyIR.hint / raw `sp`-adjacent hint field. */
  hint?: string;
  /** Sub-keys (longpress menu), read-only in this preview. */
  sk?: TouchPreviewKey[];
}

export interface TouchPreviewLayer {
  id: string;
  rows: Array<{ keys: TouchPreviewKey[] }>;
}

export interface TouchLayoutPreviewData {
  /** Platform ids the source layout ships, e.g. ["phone", "tablet"]. */
  platformIds: string[];
  /** The platform id these layers were drawn from (preference order below). */
  previewPlatformId: string;
  /** All layers of the preview platform (not just "default") — feeds the tab strip. */
  layers: TouchPreviewLayer[];
}

/** Preference order for which platform's layers to preview when several ship. */
export const PREVIEW_PLATFORM_ORDER = ["phone", "tablet", "desktop"] as const;

/** Pick the platform id to preview, per {@link PREVIEW_PLATFORM_ORDER}, falling back to the first shipped id. */
export function pickPreviewPlatformId(platformIds: readonly string[]): string | undefined {
  return PREVIEW_PLATFORM_ORDER.find((id) => platformIds.includes(id)) ?? platformIds[0];
}

function mapTouchKeyIrToPreviewKey(key: TouchKeyIR): TouchPreviewKey {
  // exactOptionalPropertyTypes: build the object with only the optional keys
  // that actually have a value, rather than assigning `undefined` to them.
  return {
    id: key.id,
    label: key.text ?? key.output ?? key.id,
    ...(key.hint !== undefined ? { hint: key.hint } : {}),
    ...(key.sk !== undefined ? { sk: key.sk.map(mapTouchKeyIrToPreviewKey) } : {}),
  };
}

/**
 * Adapt a real `TouchLayoutIR` (e.g. the output of `deriveSeedLayout` —
 * spec 035 R4a) into the presentational preview shape. Direct field pick, no
 * engine calls. Returns null when the layout ships no platforms at all.
 */
export function mapTouchLayoutIrToPreview(layout: TouchLayoutIR): TouchLayoutPreviewData | null {
  const platformIds = layout.platforms.map((p) => p.id);
  if (platformIds.length === 0) return null;

  const previewPlatformId = pickPreviewPlatformId(platformIds) ?? platformIds[0]!;
  const platform = layout.platforms.find((p) => p.id === previewPlatformId);
  if (platform === undefined) return null;

  const layers: TouchPreviewLayer[] = platform.layers.map((l) => ({
    id: l.id,
    rows: l.rows.map((r) => ({ keys: r.keys.map(mapTouchKeyIrToPreviewKey) })),
  }));

  return { platformIds, previewPlatformId, layers };
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const tabStripStyle: CSSProperties = {
  display: "flex",
  gap: 4,
  marginBottom: 8,
  flexWrap: "wrap",
};

const tabBtnStyle = (active: boolean): CSSProperties => ({
  padding: "3px 8px",
  fontSize: 11,
  fontFamily: FONT,
  borderRadius: 4,
  border: `1px solid ${active ? ACCENT : BORDER}`,
  background: active ? "#0d2840" : "transparent",
  color: active ? ACCENT : TEXT_DIM,
  cursor: "pointer",
});

const keycapRowStyle: CSSProperties = {
  display: "flex",
  gap: 4,
  flexWrap: "wrap",
  marginBottom: 4,
};

const keyWrapStyle: CSSProperties = {
  position: "relative",
  display: "inline-flex",
};

const subkeyBadgeStyle: CSSProperties = {
  position: "absolute",
  top: -4,
  right: -4,
  minWidth: 10,
  height: 10,
  borderRadius: "50%",
  background: ACCENT,
  border: "1px solid " + BORDER,
};

const subkeyStripStyle: CSSProperties = {
  position: "absolute",
  top: "100%",
  left: 0,
  zIndex: 1,
  display: "flex",
  gap: 3,
  padding: 4,
  marginTop: 2,
  background: "#0d2840",
  border: `1px solid ${ACCENT}`,
  borderRadius: 4,
};

const emptyMessageStyle: CSSProperties = {
  margin: 0,
  fontSize: 13,
  color: TEXT_DIM,
  fontFamily: FONT,
};

// ---------------------------------------------------------------------------
// PreviewKey — a single keycap, plus its optional subkey reveal strip
// ---------------------------------------------------------------------------

interface PreviewKeyCellProps {
  keyData: TouchPreviewKey;
}

function PreviewKeyCell({ keyData }: PreviewKeyCellProps) {
  const { t } = useLingui();
  const [expanded, setExpanded] = useState(false);
  const hasSubkeys = keyData.sk !== undefined && keyData.sk.length > 0;

  return (
    <span
      style={keyWrapStyle}
      onMouseEnter={hasSubkeys ? () => setExpanded(true) : undefined}
      onMouseLeave={hasSubkeys ? () => setExpanded(false) : undefined}
      onFocus={hasSubkeys ? () => setExpanded(true) : undefined}
      onBlur={hasSubkeys ? () => setExpanded(false) : undefined}
      tabIndex={hasSubkeys ? 0 : undefined}
      role={hasSubkeys ? "button" : undefined}
      aria-expanded={hasSubkeys ? expanded : undefined}
      aria-label={
        hasSubkeys
          ? t({
              id: "editor.touchSeed.subkeyRevealAriaLabel",
              message: "Show subkey alternates",
            })
          : undefined
      }
      title={keyData.hint}
    >
      <KeyCap>{keyData.label || " "}</KeyCap>
      {hasSubkeys && <span aria-hidden="true" style={subkeyBadgeStyle} />}
      {hasSubkeys && expanded && (
        <span style={subkeyStripStyle}>
          {keyData.sk?.map((sub, i) => <KeyCap key={i}>{sub.label}</KeyCap>)}
        </span>
      )}
    </span>
  );
}

// ---------------------------------------------------------------------------
// TouchLayoutPreview
// ---------------------------------------------------------------------------

export interface TouchLayoutPreviewProps {
  /** The preview data to render, or null/undefined for the empty state. */
  data: TouchLayoutPreviewData | null | undefined;
  /** Rendered instead of the grid when `data` is null/undefined or has no layers. */
  emptyMessage: ReactNode;
}

/**
 * Minimal, read-only rendering of a touch layout's preview platform: a
 * layer tab strip (when more than one layer ships) followed by keycap rows.
 * Never calls the engine and never mutates anything — this is a preview,
 * not the touch-layout editor.
 */
export function TouchLayoutPreview({ data, emptyMessage }: TouchLayoutPreviewProps) {
  const { t } = useLingui();
  const layers = data?.layers ?? [];
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);

  if (layers.length === 0) {
    return <p style={emptyMessageStyle}>{emptyMessage}</p>;
  }

  const activeLayerId =
    selectedLayerId !== null && layers.some((l) => l.id === selectedLayerId)
      ? selectedLayerId
      : (layers.find((l) => l.id === "default")?.id ?? layers[0]!.id);
  const activeLayer = layers.find((l) => l.id === activeLayerId) ?? layers[0]!;

  return (
    <div>
      {layers.length > 1 && (
        <div
          role="tablist"
          aria-label={t({ id: "editor.touchSeed.layerTabAriaLabel", message: "Layer" })}
          style={tabStripStyle}
        >
          {layers.map((layer) => (
            <button
              key={layer.id}
              type="button"
              role="tab"
              aria-selected={layer.id === activeLayerId}
              onClick={() => setSelectedLayerId(layer.id)}
              style={tabBtnStyle(layer.id === activeLayerId)}
            >
              {layer.id}
            </button>
          ))}
        </div>
      )}
      <div>
        {activeLayer.rows.map((row, i) => (
          <div key={i} style={keycapRowStyle}>
            {row.keys.map((k, j) => (
              <PreviewKeyCell key={k.id || j} keyData={k} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
