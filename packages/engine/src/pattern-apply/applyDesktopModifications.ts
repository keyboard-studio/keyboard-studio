/**
 * applyDesktopModifications — pure function that replays the locked desktop
 * work (Phase D carve removals + Phase C letter placements) onto a touch
 * seed, so both the reseed-from-desktop and import-adapt paths carry the
 * author's desktop decisions instead of silently dropping them.
 *
 * Two passes over the layout, run in the same chronological order as the
 * desktop decisions they replay (Phase C placements precede Phase D carve):
 *   1. Placements — for each {char, hostKey}, land the char on the phone
 *      platform's "default" layer only, as the host key's own production when
 *      the host is empty, or as a longpress (sk[]) alternate when the host
 *      already produces something else.
 *   2. Removals — walk EVERY platform/layer/row/key and strip any trace of a
 *      carved character (text/output/U_-id-decoded, plus sk/flick/multitap
 *      entries). A key whose primary production is carved is never deleted —
 *      it becomes an inert `T_removed_<n>` placeholder so row geometry stays
 *      stable (R9).
 *      Running removals AFTER placements matters: if a hostKey is both the
 *      target of a Phase C placement and later has its (now-superseded)
 *      character carved, the removal pass sees the key's CURRENT (placed)
 *      production — not its stale pre-placement one — so the key is
 *      evaluated correctly instead of being placeholder'd by an id lookup
 *      that placements can no longer find (placements index by the seed's
 *      original key id).
 *
 * @see specs/035-mobile-touch-derivation/contracts/seed-derivation.md — the contract.
 * @see applyTouchAssignments.ts — sibling Phase E applier (same structural-sharing idiom).
 */

import type { TouchLayoutIR, TouchKeyIR } from "@keyboard-studio/contracts";
import { NodeIdMinter } from "../shared/node-ids.js";
import { charToUnicodeKeyId } from "../shared/touch-ids.js";
import {
  buildRemovalSet,
  isTouchSubKeyDuplicate,
  keyMatchesRemovalSet,
} from "./touch-mechanism-shared.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface DesktopModifications {
  /** Phase D carve removals — characters no key may produce after replay. */
  removals: readonly string[];
  /** Phase C individual letter placements. */
  placements: readonly { char: string; hostKey: string }[];
}

export interface ApplyDesktopModificationsResult {
  /** Updated layout (structurally shared with the seed where unchanged). */
  layout: TouchLayoutIR;
  /** Diagnostic messages — e.g. a placement whose hostKey wasn't found. */
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Replay `mods` (carve removals + letter placements) onto `seed`, returning a
 * new (pure, non-mutating) layout with structural sharing for every
 * untouched platform/layer/row/key.
 */
export function applyDesktopModifications(
  seed: TouchLayoutIR,
  mods: DesktopModifications,
): ApplyDesktopModificationsResult {
  const warnings: string[] = [];
  const minter = new NodeIdMinter();

  const afterPlacements = applyPlacements(seed, mods.placements, warnings, minter);
  const removalSet = buildRemovalSet(mods.removals);
  const finalLayout = removeAcrossLayout(afterPlacements, removalSet);

  return { layout: finalLayout, warnings };
}

// ---------------------------------------------------------------------------
// Pass 1 — removals (every platform / layer / row / key)
// ---------------------------------------------------------------------------

/**
 * Walk every platform/layer/row/key in `layout`, stripping any trace of a
 * carved character. Structural sharing: a row/layer/platform is only
 * replaced when one of its keys actually changed.
 */
function removeAcrossLayout(layout: TouchLayoutIR, removalSet: ReadonlySet<string>): TouchLayoutIR {
  // Deterministic per-layout counter for T_removed_<n> placeholder ids —
  // increments only when a key's primary production is actually carved.
  let placeholderCounter = 0;
  const mintPlaceholderId = () => `T_removed_${placeholderCounter++}`;

  let anyPlatformChanged = false;
  const newPlatforms = layout.platforms.map((platform) => {
    let anyLayerChanged = false;
    const newLayers = platform.layers.map((layer) => {
      let anyRowChanged = false;
      const newRows = layer.rows.map((row) => {
        let anyKeyChanged = false;
        const newKeys = row.keys.map((key) => {
          const { key: nextKey, changed } = stripRemovedFromKey(key, removalSet, mintPlaceholderId);
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

  if (!anyPlatformChanged) return layout;
  return { ...layout, platforms: newPlatforms };
}

/**
 * Strip carved-character traces from a single key: drop matching sk/flick/
 * multitap entries, and — if the key's own primary production (text/output/
 * U_-id) is carved — convert it to an inert `T_removed_<n>` placeholder
 * (never delete the key object, so row geometry/widths stay stable — R9).
 * Gesture entries for OTHER characters are kept on the placeholder.
 */
function stripRemovedFromKey(
  key: TouchKeyIR,
  removalSet: ReadonlySet<string>,
  mintPlaceholderId: () => string,
): { key: TouchKeyIR; changed: boolean } {
  let sk = key.sk;
  if (sk) {
    const filtered = sk.filter((s) => !keyMatchesRemovalSet(s, removalSet));
    if (filtered.length !== sk.length) sk = filtered;
  }

  let multitap = key.multitap;
  if (multitap) {
    const filtered = multitap.filter((m) => !keyMatchesRemovalSet(m, removalSet));
    if (filtered.length !== multitap.length) multitap = filtered;
  }

  let flick = key.flick;
  if (flick) {
    const entries = Object.entries(flick).filter(
      ([, v]) => v !== undefined && !keyMatchesRemovalSet(v, removalSet),
    );
    if (entries.length !== Object.keys(flick).length) {
      flick = Object.fromEntries(entries) as NonNullable<TouchKeyIR["flick"]>;
    }
  }

  const primaryRemoved = keyMatchesRemovalSet(key, removalSet);
  const gestureEntriesChanged = sk !== key.sk || multitap !== key.multitap || flick !== key.flick;

  if (!primaryRemoved && !gestureEntriesChanged) {
    return { key, changed: false };
  }

  const base: TouchKeyIR = { ...key };
  if (sk !== undefined && sk !== key.sk) base.sk = sk;
  if (multitap !== undefined && multitap !== key.multitap) base.multitap = multitap;
  if (flick !== undefined && flick !== key.flick) base.flick = flick;

  if (!primaryRemoved) {
    return { key: base, changed: true };
  }

  // Primary production carved — never delete the key; convert to an inert
  // placeholder. `text`/`output` are cleared (destructure-omit, not set to
  // `undefined`, to satisfy exactOptionalPropertyTypes); every other field
  // (geometry, nextlayer, the filtered sk/flick/multitap above) is kept.
  const { text: _droppedText, output: _droppedOutput, ...rest } = base;
  const placeholder: TouchKeyIR = { ...rest, id: mintPlaceholderId() };
  return { key: placeholder, changed: true };
}

// ---------------------------------------------------------------------------
// Pass 2 — placements (phone platform's "default" layer only)
// ---------------------------------------------------------------------------

function applyPlacements(
  layout: TouchLayoutIR,
  placements: readonly { char: string; hostKey: string }[],
  warnings: string[],
  minter: NodeIdMinter,
): TouchLayoutIR {
  if (placements.length === 0) return layout;

  const phonePlatformIndex = layout.platforms.findIndex((p) => p.id === "phone");
  if (phonePlatformIndex === -1) {
    warnings.push(
      "[desktop-modifications] no phone platform found in layout — all placements skipped",
    );
    return layout;
  }
  const phonePlatform = layout.platforms[phonePlatformIndex]!;

  const defaultLayerIndex = phonePlatform.layers.findIndex((l) => l.id === "default");
  if (defaultLayerIndex === -1) {
    warnings.push(
      "[desktop-modifications] phone platform has no default layer — all placements skipped",
    );
    return layout;
  }
  const defaultLayer = phonePlatform.layers[defaultLayerIndex]!;

  // Shallow-clone rows up-front; replace individual key slots as placements
  // are processed (same idiom as applyTouchAssignments).
  const workingRows: Array<{ keys: TouchKeyIR[] }> = defaultLayer.rows.map((row) => ({
    keys: [...row.keys],
  }));

  const keyIndex = new Map<string, { rowIdx: number; keyIdx: number }>();
  for (let ri = 0; ri < workingRows.length; ri++) {
    const row = workingRows[ri]!;
    for (let ki = 0; ki < row.keys.length; ki++) {
      keyIndex.set(row.keys[ki]!.id, { rowIdx: ri, keyIdx: ki });
    }
  }

  function getWorkingKey(hostKey: string): TouchKeyIR | undefined {
    const pos = keyIndex.get(hostKey);
    return pos ? workingRows[pos.rowIdx]!.keys[pos.keyIdx] : undefined;
  }

  function setWorkingKey(hostKey: string, updated: TouchKeyIR): void {
    const pos = keyIndex.get(hostKey);
    if (!pos) return;
    workingRows[pos.rowIdx]!.keys[pos.keyIdx] = updated;
  }

  // Sensible fallback position: append a new letter key onto the last row
  // (or a fresh row if the layer is empty) so the character stays reachable
  // even with no obvious host position (e.g. no hostKey, or hostKey absent).
  function placeFallback(char: string): void {
    const fallbackKey: TouchKeyIR = {
      nodeId: minter.mint("touchKey"),
      id: charToUnicodeKeyId(char),
      text: char,
      provenance: "physical-suggested",
    };
    if (workingRows.length === 0) {
      workingRows.push({ keys: [fallbackKey] });
    } else {
      workingRows[workingRows.length - 1]!.keys.push(fallbackKey);
    }
    const lastRowIdx = workingRows.length - 1;
    keyIndex.set(fallbackKey.id, {
      rowIdx: lastRowIdx,
      keyIdx: workingRows[lastRowIdx]!.keys.length - 1,
    });
  }

  for (const rawPlacement of placements) {
    const { hostKey } = rawPlacement;
    // Normalize once so `text` and `id` (charToUnicodeKeyId NFC-normalizes
    // internally) always agree, even for an NFD-form placement char.
    const char = rawPlacement.char.normalize("NFC");
    const existing = hostKey ? getWorkingKey(hostKey) : undefined;

    if (!hostKey) {
      warnings.push(
        `[desktop-modifications] placement for "${char}" has no hostKey — placed via fallback`,
      );
      placeFallback(char);
      continue;
    }

    if (!existing) {
      warnings.push(
        `[desktop-modifications] host key "${hostKey}" not found in phone default layer — "${char}" placed via fallback`,
      );
      placeFallback(char);
      continue;
    }

    // Never overwrite a hand-set key (no-clobber — spec-014's provenance
    // axis, reused here per R6/R9): fall back instead so the placement is
    // not silently lost.
    if (existing.provenance === "hand-set") {
      warnings.push(
        `[desktop-modifications] host key "${hostKey}" is hand-set — "${char}" placed via fallback instead of overwriting an author edit`,
      );
      placeFallback(char);
      continue;
    }

    const hostIsEmpty = existing.text === undefined && existing.output === undefined;

    if (hostIsEmpty) {
      const { text: _t, output: _o, ...rest } = existing;
      const updated: TouchKeyIR = {
        ...rest,
        id: charToUnicodeKeyId(char),
        text: char,
        provenance: "physical-suggested",
      };
      setWorkingKey(hostKey, updated);
      continue;
    }

    // Host already produces another char — add as a longpress alternate.
    const existingSk = existing.sk ?? [];
    if (existingSk.some((s) => isTouchSubKeyDuplicate(s, char))) {
      continue;
    }

    const newSkKey: TouchKeyIR = {
      nodeId: minter.mint("touchKey"),
      id: charToUnicodeKeyId(char),
      text: char,
      provenance: "physical-suggested",
    };
    const updated: TouchKeyIR = {
      ...existing,
      sk: [...existingSk, newSkKey],
      provenance: "physical-suggested",
    };
    setWorkingKey(hostKey, updated);
  }

  const updatedDefaultLayer = { ...defaultLayer, rows: workingRows };
  const updatedLayers = phonePlatform.layers.map((layer, idx) =>
    idx === defaultLayerIndex ? updatedDefaultLayer : layer,
  );
  const updatedPhonePlatform = { ...phonePlatform, layers: updatedLayers };
  const updatedPlatforms = layout.platforms.map((platform, idx) =>
    idx === phonePlatformIndex ? updatedPhonePlatform : platform,
  );

  return { ...layout, platforms: updatedPlatforms };
}
