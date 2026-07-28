/**
 * scaffoldTouchLayout — spec §8 Phase E: physical → touch layout derivation.
 *
 * **GENERATE-FROM-SCRATCH path only.** This function is used when the base
 * keyboard ships NO `.keyman-touch-layout` file (Case A).  When the base DOES
 * ship a touch layout, Phase E assignments are applied via
 * [applyTouchAssignmentsToRawJson](../pattern-apply/applyTouchAssignmentsToRawJson.ts)
 * instead, which preserves the shipped layout verbatim and does NOT auto-seed
 * deadkey sk[] entries.
 *
 * Derives a TouchLayoutIR for the phone platform from the IR's desktop key rules
 * and (optionally) from an existing .keyman-touch-layout already in the IR.
 *
 * Mapping table (spec §8 physical→touch):
 *   - Base desktop keys (no SHIFT / RALT modifiers) → touch "default" layer
 *   - SHIFT-modified keys                           → touch "shift" layer
 *   - RALT-modified keys                            → touch "altgr" layer
 *   - Deadkey patterns (strategyId starts with "S-02") → sk[] (longpress
 *     menu) attached to whichever key actually produces the base letter the
 *     deadkey decorates (resolved via a char → vkey reverse lookup), which
 *     covers both the collapsed single-rule shape and the canonical
 *     trigger/continuation split (a vkey-less "body" rule whose base letters
 *     and decorated forms live in a paired store() pair, read via kind:
 *     "index" rather than requiring a direct kind:"char" output)
 *   - A produced character on a vkey outside the compact skeleton's 26
 *     letter slots (K_LBRKT, K_QUOTE, K_BKQUOTE, digits, etc.) is spilled
 *     onto the sk[] of the nearest occupied slot key, or — with no known
 *     neighbor — onto a dedicated "extras" grouping on the space bar; it is
 *     never silently dropped
 *
 * If ir.touchLayout is already present (the IR was imported with a
 * .keyman-touch-layout file), that data is used as the base for the phone
 * platform and any existing keys are augmented with sk[] entries derived
 * from the deadkey patterns.  If ir.touchLayout is absent, a phone platform
 * is generated from scratch using the compact 3-layer QWERTY structure
 * (default + shift + numeric), with ≤10 keys per row.
 *
 * The function is pure — it does not mutate the IR or access any store.
 *
 * @see spec.md §8 Phase E (touch gallery)
 */

import type {
  KeyboardIR,
  TouchLayoutIR,
  TouchKeyIR,
  IRRule,
} from "@keyboard-studio/contracts";
import { NodeIdMinter } from "../shared/node-ids.js";
import { charToUnicodeKeyId } from "../shared/touch-ids.js";

// ---------------------------------------------------------------------------
// US fallback keycaps for unmapped keys
//
// When the keyMap has no entry for a template key id, we fall back to
// the standard US keycap for that key id. Letters use lower/upper case;
// symbol keys use default/shifted values.
// ---------------------------------------------------------------------------

/** [defaultLayer cap, shiftLayer cap] */
const US_KEYCAPS: Readonly<Record<string, [string, string]>> = {
  K_1: ["1", "!"],   K_2: ["2", "@"],   K_3: ["3", "#"],   K_4: ["4", "$"],
  K_5: ["5", "%"],   K_6: ["6", "^"],   K_7: ["7", "&"],   K_8: ["8", "*"],
  K_9: ["9", "("],   K_0: ["0", ")"],
  K_HYPHEN:  ["-", "_"],  K_EQUAL:   ["=", "+"],
  K_Q: ["q", "Q"],   K_W: ["w", "W"],   K_E: ["e", "E"],   K_R: ["r", "R"],
  K_T: ["t", "T"],   K_Y: ["y", "Y"],   K_U: ["u", "U"],   K_I: ["i", "I"],
  K_O: ["o", "O"],   K_P: ["p", "P"],
  K_LBRKT:   ["[", "{"],  K_RBRKT:   ["]", "}"],
  K_A: ["a", "A"],   K_S: ["s", "S"],   K_D: ["d", "D"],   K_F: ["f", "F"],
  K_G: ["g", "G"],   K_H: ["h", "H"],   K_J: ["j", "J"],   K_K: ["k", "K"],
  K_L: ["l", "L"],
  K_COLON:   [";", ":"],  K_QUOTE:   ["'", "\""],  K_BKSLASH: ["\\", "|"],
  K_Z: ["z", "Z"],   K_X: ["x", "X"],   K_C: ["c", "C"],   K_V: ["v", "V"],
  K_B: ["b", "B"],   K_N: ["n", "N"],   K_M: ["m", "M"],
  K_COMMA:   [",", "<"],  K_PERIOD:  [".", ">"],   K_SLASH:   ["/", "?"],
  K_BKQUOTE: ["`", "~"],
};

// ---------------------------------------------------------------------------
// Compact phone layout row definitions
//
// Three layers: default, shift, numeric.
// Every row in every layer has ≤10 keys (including spacers).
// Modeled on the naijatype experimental keyboard pattern.
// ---------------------------------------------------------------------------

/** Compact QWERTY row 1 (10 keys): Q–P */
const COMPACT_ROW1_VKEYS = [
  "K_Q", "K_W", "K_E", "K_R", "K_T", "K_Y", "K_U", "K_I", "K_O", "K_P",
] as const;

/** Compact ASDF row 2 (9 letters + 1 spacer = 10 entries): A–L + spacer */
const COMPACT_ROW2_VKEYS = [
  "K_A", "K_S", "K_D", "K_F", "K_G", "K_H", "K_J", "K_K", "K_L",
] as const;

// ---------------------------------------------------------------------------
// Overflow handling — vkeys the compact skeleton has no slot for.
//
// The compact skeleton only renders the 26 vkeys below (rows 0-2 of the
// default/shift layers). Any OTHER vkey the desktop rules produce a
// character for (K_LBRKT, K_QUOTE, K_BKQUOTE, digits, AZERTY-style OEM
// keys, etc.) has no home on the compact keyboard and would otherwise be
// silently dropped. Instead of dropping it, it is spilled onto the sk[]
// longpress menu of the nearest occupied slot key (a small, best-effort
// physical-adjacency table), or — for a vkey with no defined neighbor — into
// a dedicated "extras" grouping on the space bar's longpress menu, so the
// full desktop character inventory always surfaces somewhere on the phone
// layout.
// ---------------------------------------------------------------------------

/** Every vkey the compact skeleton actually renders a key for. */
const COVERED_VKEYS: ReadonlySet<string> = new Set<string>([
  ...COMPACT_ROW1_VKEYS,
  ...COMPACT_ROW2_VKEYS,
  "K_Z", "K_X", "K_C", "K_V", "K_B", "K_N", "K_M",
]);

/**
 * Nearest occupied slot key for a vkey outside the compact skeleton,
 * following standard US physical keyboard adjacency (row-above and
 * row-to-the-right neighbors). Best-effort — not exhaustive; a vkey absent
 * from this table falls through to the "extras" grouping instead.
 */
const OVERFLOW_NEAREST_SLOT: Readonly<Record<string, string>> = {
  // digits + hyphen/equal sit directly above the QWERTY row on a US layout.
  K_1: "K_Q", K_2: "K_W", K_3: "K_E", K_4: "K_R", K_5: "K_T",
  K_6: "K_Y", K_7: "K_U", K_8: "K_I", K_9: "K_O", K_0: "K_P",
  K_HYPHEN: "K_P", K_EQUAL: "K_P",
  // right of the QWERTY row.
  K_LBRKT: "K_P", K_RBRKT: "K_P", K_BKSLASH: "K_P",
  // left of the QWERTY row.
  K_BKQUOTE: "K_Q",
  // right of the ASDF row.
  K_COLON: "K_L", K_QUOTE: "K_L",
  // right of the ZXCV row.
  K_COMMA: "K_M", K_PERIOD: "K_M", K_SLASH: "K_M",
};

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

/** Modifier buckets we track from the desktop rules. */
type LayerId = "default" | "shift" | "altgr";

/** The first character output for a given (vkey, layer) pair. */
type KeyMap = Map<string, Map<LayerId, string>>;

/** Deadkey successor characters keyed by vkey. */
type DeadkeySuccessors = Map<string, string[]>;

// ---------------------------------------------------------------------------
// Desktop rule processing helpers
// ---------------------------------------------------------------------------

/**
 * Classify the modifier set of a rule into one of the three touch layers
 * (or null if the modifiers make the rule irrelevant to touch, e.g. CAPS).
 */
function classifyModifiers(rule: IRRule): LayerId | null {
  let hasShift = false;
  let hasRalt = false;
  let hasCaps = false;

  for (const el of rule.context) {
    if (el.kind !== "vkey") continue;
    for (const mod of el.modifiers) {
      if (mod === "SHIFT") hasShift = true;
      if (mod === "RALT" || mod === "RIGHTALT") hasRalt = true;
      if (mod === "CAPS" || mod === "NCAPS") hasCaps = true;
    }
  }

  // CAPS-keyed rules are stripped by scaffoldIR; skip any that remain.
  if (hasCaps) return null;
  // RALT alone → "altgr"; SHIFT alone → "shift"; no mods → "default".
  // RALT+SHIFT combinations are not mapped to a top-level touch layer.
  if (hasRalt && !hasShift) return "altgr";
  if (hasShift && !hasRalt) return "shift";
  if (!hasRalt && !hasShift) return "default";
  return null;
}

/**
 * Extract the character output from a rule's output elements.
 *
 * Concatenates every element in the *leading run* of consecutive kind:"char"
 * elements (e.g. a digraph or a base+combining-mark sequence emitted as two
 * literals: `> 'e' U+0301`) rather than returning only the first one, so
 * multi-char outputs survive intact on the touch key's text/output. Stops at
 * the first non-char element (a deadkey/beep/index/etc. mid-output changes
 * the rule's meaning; only the leading literal run is a "simple character").
 * Whatever normalization form the source characters are already in is kept
 * as-is — this is plain string concatenation, never a re-normalize.
 * Returns null when the rule produces no leading literal character(s).
 */
function charOutputText(rule: IRRule): string | null {
  let text = "";
  for (const el of rule.output) {
    if (el.kind !== "char") break;
    text += el.value;
  }
  return text.length > 0 ? text : null;
}

/**
 * Extract the vkey name from the rule's context (the first vkey element).
 */
function extractVkey(rule: IRRule): string | null {
  for (const el of rule.context) {
    if (el.kind === "vkey") return el.name;
  }
  return null;
}

/**
 * Build a (vkey → layerId → char) map from the IR's rule groups.
 * Only one character output per (vkey, layer) is recorded (first-wins).
 */
function buildKeyMap(ir: KeyboardIR): KeyMap {
  const map: KeyMap = new Map();

  for (const group of ir.groups) {
    if (group.readonly) continue;
    for (const rule of group.rules) {
      const vkey = extractVkey(rule);
      if (!vkey) continue;

      const layer = classifyModifiers(rule);
      if (!layer) continue;

      const char = charOutputText(rule);
      if (!char) continue;

      if (!map.has(vkey)) map.set(vkey, new Map());
      const layerMap = map.get(vkey)!;
      if (!layerMap.has(layer)) {
        // first-wins per (vkey, layer)
        layerMap.set(layer, char);
      }
    }
  }

  return map;
}

/**
 * Build a (char → vkey) reverse-lookup from the keyMap, so a base letter
 * (e.g. from a deadkey pattern's base-letter store) can be traced back to
 * the physical key that actually produces it. Layer priority is
 * default > shift > altgr — the base letter a deadkey decorates is
 * overwhelmingly the plain/default form of a key, so a default-layer
 * producer of a char wins over a shift/altgr producer of the same char.
 */
function buildCharToVkeyMap(keyMap: KeyMap): Map<string, string> {
  const map = new Map<string, string>();
  const layerPriority: LayerId[] = ["default", "shift", "altgr"];

  for (const layer of layerPriority) {
    for (const [vkey, layerMap] of keyMap) {
      const ch = layerMap.get(layer);
      if (ch !== undefined && !map.has(ch)) map.set(ch, vkey);
    }
  }

  return map;
}

/**
 * Build a (vkey → successor-chars[]) map from recognized deadkey patterns
 * (strategyId starts with "S-02").
 *
 * The canonical S-02 shape is a **trigger/continuation split** across two
 * rules (see `s02-deadkey-single-tap.ts`):
 *   - trigger:      `+ [K_QUOTE] > dk(grave)`               — vkey, output kind:"deadkey"
 *   - continuation: `dk(grave) + any(store1) > index(store2, 2)` — context
 *     kind:"deadkey" + kind:"any"(store1), output kind:"index"(store2)
 * The continuation rule owns the actual accent mapping but has no vkey of
 * its own — the base letters live in store1 and their decorated forms in
 * store2, paired positionally. Those decorated forms are attached here as
 * sk[] to whichever vkey *produces the base letter* (via `charToVkey`), not
 * to the continuation rule.
 *
 * A simpler collapsed shape (one rule carrying a deadkey context, a
 * triggering vkey, AND a direct char output) is also recognized directly,
 * for patterns that never split trigger from continuation.
 *
 * A recognized pattern's ownedNodes links it to actual IR rules; we read
 * those directly when available. The kmnFragment-regex scan is kept only as
 * a last resort, for patterns lacking ownedNodes or whose owned rules don't
 * match either shape above.
 */
function buildDeadkeySuccessors(
  ir: KeyboardIR,
  charToVkey: ReadonlyMap<string, string>,
): DeadkeySuccessors {
  const result: DeadkeySuccessors = new Map();

  const addSuccessor = (vkey: string, ch: string): void => {
    if (!result.has(vkey)) result.set(vkey, []);
    const list = result.get(vkey)!;
    if (!list.includes(ch)) list.push(ch);
  };

  for (const pattern of ir.recognizedPatterns) {
    if (!pattern.strategyId?.startsWith("S-02")) continue;

    let matchedFromOwnedNodes = false;

    // Collect successor characters from owned IR rules (accurate path).
    if (pattern.ownedNodes && pattern.ownedNodes.length > 0) {
      const ownedIds = new Set(pattern.ownedNodes.map((n) => n.nodeId));
      for (const group of ir.groups) {
        for (const rule of group.rules) {
          if (!ownedIds.has(rule.nodeId)) continue;

          const hasDeadkeyCtx = rule.context.some((el) => el.kind === "deadkey");
          if (!hasDeadkeyCtx) continue;

          // Shape 1 (collapsed): deadkey context + a triggering vkey + a
          // direct char output, all on the same rule.
          const directVkey = extractVkey(rule);
          const directChar = charOutputText(rule);
          if (directVkey && directChar) {
            addSuccessor(directVkey, directChar);
            matchedFromOwnedNodes = true;
            continue;
          }

          // Shape 2 (trigger -> continuation split): this is the
          // continuation rule — context has an any(storeRef) alongside the
          // deadkey marker, output is an index(storeRef, offset) reference.
          let baseStoreRef: string | undefined;
          for (const el of rule.context) {
            if (el.kind === "any") {
              baseStoreRef = el.storeRef;
              break;
            }
          }
          if (baseStoreRef === undefined) continue;

          let accentedStoreRef: string | undefined;
          for (const el of rule.output) {
            if (el.kind === "index") {
              accentedStoreRef = el.storeRef;
              break;
            }
          }
          if (accentedStoreRef === undefined) continue;

          const baseStore = ir.stores.find((s) => s.name === baseStoreRef);
          const accentedStore = ir.stores.find((s) => s.name === accentedStoreRef);
          if (!baseStore || !accentedStore) continue;
          if (baseStore.items.length !== accentedStore.items.length) continue;

          for (let i = 0; i < baseStore.items.length; i++) {
            const baseItem = baseStore.items[i]!;
            const accentedItem = accentedStore.items[i]!;
            if (baseItem.kind !== "char" || accentedItem.kind !== "char") continue;

            const vkey = charToVkey.get(baseItem.value);
            if (!vkey) continue;

            addSuccessor(vkey, accentedItem.value);
            matchedFromOwnedNodes = true;
          }
        }
      }
    }

    if (matchedFromOwnedNodes) continue;

    // Last-resort fallback: scan the kmnFragment for quoted char literals
    // after 'deadkey'. Pattern: look for vkey references (via slotValues)
    // and collect quoted chars.
    for (const q of pattern.questions) {
      const slotId = q.id;
      // If the slot is a key-name type, it identifies the triggering vkey.
      if (q.answerType !== "key-name") continue;
      // The slot's resolved answer IS the real vkey name (e.g. "K_E") — the
      // kmnFragment itself still carries the unresolved `{{slotId}}`
      // placeholder text, which is never a real vkey and would silently
      // orphan every successor collected below.
      const vkeyName = q.default;
      if (!vkeyName) continue;

      // Scan the kmnFragment for lines with this slot's output chars.
      const fragLines = pattern.kmnFragment.split("\n");
      for (const line of fragLines) {
        if (!line.includes(`{{${slotId}}}`)) continue;
        // Find quoted characters on the output side (after '>').
        const outputSide = line.split(">")[1] ?? "";
        const charMatches = outputSide.match(/'([^']+)'/g) ?? [];
        for (const m of charMatches) {
          const ch = m.slice(1, -1);
          if (ch.length === 1) {
            addSuccessor(vkeyName, ch);
          }
        }
      }
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Compact phone layer builder
// ---------------------------------------------------------------------------

/**
 * Resolve the display text for a character key in a given layer.
 *
 * Priority:
 *  1. keyMap entry for (vkey, layerId) — the keyboard's own mapping.
 *  2. US fallback keycap — ONLY when the desktop rules never assigned this
 *     physical key at all (no keyMap entry for ANY layer). This is a
 *     genuinely-unassigned structural key (e.g. no group ever referenced
 *     this vkey), so a plain US keycap is a safe placeholder.
 *  3. Empty string — the desktop rules DID assign this vkey (on some other
 *     layer), just not this one. Falling back to a Latin keycap here would
 *     fabricate a letter the base never produced (and would silently
 *     Latin-ize a non-Latin base) — leave it blank instead.
 */
function resolveKeyText(
  vkey: string,
  layerId: "default" | "shift" | "altgr",
  keyMap: KeyMap,
): string {
  const layerMap = keyMap.get(vkey);

  if (layerMap === undefined) {
    const fallback = US_KEYCAPS[vkey];
    if (fallback !== undefined) {
      return layerId === "shift" ? fallback[1] : fallback[0];
    }
    return "";
  }

  return layerMap.get(layerId) ?? "";
}

/**
 * Build a compact phone layout letter key from a vkey for the given layer.
 * Attaches deadkey sk[] to keys in the default layer.
 */
function buildLetterKey(
  vkey: string,
  layerId: "default" | "shift",
  keyMap: KeyMap,
  deadkeySuccessors: DeadkeySuccessors,
  minter: NodeIdMinter,
  pad?: number,
  nextlayer?: string,
): TouchKeyIR {
  const text = resolveKeyText(vkey, layerId, keyMap);
  const key: TouchKeyIR = {
    nodeId: minter.mint("touchKey"),
    id: vkey,
    provenance: "physical-suggested",
    ...(text !== "" ? { text, output: text } : {}),
    ...(pad !== undefined ? { pad } : {}),
    ...(nextlayer !== undefined ? { nextlayer } : {}),
  };

  // Attach deadkey sk[] to keys in the default layer only
  if (layerId === "default") {
    const successors = deadkeySuccessors.get(vkey);
    if (successors && successors.length > 0) {
      key.sk = successors.map((ch) => ({
        nodeId: minter.mint("touchKey"),
        id: charToUnicodeKeyId(ch),
        text: ch,
        provenance: "physical-suggested",
      }));
    }
  }

  return key;
}

/**
 * Merge a vkey → successor-chars[] map (`extra`) into `base`, deduplicating
 * per vkey. Returns a new map; neither input is mutated.
 */
function mergeSuccessorMaps(
  base: DeadkeySuccessors,
  extra: Map<string, string[]>,
): DeadkeySuccessors {
  const merged: DeadkeySuccessors = new Map();
  for (const [vkey, chars] of base) merged.set(vkey, [...chars]);
  for (const [vkey, chars] of extra) {
    const existing = merged.get(vkey) ?? [];
    for (const ch of chars) {
      if (!existing.includes(ch)) existing.push(ch);
    }
    merged.set(vkey, existing);
  }
  return merged;
}

/**
 * Find every character the desktop rules produce on a vkey OUTSIDE the
 * compact skeleton's 26 covered slots, and route it somewhere it can still
 * be reached from the phone layout:
 *   - `bySlot`   — vkeys with a known physical neighbor (OVERFLOW_NEAREST_SLOT)
 *                  → attached as sk[] longpress on that neighbor.
 *   - `unplaced` — vkeys with no known neighbor → the caller spills these
 *                  into a dedicated "extras" grouping (never dropped).
 */
function collectOverflowEntries(
  keyMap: KeyMap,
  covered: ReadonlySet<string>,
): { bySlot: Map<string, string[]>; unplaced: string[] } {
  const bySlot = new Map<string, string[]>();
  const unplaced: string[] = [];

  for (const [vkey, layerMap] of keyMap) {
    if (covered.has(vkey)) continue;

    const chars: string[] = [];
    for (const layer of ["default", "shift", "altgr"] as const) {
      const ch = layerMap.get(layer);
      if (ch !== undefined && !chars.includes(ch)) chars.push(ch);
    }
    if (chars.length === 0) continue;

    const slot = OVERFLOW_NEAREST_SLOT[vkey];
    if (slot === undefined) {
      for (const ch of chars) {
        if (!unplaced.includes(ch)) unplaced.push(ch);
      }
      continue;
    }

    const existing = bySlot.get(slot) ?? [];
    for (const ch of chars) {
      if (!existing.includes(ch)) existing.push(ch);
    }
    bySlot.set(slot, existing);
  }

  return { bySlot, unplaced };
}

/**
 * Attach `extras` (characters with no physical neighbor — see
 * {@link collectOverflowEntries}) as an sk[] longpress menu on the default
 * layer's space bar, so nothing produced by the desktop rules is ever
 * silently dropped even when it has no natural key of its own. No-op when
 * `extras` is empty or the default layer / space key aren't present.
 */
function attachOverflowExtras(
  layers: TouchLayoutIR["platforms"][number]["layers"],
  minter: NodeIdMinter,
  extras: string[],
): void {
  if (extras.length === 0) return;

  const defaultLayer = layers.find((l) => l.id === "default");
  const funcRow = defaultLayer?.rows[3];
  const spaceIdx = funcRow?.keys.findIndex((k) => k.id === "K_SPACE") ?? -1;
  if (funcRow === undefined || spaceIdx === -1) return;

  const space = funcRow.keys[spaceIdx]!;
  funcRow.keys[spaceIdx] = {
    ...space,
    sk: [
      ...(space.sk ?? []),
      ...extras.map((ch) => ({
        nodeId: minter.mint("touchKey"),
        id: charToUnicodeKeyId(ch),
        text: ch,
        provenance: "physical-suggested" as const,
      })),
    ],
  };
}

/**
 * Build the compact QWERTY phone default + shift layers (and optionally
 * altgr) from the compact row structure, populating key text from keyMap.
 *
 * Layout structure (≤10 keys per row in every layer):
 *
 * default / shift layers:
 *   Row 0 (10): Q W E R T Y U I O P
 *   Row 1 (10): A(pad:50) S D F G H J K L  + spacer(sp:10,w:10)
 *   Row 2 (10): K_SHIFT(sp:1→shift / sp:2→default) Z X C V B N M  K_PERIOD  K_BKSP(sp:1)
 *   Row 3  (4): K_NUMLOCK("*123*",sp:1,w:150,nextlayer:numeric)
 *               K_LOPT("*Menu*",sp:1,w:120)
 *               K_SPACE("", width:610)
 *               K_ENTER("*Enter*",sp:1,w:150)
 *
 * numeric layer:
 *   Row 0 (10): 1 2 3 4 5 6 7 8 9 0 (literal)
 *   Row 1 (10): $(pad:50) @ # % & _ = | \  + spacer(sp:10,w:10)
 *   Row 2 (10): spacer(sp:10,w:110) [ ( ) ] + - * /  K_BKSP(sp:1) — K_BKSP at keyIndex 9, no width, matching default/shift/altgr
 *   Row 3  (4): K_LOWER("*abc*",sp:1,w:150,nextlayer:default) K_LOPT K_SPACE K_ENTER
 *
 * Shift key:
 *   default layer → sp:1, nextlayer:"shift"
 *   shift layer   → sp:2, nextlayer:"default"
 * No sk[] on touch shift key (desktop modifier sk array omitted).
 *
 * @param keyMap           Vkey → layer → char map from the desktop rules.
 * @param deadkeySuccessors Vkey → successor-chars[] map from S-02 patterns.
 * @param minter           NodeIdMinter for stable ids.
 */
function buildCanonicalPhoneLayers(
  keyMap: KeyMap,
  deadkeySuccessors: DeadkeySuccessors,
  minter: NodeIdMinter,
): TouchLayoutIR["platforms"][number]["layers"] {
  const layers: TouchLayoutIR["platforms"][number]["layers"] = [];

  // -------------------------------------------------------------------------
  // default and shift layers
  // -------------------------------------------------------------------------
  const letterLayers: Array<"default" | "shift"> = ["default", "shift"];

  for (const layerId of letterLayers) {
    const isDefault = layerId === "default";

    // Row 0: Q W E R T Y U I O P (10 keys)
    const row0Keys: TouchKeyIR[] = COMPACT_ROW1_VKEYS.map((vkey) =>
      buildLetterKey(vkey, layerId, keyMap, deadkeySuccessors, minter,
        undefined, isDefault ? undefined : "default"),
    );

    // Row 1: A(pad:50) S D F G H J K L  spacer (9 letters + 1 spacer = 10)
    const row1Keys: TouchKeyIR[] = [
      buildLetterKey("K_A", layerId, keyMap, deadkeySuccessors, minter,
        50, isDefault ? undefined : "default"),
      ...COMPACT_ROW2_VKEYS.slice(1).map((vkey) =>
        buildLetterKey(vkey, layerId, keyMap, deadkeySuccessors, minter,
          undefined, isDefault ? undefined : "default"),
      ),
      // trailing spacer
      {
        nodeId: minter.mint("touchKey"),
        id: `T_ks_sp_${layerId}`,
        text: "",
        sp: 10,
        width: 10,
      } satisfies TouchKeyIR,
    ];

    // Row 2: K_SHIFT  Z X C V B N M  K_PERIOD  K_BKSP (10 keys)
    const shiftSp = isDefault ? 1 : 2;
    const shiftNextlayer = isDefault ? "shift" : "default";
    const row2Keys: TouchKeyIR[] = [
      {
        nodeId: minter.mint("touchKey"),
        id: "K_SHIFT",
        text: "*Shift*",
        sp: shiftSp,
        nextlayer: shiftNextlayer,
      },
      buildLetterKey("K_Z", layerId, keyMap, deadkeySuccessors, minter,
        undefined, isDefault ? undefined : "default"),
      buildLetterKey("K_X", layerId, keyMap, deadkeySuccessors, minter,
        undefined, isDefault ? undefined : "default"),
      buildLetterKey("K_C", layerId, keyMap, deadkeySuccessors, minter,
        undefined, isDefault ? undefined : "default"),
      buildLetterKey("K_V", layerId, keyMap, deadkeySuccessors, minter,
        undefined, isDefault ? undefined : "default"),
      buildLetterKey("K_B", layerId, keyMap, deadkeySuccessors, minter,
        undefined, isDefault ? undefined : "default"),
      buildLetterKey("K_N", layerId, keyMap, deadkeySuccessors, minter,
        undefined, isDefault ? undefined : "default"),
      buildLetterKey("K_M", layerId, keyMap, deadkeySuccessors, minter,
        undefined, isDefault ? undefined : "default"),
      {
        nodeId: minter.mint("touchKey"),
        id: "K_PERIOD",
        text: ".",
        ...(isDefault ? {} : { nextlayer: "default" }),
      },
      {
        nodeId: minter.mint("touchKey"),
        id: "K_BKSP",
        text: "*BkSp*",
        sp: 1,
      },
    ];

    // Row 3: functional (4 keys)
    const row3Keys: TouchKeyIR[] = [
      {
        nodeId: minter.mint("touchKey"),
        id: "K_NUMLOCK",
        text: "*123*",
        sp: 1,
        width: 150,
        nextlayer: "numeric",
      },
      {
        nodeId: minter.mint("touchKey"),
        id: "K_LOPT",
        text: "*Menu*",
        sp: 1,
        width: 120,
      },
      {
        nodeId: minter.mint("touchKey"),
        id: "K_SPACE",
        text: "",
        width: 610,
      },
      {
        nodeId: minter.mint("touchKey"),
        id: "K_ENTER",
        text: "*Enter*",
        sp: 1,
        width: 150,
      },
    ];

    layers.push({
      id: layerId,
      rows: [
        { keys: row0Keys },
        { keys: row1Keys },
        { keys: row2Keys },
        { keys: row3Keys },
      ],
    });
  }

  // -------------------------------------------------------------------------
  // numeric layer (fixed literal keys — not from keyMap)
  //
  // All literal-character keys use U_<UPPERHEX> ids so Keyman outputs the
  // Unicode codepoint directly without routing through the keyboard's rules.
  // This also guarantees globally unique ids within the layer (no two keys
  // can share a U_ id, unlike K_BKSLASH which would have collided for | and \).
  // -------------------------------------------------------------------------
  // Row 0 (10): 1 2 3 4 5 6 7 8 9 0
  const numRow0Keys: TouchKeyIR[] = (
    ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"] as const
  ).map((ch) => ({
    nodeId: minter.mint("touchKey"),
    id: charToUnicodeKeyId(ch),
    text: ch,
  }));

  // Row 1 (9 symbol keys + 1 spacer = 10): $(pad:50) @ # % & _ = | \  spacer
  const numRow1Symbols: Array<[string, number | undefined]> = [
    ["$", 50], ["@", undefined], ["#", undefined], ["%", undefined],
    ["&", undefined], ["_", undefined], ["=", undefined],
    ["|", undefined], ["\\", undefined],
  ];
  const numRow1Keys: TouchKeyIR[] = [
    ...numRow1Symbols.map(([ch, pad]) => ({
      nodeId: minter.mint("touchKey"),
      id: charToUnicodeKeyId(ch),
      text: ch,
      ...(pad !== undefined ? { pad } : {}),
    })),
    // trailing spacer
    { nodeId: minter.mint("touchKey"), id: "T_ks_sp_numeric", text: "", sp: 10, width: 10 },
  ];

  // Row 2 (10 keys): leading-spacer [ ( ) ] + - * /  K_BKSP(sp:1, no width)
  // [ and ] keep K_LBRKT / K_RBRKT so they route through the keyboard rules
  // (they are punctuation keys, not fixed-value literals).
  // ( ) + - * / are literal characters → U_ ids.
  // The leading spacer (width:110) replaces the old pad:110 on K_LBRKT so that
  // K_BKSP lands at keyIndex 9 — identical to default/shift/altgr layers.
  const numRow2Keys: TouchKeyIR[] = [
    // index 0: leading spacer to preserve the ~110px visual indent
    { nodeId: minter.mint("touchKey"), id: "T_num_r2_lead_sp", text: "", sp: 10, width: 110 },
    { nodeId: minter.mint("touchKey"), id: "K_LBRKT",              text: "[" },
    { nodeId: minter.mint("touchKey"), id: charToUnicodeKeyId("("), text: "(" },
    { nodeId: minter.mint("touchKey"), id: charToUnicodeKeyId(")"), text: ")" },
    { nodeId: minter.mint("touchKey"), id: "K_RBRKT",              text: "]" },
    { nodeId: minter.mint("touchKey"), id: charToUnicodeKeyId("+"), text: "+" },
    { nodeId: minter.mint("touchKey"), id: charToUnicodeKeyId("-"), text: "-" },
    { nodeId: minter.mint("touchKey"), id: charToUnicodeKeyId("*"), text: "*" },
    { nodeId: minter.mint("touchKey"), id: charToUnicodeKeyId("/"), text: "/" },
    // index 9: K_BKSP — no width, matching default/shift/altgr exactly
    { nodeId: minter.mint("touchKey"), id: "K_BKSP",               text: "*BkSp*", sp: 1 },
  ];

  // Row 3 (4 functional keys): *abc* *Menu* space *Enter*
  const numRow3Keys: TouchKeyIR[] = [
    {
      nodeId: minter.mint("touchKey"),
      id: "K_LOWER",
      text: "*abc*",
      sp: 1,
      width: 150,
      nextlayer: "default",
    },
    {
      nodeId: minter.mint("touchKey"),
      id: "K_LOPT",
      text: "*Menu*",
      sp: 1,
      width: 120,
    },
    {
      nodeId: minter.mint("touchKey"),
      id: "K_SPACE",
      text: "",
      width: 610,
    },
    {
      nodeId: minter.mint("touchKey"),
      id: "K_ENTER",
      text: "*Enter*",
      sp: 1,
      width: 150,
    },
  ];

  layers.push({
    id: "numeric",
    rows: [
      { keys: numRow0Keys },
      { keys: numRow1Keys },
      { keys: numRow2Keys },
      { keys: numRow3Keys },
    ],
  });

  // altgr layer: only emit when at least one key has an altgr mapping.
  // Uses same row structure as default but with altgr text values.
  const hasAltgr = [...keyMap.values()].some((m) => m.has("altgr"));
  if (hasAltgr) {
    // Row 0: Q W E R T Y U I O P with altgr text
    const altRow0Keys: TouchKeyIR[] = COMPACT_ROW1_VKEYS.map((vkey) => {
      const text = resolveKeyText(vkey, "altgr", keyMap);
      return {
        nodeId: minter.mint("touchKey"),
        id: vkey,
        ...(text !== "" ? { text, output: text } : {}),
      };
    });

    // Row 1: A(pad:50) S D F G H J K L  spacer
    const altRow1Keys: TouchKeyIR[] = [
      (() => {
        const text = resolveKeyText("K_A", "altgr", keyMap);
        return {
          nodeId: minter.mint("touchKey"),
          id: "K_A",
          ...(text !== "" ? { text, output: text } : {}),
          pad: 50,
        };
      })(),
      ...COMPACT_ROW2_VKEYS.slice(1).map((vkey) => {
        const text = resolveKeyText(vkey, "altgr", keyMap);
        return {
          nodeId: minter.mint("touchKey"),
          id: vkey,
          ...(text !== "" ? { text, output: text } : {}),
        };
      }),
      {
        nodeId: minter.mint("touchKey"),
        id: "T_ks_sp_altgr",
        text: "",
        sp: 10,
        width: 10,
      } satisfies TouchKeyIR,
    ];

    // Row 2: K_SHIFT  Z X C V B N M  K_PERIOD  K_BKSP
    const altRow2Keys: TouchKeyIR[] = [
      {
        nodeId: minter.mint("touchKey"),
        id: "K_SHIFT",
        text: "*Shift*",
        sp: 1,
        nextlayer: "shift",
      },
      ...["K_Z", "K_X", "K_C", "K_V", "K_B", "K_N", "K_M"].map((vkey) => {
        const text = resolveKeyText(vkey, "altgr", keyMap);
        return {
          nodeId: minter.mint("touchKey"),
          id: vkey,
          ...(text !== "" ? { text, output: text } : {}),
        };
      }),
      { nodeId: minter.mint("touchKey"), id: "K_PERIOD", text: "." },
      { nodeId: minter.mint("touchKey"), id: "K_BKSP",   text: "*BkSp*", sp: 1 },
    ];

    // Row 3: same functional row as default
    const altRow3Keys: TouchKeyIR[] = [
      {
        nodeId: minter.mint("touchKey"),
        id: "K_NUMLOCK",
        text: "*123*",
        sp: 1,
        width: 150,
        nextlayer: "numeric",
      },
      { nodeId: minter.mint("touchKey"), id: "K_LOPT",  text: "*Menu*",  sp: 1, width: 120 },
      { nodeId: minter.mint("touchKey"), id: "K_SPACE", text: "",                width: 610 },
      { nodeId: minter.mint("touchKey"), id: "K_ENTER", text: "*Enter*", sp: 1, width: 150 },
    ];

    layers.push({
      id: "altgr",
      rows: [
        { keys: altRow0Keys },
        { keys: altRow1Keys },
        { keys: altRow2Keys },
        { keys: altRow3Keys },
      ],
    });
  }

  return layers;
}

/**
 * Build the compact phone layers AND route every character the desktop
 * rules produce that falls outside the compact skeleton's slots (see
 * {@link collectOverflowEntries}) onto a real key's sk[] longpress menu — a
 * nearest-neighbor slot when known, otherwise the space bar's "extras"
 * grouping. Logs a warning (no emoji, per convention) naming any character
 * that landed in the extras grouping, so a gap is visible rather than only
 * inferred from the layout, AND returns that same character list as
 * structured data (`unplacedChars`) so a caller with no console (e.g. the
 * studio's live preview) can surface it too — see
 * {@link scaffoldTouchLayoutWithDiagnostics}.
 */
function buildCompactPhoneLayers(
  keyMap: KeyMap,
  deadkeySuccessors: DeadkeySuccessors,
  minter: NodeIdMinter,
): { layers: TouchLayoutIR["platforms"][number]["layers"]; unplacedChars: string[] } {
  const { bySlot: overflowBySlot, unplaced } = collectOverflowEntries(keyMap, COVERED_VKEYS);
  const combinedSuccessors = mergeSuccessorMaps(deadkeySuccessors, overflowBySlot);

  const layers = buildCanonicalPhoneLayers(keyMap, combinedSuccessors, minter);

  if (unplaced.length > 0) {
    attachOverflowExtras(layers, minter, unplaced);
    console.warn(
      `[scaffoldTouchLayout] ${unplaced.length} character(s) produced by the desktop rules ` +
        "have no compact-layout key and no known adjacent slot; placed on the space bar's " +
        `longpress ("extras") menu instead of being dropped: ${unplaced.join(", ")}`,
    );
  }

  return { layers, unplacedChars: unplaced };
}

/**
 * Tag a carried-through touch key (and any of its carried sk[] / flick{} /
 * multitap[] sub-keys) with `provenance: "base-derived"` when it has no
 * existing provenance. Keys that already carry an explicit provenance (e.g.
 * an author-set "hand-set") are left untouched — per R6 (research.md),
 * content carried through from an existing ir.touchLayout is base-derived,
 * never absent-provenance (contrast the general TouchKeyProvenance doc
 * default of "absent = hand-set", which applies elsewhere but not to this
 * carry-through path).
 *
 * `precomputedSk`, when provided, is used instead of re-deriving `sk` from
 * `key.sk` — callers that already tagged `key.sk` themselves (e.g. the
 * deadkey-augmentation pass, which walks `existingSk` to decide which
 * successors are new) pass it through here rather than paying for a second
 * identical walk.
 */
function tagCarriedProvenance(key: TouchKeyIR, precomputedSk?: TouchKeyIR[]): TouchKeyIR {
  const sk = precomputedSk ?? key.sk?.map((sub) => tagCarriedProvenance(sub));
  const flick = key.flick === undefined
    ? undefined
    : Object.fromEntries(
        Object.entries(key.flick).map(([dir, sub]) => [dir, tagCarriedProvenance(sub)]),
      ) as TouchKeyIR["flick"];
  const multitap = key.multitap?.map((sub) => tagCarriedProvenance(sub));
  return {
    ...key,
    ...(sk !== undefined ? { sk } : {}),
    ...(flick !== undefined ? { flick } : {}),
    ...(multitap !== undefined ? { multitap } : {}),
    provenance: key.provenance ?? "base-derived",
  };
}

/**
 * Augment an existing phone platform's layers with sk[] from deadkey
 * successors (default layer only), leaving all other key properties intact.
 * Every carried-through key — on every layer, including sk[] / flick{} /
 * multitap[] sub-keys — is tagged via {@link tagCarriedProvenance}.
 */
function augmentExistingPhoneLayers(
  platform: TouchLayoutIR["platforms"][number],
  deadkeySuccessors: DeadkeySuccessors,
  minter: NodeIdMinter,
): TouchLayoutIR["platforms"][number] {
  const augmentedLayers = platform.layers.map((layer) => {
    const augmentedRows = layer.rows.map((row) => {
      const augmentedKeys = row.keys.map((key): TouchKeyIR => {
        const successors = layer.id === "default" ? deadkeySuccessors.get(key.id) : undefined;
        if (!successors || successors.length === 0) return tagCarriedProvenance(key);

        const existingSk = (key.sk ?? []).map((sub) => tagCarriedProvenance(sub));
        const newSk: TouchKeyIR[] = successors
          .filter((ch) => !existingSk.some((s) => s.text === ch))
          .map((ch) => ({
            nodeId: minter.mint("touchKey"),
            // U_<UPPERHEX> id: Keyman outputs the codepoint from this id form — no
            // `output` field needed. `text` provides the on-key glyph display.
            id: charToUnicodeKeyId(ch),
            text: ch,
            // The sk[] entry is projection output (R6); the carried-through
            // parent key is tagged base-derived (when untagged) below.
            provenance: "physical-suggested",
          }));

        if (newSk.length === 0) {
          return tagCarriedProvenance(key, key.sk !== undefined ? existingSk : undefined);
        }

        const augmented: TouchKeyIR = {
          ...key,
          provenance: key.provenance ?? "base-derived",
          sk: [...existingSk, ...newSk],
        };
        // No per-key hint set here — the dot (•) is supplied automatically by
        // the Keyman runtime because the platform defaultHint is "dot".
        return augmented;
      });

      return { keys: augmentedKeys };
    });

    return { ...layer, rows: augmentedRows };
  });

  return { ...platform, layers: augmentedLayers };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build a compact phone touch layout — three layers (default + shift + numeric)
 * with ≤10 keys per row and standard US keycaps for all character keys.
 *
 * This is intentionally independent of the IR — it is used as a seed by the
 * Phase E longpress compile regression test.
 *
 * @see spec.md §8 Phase E (touch gallery)
 */
export function buildMinimalPhoneTouchLayout(): TouchLayoutIR {
  const minter = new NodeIdMinter();

  // Use an empty keyMap — all text falls back to US_KEYCAPS.
  const emptyKeyMap: KeyMap = new Map();
  const emptyDeadkeys: DeadkeySuccessors = new Map();

  const layers = buildCanonicalPhoneLayers(emptyKeyMap, emptyDeadkeys, minter);

  return {
    platforms: [{
      id: "phone",
      layers,
    }],
    nodeIds: [],
  };
}

/** The result of {@link scaffoldTouchLayoutWithDiagnostics}. */
export interface ScaffoldTouchLayoutResult {
  /** The derived TouchLayoutIR — identical to {@link scaffoldTouchLayout}'s return. */
  layout: TouchLayoutIR;
  /**
   * Characters produced by the desktop rules that had no compact-layout key
   * and no known adjacent slot, so they were spilled onto the space bar's
   * "extras" longpress menu instead of being dropped (see
   * {@link collectOverflowEntries} / {@link attachOverflowExtras}). Empty
   * when nothing was spilled. Advisory only — never gates anything; a caller
   * with a UI (e.g. the studio's live seed preview) can surface this list to
   * the author instead of relying on the `console.warn` this function also
   * emits.
   */
  unplacedChars: string[];
}

/**
 * Derive a {@link TouchLayoutIR} for the phone platform from the keyboard IR,
 * plus the structured diagnostics {@link scaffoldTouchLayout} only logs to
 * the console. See {@link scaffoldTouchLayout} for the derivation itself —
 * this is the same logic, returning `unplacedChars` alongside the layout for
 * callers that need it (e.g. a UI preview) rather than re-deriving it.
 *
 * The function is pure — it does not mutate `ir`.
 *
 * @see spec.md §8 Phase E (touch gallery)
 */
export function scaffoldTouchLayoutWithDiagnostics(ir: KeyboardIR): ScaffoldTouchLayoutResult {
  const minter = new NodeIdMinter();
  const keyMap = buildKeyMap(ir);
  const charToVkey = buildCharToVkeyMap(keyMap);
  const deadkeySuccessors = buildDeadkeySuccessors(ir, charToVkey);

  // ------------------------------------------------------------------
  // Case A: no existing touch layout — generate from scratch using
  //         the compact 3-layer phone template.
  // ------------------------------------------------------------------
  if (ir.touchLayout === undefined) {
    const { layers: phoneLayers, unplacedChars } = buildCompactPhoneLayers(
      keyMap,
      deadkeySuccessors,
      minter,
    );

    return {
      layout: {
        platforms: [
          {
            id: "phone",
            layers: phoneLayers,
          },
        ],
        nodeIds: [],
      },
      unplacedChars,
    };
  }

  // ------------------------------------------------------------------
  // Case B: existing touch layout — use it as the base, augment phone.
  // ------------------------------------------------------------------
  const existingPhoneIdx = ir.touchLayout.platforms.findIndex(
    (p) => p.id === "phone",
  );

  let platforms: TouchLayoutIR["platforms"];
  let unplacedChars: string[] = [];

  if (existingPhoneIdx >= 0) {
    // Augment the existing phone platform with deadkey sk[] entries.
    platforms = ir.touchLayout.platforms.map((p, i) => {
      if (i !== existingPhoneIdx) return p;
      return augmentExistingPhoneLayers(p, deadkeySuccessors, minter);
    });
  } else {
    // No phone platform in the existing layout — synthesize one and append.
    const built = buildCompactPhoneLayers(
      keyMap,
      deadkeySuccessors,
      minter,
    );
    unplacedChars = built.unplacedChars;
    platforms = [
      ...ir.touchLayout.platforms,
      {
        id: "phone" as const,
        layers: built.layers,
      },
    ];
  }

  return {
    layout: {
      platforms,
      // Preserve existing nodeId entries; new keys added during augmentation
      // carry fresh nodeIds but are not back-referenced here (they are
      // transient Phase E output, not committed to the IR).
      nodeIds: [...ir.touchLayout.nodeIds],
    },
    unplacedChars,
  };
}

/**
 * Derive a {@link TouchLayoutIR} for the phone platform from the keyboard IR.
 *
 * - If `ir.touchLayout` is absent, generates a compact phone platform using
 *   the three-layer QWERTY structure (default + shift + numeric, ≤10 keys/row),
 *   populated with characters from the desktop rules and augmented with sk[]
 *   from deadkey patterns.
 * - If `ir.touchLayout` is present, uses it as the base. The phone platform
 *   within it (or a new one if absent) is augmented with deadkey sk[] entries.
 *
 * The function is pure — it does not mutate `ir`.
 *
 * Thin wrapper over {@link scaffoldTouchLayoutWithDiagnostics} that drops the
 * `unplacedChars` diagnostic, kept so every existing caller of this exact
 * signature keeps compiling unchanged; callers that need the diagnostic
 * should call {@link scaffoldTouchLayoutWithDiagnostics} directly.
 *
 * @param ir  The keyboard IR (from parse or scaffoldIR).
 * @returns   A TouchLayoutIR with at least one platform with id `"phone"`.
 *
 * @see spec.md §8 Phase E (touch gallery)
 */
export function scaffoldTouchLayout(ir: KeyboardIR): TouchLayoutIR {
  return scaffoldTouchLayoutWithDiagnostics(ir).layout;
}
