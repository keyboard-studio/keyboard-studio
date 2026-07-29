/**
 * applyTouchAssignments — pure function that folds Phase E touch
 * assignments (longpress / flick / multitap) into a TouchLayoutIR.
 *
 * Only the mobile platform ("phone", or "tablet" when no "phone" platform is
 * present — see {@link resolveMobilePlatformIndex}) is mutated, and within it
 * only the layers a mechanism actually names (via structural sharing — no
 * original objects are modified). All other platforms and layers are
 * returned by reference.
 *
 * Each mechanism selects its target layer with the optional `layer` slot
 * value; an ABSENT `layer` means `"default"`, so every assignment written
 * before that slot existed behaves byte-identically. An unknown layer id
 * warns and skips that mechanism — it never falls back to `"default"`.
 *
 * Each assignment's `mechanisms[]` are ALL applied, not just the first —
 * one character may carry multiple touch methods simultaneously (e.g.
 * longpress + multitap on the same host key), and those methods may target
 * different layers.
 *
 * @see spec.md §8 Phase E (touch gallery)
 * @see specs/035-mobile-touch-derivation/ — spec-035 amendment R7a (tablet reseed target)
 */

import type { TouchLayoutIR, TouchKeyIR } from "@keyboard-studio/contracts";
import type { TouchAssignment } from "@keyboard-studio/contracts";
import { NodeIdMinter } from "../shared/node-ids.js";
import { charToUnicodeKeyId } from "../shared/touch-ids.js";
import {
  isTouchSubKeyDuplicate,
  resolveMobilePlatformIndex,
} from "./touch-mechanism-shared.js";
import { resolveTouchLayerId } from "./touchLayer.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ApplyTouchAssignmentsResult {
  /** Updated layout (structurally shared with the input where unchanged). */
  layout: TouchLayoutIR;
  /** Diagnostic messages for unknown/unhandled assignments. */
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Mutable per-layer working state, created lazily the first time a
 *  mechanism names that layer. A layer with no state was never touched and
 *  is returned by reference. */
interface LayerWorkState {
  /** Index of this layer within `phonePlatform.layers`. */
  layerIndex: number;
  /** Shallow-cloned rows whose key slots we replace as we accumulate changes. */
  workingRows: Array<{ keys: TouchKeyIR[] }>;
  /** key id → { rowIdx, keyIdx }, built once so a `touch_key_replace` that
   *  rewrites a key's id does not disturb later lookups by the old id. */
  keyIndex: Map<string, { rowIdx: number; keyIdx: number }>;
}

/**
 * Apply a list of touch {@link TouchAssignment}s to a {@link TouchLayoutIR},
 * returning a new (pure, non-mutating) layout and any diagnostic warnings.
 *
 * Only the mobile platform ("phone", or "tablet" fallback — see
 * {@link resolveMobilePlatformIndex}) is modified, and within it only the
 * layers named by a mechanism's `layer` slot value (default `"default"`);
 * all other platforms and layers are returned by reference (structural
 * sharing).
 *
 * @param layout      The base touch layout (from scaffoldTouchLayout or
 *                    buildMinimalPhoneTouchLayout).
 * @param assignments Touch-modality assignments from Phase E (TouchGallery).
 */
export function applyTouchAssignments(
  layout: TouchLayoutIR,
  assignments: ReadonlyArray<TouchAssignment>,
): ApplyTouchAssignmentsResult {
  const warnings: string[] = [];
  const minter = new NodeIdMinter();

  // Verify a mobile platform exists — "phone" wins when both are present
  // (unchanged legacy behavior); "tablet" is the fallback for a tablet-style
  // reseed (spec-035 amendment R7a). Same helper Phase C uses, so the two
  // phases can never resolve different platforms for the same layout.
  const phonePlatformIndex = resolveMobilePlatformIndex(layout.platforms);
  if (phonePlatformIndex === -1) {
    warnings.push(
      "[touch-apply] no phone or tablet platform found in layout — all touch assignments skipped"
    );
    return { layout, warnings };
  }

  const phonePlatform = layout.platforms[phonePlatformIndex]!;

  // Per-layer working state, populated lazily: a layer nobody targets is never
  // cloned and therefore comes back reference-equal.
  const layerStates = new Map<string, LayerWorkState>();

  /**
   * Resolve (and lazily build) the working state for a target layer.
   * Returns undefined when the mobile platform has no such layer — the caller
   * warns and skips that mechanism. Never falls back to "default".
   */
  function resolveLayerState(layerId: string): LayerWorkState | undefined {
    const existing = layerStates.get(layerId);
    if (existing) return existing;

    const layerIndex = phonePlatform.layers.findIndex((l) => l.id === layerId);
    if (layerIndex === -1) return undefined;

    const layer = phonePlatform.layers[layerIndex]!;
    // Shallow-clone all rows up-front (array of arrays), then replace
    // individual key slots as mechanisms are processed. Keys we never touch
    // stay structurally shared.
    const workingRows: Array<{ keys: TouchKeyIR[] }> = layer.rows.map((row) => ({
      keys: [...row.keys],
    }));

    const keyIndex = new Map<string, { rowIdx: number; keyIdx: number }>();
    for (let ri = 0; ri < workingRows.length; ri++) {
      const row = workingRows[ri]!;
      for (let ki = 0; ki < row.keys.length; ki++) {
        const key = row.keys[ki]!;
        keyIndex.set(key.id, { rowIdx: ri, keyIdx: ki });
      }
    }

    const state: LayerWorkState = { layerIndex, workingRows, keyIndex };
    layerStates.set(layerId, state);
    return state;
  }

  function setWorkingKey(
    state: LayerWorkState,
    hostKey: string,
    updated: TouchKeyIR,
  ): void {
    const pos = state.keyIndex.get(hostKey);
    if (!pos) return;
    state.workingRows[pos.rowIdx]!.keys[pos.keyIdx] = updated;
  }

  /**
   * Resolve the target layer and the host key within it. Both misses warn and
   * skip the mechanism (never throw, never fall back to another layer).
   */
  function resolveTarget(
    slotValues: Readonly<Record<string, string>> | undefined,
    char: string,
  ): { state: LayerWorkState; key: TouchKeyIR; hostKey: string } | undefined {
    const hostKey = slotValues?.["hostKey"] ?? "";
    const layerId = resolveTouchLayerId(slotValues);

    const state = resolveLayerState(layerId);
    if (!state) {
      warnings.push(
        `[touch-apply] target layer "${layerId}" not found in ${phonePlatform.id} platform — assignment for "${char}" skipped`
      );
      return undefined;
    }

    const pos = state.keyIndex.get(hostKey);
    if (!pos) {
      warnings.push(
        `[touch-apply] host key "${hostKey}" not found in ${phonePlatform.id} layer "${layerId}" — assignment for "${char}" skipped`
      );
      return undefined;
    }

    return {
      state,
      key: state.workingRows[pos.rowIdx]!.keys[pos.keyIdx]!,
      hostKey,
    };
  }

  // Process each assignment in order, applying EVERY mechanism it carries —
  // a single character may combine multiple touch methods (e.g. longpress +
  // multitap on the same host key), each naming its own target layer.
  for (const assignment of assignments) {
    for (const ref of assignment.mechanisms) {
      const { patternId, slotValues } = ref;

      // touch_inherited: intentional no-op, no warning.
      if (patternId === "touch_inherited") {
        continue;
      }

      if (patternId === "longpress_alternates") {
        const char = slotValues?.["char"] ?? "";

        const target = resolveTarget(slotValues, char);
        if (!target) continue;
        const { state, key, hostKey } = target;

        const existingSk = key.sk ?? [];
        // Dedupe: skip if already present by text/output OR by U_ id (shared
        // predicate — covers id-only sk entries that carry no text/output field).
        if (existingSk.some((s) => isTouchSubKeyDuplicate(s, char))) {
          continue;
        }

        const newSkKey: TouchKeyIR = {
          nodeId: minter.mint("touchKey"),
          // U_<UPPERHEX> id: Keyman outputs the Unicode codepoint directly from
          // this id form — no `output` field needed (adding one is redundant and
          // can cause kmc-kmn to fail to produce artifacts). `text` is kept so
          // the on-key glyph is rendered correctly in the OSK.
          id: charToUnicodeKeyId(char),
          text: char,
        };

        const updated: TouchKeyIR = {
          ...key,
          sk: [...existingSk, newSkKey],
        };

        // No per-key hint set here. The dot (•) is supplied automatically by the
        // Keyman runtime because the platform defaultHint is "dot"; an explicit
        // hint would override the dot and re-reveal a character.

        setWorkingKey(state, hostKey, updated);
        continue;
      }

      if (patternId === "flick_gestures") {
        const direction = slotValues?.["direction"] ?? "";
        const char = slotValues?.["char"] ?? "";

        const target = resolveTarget(slotValues, char);
        if (!target) continue;
        const { state, key, hostKey } = target;

        const newFlickKey: TouchKeyIR = {
          nodeId: minter.mint("touchKey"),
          // U_<UPPERHEX> id: same rationale as longpress sk — Keyman derives
          // output from the id; `text` provides the on-key glyph.
          id: charToUnicodeKeyId(char),
          text: char,
        };

        // Merge with existing flick map; avoid spreading `undefined`.
        const mergedFlick: NonNullable<TouchKeyIR["flick"]> = {
          ...(key.flick ?? {}),
          [direction]: newFlickKey,
        };

        const updated: TouchKeyIR = {
          ...key,
          flick: mergedFlick,
        };

        setWorkingKey(state, hostKey, updated);
        continue;
      }

      if (patternId === "multitap") {
        const char = slotValues?.["char"] ?? "";

        const target = resolveTarget(slotValues, char);
        if (!target) continue;
        const { state, key, hostKey } = target;

        const existingMt = key.multitap ?? [];
        // Dedupe: same predicate as longpress sk — covers id-only multitap entries.
        if (existingMt.some((s) => isTouchSubKeyDuplicate(s, char))) {
          continue;
        }

        const newMtKey: TouchKeyIR = {
          nodeId: minter.mint("touchKey"),
          // U_<UPPERHEX> id: same rationale as longpress sk — Keyman derives
          // output from the id; `text` provides the on-key glyph.
          id: charToUnicodeKeyId(char),
          text: char,
        };

        const updated: TouchKeyIR = {
          ...key,
          multitap: [...existingMt, newMtKey],
        };

        setWorkingKey(state, hostKey, updated);
        continue;
      }

      if (patternId === "touch_key_replace") {
        const char = slotValues?.["char"] ?? "";

        const target = resolveTarget(slotValues, char);
        if (!target) continue;
        const { state, key, hostKey } = target;

        // Destructure out any existing `output` field so the U_-id supersedes it.
        // Preserve all other properties: nodeId, geometry (pad, width, sp),
        // nextlayer, and any existing sk / flick / multitap.
        const { output: _omit, ...rest } = key;
        const updated: TouchKeyIR = {
          ...rest,
          id: charToUnicodeKeyId(char),
          text: char,
        };

        setWorkingKey(state, hostKey, updated);
        continue;
      }

      // Unknown patternId — one warning per mechanism.
      warnings.push(
        `[touch-apply] unknown patternId "${patternId}" — mechanism skipped`
      );
    }
  }

  // Nothing resolved to a layer: no layer was cloned, so the input layout is
  // already the answer.
  if (layerStates.size === 0) {
    return { layout, warnings };
  }

  // Reconstruct the layout with structural sharing.
  // Only the layers a mechanism actually targeted are rebuilt; every other
  // layer and platform is returned by reference.
  const rebuiltByIndex = new Map<number, LayerWorkState>();
  for (const state of layerStates.values()) {
    rebuiltByIndex.set(state.layerIndex, state);
  }

  const updatedLayers = phonePlatform.layers.map((layer, idx) => {
    const state = rebuiltByIndex.get(idx);
    return state ? { ...layer, rows: state.workingRows } : layer;
  });

  const updatedPhonePlatform = {
    ...phonePlatform,
    layers: updatedLayers,
  };

  const updatedPlatforms = layout.platforms.map((platform, idx) =>
    idx === phonePlatformIndex ? updatedPhonePlatform : platform
  );

  const updatedLayout: TouchLayoutIR = {
    ...layout,
    platforms: updatedPlatforms,
  };

  return { layout: updatedLayout, warnings };
}
