/**
 * layout-chart — deterministic SVG layout charts for the welcome folder
 * (spec 076 T049, FR-013/FR-014/FR-015/FR-016, research R1/R2).
 *
 * `renderLayoutCharts` is a pure projection over contracts types only, one
 * file per (platform, layer) pair present in the model:
 *
 *  - **Desktop** layers render from `KvksIR` labels when present (its
 *    `layer.keys[].label` is exactly the display text a visual keyboard
 *    shows), else from the `KeyboardIR`'s rule outputs projected onto the
 *    fixed physical grid ({@link DESKTOP_GEOMETRY}) via `collectLayerCombosInUse`
 *    / `buildComboKeyMap` — the same combo-scanning vocabulary the S-08
 *    mechanism gallery uses. The empty (no-modifier) combo is always included
 *    first, so a desktop chart set is never empty (a `KeyboardIR` always has
 *    at least the default layer).
 *  - **Touch** layers render from `TouchLayoutIR`'s declared `width`/`pad`
 *    geometry (never a rendered width — spec 065's rule) via
 *    `computeRowMetrics`'s own defaulting. Only the `phone`/`tablet`
 *    `platforms[]` entries are charted here: a `TouchLayoutIR` MAY also carry
 *    a `"desktop"` platform, but the desktop chart is already produced from
 *    `kvks`/`ir` above, and charting both would risk two files at the same
 *    (platform, layerId) filename for a keyboard whose touch and desktop
 *    layer ids happen to coincide (e.g. both calling the base layer
 *    `"default"`). `touchLayout === null` yields zero touch files.
 */

import type { KeyboardIR, KvksIR, LayoutChartFile, LayoutChartInput, LayoutChartPlatform, TouchLayoutIR } from "@keyboard-studio/contracts";
import { computeRowMetrics, DEFAULT_KEY_PAD_PCT, DEFAULT_KEY_WIDTH_PCT } from "@keyboard-studio/contracts";

import {
  buildComboKeyMap,
  collectLayerCombosInUse,
  comboToTouchLayerId,
  type ModifierToken,
} from "../pattern-apply/index.js";

import { DESKTOP_GEOMETRY, DESKTOP_GEOMETRY_WIDTH, DESKTOP_ROW_COUNT } from "./geometry.js";
import { classifyKeyLegibility } from "./legibility.js";
import { renderKeycapSvg, renderSvgDocument } from "./svg.js";
import { layoutChartFilename } from "./filename.js";

export { layoutChartFilename, LAYOUT_CHART_PREFIX, isLayoutChartFilename, layoutChartPlatformFromFilename, sanitizeLayerIdForFilename } from "./filename.js";
export { DESKTOP_GEOMETRY, DESKTOP_GEOMETRY_WIDTH } from "./geometry.js";
export {
  classifyKeyLegibility,
  DOTTED_CIRCLE,
  FALLBACK_FONT_STACK,
  NO_GLYPH_FONT_STACK,
  NORMAL_KEYCAP_CLASS,
  EMPTY_KEYCAP_CLASS,
  NO_GLYPH_LABEL_CLASS,
  SCRIPT_COVERAGE_RANGES,
  isCodePointCovered,
  formatCodePointLabel,
} from "./legibility.js";
export type { KeyLegibilityKind, KeyLegibilityResult, ScriptCoverageRange } from "./legibility.js";
export { formatSvgNumber, renderKeycapSvg, renderSvgDocument } from "./svg.js";

// ---------------------------------------------------------------------------
// Desktop chart layers
// ---------------------------------------------------------------------------

const DESKTOP_UNIT_PX = 60;
const DESKTOP_ROW_HEIGHT_PX = 60;
const DESKTOP_ROW_GAP_PX = 6;
const DESKTOP_MARGIN_PX = 12;
const DESKTOP_FONT_SIZE_PX = 18;

interface DesktopLayer {
  readonly layerId: string;
  readonly outputs: ReadonlyMap<string, string>;
}

/** One entry per `KvksIR` layer, or per desktop combo in use when no `KvksIR` is present — the empty combo (base layer) always first. */
function collectDesktopLayers(kvks: KvksIR | null, ir: KeyboardIR): DesktopLayer[] {
  if (kvks !== null && kvks.layers.length > 0) {
    return kvks.layers.map((layer) => {
      const layerId = layer.shift === "" ? "default" : layer.shift;
      const outputs = new Map<string, string>();
      for (const key of layer.keys) {
        outputs.set(key.vkey, key.label);
      }
      return { layerId, outputs };
    });
  }

  const combos: ModifierToken[][] = [[], ...collectLayerCombosInUse(ir)];
  return combos.map((combo) => ({
    layerId: comboToTouchLayerId(combo) ?? "default",
    outputs: buildComboKeyMap(ir, combo),
  }));
}

function renderDesktopLayerSvg(displayName: string, layerId: string, outputs: ReadonlyMap<string, string>): string {
  const width = DESKTOP_GEOMETRY_WIDTH * DESKTOP_UNIT_PX + DESKTOP_MARGIN_PX * 2;
  const height =
    DESKTOP_ROW_COUNT * (DESKTOP_ROW_HEIGHT_PX + DESKTOP_ROW_GAP_PX) - DESKTOP_ROW_GAP_PX + DESKTOP_MARGIN_PX * 2;

  const body = DESKTOP_GEOMETRY.map((key) => {
    const legibility = classifyKeyLegibility(outputs.get(key.id));
    return renderKeycapSvg({
      x: DESKTOP_MARGIN_PX + key.x * DESKTOP_UNIT_PX,
      y: DESKTOP_MARGIN_PX + key.row * (DESKTOP_ROW_HEIGHT_PX + DESKTOP_ROW_GAP_PX),
      width: key.width * DESKTOP_UNIT_PX,
      height: DESKTOP_ROW_HEIGHT_PX,
      keycapClassName: legibility.keycapClassName,
      labelClassName: legibility.labelClassName,
      fontStack: legibility.fontStack,
      fontSize: DESKTOP_FONT_SIZE_PX,
      label: legibility.displayText,
    });
  }).join("");

  return renderSvgDocument({
    width,
    height,
    title: `${displayName} — desktop — ${layerId}`,
    body,
  });
}

// ---------------------------------------------------------------------------
// Touch chart layers
// ---------------------------------------------------------------------------

const TOUCH_UNIT_PX = 3; // px per declared width/pad percent-unit
const TOUCH_ROW_HEIGHT_PX = 50;
const TOUCH_ROW_GAP_PX = 6;
const TOUCH_MARGIN_PX = 12;
const TOUCH_FONT_SIZE_PX = 16;

type TouchLayoutLayer = TouchLayoutIR["platforms"][number]["layers"][number];

function renderTouchLayerSvg(
  displayName: string,
  platform: LayoutChartPlatform,
  layerId: string,
  layer: TouchLayoutLayer,
): string {
  let maxRowWidth = 0;
  const rowBodies: string[] = [];

  layer.rows.forEach((row, rowIndex) => {
    const metrics = computeRowMetrics(row.keys, platform);
    maxRowWidth = Math.max(maxRowWidth, metrics.rowTotal);
    const y = TOUCH_MARGIN_PX + rowIndex * (TOUCH_ROW_HEIGHT_PX + TOUCH_ROW_GAP_PX);

    let cursor = 0;
    for (const key of row.keys) {
      const pad = key.pad ?? DEFAULT_KEY_PAD_PCT;
      const width = key.width ?? DEFAULT_KEY_WIDTH_PCT;
      cursor += pad;
      const legibility = classifyKeyLegibility(key.text ?? key.output);
      rowBodies.push(
        renderKeycapSvg({
          x: TOUCH_MARGIN_PX + cursor * TOUCH_UNIT_PX,
          y,
          width: width * TOUCH_UNIT_PX,
          height: TOUCH_ROW_HEIGHT_PX,
          keycapClassName: legibility.keycapClassName,
          labelClassName: legibility.labelClassName,
          fontStack: legibility.fontStack,
          fontSize: TOUCH_FONT_SIZE_PX,
          label: legibility.displayText,
        }),
      );
      cursor += width;
    }
  });

  const width = maxRowWidth * TOUCH_UNIT_PX + TOUCH_MARGIN_PX * 2;
  const height =
    layer.rows.length * (TOUCH_ROW_HEIGHT_PX + TOUCH_ROW_GAP_PX) - TOUCH_ROW_GAP_PX + TOUCH_MARGIN_PX * 2;

  return renderSvgDocument({
    width,
    height,
    title: `${displayName} — ${platform} — ${layerId}`,
    body: rowBodies.join(""),
  });
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

const TOUCH_CHART_PLATFORMS: ReadonlySet<string> = new Set(["phone", "tablet"]);

/**
 * Render every layout chart for `input` — one {@link LayoutChartFile} per
 * (platform, layer) pair present in the model, in model order. Pure and
 * deterministic (FR-014): same input, byte-identical `svg` strings.
 */
export function renderLayoutCharts(input: LayoutChartInput): LayoutChartFile[] {
  const { displayName, kvks, ir, touchLayout } = input;
  const files: LayoutChartFile[] = [];

  for (const { layerId, outputs } of collectDesktopLayers(kvks, ir)) {
    files.push({
      filename: layoutChartFilename("desktop", layerId),
      platform: "desktop",
      layerId,
      svg: renderDesktopLayerSvg(displayName, layerId, outputs),
    });
  }

  if (touchLayout !== null) {
    for (const platformEntry of touchLayout.platforms) {
      if (!TOUCH_CHART_PLATFORMS.has(platformEntry.id)) continue;
      const platform = platformEntry.id as LayoutChartPlatform;
      for (const layer of platformEntry.layers) {
        files.push({
          filename: layoutChartFilename(platform, layer.id),
          platform,
          layerId: layer.id,
          svg: renderTouchLayerSvg(displayName, platform, layer.id, layer),
        });
      }
    }
  }

  return files;
}
