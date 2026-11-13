// CLDR legacy (43.1) Android keyboard → TouchLayoutIR (issue #2599).
//
// The Android file seeds the touch layout: each `<keyMap>` becomes one touch
// layer, each ISO row becomes a touch row, each `<map>` a touch key.
//   - keyMap (no modifiers) → layer `default`
//   - keyMap `shift caps`    → layer `shift`
//   - keyMap `opt`           → layer `symbol`
//   - keyMap `opt+shift`     → layer `symbol-shift`
//   - `longPress` lists become `sk` subkeys; `multitap` becomes `multitap`.
//
// Key identity (ruling §7): a key takes the K_ id of its ISO position when
// the desktop rule under the layer's modifiers outputs the labelled
// character (so the touch key fires the same rule as the hardware key).
// Otherwise it takes a `U_` id encoding its output codepoints
// (`U_00E9`, `U_0053_0053` for `SS`) — the studio's own literal-key idiom,
// a post-rule fallback needing no rule. The `text` label is always the
// CLDR `to` value. No navigation/shift keys are invented (ruling §8): CLDR
// carries none, and the author adds them in the touch editor.

import type {
  TouchLayoutIR,
  TouchKeyIR,
} from "@keyboard-studio/contracts";
import type {
  CldrLegacyKeyboard,
  CldrLegacyMap,
} from "./legacyXml.js";
import { isoToVkey, expandModifiers, formForLocale, ISO_ROWS_IN_ORDER } from "./isoKeys.js";
import type { CldrSkippedItem } from "./toIr.js";

/**
 * Resolves a touch label to the K_ key whose desktop rule under the layer's
 * modifiers outputs it. Built from the desktop file by
 * {@link makeDesktopTouchResolver}; absent when no desktop file is in play
 * (standalone touch import, e.g. #2610 before the base rules are known),
 * in which case every key takes a `U_` id.
 */
export interface CldrTouchKeyResolver {
  keyForOutput(char: string, modifiers: readonly string[]): string | undefined;
}

/**
 * Build a {@link CldrTouchKeyResolver} from a parsed desktop (windows / osx /
 * chromeos) file: the first key, in file order, whose `to` under the given
 * modifiers is the character. Base layer first, so plain keys beat shifted
 * ones — the same preference the desktop import's follower lookup uses.
 */
export function makeDesktopTouchResolver(
  desktop: CldrLegacyKeyboard,
): CldrTouchKeyResolver {
  const form = formForLocale(desktop.locale);
  const byOutputAndMods = new Map<string, string>();
  for (const keyMap of desktop.keyMaps) {
    const { sets } = expandModifiers(keyMap.modifiers);
    for (const modifiers of sets) {
      for (const map of keyMap.maps) {
        if (map.to === "") continue;
        const key = `${map.to}|${modifiers.join(" ")}`;
        if (!byOutputAndMods.has(key)) {
          const vkey = isoToVkey(map.iso, form);
          if (vkey !== undefined) byOutputAndMods.set(key, vkey);
        }
      }
    }
  }
  return {
    keyForOutput: (char: string, modifiers: readonly string[]) =>
      byOutputAndMods.get(`${char}|${[...modifiers].join(" ")}`),
  };
}

/** `U_` id encoding a string's codepoints (`U_00E9`, `U_0053_0053`). */
export function unicodeKeyIdFor(text: string): string {
  const groups = [...text].map((ch) =>
    (ch.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, "0"),
  );
  return `U_${groups.join("_")}`;
}

export interface CldrTouchImportReport {
  platform: "phone" | "tablet";
  layers: string[];
  keys: number;
  longpressSubkeys: number;
  multitapSubkeys: number;
  /** Modifier values whose keyMaps were skipped (not one of the four above). */
  skippedKeyMaps: string[];
  skipped: CldrSkippedItem[];
}

export interface CldrTouchImportResult {
  touchLayout: TouchLayoutIR;
  report: CldrTouchImportReport;
}

export interface ImportCldrTouchOptions {
  platform: "phone" | "tablet";
  resolver?: CldrTouchKeyResolver;
}

/** Touch layer id + rule modifiers for an Android `modifiers` attribute. */
function layerForModifiers(
  modifiers: string | undefined,
): { id: string; modifiers: string[] } | undefined {
  if (modifiers === undefined || modifiers.trim() === "") {
    return { id: "default", modifiers: [] };
  }
  const lower = modifiers.toLowerCase();
  const hasOpt = lower.includes("opt");
  const hasShift = lower.includes("shift");
  const hasCaps = lower.includes("caps");
  if (hasOpt) {
    return { id: hasShift ? "symbol-shift" : "symbol", modifiers: [] };
  }
  if (hasShift) return { id: "shift", modifiers: ["SHIFT"] };
  if (hasCaps) return { id: "caps", modifiers: ["CAPS"] };
  return undefined;
}

function parseIso(iso: string): { row: string; col: number } | undefined {
  const m = /^([A-Z])([0-9]{2})$/.exec(iso.toUpperCase());
  if (m === null) return undefined;
  return { row: m[1] as string, col: parseInt(m[2] as string, 10) };
}

/**
 * Import a parsed Android legacy CLDR keyboard into a single-platform
 * {@link TouchLayoutIR}. Pass the `phone` file for the phone platform and a
 * `600dpi`/`768dpi` file for `tablet`; the combined import assembles both.
 */
export function importCldrTouchLayout(
  android: CldrLegacyKeyboard,
  opts: ImportCldrTouchOptions,
): CldrTouchImportResult {
  const skipped: CldrSkippedItem[] = [];
  const skippedKeyMaps: string[] = [];
  let keyCounter = 0;
  const nextNodeId = (): string =>
    `touchkey:cldr:${opts.platform}:${++keyCounter}`;

  const resolveKeyId = (
    map: CldrLegacyMap,
    layerModifiers: readonly string[],
  ): string => {
    const vkey = isoToVkey(map.iso, formForLocale(android.locale));
    if (
      vkey !== undefined &&
      opts.resolver !== undefined &&
      opts.resolver.keyForOutput(map.to, layerModifiers) === vkey
    ) {
      return vkey;
    }
    return unicodeKeyIdFor(map.to);
  };

  const buildSubkeys = (
    list: string | undefined,
    layerModifiers: readonly string[],
  ): TouchKeyIR[] | undefined => {
    if (list === undefined || list.trim() === "") return undefined;
    const subkeys: TouchKeyIR[] = [];
    for (const item of list.split(/\s+/).filter((s) => s !== "")) {
      const kId =
        opts.resolver?.keyForOutput(item, layerModifiers) ??
        unicodeKeyIdFor(item);
      subkeys.push({ nodeId: nextNodeId(), id: kId, text: item });
    }
    return subkeys.length > 0 ? subkeys : undefined;
  };

  const layers: TouchLayoutIR["platforms"][number]["layers"] = [];
  const layerIds: string[] = [];
  let keyCount = 0;
  let longpressCount = 0;
  let multitapCount = 0;

  for (const keyMap of android.keyMaps) {
    const layer = layerForModifiers(keyMap.modifiers);
    if (layer === undefined) {
      skippedKeyMaps.push(keyMap.modifiers ?? "(missing)");
      continue;
    }
    // Rows grouped by ISO row letter, in E/D/C/B/A order; keys sorted by
    // ISO column within a row. Positions with no desktop vkey (A00–A04 …)
    // still become keys — they take `U_` ids (see resolveKeyId).
    const byRow = new Map<string, CldrLegacyMap[]>();
    for (const map of keyMap.maps) {
      if (map.to === "") {
        skipped.push({ reason: "empty-to", detail: `iso=${map.iso}` });
        continue;
      }
      const pos = parseIso(map.iso);
      if (pos === undefined) {
        skipped.push({ reason: "bad-iso", detail: `iso=${map.iso}` });
        continue;
      }
      const row = byRow.get(pos.row) ?? [];
      row.push(map);
      byRow.set(pos.row, row);
    }
    const rows = ISO_ROWS_IN_ORDER.filter((row) => byRow.has(row)).map(
      (rowLetter, rowIdx) => {
        const maps = (byRow.get(rowLetter) ?? []).sort(
          (a, b) =>
            (parseIso(a.iso)?.col ?? 0) - (parseIso(b.iso)?.col ?? 0),
        );
        return {
          id: rowIdx + 1,
          keys: maps.map((map) => {
            const sk = buildSubkeys(map.longPress, layer.modifiers);
            const multitap = buildSubkeys(map.multitap, layer.modifiers);
            if (sk !== undefined) longpressCount += sk.length;
            if (multitap !== undefined) multitapCount += multitap.length;
            keyCount++;
            return {
              nodeId: nextNodeId(),
              id: resolveKeyId(map, layer.modifiers),
              text: map.to,
              ...(sk !== undefined ? { sk } : {}),
              ...(multitap !== undefined ? { multitap } : {}),
            } satisfies TouchKeyIR;
          }),
        };
      },
    );
    layerIds.push(layer.id);
    layers.push({ id: layer.id, rows });
  }

  return {
    touchLayout: {
      platforms: [{ id: opts.platform, layers }],
      nodeIds: [],
    },
    report: {
      platform: opts.platform,
      layers: layerIds,
      keys: keyCount,
      longpressSubkeys: longpressCount,
      multitapSubkeys: multitapCount,
      skippedKeyMaps,
      skipped,
    },
  };
}
