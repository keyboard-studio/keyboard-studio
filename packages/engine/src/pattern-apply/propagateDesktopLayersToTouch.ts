/**
 * propagateDesktopLayersToTouch — surfaces arbitrary desktop modifier-combo
 * layers (S-08 "modifier_as_layer_switch", generalized beyond RALT — see
 * modifierCombos.ts) onto a keyboard's shipped `.keyman-touch-layout`.
 *
 * Follows the same contract as applyTouchAssignmentsToRawJson.ts (Case B):
 *   - parse the raw JSON to a plain object (fresh tree), mutate IN PLACE,
 *     stringify. Unmodified keys/layers/platforms/fields are preserved verbatim.
 *   - Never throws on parseable-but-odd JSON; may throw `SyntaxError` when
 *     `rawJson` is not valid JSON (documented caller contract, same as the
 *     sibling appliers).
 *
 * Behavior:
 *   - The set of desktop layer combos is the union of
 *     {@link collectLayerCombosInUse} (already-authored `.kmn` rules) and the
 *     combos parsed from `assignments`' `modifier_as_layer_switch` mechanisms
 *     (covers a combo the caller is about to author but that isn't reflected
 *     in `ir` yet).
 *   - Combos containing CAPS/NCAPS have no touch layer (`comboToTouchLayerId`
 *     returns `null`) and are skipped entirely — touch has no CapsLock state.
 *   - Every touch platform is processed except a literal `"desktop"` key
 *     (kept for the physical/kvks side, not a touch surface). Platforms with
 *     no `layer` array are skipped.
 *   - If a platform already has a layer with the combo's id: only `text`/
 *     `output` are updated on keys where the combo's IR key-map defines an
 *     output for that key id — existing keys/rows are never deleted or
 *     restructured.
 *   - If a platform has NO layer with that id: one is synthesized by cloning
 *     the "default" layer's row/key geometry (same ids, `sp`/`width`/`pad`
 *     preserved verbatim). Keys get `text`/`output` set from the combo's
 *     key-map where defined, blank otherwise. `sk`/`flick`/`multitap` are
 *     stripped (those describe the default layer's own deadkey/alternate
 *     menus, not this combo's). Any key that had a `nextlayer` on the default
 *     layer keeps that role on the clone but repointed to `"default"` — the
 *     synthesized layer's way back.
 *   - Reachability: a synthesized layer is otherwise dead JSON, so unless
 *     SOME key anywhere in the platform already switches into it (a
 *     `nextlayer` — including inside `sk`/`multitap`/`flick` — equal to the
 *     layer id), a longpress sub-key (`sk`) is added to the first available
 *     anchor key (`K_LOPT`, then `K_NUMLOCK`, then `K_SHIFT`) on the DEFAULT
 *     layer, least-destructively: it does not overwrite that key's primary
 *     function. If no anchor key exists, a warning is pushed and the layer
 *     is left unreachable (still valid JSON, just inert).
 *   - Idempotent: re-running with the same `ir`/`assignments` against the
 *     already-patched JSON makes no further changes (existing layers/switch
 *     keys are detected and left alone).
 *
 * @see applyTouchAssignmentsToRawJson.ts — sibling raw-JSON touch applier (Phase E).
 * @see modifierCombos.ts — combo canonicalization, touch-layer-id + kvks-token mapping, IR scanning.
 */

import type { KeyboardIR, MechanismAssignment } from "@keyboard-studio/contracts";
import {
  buildComboKeyMap,
  canonicalizeCombo,
  collectLayerCombosInUse,
  comboToTouchLayerId,
  parseKeySpec,
  type ModifierToken,
} from "./modifierCombos.js";

// ---------------------------------------------------------------------------
// Wire-format types (raw JSON shape — NOT the IR types)
// ---------------------------------------------------------------------------

interface RawSubKey {
  id?: string;
  text?: string;
  output?: string;
  nextlayer?: string;
  [k: string]: unknown;
}

interface RawKey {
  id: string;
  text?: string;
  output?: string;
  nextlayer?: string;
  sk?: RawSubKey[];
  flick?: Record<string, RawSubKey>;
  multitap?: RawSubKey[];
  [k: string]: unknown;
}

interface RawRow {
  id: number | string;
  key: RawKey[];
  [k: string]: unknown;
}

interface RawLayer {
  id: string;
  row: RawRow[];
  [k: string]: unknown;
}

interface RawPlatform {
  layer: RawLayer[];
  [k: string]: unknown;
}

function isRawLayer(value: unknown): value is RawLayer {
  return (
    !!value &&
    typeof value === "object" &&
    typeof (value as RawLayer).id === "string" &&
    Array.isArray((value as RawLayer).row)
  );
}

function isRawPlatform(value: unknown): value is RawPlatform {
  return !!value && typeof value === "object" && Array.isArray((value as RawPlatform).layer);
}

/**
 * Legacy touch-layer-id aliases, keyed by {@link comboToTouchLayerId}'s
 * canonical id. scaffoldTouchLayout.ts's Case A (keyboards with NO shipped
 * touch layout) synthesizes a RALT-only layer under the id "altgr" rather
 * than "rightalt" — the only combo attested to diverge. Deliberately not
 * migrated here (out of scope for this fix); this alias lets propagation
 * find and patch that existing layer instead of creating a duplicate.
 */
const LEGACY_TOUCH_LAYER_ID_ALIASES: ReadonlyMap<string, string> = new Map([
  ["rightalt", "altgr"],
]);

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface PropagateDesktopLayersToTouchResult {
  /** Updated `.keyman-touch-layout` JSON string. */
  json: string;
  /** Diagnostic messages (e.g. no anchor key available for a switch). */
  warnings: string[];
}

/**
 * Edit a raw shipped `.keyman-touch-layout` JSON string so every reachable
 * desktop modifier-combo layer (S-08, generalized) has a corresponding touch
 * layer, synthesizing one from the "default" layer's geometry when absent.
 *
 * @param rawTouchJsonString Raw `.keyman-touch-layout` JSON string from the VFS.
 * @param ir                 The current KeyboardIR (desktop rules source of truth).
 * @param assignments        Physical mechanism assignments — combos referenced by
 *                           a `modifier_as_layer_switch` mechanism here are unioned
 *                           with combos already present in `ir`.
 */
export function propagateDesktopLayersToTouch(
  rawTouchJsonString: string,
  ir: KeyboardIR,
  assignments: ReadonlyArray<MechanismAssignment>,
): PropagateDesktopLayersToTouchResult {
  const warnings: string[] = [];
  const layout = JSON.parse(rawTouchJsonString) as Record<string, unknown>;

  // -------------------------------------------------------------------------
  // Step 1 — union the combos already in the IR with those referenced by
  // pending modifier_as_layer_switch assignments.
  // -------------------------------------------------------------------------
  const comboSeen = new Set<string>();
  const combos: ModifierToken[][] = [];
  const addCombo = (tokens: readonly ModifierToken[]): void => {
    let canon: ModifierToken[];
    try {
      canon = canonicalizeCombo(tokens);
    } catch {
      return;
    }
    const key = canon.join("+");
    if (comboSeen.has(key)) return;
    comboSeen.add(key);
    combos.push(canon);
  };

  for (const combo of collectLayerCombosInUse(ir)) addCombo(combo);

  for (const assignment of assignments) {
    if (assignment.modality !== "physical") continue;
    for (const ref of assignment.mechanisms) {
      if (ref.patternId !== "modifier_as_layer_switch") continue;
      const altgrKeyList = ref.slotValues?.["altgrKeyList"] ?? "";
      const parsed = parseKeySpec(altgrKeyList);
      if (parsed) addCombo(parsed.tokens);
    }
  }

  // -------------------------------------------------------------------------
  // Step 2 — build a per-combo (vkey → output char) map from the IR, and
  // resolve each combo's touch layer id up front.
  // -------------------------------------------------------------------------
  const comboEntries = combos
    .map((combo) => ({
      combo,
      layerId: comboToTouchLayerId(combo),
      keyMap: buildComboKeyMap(ir, combo),
    }))
    // CAPS/NCAPS combos have no touch layer — touch has no caps-lock state.
    .filter((e): e is { combo: ModifierToken[]; layerId: string; keyMap: Map<string, string> } =>
      e.layerId !== null,
    );

  // -------------------------------------------------------------------------
  // Step 3 — apply to every platform except "desktop".
  // -------------------------------------------------------------------------
  for (const [platformName, platformVal] of Object.entries(layout)) {
    if (platformName === "desktop") continue;
    if (!isRawPlatform(platformVal)) continue;

    const defaultLayer = platformVal.layer.find((l) => isRawLayer(l) && l.id === "default");
    if (!isRawLayer(defaultLayer)) continue;

    for (const { layerId, keyMap } of comboEntries) {
      const existingLayer = platformVal.layer.find((l) => isRawLayer(l) && l.id === layerId);

      if (isRawLayer(existingLayer)) {
        patchExistingComboLayer(existingLayer, keyMap);
        continue;
      }

      // Legacy-id alias: scaffoldTouchLayout.ts's Case A (no shipped touch
      // layout) synthesizes a RALT-only layer under the id "altgr", not
      // "rightalt" (comboToTouchLayerId's id for the same combo). Patch that
      // existing layer instead of synthesizing a second, duplicate one.
      const aliasId = LEGACY_TOUCH_LAYER_ID_ALIASES.get(layerId);
      const aliasLayer =
        aliasId !== undefined
          ? platformVal.layer.find((l) => isRawLayer(l) && l.id === aliasId)
          : undefined;
      if (isRawLayer(aliasLayer)) {
        patchExistingComboLayer(aliasLayer, keyMap);
        continue;
      }

      const newLayer = cloneLayerForCombo(defaultLayer, layerId, keyMap);
      platformVal.layer.push(newLayer);

      ensureReachability(platformVal, defaultLayer, layerId, warnings);
    }
  }

  return { json: JSON.stringify(layout), warnings };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Update `text`/`output` on keys where `keyMap` defines an output for that
 * key id. Never adds, removes, or restructures keys/rows.
 */
function patchExistingComboLayer(layer: RawLayer, keyMap: Map<string, string>): void {
  for (const row of layer.row) {
    for (const key of row.key) {
      const char = keyMap.get(key.id);
      if (char === undefined) continue;
      key.text = char;
      key.output = char;
    }
  }
}

/**
 * Clone the default layer's row/key geometry into a new layer for `layerId`.
 * Keys get the combo's output where defined, blank otherwise; `sk`/`flick`/
 * `multitap` are stripped (they describe the default layer's own menus); a
 * key that switches layers on the default layer keeps that role, repointed
 * to `"default"` (the synthesized layer's way back).
 */
function cloneLayerForCombo(
  defaultLayer: RawLayer,
  layerId: string,
  keyMap: Map<string, string>,
): RawLayer {
  return {
    ...defaultLayer,
    id: layerId,
    row: defaultLayer.row.map((row) => ({
      ...row,
      key: row.key.map((key) => cloneKeyForCombo(key, keyMap)),
    })),
  };
}

function cloneKeyForCombo(key: RawKey, keyMap: Map<string, string>): RawKey {
  const { sk: _sk, flick: _flick, multitap: _multitap, output: _output, text: _text, ...rest } =
    key;
  const cloned: RawKey = { ...rest, id: key.id };

  const char = keyMap.get(key.id);
  if (char !== undefined) {
    cloned.text = char;
    cloned.output = char;
  } else {
    cloned.text = "";
  }

  if (typeof cloned["nextlayer"] === "string") {
    cloned["nextlayer"] = "default";
  }

  return cloned;
}

/** Anchor keys tried in order for a longpress switch into a synthesized layer. */
const SWITCH_ANCHOR_KEY_IDS: readonly string[] = ["K_LOPT", "K_NUMLOCK", "K_SHIFT"];

/**
 * Ensure `layerId` is reachable from `default`: skip if any key/sub-key
 * anywhere in the platform already switches into it; otherwise add a
 * longpress `sk` entry (not a primary-function overwrite) to the first
 * anchor key found on the default layer. Pushes a warning if no anchor exists.
 */
function ensureReachability(
  platform: RawPlatform,
  defaultLayer: RawLayer,
  layerId: string,
  warnings: string[],
): void {
  if (layerAlreadySwitchesTo(platform.layer, layerId)) return;

  for (const row of defaultLayer.row) {
    for (const key of row.key) {
      if (!SWITCH_ANCHOR_KEY_IDS.includes(key.id)) continue;
      if (!key.sk) key.sk = [];
      key.sk.push({ id: `T_ks_layer_${layerId}`, text: `*${layerId}*`, nextlayer: layerId });
      return;
    }
  }

  warnings.push(
    `[propagateDesktopLayersToTouch] no anchor key (${SWITCH_ANCHOR_KEY_IDS.join("/")}) found on the default layer — synthesized layer "${layerId}" is unreachable`,
  );
}

/** True when some key/sub-key anywhere in `layers` already switches to `layerId`. */
function layerAlreadySwitchesTo(layers: RawLayer[], layerId: string): boolean {
  for (const layer of layers) {
    for (const row of layer.row) {
      for (const key of row.key) {
        if (key.nextlayer === layerId) return true;
        if (key.sk?.some((s) => s.nextlayer === layerId)) return true;
        if (key.multitap?.some((s) => s.nextlayer === layerId)) return true;
        if (key.flick && Object.values(key.flick).some((f) => f.nextlayer === layerId)) return true;
      }
    }
  }
  return false;
}
