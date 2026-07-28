/**
 * applyTouchKeycapRemovalsToVfs — remove a set of individually-deleted,
 * pre-existing touch methods (main key / longpress / multitap / flick) from
 * the `.keyman-touch-layout` VFS entry, addressed by the stable scheme in
 * `touchKeyAddress.ts`.
 *
 * This is the WRITE side of the touch-method deletion overlay
 * (`workingCopyStore.deletedTouchKeyIds`); `enumerateTouchMethodsForChar.ts`
 * is the READ side that lists the candidates using the same addresses.
 * Mirrors the desktop carve keycap remover
 * (`applyCarveKeycapRemovalsToVfs.ts`) one level down: that pass blanks
 * keycaps by MATCHING CARVED CHARACTER TEXT across every key; this pass
 * blanks (or drops) a specific key/sub-entry by ADDRESS, since deletion here
 * is a user's per-method choice, not a character-wide carve.
 *
 * Two pure appliers, mirroring the existing `applyDesktopModifications` /
 * `applyDesktopModificationsToRawJson` twin shape so this feature's future
 * callers (e.g. an in-memory TouchGallery preview built on `TouchLayoutIR`)
 * have the same IR-based option available that the desktop-modification
 * replay already offers, without forcing every caller through a VFS:
 *   - `applyTouchKeycapRemovalsToLayout` — `TouchLayoutIR` in, structural
 *     sharing for untouched platforms/layers/rows (Case A shape).
 *   - `applyTouchKeycapRemovalsToRawJson` — raw `.keyman-touch-layout` JSON
 *     string in, parse → splice-in-place → stringify, preserving every
 *     unmodified field verbatim (Case B shape).
 * `applyTouchKeycapRemovalsToVfs` (the actual projection step wired into
 * `projectWorkingCopyVfs`) always uses the RAW-JSON variant: by the time this
 * step runs, `.keyman-touch-layout` in the VFS is already a fully-derived
 * JSON string (either freshly injected `touchLayoutJson`, Case A or B, or the
 * base VFS's shipped file) — there is no live `TouchLayoutIR` to hand it, and
 * splicing the raw JSON in place (rather than round-tripping it through
 * `parseTouchLayoutString`/`emitTouchLayout`) avoids re-losing the same
 * IR-unrepresented fields `applyDesktopModificationsToRawJson` documents
 * (per-key `layer`, `displayUnderlying`, `font`/`fontsize`, string-vs-int
 * `sp`/`width`/`pad`) — exactly the reasoning that motivates
 * `applyCarveKeycapRemovalsToVfs`'s own choice of a direct JSON-object splice
 * over an IR round-trip.
 *
 * Idempotency / desktop-cascade safety: addresses are resolved by
 * PLATFORM + LAYER + key/sub-key id, recomputed from whatever the touch
 * layout currently looks like at the point this step runs (step 1.5's
 * carve-keycap blanking always runs first in `projectWorkingCopyVfs` — see
 * that module's step ordering). If the desktop-carve cascade already
 * neutralized a key's id (`T_carved_*`) or removed an already-blanked
 * sub-entry, that key/sub-entry no longer resolves to its
 * pre-neutralization address, so a `deletedTouchKeyIds` entry that also
 * names it silently resolves to nothing here — never a double-blank, never a
 * thrown error. Missing addresses are NOT warned about: this is the expected
 * steady-state (every debounce cycle re-derives the touch layout from
 * scratch and re-applies the SAME deletion set against it), not a sign of
 * drift.
 *
 * Never deletes a key/row/layer/platform object outright — row geometry
 * stays stable, the same invariant `applyDesktopModifications` and
 * `applyCarveKeycapRemovalsToVfs` uphold.
 */

import type { TouchKeyIR, TouchLayoutIR, VirtualFS } from "@keyboard-studio/contracts";
import { resolveOskAssetPaths, readVfsText } from "./oskAssetShared.js";
import type { RawKey, RawPlatform, RawSubKey } from "./touch-layout-wire-format.js";
import { touchFlickAddress, touchKeyAddress, touchSubKeyAddress } from "./touchKeyAddress.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ApplyTouchKeycapRemovalsResult {
  /** Updated layout (structurally shared with the input where unchanged). */
  layout: TouchLayoutIR;
  warnings: string[];
}

export interface ApplyTouchKeycapRemovalsToRawJsonResult {
  /** Updated `.keyman-touch-layout` JSON string. */
  json: string;
  warnings: string[];
}

/** Placeholder id prefix minted for a deleted main key's `U_`/`output` id — parallels
 *  `applyCarveKeycapRemovalsToVfs`'s `T_carved_*`, distinct so the two removal
 *  passes never produce an ambiguous id. */
const PLACEHOLDER_PREFIX = "T_touchdel_";

function neutralizeId(id: string): string {
  return id.startsWith("U_") ? `${PLACEHOLDER_PREFIX}${id.slice(2)}` : `${PLACEHOLDER_PREFIX}${id}`;
}

// ---------------------------------------------------------------------------
// Case A — TouchLayoutIR (structural sharing)
// ---------------------------------------------------------------------------

/**
 * Blank/drop every touch method addressed by `deletedTouchKeyIds` in `layout`.
 * Pure — returns a new layout sharing every untouched platform/layer/row.
 */
export function applyTouchKeycapRemovalsToLayout(
  layout: TouchLayoutIR,
  deletedTouchKeyIds: ReadonlySet<string>,
): ApplyTouchKeycapRemovalsResult {
  const warnings: string[] = [];
  if (deletedTouchKeyIds.size === 0) return { layout, warnings };

  let anyPlatformChanged = false;
  const newPlatforms = layout.platforms.map((platform) => {
    let anyLayerChanged = false;
    const newLayers = platform.layers.map((layer) => {
      let anyRowChanged = false;
      const newRows = layer.rows.map((row) => {
        let anyKeyChanged = false;
        const newKeys = row.keys.map((key) => {
          const { key: nextKey, changed } = stripDeletedFromKey(
            platform.id,
            layer.id,
            key,
            deletedTouchKeyIds,
          );
          if (changed) anyKeyChanged = true;
          return nextKey;
        });
        if (!anyKeyChanged) return row;
        anyRowChanged = true;
        return { ...row, keys: newKeys };
      });
      if (!anyRowChanged) return layer;
      anyLayerChanged = true;
      return { ...layer, rows: newRows };
    });
    if (!anyLayerChanged) return platform;
    anyPlatformChanged = true;
    return { ...platform, layers: newLayers };
  });

  if (!anyPlatformChanged) return { layout, warnings };
  return { layout: { ...layout, platforms: newPlatforms }, warnings };
}

function stripDeletedFromKey(
  platform: string,
  layerId: string,
  key: TouchKeyIR,
  deletedIds: ReadonlySet<string>,
): { key: TouchKeyIR; changed: boolean } {
  let sk: TouchKeyIR[] | undefined = key.sk;
  let skChanged = false;
  if (sk) {
    const filtered = sk.filter(
      (s) => !deletedIds.has(touchSubKeyAddress(platform, layerId, key.id, "sk", s.id)),
    );
    if (filtered.length !== sk.length) {
      sk = filtered.length > 0 ? filtered : undefined;
      skChanged = true;
    }
  }

  let multitap: TouchKeyIR[] | undefined = key.multitap;
  let multitapChanged = false;
  if (multitap) {
    const filtered = multitap.filter(
      (m) => !deletedIds.has(touchSubKeyAddress(platform, layerId, key.id, "multitap", m.id)),
    );
    if (filtered.length !== multitap.length) {
      multitap = filtered.length > 0 ? filtered : undefined;
      multitapChanged = true;
    }
  }

  let flick: TouchKeyIR["flick"] = key.flick;
  let flickChanged = false;
  if (flick) {
    const entries = Object.entries(flick).filter(
      ([direction, v]) => v !== undefined && !deletedIds.has(touchFlickAddress(platform, layerId, key.id, direction)),
    );
    if (entries.length !== Object.keys(flick).length) {
      flick = entries.length > 0 ? (Object.fromEntries(entries) as NonNullable<TouchKeyIR["flick"]>) : undefined;
      flickChanged = true;
    }
  }

  const mainDeleted = deletedIds.has(touchKeyAddress(platform, layerId, key.id));
  const gestureEntriesChanged = skChanged || multitapChanged || flickChanged;

  if (!mainDeleted && !gestureEntriesChanged) {
    return { key, changed: false };
  }

  const base: TouchKeyIR = { ...key };
  if (skChanged) {
    if (sk === undefined) delete base.sk;
    else base.sk = sk;
  }
  if (multitapChanged) {
    if (multitap === undefined) delete base.multitap;
    else base.multitap = multitap;
  }
  if (flickChanged) {
    if (flick === undefined) delete base.flick;
    else base.flick = flick;
  }

  if (!mainDeleted) {
    return { key: base, changed: true };
  }

  // Never delete the key object — row geometry stays stable (mirrors
  // applyDesktopModifications / applyCarveKeycapRemovalsToVfs).
  const { text: _droppedText, output: droppedOutput, ...rest } = base;
  const nextId = droppedOutput !== undefined || key.id.startsWith("U_") ? neutralizeId(key.id) : key.id;
  return { key: { ...rest, id: nextId }, changed: true };
}

// ---------------------------------------------------------------------------
// Case B — raw `.keyman-touch-layout` JSON (splice-in-place)
// ---------------------------------------------------------------------------

/** The top-level raw `.keyman-touch-layout` JSON object. */
type RawTouchLayout = Record<string, unknown>;

/**
 * Splice `deletedTouchKeyIds` deletions directly onto a copy of the raw
 * `.keyman-touch-layout` JSON string, preserving every unmodified field
 * verbatim (never round-tripped through the IR — see module doc).
 */
export function applyTouchKeycapRemovalsToRawJson(
  rawJson: string,
  deletedTouchKeyIds: ReadonlySet<string>,
): ApplyTouchKeycapRemovalsToRawJsonResult {
  const warnings: string[] = [];
  if (deletedTouchKeyIds.size === 0) return { json: rawJson, warnings };

  const layout = JSON.parse(rawJson) as RawTouchLayout;
  let changed = false;

  for (const pName of Object.keys(layout)) {
    const platform = layout[pName];
    if (!platform || typeof platform !== "object") continue;
    const p = platform as RawPlatform;
    if (!Array.isArray(p.layer)) continue;

    for (const layer of p.layer) {
      if (!Array.isArray(layer.row)) continue;
      for (const row of layer.row) {
        if (!Array.isArray(row.key)) continue;
        for (const key of row.key) {
          if (stripDeletedFromRawKey(pName, layer.id, key, deletedTouchKeyIds)) {
            changed = true;
          }
        }
      }
    }
  }

  // Only re-stringify when something actually matched — an unmatched
  // (already-resolved-away, e.g. by the desktop cascade) deletion set must
  // not reformat the file (mirrors applyCarveKeycapRemovalsToVfs's own
  // changed-guard).
  return { json: changed ? JSON.stringify(layout) : rawJson, warnings };
}

/** Mutates `key` in place; returns true when anything was actually removed/blanked. */
function stripDeletedFromRawKey(
  platform: string,
  layerId: string,
  key: RawKey,
  deletedIds: ReadonlySet<string>,
): boolean {
  let changed = false;

  if (Array.isArray(key.sk)) {
    const filtered = key.sk.filter(
      (s: RawSubKey) => s.id === undefined || !deletedIds.has(touchSubKeyAddress(platform, layerId, key.id, "sk", s.id)),
    );
    if (filtered.length !== key.sk.length) {
      if (filtered.length > 0) key.sk = filtered;
      else delete key.sk;
      changed = true;
    }
  }
  if (Array.isArray(key.multitap)) {
    const filtered = key.multitap.filter(
      (m: RawSubKey) => m.id === undefined || !deletedIds.has(touchSubKeyAddress(platform, layerId, key.id, "multitap", m.id)),
    );
    if (filtered.length !== key.multitap.length) {
      if (filtered.length > 0) key.multitap = filtered;
      else delete key.multitap;
      changed = true;
    }
  }
  if (key.flick && typeof key.flick === "object") {
    for (const direction of Object.keys(key.flick)) {
      if (deletedIds.has(touchFlickAddress(platform, layerId, key.id, direction))) {
        delete key.flick[direction];
        changed = true;
      }
    }
    if (Object.keys(key.flick).length === 0) {
      delete key.flick;
    }
  }

  if (deletedIds.has(touchKeyAddress(platform, layerId, key.id))) {
    const hadOutput = key.output !== undefined;
    delete key.text;
    delete key.output;
    if (hadOutput || key.id.startsWith("U_")) {
      key.id = neutralizeId(key.id);
    }
    changed = true;
  }

  return changed;
}

// ---------------------------------------------------------------------------
// VFS projection step
// ---------------------------------------------------------------------------

/**
 * Apply the `deletedTouchKeyIds` overlay to the `.keyman-touch-layout` VFS
 * entry in place. No-op (no warnings) when the set is empty, the file is
 * absent, binary, or not valid JSON — a touch-only keyboard with nothing to
 * delete, or a keyboard shipping no touch layout at all, must not be treated
 * as an error.
 */
export function applyTouchKeycapRemovalsToVfs(
  vfs: VirtualFS,
  keyboardId: string,
  deletedTouchKeyIds: ReadonlySet<string>,
): { warnings: string[] } {
  const warnings: string[] = [];
  if (deletedTouchKeyIds.size === 0) return { warnings };

  const { touchPath } = resolveOskAssetPaths(vfs, keyboardId);
  const raw = readVfsText(vfs, touchPath);
  if (raw === undefined) return { warnings };

  let result: ApplyTouchKeycapRemovalsToRawJsonResult;
  try {
    result = applyTouchKeycapRemovalsToRawJson(raw, deletedTouchKeyIds);
  } catch {
    warnings.push(
      `[applyTouchKeycapRemovals] .keyman-touch-layout at "${touchPath}" is not valid JSON — touch method deletions not applied`,
    );
    return { warnings };
  }

  if (result.json !== raw) {
    vfs.set(touchPath, result.json, false);
  }
  warnings.push(...result.warnings);
  return { warnings };
}
