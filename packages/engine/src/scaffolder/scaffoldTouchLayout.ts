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
 * is generated from scratch using a QWERTY-shaped row structure derived from
 * the desktop key positions.
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

// ---------------------------------------------------------------------------
// QWERTY physical-keyboard row layout (phone platform seed)
// Standard US-QWERTY row ordering by physical position (top → bottom).
// Used only when no existing touch layout is present in the IR.
// ---------------------------------------------------------------------------

/**
 * Standard QWERTY virtual-key rows for the phone platform seed.
 * Row 0 is the number row, rows 1–3 are the letter rows.
 */
const QWERTY_ROWS: ReadonlyArray<ReadonlyArray<string>> = [
  // Row 0 — number / symbol row
  ["K_1", "K_2", "K_3", "K_4", "K_5", "K_6", "K_7", "K_8", "K_9", "K_0"],
  // Row 1 — QWERTY
  [
    "K_Q", "K_W", "K_E", "K_R", "K_T",
    "K_Y", "K_U", "K_I", "K_O", "K_P",
  ],
  // Row 2 — ASDF
  [
    "K_A", "K_S", "K_D", "K_F", "K_G",
    "K_H", "K_J", "K_K", "K_L", "K_QUOTE",
  ],
  // Row 3 — ZXCV
  [
    "K_Z", "K_X", "K_C", "K_V",
    "K_B", "K_N", "K_M",
  ],
];

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
// Helpers
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

/**
 * Build a single TouchKeyIR for a given vkey, using the keyMap for primary
 * output and the deadkey successors for sk[].
 */
function buildTouchKey(
  vkey: string,
  layer: LayerId,
  keyMap: KeyMap,
  deadkeySuccessors: DeadkeySuccessors,
  minter: NodeIdMinter,
): TouchKeyIR {
  const nodeId = minter.mint("touchKey");
  const layerMap = keyMap.get(vkey);
  const output = layerMap?.get(layer);

  const key: TouchKeyIR = {
    nodeId,
    id: vkey,
    ...(output !== undefined ? { text: output, output } : {}),
  };

  // Populate sk[] from deadkey successors if the vkey has any.
  const successors = deadkeySuccessors.get(vkey);
  if (successors && successors.length > 0) {
    const firstSuccessor = successors[0];
    if (firstSuccessor !== undefined) {
      key.hint = firstSuccessor; // corner hint signals a longpress menu exists
    }
    key.sk = successors.map((ch) => ({
      nodeId: minter.mint("touchKey"),
      id: `${vkey}_sk_${ch.codePointAt(0)?.toString(16) ?? "?"}`,
      text: ch,
      output: ch,
    }));
  }

  return key;
}

/**
 * Build one row of TouchKeyIR nodes for the given layer.
 */
function buildRow(
  vkeys: ReadonlyArray<string>,
  layer: LayerId,
  keyMap: KeyMap,
  deadkeySuccessors: DeadkeySuccessors,
  minter: NodeIdMinter,
): TouchKeyIR[] {
  return vkeys.map((vkey) =>
    buildTouchKey(vkey, layer, keyMap, deadkeySuccessors, minter),
  );
}

// ---------------------------------------------------------------------------
// Layer builders
// ---------------------------------------------------------------------------

/**
 * Build the three standard phone layers (default, shift, altgr) from the
 * key map, using the QWERTY row template as the key population.
 */
function buildPhoneLayersFromDesktop(
  keyMap: KeyMap,
  deadkeySuccessors: DeadkeySuccessors,
  minter: NodeIdMinter,
): TouchLayoutIR["platforms"][number]["layers"] {
  const layers: TouchLayoutIR["platforms"][number]["layers"] = [];

  const layersToEmit: LayerId[] = ["default", "shift"];

  // Only emit "altgr" when at least one key has an altgr mapping.
  const hasAltgr = [...keyMap.values()].some((m) => m.has("altgr"));
  if (hasAltgr) layersToEmit.push("altgr");

  for (const layerId of layersToEmit) {
    const rows = QWERTY_ROWS.map((rowVkeys) => ({
      keys: buildRow(rowVkeys, layerId, keyMap, deadkeySuccessors, minter),
    }));
    layers.push({ id: layerId, rows });
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
          .filter((ch) => !existingSk.some((s) => s.output === ch))
          .map((ch) => ({
            nodeId: minter.mint("touchKey"),
            id: `${key.id}_sk_${ch.codePointAt(0)?.toString(16) ?? "?"}`,
            text: ch,
            output: ch,
          }));

        if (newSk.length === 0) return key;

        const firstSuccessor = successors[0];
        const augmented: TouchKeyIR = {
          ...key,
          sk: [...existingSk, ...newSk],
        };
        if (augmented.hint === undefined && firstSuccessor !== undefined) {
          augmented.hint = firstSuccessor;
        }
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
 * Derive a {@link TouchLayoutIR} for the phone platform from the keyboard IR.
 *
 * - If `ir.touchLayout` is absent, generates a minimal phone platform seeded
 *   from the QWERTY row template, populated with characters from the desktop
 *   rules, and augmented with sk[] (longpress menu) from deadkey patterns.
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
  // Case A: no existing touch layout — generate from scratch.
  // ------------------------------------------------------------------
  if (ir.touchLayout === undefined) {
    const phoneLayers = buildPhoneLayersFromDesktop(
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
    const phoneLayers = buildPhoneLayersFromDesktop(
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
