/**
 * applyDesktopModifications — pure function that replays the locked desktop
 * work (Phase D carve removals + Phase C letter placements) onto a touch
 * seed, so both the reseed-from-desktop and import-adapt paths carry the
 * author's desktop decisions instead of silently dropping them.
 *
 * Two passes over the layout, run in the same chronological order as the
 * desktop decisions they replay (Phase C placements precede Phase D carve):
 *   1. Placements — for each {char, baseKey}, land the char on the mobile
 *      platform's ("phone", or "tablet" when no "phone" platform is present —
 *      see {@link resolveMobilePlatformIndex}) layer its case selects (see
 *      {@link touchLayerForChar} in touchLayer.ts: an uppercase char targets
 *      "shift", everything else targets "default"), as the host key's own
 *      production when the host is empty, or as a longpress (sk[]) alternate
 *      when the host already produces something else. A "shift"-targeted
 *      placement falls back to "default" (with a warning) when the mobile
 *      platform has no shift layer, so the char always stays reachable.
 *   2. Removals — walk EVERY platform/layer/row/key and strip any trace of a
 *      carved character (text/output/U_-id-decoded, plus sk/flick/multitap
 *      entries). A key whose primary production is carved is never deleted —
 *      it becomes the corpus's own blank (`T_BLANK` + `sp` 10, see
 *      {@link BLANK_KEY_ID}) so row geometry stays stable (R9) without leaving
 *      a dead key that still draws as a live one.
 *      Running removals AFTER placements matters: if a baseKey is both the
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
  BLANK_KEY_ID,
  BLANK_KEY_SP,
  buildRemovalSet,
  findSlotOccupant,
  isTouchKeyPrimaryProduction,
  isTouchSubKeyDuplicate,
  keyMatchesRemovalSet,
  resolvedTextProductions,
  resolveMobilePlatformIndex,
  touchKeyIdFamily,
  type PlacementResolverContext,
} from "./touch-mechanism-shared.js";
import { DEFAULT_TOUCH_LAYER, touchLayerForChar } from "./touchLayer.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface DesktopModifications {
  /** Phase D carve removals — characters no key may produce after replay. */
  removals: readonly string[];
  /** Phase C individual letter placements. */
  placements: readonly { char: string; baseKey: string }[];
}

export interface ApplyDesktopModificationsResult {
  /** Updated layout (structurally shared with the seed where unchanged). */
  layout: TouchLayoutIR;
  /** Diagnostic messages — e.g. a placement whose baseKey wasn't found. */
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Replay `mods` (carve removals + letter placements) onto `seed`, returning a
 * new (pure, non-mutating) layout with structural sharing for every
 * untouched platform/layer/row/key.
 *
 * `resolverCtx` (spec 104 FR-021, T017): when supplied, placement host
 * lookup is resolver-addressed — an exact-id miss falls back to the slot's
 * OCCUPANT (the T_/U_ key whose resolved production in the layer state
 * equals the physical key's, see {@link findSlotOccupant}), and a T_/U_
 * host's production is read from the resolver rather than from keycap
 * text. When absent, the legacy exact-id behaviour is unchanged.
 */
export function applyDesktopModifications(
  seed: TouchLayoutIR,
  mods: DesktopModifications,
  resolverCtx?: PlacementResolverContext,
): ApplyDesktopModificationsResult {
  const warnings: string[] = [];
  const minter = new NodeIdMinter();

  const afterPlacements = applyPlacements(seed, mods.placements, warnings, minter, resolverCtx);
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
  let anyPlatformChanged = false;
  const newPlatforms = layout.platforms.map((platform) => {
    let anyLayerChanged = false;
    const newLayers = platform.layers.map((layer) => {
      let anyRowChanged = false;
      const newRows = layer.rows.map((row) => {
        let anyKeyChanged = false;
        const newKeys = row.keys.map((key) => {
          const { key: nextKey, changed } = stripRemovedFromKey(key, removalSet);
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
 * U_-id) is carved — convert it to the corpus's own blank ({@link BLANK_KEY_ID}
 * + {@link BLANK_KEY_SP}), never deleting the key object, so row geometry/widths
 * stay stable (R9). Gesture entries for OTHER characters are kept on it.
 */
function stripRemovedFromKey(
  key: TouchKeyIR,
  removalSet: ReadonlySet<string>,
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
  //
  // An emptied key becomes the corpus's own blank: `T_BLANK` + `sp` 10.
  //
  // `sp` is the substance. Clearing production while leaving `sp` at its old
  // value (in practice `0`, the character class) is exactly the half-done
  // neutralization FR-029c names — `applySuppressSemantics`'s own doc puts it as
  // "a half-done suppression is a live key that looks dead". This is the mirror
  // image: a DEAD key that looks LIVE. The author saw a full-size,
  // ordinary-looking keycap that silently emitted nothing.
  //
  // The pairing is the CORPUS's, measured rather than assumed: across
  // ../keyboards, `T_BLANK` occurs 117 times and carries `sp` 10 every single
  // time — never 9 — and `T_SPACER` another 106 times, also always 10. Sixty-six
  // of those `T_BLANK`s are in `sil_cameroon_azerty` alone. So the blank a
  // Keyman author recognizes is the spacer class, and an emptied key written any
  // other way would be a shape this corpus does not contain.
  //
  // Deliberately NOT `proposeSuppressFields("keycap-hole")`, whose pairing is
  // `T_BLANK` + 9 (key-id-policy.md §2): that combination appears nowhere in the
  // corpus, so this path states its own pairing rather than inheriting one that
  // would contradict the shipped layouts it has to blend into. Flagged as a
  // discrepancy in the suppress policy rather than silently reconciled here —
  // changing what `suppress` writes is a separate, spec-owned decision.
  //
  // Consequence worth knowing: every emptied key in a layer now shares the id
  // `T_BLANK`, and `touchKeyAddress` is built from the id alone, so they share
  // one address. That is the same condition the shipped layout already creates
  // with its own 66 blanks; it is a property of the address scheme, not of this
  // function, and it is why per-occurrence addressing is the outstanding work.
  const { text: _droppedText, output: _droppedOutput, ...rest } = base;
  const placeholder: TouchKeyIR = { ...rest, id: BLANK_KEY_ID, sp: BLANK_KEY_SP };
  // #2216: `rest` retains the source key's `spWire`, which encodes the OLD
  // `sp` — left in place it would emit the carved key's original class
  // instead of the blank/spacer class. When the blanking actually changes
  // `sp`, drop the hint (canonical string fallback; the emitter also
  // self-validates via `resolveWireEncoding`). A key already at
  // BLANK_KEY_SP keeps its hint — its encoding still denotes its value.
  if (base.sp !== BLANK_KEY_SP) delete placeholder.spWire;
  return { key: placeholder, changed: true };
}

// ---------------------------------------------------------------------------
// Pass 2 — placements (mobile platform, layer selected by touchLayerForChar)
// ---------------------------------------------------------------------------

/** Mutable per-layer working state, created lazily the first time a
 *  placement targets that layer. A layer with no state was never touched and
 *  is returned by reference (same idiom as applyTouchAssignments.ts). */
interface LayerWorkState {
  /** Index of this layer within `phonePlatform.layers`. */
  layerIndex: number;
  /** Shallow-cloned rows whose key slots we replace as we accumulate changes. */
  workingRows: Array<{ keys: TouchKeyIR[] }>;
  /** key id -> { rowIdx, keyIdx }, built once per layer. */
  keyIndex: Map<string, { rowIdx: number; keyIdx: number }>;
}

function applyPlacements(
  layout: TouchLayoutIR,
  placements: readonly { char: string; baseKey: string }[],
  warnings: string[],
  minter: NodeIdMinter,
  resolverCtx?: PlacementResolverContext,
): TouchLayoutIR {
  if (placements.length === 0) return layout;

  const phonePlatformIndex = resolveMobilePlatformIndex(layout.platforms);
  if (phonePlatformIndex === -1) {
    warnings.push(
      "[desktop-modifications] no phone or tablet platform found in layout — all placements skipped",
    );
    return layout;
  }
  const phonePlatform = layout.platforms[phonePlatformIndex]!;

  // Per-layer working state, populated lazily: a layer no placement targets
  // is never cloned and therefore comes back reference-equal.
  const layerStates = new Map<string, LayerWorkState>();

  function resolveLayerState(layerId: string): LayerWorkState | undefined {
    const existing = layerStates.get(layerId);
    if (existing) return existing;

    const layerIndex = phonePlatform.layers.findIndex((l) => l.id === layerId);
    if (layerIndex === -1) return undefined;

    const layer = phonePlatform.layers[layerIndex]!;
    // Shallow-clone rows up-front; replace individual key slots as
    // placements are processed (same idiom as applyTouchAssignments).
    // #2083: preserve the source row id.
    const workingRows: Array<{ id?: number; keys: TouchKeyIR[] }> = layer.rows.map((row) => ({
      ...(row.id !== undefined ? { id: row.id } : {}),
      keys: [...row.keys],
    }));

    const keyIndex = new Map<string, { rowIdx: number; keyIdx: number }>();
    for (let ri = 0; ri < workingRows.length; ri++) {
      const row = workingRows[ri]!;
      for (let ki = 0; ki < row.keys.length; ki++) {
        keyIndex.set(row.keys[ki]!.id, { rowIdx: ri, keyIdx: ki });
      }
    }

    const state: LayerWorkState = { layerIndex, workingRows, keyIndex };
    layerStates.set(layerId, state);
    return state;
  }

  // The default layer must exist up front — a "shift"-targeted placement
  // falls back to it (see resolveTargetLayer below), and a layout with no
  // default layer at all skips every placement, same as before this change.
  if (!resolveLayerState(DEFAULT_TOUCH_LAYER)) {
    warnings.push(
      `[desktop-modifications] ${phonePlatform.id} platform has no default layer — all placements skipped`,
    );
    return layout;
  }

  /**
   * Resolve the layer a placement's char targets (via touchLayerForChar).
   * Falls back to the default layer — with a warning — when the case rule
   * picks a layer (e.g. "shift") the mobile platform doesn't have, so the
   * char stays reachable rather than silently dropped.
   */
  function resolveTargetLayer(char: string): { state: LayerWorkState; layerId: string } {
    const desiredLayerId = touchLayerForChar(char);
    const desiredState = resolveLayerState(desiredLayerId);
    if (desiredState) return { state: desiredState, layerId: desiredLayerId };

    warnings.push(
      `[desktop-modifications] ${phonePlatform.id} platform has no "${desiredLayerId}" layer — "${char}" placed on the default layer instead`,
    );
    // Guaranteed present — checked above.
    return { state: resolveLayerState(DEFAULT_TOUCH_LAYER)!, layerId: DEFAULT_TOUCH_LAYER };
  }

  function getWorkingKey(state: LayerWorkState, baseKey: string): TouchKeyIR | undefined {
    const pos = state.keyIndex.get(baseKey);
    return pos ? state.workingRows[pos.rowIdx]!.keys[pos.keyIdx] : undefined;
  }

  function setWorkingKey(state: LayerWorkState, baseKey: string, updated: TouchKeyIR): void {
    const pos = state.keyIndex.get(baseKey);
    if (!pos) return;
    state.workingRows[pos.rowIdx]!.keys[pos.keyIdx] = updated;
  }

  function setWorkingKeyAt(
    state: LayerWorkState,
    pos: { rowIdx: number; keyIdx: number },
    updated: TouchKeyIR,
  ): void {
    state.workingRows[pos.rowIdx]!.keys[pos.keyIdx] = updated;
  }

  /**
   * Land `char` on `host` as a longpress alternate — the landing a T_/U_
   * host or slot occupant always gets (spec 104 FR-021): their ids carry
   * rule linkage or decode identity, so the empty-host id rewrite the K_
   * path uses would sever the very identity the placement is meant to
   * respect. A host that already carries the char as a sub-key is left
   * untouched (no duplicate).
   */
  function landAsLongpress(
    state: LayerWorkState,
    pos: { rowIdx: number; keyIdx: number },
    host: TouchKeyIR,
    char: string,
  ): void {
    const existingSk = host.sk ?? [];
    if (existingSk.some((s) => isTouchSubKeyDuplicate(s, char))) return;
    const newSkKey: TouchKeyIR = {
      nodeId: minter.mint("touchKey"),
      id: charToUnicodeKeyId(char),
      text: char,
      provenance: "physical-suggested",
    };
    setWorkingKeyAt(state, pos, {
      ...host,
      sk: [...existingSk, newSkKey],
      provenance: "physical-suggested",
    });
  }

  /**
   * The position of the slot's resolver-resolved occupant (FR-021), scanning
   * the layer's CURRENT working keys row-major — a placement earlier in
   * this same pass may already have landed on the occupant, and a later
   * placement for the same slot must find it again.
   */
  function findOccupantPosition(
    state: LayerWorkState,
    baseKey: string,
    layerId: string,
  ): { rowIdx: number; keyIdx: number } | undefined {
    if (!resolverCtx) return undefined;
    const candidates: TouchKeyIR[] = [];
    const positions: Array<{ rowIdx: number; keyIdx: number }> = [];
    for (let ri = 0; ri < state.workingRows.length; ri++) {
      const row = state.workingRows[ri]!;
      for (let ki = 0; ki < row.keys.length; ki++) {
        candidates.push(row.keys[ki]!);
        positions.push({ rowIdx: ri, keyIdx: ki });
      }
    }
    const occupant = findSlotOccupant(resolverCtx, candidates, baseKey, layerId);
    if (!occupant) return undefined;
    const idx = candidates.indexOf(occupant);
    return idx === -1 ? undefined : positions[idx];
  }

  // Sensible fallback position: append a new letter key onto the last row of
  // the target layer (or a fresh row if the layer is empty) so the character
  // stays reachable even with no obvious host position (e.g. no baseKey, or
  // baseKey absent from that layer).
  function placeFallback(state: LayerWorkState, char: string): void {
    const fallbackKey: TouchKeyIR = {
      nodeId: minter.mint("touchKey"),
      id: charToUnicodeKeyId(char),
      text: char,
      provenance: "physical-suggested",
    };
    if (state.workingRows.length === 0) {
      state.workingRows.push({ keys: [fallbackKey] });
    } else {
      state.workingRows[state.workingRows.length - 1]!.keys.push(fallbackKey);
    }
    const lastRowIdx = state.workingRows.length - 1;
    state.keyIndex.set(fallbackKey.id, {
      rowIdx: lastRowIdx,
      keyIdx: state.workingRows[lastRowIdx]!.keys.length - 1,
    });
  }

  for (const rawPlacement of placements) {
    const { baseKey } = rawPlacement;
    // Normalize once so `text` and `id` (charToUnicodeKeyId NFC-normalizes
    // internally) always agree, even for an NFD-form placement char — and so
    // touchLayerForChar sees a single precomposed code point for its case test.
    const char = rawPlacement.char.normalize("NFC");
    const { state, layerId } = resolveTargetLayer(char);
    const existing = baseKey ? getWorkingKey(state, baseKey) : undefined;

    if (!baseKey) {
      warnings.push(
        `[desktop-modifications] placement for "${char}" has no hostKey — placed via fallback`,
      );
      placeFallback(state, char);
      continue;
    }

    if (!existing) {
      // Spec 104 FR-021 (T017): an exact-id miss is not yet a miss. The
      // slot may be occupied by a T_/U_ key whose id is not the physical
      // key's — resolve the occupant through the production resolver and
      // land on IT rather than appending a duplicate key to the last row.
      const occupantPos = findOccupantPosition(state, baseKey, layerId);
      if (occupantPos) {
        const occupant = state.workingRows[occupantPos.rowIdx]!.keys[occupantPos.keyIdx]!;
        if (occupant.provenance === "hand-set") {
          warnings.push(
            `[desktop-modifications] the key occupying "${baseKey}"'s slot ("${occupant.id}") is hand-set — "${char}" placed via fallback instead of overwriting an author edit`,
          );
          placeFallback(state, char);
          continue;
        }
        // Already producing the char (per the resolver) — nothing to place.
        if (
          resolverCtx &&
          resolvedTextProductions(resolverCtx, occupant, layerId).includes(char)
        ) {
          continue;
        }
        landAsLongpress(state, occupantPos, occupant, char);
        continue;
      }

      warnings.push(
        `[desktop-modifications] host key "${baseKey}" not found in ${phonePlatform.id} "${layerId}" layer — "${char}" placed via fallback`,
      );
      placeFallback(state, char);
      continue;
    }

    // The host's own primary production is already this char (common on a
    // shift-layer seed) — nothing to place; never hand a key itself as its own
    // longpress alternate.
    //
    // This precedes the hand-set check deliberately: "there is nothing to
    // place" is a stronger claim than "do not clobber". A hand-set host that
    // already produces this char needs no placement at all, and routing it to
    // the hand-set fallback appended a SECOND key with the same production
    // (plus a warning about overwriting an author edit that was not happening).
    // That input is routine now that placements target the case-derived layer:
    // promoteOnManualEdit (spec-014 FR-014) marks the very key an author edits
    // as hand-set, and the case-pair flow puts uppercase chars on the shift
    // key, so a reseed replays a placement onto a hand-set key that already
    // carries the char. A key with no production at all fails this predicate,
    // so the empty-host branch below still owns that case.
    // Spec 104 FR-021 (T017): for a T_/U_ host, "already produces this
    // char" is a resolver question, not a keycap-text one — a ruled T_
    // host's keycap ("◌̀") is not its production (U+0300), and the
    // text/output-only check below would hand it a duplicate longpress of
    // its own production. Checked before the hand-set branch for the same
    // reason the text check precedes it: nothing-to-place beats
    // do-not-clobber.
    const existingFamily = touchKeyIdFamily(existing.id);
    if (
      resolverCtx &&
      (existingFamily === "T_" || existingFamily === "U_") &&
      resolvedTextProductions(resolverCtx, existing, layerId).includes(char)
    ) {
      continue;
    }

    if (isTouchKeyPrimaryProduction(existing, char)) {
      continue;
    }

    // Never overwrite a hand-set key (no-clobber — spec-014's provenance
    // axis, reused here per R6/R9): fall back instead so the placement is
    // not silently lost.
    if (existing.provenance === "hand-set") {
      warnings.push(
        `[desktop-modifications] host key "${baseKey}" is hand-set — "${char}" placed via fallback instead of overwriting an author edit`,
      );
      placeFallback(state, char);
      continue;
    }

    // A T_/U_ host's id is never rewritten by a placement (FR-021): the
    // id carries the key's rule linkage (T_) or its decode identity (U_),
    // so the placement lands as a longpress alternate instead of the
    // empty-host id rewrite the K_ path below performs.
    if (existingFamily === "T_" || existingFamily === "U_") {
      const pos = state.keyIndex.get(baseKey);
      if (pos) landAsLongpress(state, pos, existing, char);
      continue;
    }

    const baseIsEmpty = existing.text === undefined && existing.output === undefined;

    if (baseIsEmpty) {
      const { text: _t, output: _o, ...rest } = existing;
      const updated: TouchKeyIR = {
        ...rest,
        id: charToUnicodeKeyId(char),
        text: char,
        provenance: "physical-suggested",
      };
      setWorkingKey(state, baseKey, updated);
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
    setWorkingKey(state, baseKey, updated);
  }

  // Reconstruct the layout with structural sharing: only the layers a
  // placement actually targeted are rebuilt; every other layer and platform
  // is returned by reference.
  const rebuiltByIndex = new Map<number, LayerWorkState>();
  for (const state of layerStates.values()) {
    rebuiltByIndex.set(state.layerIndex, state);
  }

  const updatedLayers = phonePlatform.layers.map((layer, idx) => {
    const state = rebuiltByIndex.get(idx);
    return state ? { ...layer, rows: state.workingRows } : layer;
  });
  const updatedPhonePlatform = { ...phonePlatform, layers: updatedLayers };
  const updatedPlatforms = layout.platforms.map((platform, idx) =>
    idx === phonePlatformIndex ? updatedPhonePlatform : platform,
  );

  return { ...layout, platforms: updatedPlatforms };
}
