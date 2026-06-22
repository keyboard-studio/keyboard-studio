/**
 * scaffoldTouchLayout — spec §8 Phase E: physical → touch layout derivation.
 *
 * Derives a TouchLayoutIR for the phone platform from the IR's desktop key rules
 * and (optionally) from an existing .keyman-touch-layout already in the IR.
 *
 * Mapping table (spec §8 physical→touch):
 *   - Base desktop keys (no SHIFT / RALT modifiers) → touch "default" layer
 *   - SHIFT-modified keys                           → touch "shift" layer
 *   - RALT-modified keys                            → touch "altgr" layer
 *   - Deadkey patterns (strategyId starts with "S-02") whose owning key
 *     also appears in the desktop layout → sk[] (longpress menu) on that key
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
import { NodeIdMinter } from "../codec/node-ids.js";
import { charToUnicodeKeyId } from "../codec/touch-ids.js";

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
 * Extract the first character output from a rule's output elements.
 * Returns null when the rule produces no simple character.
 */
function firstCharOutput(rule: IRRule): string | null {
  for (const el of rule.output) {
    if (el.kind === "char") return el.value;
  }
  return null;
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

      const char = firstCharOutput(rule);
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
 * Build a (vkey → successor-chars[]) map from recognized deadkey patterns
 * (strategyId starts with "S-02"). The successor characters are parsed from
 * the pattern's kmnFragment as a heuristic: we collect every quoted char
 * literal on the output side adjacent to a deadkey context.
 *
 * This is intentionally simple — the goal is to populate sk[] (longpress menu)
 * with representative characters, not reproduce the full deadkey tree.
 * A recognized pattern's ownedNodes links it to actual IR rules; we read
 * those directly when available, falling back to kmnFragment scanning.
 */
function buildDeadkeySuccessors(ir: KeyboardIR): DeadkeySuccessors {
  const result: DeadkeySuccessors = new Map();

  for (const pattern of ir.recognizedPatterns) {
    if (!pattern.strategyId?.startsWith("S-02")) continue;

    // Collect successor characters from owned IR rules (accurate path).
    if (pattern.ownedNodes && pattern.ownedNodes.length > 0) {
      const ownedIds = new Set(pattern.ownedNodes.map((n) => n.nodeId));
      for (const group of ir.groups) {
        for (const rule of group.rules) {
          if (!ownedIds.has(rule.nodeId)) continue;

          // The context should have a deadkey marker; output has the successor.
          const hasDeadkeyCtx = rule.context.some((el) => el.kind === "deadkey");
          if (!hasDeadkeyCtx) continue;

          const char = firstCharOutput(rule);
          if (!char) continue;

          // Determine the triggering vkey from the same rule's context.
          const vkey = extractVkey(rule);
          if (!vkey) continue;

          if (!result.has(vkey)) result.set(vkey, []);
          const list = result.get(vkey)!;
          if (!list.includes(char)) list.push(char);
        }
      }
    } else {
      // Fallback: scan the kmnFragment for quoted char literals after 'deadkey'.
      // Pattern: look for vkey references (via slotValues) and collect quoted chars.
      for (const q of pattern.questions) {
        const slotId = q.id;
        // If the slot is a key-name type, it identifies the triggering vkey.
        if (q.answerType !== "key-name") continue;

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
              const vkeyPlaceholder = `{{${slotId}}}`;
              if (!result.has(vkeyPlaceholder)) result.set(vkeyPlaceholder, []);
              const list = result.get(vkeyPlaceholder)!;
              if (!list.includes(ch)) list.push(ch);
            }
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
 *  2. US fallback keycap for the vkey (index 0 = default, index 1 = shift).
 *  3. Empty string (key exists in template but has no known mapping).
 */
function resolveKeyText(
  vkey: string,
  layerId: "default" | "shift" | "altgr",
  keyMap: KeyMap,
): string {
  const mapped = keyMap.get(vkey)?.get(layerId);
  if (mapped !== undefined) return mapped;

  const fallback = US_KEYCAPS[vkey];
  if (fallback !== undefined) {
    return layerId === "shift" ? fallback[1] : fallback[0];
  }

  return "";
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
      }));
    }
  }

  return key;
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
 *   Row 2  (9): [(pad:110) ( ) ] + - * /  K_BKSP(sp:1,w:100)
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

  // Row 2 (9 keys): [(pad:110) ( ) ] + - * /  K_BKSP(sp:1,w:100)
  // [ and ] keep K_LBRKT / K_RBRKT so they route through the keyboard rules
  // (they are punctuation keys, not fixed-value literals).
  // ( ) + - * / are literal characters → U_ ids.
  const numRow2Keys: TouchKeyIR[] = [
    { nodeId: minter.mint("touchKey"), id: "K_LBRKT",              text: "[",      pad: 110 },
    { nodeId: minter.mint("touchKey"), id: charToUnicodeKeyId("("), text: "(" },
    { nodeId: minter.mint("touchKey"), id: charToUnicodeKeyId(")"), text: ")" },
    { nodeId: minter.mint("touchKey"), id: "K_RBRKT",              text: "]" },
    { nodeId: minter.mint("touchKey"), id: charToUnicodeKeyId("+"), text: "+" },
    { nodeId: minter.mint("touchKey"), id: charToUnicodeKeyId("-"), text: "-" },
    { nodeId: minter.mint("touchKey"), id: charToUnicodeKeyId("*"), text: "*" },
    { nodeId: minter.mint("touchKey"), id: charToUnicodeKeyId("/"), text: "/" },
    { nodeId: minter.mint("touchKey"), id: "K_BKSP",               text: "*BkSp*", sp: 1, width: 100 },
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
 * Augment an existing phone platform's layers with sk[] from deadkey
 * successors, leaving all other key properties intact.
 */
function augmentExistingPhoneLayers(
  platform: TouchLayoutIR["platforms"][number],
  deadkeySuccessors: DeadkeySuccessors,
  minter: NodeIdMinter,
): TouchLayoutIR["platforms"][number] {
  if (deadkeySuccessors.size === 0) return platform;

  const augmentedLayers = platform.layers.map((layer) => {
    if (layer.id !== "default") return layer;

    const augmentedRows = layer.rows.map((row) => {
      const augmentedKeys = row.keys.map((key): TouchKeyIR => {
        const successors = deadkeySuccessors.get(key.id);
        if (!successors || successors.length === 0) return key;

        const existingSk = key.sk ?? [];
        const newSk: TouchKeyIR[] = successors
          .filter((ch) => !existingSk.some((s) => s.text === ch))
          .map((ch) => ({
            nodeId: minter.mint("touchKey"),
            // U_<UPPERHEX> id: Keyman outputs the codepoint from this id form — no
            // `output` field needed. `text` provides the on-key glyph display.
            id: charToUnicodeKeyId(ch),
            text: ch,
          }));

        if (newSk.length === 0) return key;

        const augmented: TouchKeyIR = {
          ...key,
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
 * @param ir  The keyboard IR (from parse or scaffoldIR).
 * @returns   A TouchLayoutIR with at least one platform with id `"phone"`.
 *
 * @see spec.md §8 Phase E (touch gallery)
 */
export function scaffoldTouchLayout(ir: KeyboardIR): TouchLayoutIR {
  const minter = new NodeIdMinter();
  const keyMap = buildKeyMap(ir);
  const deadkeySuccessors = buildDeadkeySuccessors(ir);

  // ------------------------------------------------------------------
  // Case A: no existing touch layout — generate from scratch using
  //         the compact 3-layer phone template.
  // ------------------------------------------------------------------
  if (ir.touchLayout === undefined) {
    const phoneLayers = buildCanonicalPhoneLayers(
      keyMap,
      deadkeySuccessors,
      minter,
    );

    return {
      platforms: [
        {
          id: "phone",
          layers: phoneLayers,
        },
      ],
      nodeIds: [],
    };
  }

  // ------------------------------------------------------------------
  // Case B: existing touch layout — use it as the base, augment phone.
  // ------------------------------------------------------------------
  const existingPhoneIdx = ir.touchLayout.platforms.findIndex(
    (p) => p.id === "phone",
  );

  let platforms: TouchLayoutIR["platforms"];

  if (existingPhoneIdx >= 0) {
    // Augment the existing phone platform with deadkey sk[] entries.
    platforms = ir.touchLayout.platforms.map((p, i) => {
      if (i !== existingPhoneIdx) return p;
      return augmentExistingPhoneLayers(p, deadkeySuccessors, minter);
    });
  } else {
    // No phone platform in the existing layout — synthesize one and append.
    const phoneLayers = buildCanonicalPhoneLayers(
      keyMap,
      deadkeySuccessors,
      minter,
    );
    platforms = [
      ...ir.touchLayout.platforms,
      {
        id: "phone" as const,
        layers: phoneLayers,
      },
    ];
  }

  return {
    platforms,
    // Preserve existing nodeId entries; new keys added during augmentation
    // carry fresh nodeIds but are not back-referenced here (they are
    // transient Phase E output, not committed to the IR).
    nodeIds: [...ir.touchLayout.nodeIds],
  };
}
