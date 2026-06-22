/**
 * applyTouchAssignments — pure function that folds Phase E touch
 * assignments (longpress / flick / multitap) into a TouchLayoutIR.
 *
 * Only the phone platform's "default" layer is mutated (via structural
 * sharing — no original objects are modified). All other platforms and
 * layers are returned by reference.
 *
 * @see spec.md §8 Phase E (touch gallery)
 */

import type { TouchLayoutIR, TouchKeyIR } from "@keyboard-studio/contracts";
import type { TouchAssignment } from "@keyboard-studio/contracts";
import { NodeIdMinter } from "../codec/node-ids.js";
import { charToUnicodeKeyId } from "../codec/touch-ids.js";

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

/**
 * Apply a list of touch {@link TouchAssignment}s to a {@link TouchLayoutIR},
 * returning a new (pure, non-mutating) layout and any diagnostic warnings.
 *
 * Only the phone platform's "default" layer is modified; all other platforms
 * and layers are returned by reference (structural sharing).
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

  // Verify the phone platform exists.
  const phonePlatformIndex = layout.platforms.findIndex((p) => p.id === "phone");
  if (phonePlatformIndex === -1) {
    warnings.push(
      "[touch-apply] no phone platform found in layout — all touch assignments skipped"
    );
    return { layout, warnings };
  }

  const phonePlatform = layout.platforms[phonePlatformIndex]!;

  // Verify the default layer exists.
  const defaultLayerIndex = phonePlatform.layers.findIndex(
    (l) => l.id === "default"
  );
  if (defaultLayerIndex === -1) {
    warnings.push(
      "[touch-apply] phone platform has no default layer — all touch assignments skipped"
    );
    return { layout, warnings };
  }

  const defaultLayer = phonePlatform.layers[defaultLayerIndex]!;

  // Build a flat working map: vkey id → row index × key index, pointing into
  // a mutable copy of each key we may need to update. We structural-share keys
  // we never touch.
  // Strategy: shallow-clone all rows up-front (array of arrays), then replace
  // individual key slots as assignments are processed.
  const workingRows: Array<{ keys: TouchKeyIR[] }> = defaultLayer.rows.map(
    (row) => ({ keys: [...row.keys] })
  );

  // Build a lookup: id → { rowIdx, keyIdx }
  const keyIndex = new Map<string, { rowIdx: number; keyIdx: number }>();
  for (let ri = 0; ri < workingRows.length; ri++) {
    const row = workingRows[ri]!;
    for (let ki = 0; ki < row.keys.length; ki++) {
      const key = row.keys[ki]!;
      keyIndex.set(key.id, { rowIdx: ri, keyIdx: ki });
    }
  }

  // Helper: get the current working copy of a key (already shallow-copied into
  // workingRows; we replace it in-place as we accumulate changes).
  function getWorkingKey(hostKey: string): TouchKeyIR | undefined {
    const pos = keyIndex.get(hostKey);
    if (!pos) return undefined;
    return workingRows[pos.rowIdx]!.keys[pos.keyIdx];
  }

  function setWorkingKey(hostKey: string, updated: TouchKeyIR): void {
    const pos = keyIndex.get(hostKey);
    if (!pos) return;
    workingRows[pos.rowIdx]!.keys[pos.keyIdx] = updated;
  }

  // Process each assignment in order.
  for (const assignment of assignments) {
    const ref = assignment.mechanisms[0];
    if (!ref) continue;

    const { patternId, slotValues } = ref;

    // touch_inherited: intentional no-op, no warning.
    if (patternId === "touch_inherited") {
      continue;
    }

    if (patternId === "longpress_alternates") {
      const hostKey = slotValues?.["hostKey"] ?? "";
      const char = slotValues?.["char"] ?? "";

      const key = getWorkingKey(hostKey);
      if (!key) {
        warnings.push(
          `[touch-apply] host key "${hostKey}" not found in phone default layer — assignment for "${char}" skipped`
        );
        continue;
      }

      const existingSk = key.sk ?? [];
      // Dedupe: skip if already present. Check text (the glyph displayed on
      // the key) because U_-id sk entries no longer carry an `output` field;
      // fall back to output for backwards-compat with any pre-existing entries.
      if (existingSk.some((s) => (s.text ?? s.output) === char)) {
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

      setWorkingKey(hostKey, updated);
      continue;
    }

    if (patternId === "flick_gestures") {
      const hostKey = slotValues?.["hostKey"] ?? "";
      const direction = slotValues?.["direction"] ?? "";
      const char = slotValues?.["char"] ?? "";

      const key = getWorkingKey(hostKey);
      if (!key) {
        warnings.push(
          `[touch-apply] host key "${hostKey}" not found in phone default layer — assignment for "${char}" skipped`
        );
        continue;
      }

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

      setWorkingKey(hostKey, updated);
      continue;
    }

    if (patternId === "multitap") {
      const hostKey = slotValues?.["hostKey"] ?? "";
      const char = slotValues?.["char"] ?? "";

      const key = getWorkingKey(hostKey);
      if (!key) {
        warnings.push(
          `[touch-apply] host key "${hostKey}" not found in phone default layer — assignment for "${char}" skipped`
        );
        continue;
      }

      const existingMt = key.multitap ?? [];
      // Dedupe: same text/output fallback as longpress sk above.
      if (existingMt.some((s) => (s.text ?? s.output) === char)) {
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

      setWorkingKey(hostKey, updated);
      continue;
    }

    if (patternId === "touch_key_replace") {
      const hostKey = slotValues?.["hostKey"] ?? "";
      const char = slotValues?.["char"] ?? "";

      const key = getWorkingKey(hostKey);
      if (!key) {
        warnings.push(
          `[touch-apply] host key "${hostKey}" not found in phone default layer — assignment for "${char}" skipped`
        );
        continue;
      }

      // Destructure out any existing `output` field so the U_-id supersedes it.
      // Preserve all other properties: nodeId, geometry (pad, width, sp),
      // nextlayer, and any existing sk / flick / multitap.
      const { output: _omit, ...rest } = key;
      const updated: TouchKeyIR = {
        ...rest,
        id: charToUnicodeKeyId(char),
        text: char,
      };

      setWorkingKey(hostKey, updated);
      continue;
    }

    // Unknown patternId — one warning per assignment.
    warnings.push(
      `[touch-apply] unknown patternId "${patternId}" — assignment skipped`
    );
  }

  // Reconstruct the layout with structural sharing.
  // Only replace the default layer and the phone platform; everything else is
  // returned by reference.
  const updatedDefaultLayer = {
    ...defaultLayer,
    rows: workingRows,
  };

  const updatedLayers = phonePlatform.layers.map((layer, idx) =>
    idx === defaultLayerIndex ? updatedDefaultLayer : layer
  );

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
