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
 *   - CAPS-bearing combos DO get a touch layer (`comboToTouchLayerId` no
 *     longer treats CAPS as desktop-only — real shipped
 *     `.keyman-touch-layout` files ship genuine `caps`/`rightalt-caps`
 *     layers) and are synthesized/patched the same as any other combo. A
 *     standalone NCAPS combo (no CAPS sibling in the same group — see
 *     modifierCombos.ts's `foldCasePairCombo`, which `collectLayerCombosInUse`
 *     uses) is now a genuinely distinct combo and gets its own touch layer
 *     too (`comboToTouchLayerId(["NCAPS"])` -> `"ncaps"`); only a
 *     case-pair-shaped NCAPS/CAPS sibling pair folds down to the base combo.
 *   - Every touch platform is processed except a literal `"desktop"` key
 *     (kept for the physical/kvks side, not a touch surface). Platforms with
 *     no `layer` array are skipped.
 *   - If a platform already has a layer with the combo's id: `text`/`output`
 *     are updated on keys where the combo's IR key-map defines an output for
 *     that key id — existing keys/rows are never deleted or restructured.
 *     `output` is working-copy-only for the studio's key-grid UI (per-layer
 *     disambiguator); `conformTouchLayoutToKeymanSchema` strips it on the
 *     final output projection.
 *   - If a platform has NO layer with that id: one is synthesized by cloning
 *     the "default" layer's row/key geometry (same ids, `sp`/`width`/`pad`
 *     preserved verbatim). Keys get `text`/`output` set from the combo's
 *     key-map where defined, blank otherwise (`output` working-copy-only,
 *     stripped on output by `conformTouchLayoutToKeymanSchema`, same pattern
 *     as the `p` provenance tag). `sk`/`flick`/`multitap` are
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
 * @see touch-layout-wire-format.ts — shared raw-JSON wire-format types (with applyTouchAssignmentsToRawJson.ts).
 */

import {
  buildTouchKeyRuleIndex,
  resolveTouchProduction,
  touchKeyStateFromLayerId,
  type KeyboardIR,
  type MechanismAssignment,
  type TouchKeyIR,
  type TouchKeyRuleIndex,
} from "@keyboard-studio/contracts";
import {
  buildComboKeyMap,
  canonicalizeCombo,
  collectLayerCombosInUse,
  comboToTouchLayerId,
  parseKeySpec,
  type ModifierToken,
} from "./modifierCombos.js";
import { touchKeyIdFamily } from "./touch-mechanism-shared.js";
import {
  isRawLayer,
  isRawPlatform,
  type RawKey,
  type RawLayer,
  type RawPlatform,
} from "./touch-layout-wire-format.js";
import { TOUCH_LAYOUT_JSON_INDENT } from "../codec/parse-touch.js";

/**
 * Legacy touch-layer-id aliases, keyed by {@link comboToTouchLayerId}'s
 * canonical id. scaffoldTouchLayout.ts's Case A (keyboards with NO shipped
 * touch layout) used to synthesize a RALT-only layer under the id "altgr"
 * rather than "rightalt" — the only combo attested to diverge. Deliberately
 * not migrated here (out of scope for this fix); this alias lets propagation
 * find and patch that existing layer instead of creating a duplicate.
 *
 * NOTE: scaffoldTouchLayout.ts now emits the canonical "rightalt" /
 * "rightalt-shift" ids directly (see its rename fixing the reseed-from-desktop
 * touch-apply mismatch), so this alias no longer serves the scaffolder's own
 * output. It is NOT for shipped keyboards: no keyboard in the
 * keymanapp/keyboards or keyboard-studio/keyboards corpus has ever used an
 * "altgr" touch-layer id (all use "rightalt"). It exists purely for
 * `.keyman-touch-layout` artifacts produced by PRE-rename builds of
 * scaffoldTouchLayout.ts — e.g. in-progress working copies / drafts persisted
 * before this migration — which still carry the legacy "altgr" layer. Safe to
 * retire only once no such pre-fix draft can still be loaded.
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

  // Spec 104 FR-021 (T018): the BARE combo is part of the propagation set.
  // collectLayerCombosInUse deliberately reports only non-empty combos (a
  // bare rule set is not a "layer" to it), but T_ rules are typically bare
  // — without the bare combo their productions never reach any key map and
  // the default layer's T_ keys go stale. The bare combo's layer id is
  // "default" (comboToTouchLayerId([])), which always exists on a processed
  // platform, so it takes the patch path below, never the clone path.
  addCombo([]);

  for (const assignment of assignments) {
    if (assignment.modality !== "physical") continue;
    for (const ref of assignment.mechanisms) {
      if (ref.patternId !== "modifier_as_layer_switch") continue;
      const altgrKeyList = ref.slotValues?.["altgrKeyList"] ?? "";
      const parsed = parseKeySpec(altgrKeyList);
      if (parsed) addCombo(parsed.tokens);
    }
  }

  // Spec 104 FR-021 (T018): the production resolver's rule-join index over
  // this same IR — the backstop that establishes what a T_/U_ key produces
  // in a combo's state when the (character-only) combo key map has no
  // entry for it.
  const ruleIndex = buildTouchKeyRuleIndex(ir);

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
    // comboToTouchLayerId no longer returns null for any combo (including
    // CAPS-bearing ones) — the filter is kept defensively since its return
    // type is still `string | null`.
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
        // The bare combo patches the platform's own default layer: its job
        // is to surface rule production as the working-copy `output`, not
        // to re-keycap the author's shipped keys (preserveKeycapText).
        patchExistingComboLayer(existingLayer, keyMap, layerId === "default");
        continue;
      }

      // Legacy-id alias: a `.keyman-touch-layout` produced by a PRE-rename
      // build of scaffoldTouchLayout.ts (e.g. a draft/working copy persisted
      // before this migration) may carry a RALT-only layer under the old id
      // "altgr" rather than "rightalt" (comboToTouchLayerId's id for the same
      // combo). No shipped corpus keyboard uses "altgr"; this only guards those
      // pre-fix Studio-generated artifacts. Patch that existing layer instead
      // of synthesizing a second, duplicate one.
      const aliasId = LEGACY_TOUCH_LAYER_ID_ALIASES.get(layerId);
      const aliasLayer =
        aliasId !== undefined
          ? platformVal.layer.find((l) => isRawLayer(l) && l.id === aliasId)
          : undefined;
      if (isRawLayer(aliasLayer)) {
        patchExistingComboLayer(aliasLayer, keyMap, false);
        continue;
      }

      const newLayer = cloneLayerForCombo(defaultLayer, layerId, keyMap, ir, ruleIndex);
      platformVal.layer.push(newLayer);

      ensureReachability(platformVal, defaultLayer, layerId, warnings);
    }
  }

  return { json: JSON.stringify(layout, null, TOUCH_LAYOUT_JSON_INDENT), warnings };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Update `text`/`output` on keys where `keyMap` defines an output for that key id. Never adds, removes, or restructures keys/rows.
 * `output` is kept on the working copy for the studio's own key-grid UI
 * (keyGridViewModel/useModeContextCarry read it as the per-layer
 * disambiguator); `conformTouchLayoutToKeymanSchema` strips it on the final
 * output projection before the artifact reaches kmc/Keyman Developer.
 */
function patchExistingComboLayer(
  layer: RawLayer,
  keyMap: Map<string, string>,
  preserveKeycapText: boolean,
): void {
  for (const row of layer.row) {
    for (const key of row.key) {
      const char = keyMap.get(key.id);
      if (char === undefined) continue;
      key.output = char;
      // On the author's own default layer (the bare combo's patch), the
      // shipped keycap is the author's display choice — a ruled T_ key's
      // keycap ("◌̀") is not its production — so text follows the key map
      // only where the key carries no keycap of its own. Derived combo
      // layers take the key map's text outright, as before.
      if (!preserveKeycapText || key.text === undefined || key.text === "") {
        key.text = char;
      }
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
  ir: KeyboardIR,
  ruleIndex: TouchKeyRuleIndex,
): RawLayer {
  return {
    ...defaultLayer,
    id: layerId,
    row: defaultLayer.row.map((row) => ({
      ...row,
      key: row.key.map((key) => cloneKeyForCombo(key, keyMap, layerId, ir, ruleIndex)),
    })),
  };
}

/** Minimal TouchKeyIR view of a raw key, for production-resolver reads only. */
function rawKeyToResolverKey(key: RawKey): TouchKeyIR {
  const rawSp = key["sp"];
  const sp =
    typeof rawSp === "number"
      ? rawSp
      : typeof rawSp === "string" && rawSp.trim() !== "" && !Number.isNaN(Number(rawSp))
        ? Number(rawSp)
        : undefined;
  return {
    nodeId: "",
    id: key.id,
    ...(key.text !== undefined ? { text: key.text } : {}),
    ...(key.output !== undefined ? { output: key.output } : {}),
    ...(key.nextlayer !== undefined ? { nextlayer: key.nextlayer } : {}),
    ...(typeof key["layer"] === "string" ? { layer: key["layer"] } : {}),
    ...(sp !== undefined ? { sp } : {}),
  };
}

/**
 * What a cloned combo layer's key should carry when the combo's key map
 * does not redefine it — spec 104 FR-021 (T018). For a T_/U_ key the answer
 * comes from the production resolver, not from the key's family alone:
 *   - a text production in the combo's state → that text (a U_ key decodes
 *     in every state; a T_ key may be ruled for this state in ways the
 *     character-only key map cannot see);
 *   - a non-text production (deadkey, layer switch) → the source key's own
 *     keycap: the key still DOES something on this layer and must not be
 *     blanked into looking dead;
 *   - no production (`none` / `unknown` / unclassified) → undefined: the
 *     legacy blank, which is also the truth (e.g. a T_ key whose only
 *     rules are bare produces nothing under RALT).
 * K_ keys always take the legacy blank — no fallback exists for them in a
 * non-SHIFT modifier state, and SHIFT-family clones are the key map's job.
 */
function preservedCloneText(
  key: RawKey,
  layerId: string,
  ir: KeyboardIR,
  ruleIndex: TouchKeyRuleIndex,
): string | undefined {
  const family = touchKeyIdFamily(key.id);
  if (family !== "T_" && family !== "U_") return undefined;

  const record = resolveTouchProduction(
    { ir, ruleIndex },
    rawKeyToResolverKey(key),
    touchKeyStateFromLayerId(layerId),
  );
  for (const entry of record.productions) {
    if (entry.output.kind === "text") return entry.output.text;
  }
  const producesSomething = record.productions.some(
    (e) => e.output.kind !== "none" && e.output.kind !== "unknown",
  );
  if (producesSomething) return key.text ?? "";
  return undefined;
}

function cloneKeyForCombo(
  key: RawKey,
  keyMap: Map<string, string>,
  layerId: string,
  ir: KeyboardIR,
  ruleIndex: TouchKeyRuleIndex,
): RawKey {
  const { sk: _sk, flick: _flick, multitap: _multitap, output: _output, text: _text, ...rest } =
    key;
  const cloned: RawKey = { ...rest, id: key.id };

  const char = keyMap.get(key.id);
  if (char !== undefined) {
    cloned.text = char;
    // Kept for the working-copy key-grid UI; stripped on output by
    // conformTouchLayoutToKeymanSchema (same pattern as the `p` provenance tag).
    cloned.output = char;
  } else {
    const preserved = preservedCloneText(key, layerId, ir, ruleIndex);
    if (preserved !== undefined) {
      cloned.text = preserved;
      if (preserved !== "") cloned.output = preserved;
    } else {
      cloned.text = "";
    }
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
