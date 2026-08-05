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
 *   - RALT-modified keys                            → touch "rightalt" layer
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
import { decomposeGrapheme } from "../character-discovery/decompose.js";
import { isCombiningMarkChar } from "../character-discovery/characterMap.js";

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
// Overflow character classification (BUG 2 fix) — an unplaced character (no
// OVERFLOW_NEAREST_SLOT physical neighbor) is a combining mark, a
// punctuation/symbol character, or something else. Marks and punctuation/
// symbols get a smarter home than the space bar's "extras" grouping before
// falling back to it; "other" (e.g. a Latin letter with no compact-layout
// slot of its own) keeps the pre-existing extras behavior.
// ---------------------------------------------------------------------------

type OverflowCharKind = "diacritic-mark" | "numeric-or-symbol" | "other";

/**
 * Classify an overflow character via its Unicode General_Category: Nd (a
 * decimal digit, any script — not just ASCII 0-9), No (a digit-like but
 * non-decimal form, e.g. a vulgar fraction), P (punctuation), or S (symbol).
 *
 * BUG 3 fix: digits are classified into the same "numeric-or-symbol" bucket
 * as punctuation/symbols — both are routed to the numeric/symbol layer, never
 * a letter's sk[] (see {@link collectOverflowEntries}), matching
 * {@link isValidSuccessorChar}'s digit/No-category rejection for the
 * deadkey-successor path.
 */
function classifyOverflowChar(ch: string): OverflowCharKind {
  if (isCombiningMarkChar(ch)) return "diacritic-mark";
  if (/^[\p{Nd}\p{No}\p{P}\p{S}]$/u.test(ch)) return "numeric-or-symbol";
  return "other";
}

/**
 * Every character the numeric layer's hardcoded literal rows already render
 * (see the numeric-layer construction in buildCanonicalPhoneLayers). An
 * unplaced punctuation/symbol char that is already one of these needs no
 * further placement — it is already reachable on the phone layout.
 */
const NUMERIC_LAYER_LITERAL_CHARS: ReadonlySet<string> = new Set([
  "1", "2", "3", "4", "5", "6", "7", "8", "9", "0",
  "$", "@", "#", "%", "&", "_", "=", "|", "\\",
  "[", "(", ")", "]", "+", "-", "*", "/",
]);

/**
 * Nearest numeric-layer literal key (by its rendered char) for an unplaced
 * punctuation/symbol character NOT already in NUMERIC_LAYER_LITERAL_CHARS —
 * a small, best-effort table (same spirit as OVERFLOW_NEAREST_SLOT). A char
 * absent from this table falls through to the space bar's "extras" grouping,
 * same as any other genuinely unplaceable overflow character.
 */
const NUMERIC_NEAREST_SLOT: Readonly<Record<string, string>> = {
  // semicolon/colon sit on the same physical key as underscore's row on a
  // US layout (K_MINUS/underscore neighborhood) — nearest existing literal.
  ";": "_", ":": "_",
  // exclamation mark is the shifted form of "1" on a US layout.
  "!": "1",
  // question mark is the shifted form of "/" on a US layout.
  "?": "/",
};

/**
 * Small, best-effort "mark -> typical base letter's vkey" fallback, used
 * ONLY when the IR itself carries no character whose decomposition includes
 * the mark (see resolveDiacriticBaseVkey). Covers the combining marks the
 * Latin-script orthographies this scaffolder targets use most. A mark absent
 * from this table falls through to the space bar's extras grouping, tagged
 * distinctly as unresolvable (see buildCompactPhoneLayers).
 */
const MARK_FALLBACK_VKEY: Readonly<Record<string, string>> = {
  "́": "K_E", // combining acute accent
  "̀": "K_E", // combining grave accent
  "̂": "K_O", // combining circumflex accent
  "̃": "K_N", // combining tilde
  "̈": "K_U", // combining diaeresis
  "̧": "K_C", // combining cedilla
  "̨": "K_A", // combining ogonek
  "̄": "K_A", // combining macron
  "̆": "K_A", // combining breve
  "̌": "K_S", // combining caron
  "̇": "K_E", // combining dot above
};

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

/** Modifier buckets we track from the desktop rules. */
type LayerId = "default" | "shift" | "rightalt" | "rightalt-shift";

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
  // RALT alone → "rightalt"; SHIFT alone → "shift"; no mods → "default";
  // RALT+SHIFT → "rightalt-shift" (uppercase special letters, reachable via the
  // shift<->rightalt-shift and rightalt<->rightalt-shift toggle wiring).
  //
  // These three checks are exhaustive over (hasRalt, hasShift) ∈ {T,F}×{T,F}
  // minus the three cases already covered — the only combination left is
  // hasRalt && hasShift, so the final return is unconditional (no dead
  // `return null` needed after it).
  if (hasRalt && !hasShift) return "rightalt";
  if (hasShift && !hasRalt) return "shift";
  if (!hasRalt && !hasShift) return "default";
  return "rightalt-shift";
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
 * default > shift > rightalt > rightalt-shift — the base letter a deadkey decorates
 * is overwhelmingly the plain/default form of a key, so a default-layer
 * producer of a char wins over a shift/rightalt/rightalt-shift producer of the same
 * char. rightalt-shift is lowest priority so a char existing only on that layer
 * (e.g. an uppercase special letter) is still resolvable for deadkey base
 * lookups when nothing else produces it.
 */
function buildCharToVkeyMap(keyMap: KeyMap): Map<string, string> {
  const map = new Map<string, string>();
  const layerPriority: LayerId[] = ["default", "shift", "rightalt", "rightalt-shift"];

  for (const layer of layerPriority) {
    for (const [vkey, layerMap] of keyMap) {
      const ch = layerMap.get(layer);
      if (ch !== undefined && !map.has(ch)) map.set(ch, vkey);
    }
  }

  return map;
}

/**
 * Invert a (char → vkey) map into (vkey → base char) — the char that vkey's
 * OWN (default-priority) rule produces, used by {@link isValidSuccessorChar}
 * to check that a candidate deadkey successor is actually a diacritic
 * variant of that same letter. `charToVkey` is built in default > shift >
 * rightalt priority order (see {@link buildCharToVkeyMap}), so the first char
 * encountered for a given vkey here is its default-layer (plain) form.
 */
function buildVkeyToBaseCharMap(charToVkey: ReadonlyMap<string, string>): Map<string, string> {
  const map = new Map<string, string>();
  for (const [ch, vkey] of charToVkey) {
    if (!map.has(vkey)) map.set(vkey, ch);
  }
  return map;
}

/**
 * BUG 3 guard: reject a deadkey-successor candidate that is not actually
 * related to `vkey`'s own base letter — the fix for a garbled sk[] longpress
 * menu mixing the real accented forms with stray digits, fractions, and
 * punctuation picked up by an over-eager fallback scan.
 *
 * Unicode decimal digits (\p{Nd} — any script, not just ASCII 0-9), Unicode
 * No-category characters (vulgar fractions etc.), and ordinary punctuation/
 * symbols are rejected outright. When the vkey's own base char is known (via
 * {@link buildVkeyToBaseCharMap}), `ch` must either case-fold to it or
 * `decomposeGrapheme(ch)`'s base must match it case-insensitively — i.e.
 * `ch` must actually be a diacritic variant of the same letter. When the base
 * char is unknown (the vkey has no known default-layer producer), the
 * category checks above are the only guard.
 */
function isValidSuccessorChar(baseChar: string | undefined, ch: string): boolean {
  if (/^\p{Nd}$/u.test(ch)) return false;
  if (/^\p{No}$/u.test(ch)) return false;
  if (!isCombiningMarkChar(ch) && /^[\p{P}\p{S}]$/u.test(ch)) return false;

  if (baseChar === undefined) return true;
  if (ch.toLowerCase() === baseChar.toLowerCase()) return true;
  const decomposed = decomposeGrapheme(ch);
  return decomposed !== null && decomposed.base.toLowerCase() === baseChar.toLowerCase();
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
 *
 * A candidate {@link isValidSuccessorChar} rejects is internal hygiene, not
 * a data-loss signal by itself — the rejected character is very often
 * reachable elsewhere in the emitted layout (its own key, the rightalt layer,
 * the numeric layer), which is exactly what it means for a deadkey candidate
 * to be "unrelated to this vkey's base letter". Rejection is recorded in the
 * returned `rejected` list (raw char + the vkey it was rejected from) purely
 * so {@link scaffoldTouchLayoutWithDiagnostics} can feed it into the
 * desktop-produced-characters set for the TRUE reachability check — a
 * rejected candidate that turns out to be reachable nowhere else in the
 * final layout is still reported there, just never as a per-rejection event.
 */
function buildDeadkeySuccessors(
  ir: KeyboardIR,
  charToVkey: ReadonlyMap<string, string>,
): { successors: DeadkeySuccessors; rejected: Array<{ ch: string; vkey: string }> } {
  const result: DeadkeySuccessors = new Map();
  const rejected: Array<{ ch: string; vkey: string }> = [];
  const vkeyToBaseChar = buildVkeyToBaseCharMap(charToVkey);

  // BUG 3 fix: both call sites below (the accurate owned-rule path and the
  // kmnFragment-regex fallback) funnel through here, so a garbled candidate
  // (a digit/fraction/stray punctuation, or a char unrelated to the vkey's
  // own base letter) is rejected at the single choke point instead of only
  // one of the two paths.
  const addSuccessor = (vkey: string, ch: string): void => {
    if (!isValidSuccessorChar(vkeyToBaseChar.get(vkey), ch)) {
      if (!rejected.some((r) => r.ch === ch && r.vkey === vkey)) rejected.push({ ch, vkey });
      return;
    }
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
      //
      // BUG 3 fix: the `{{slotId}}` match must land on the CONTEXT side
      // (left of the first '>') — matching it anywhere in the line let a
      // DIFFERENT line's context (or a stray same-line coincidence further
      // right) contaminate this slot's collected successors with unrelated
      // quoted literals (digits, fractions, punctuation) from elsewhere in
      // the fragment.
      const fragLines = pattern.kmnFragment.split("\n");
      for (const line of fragLines) {
        const arrowIdx = line.indexOf(">");
        if (arrowIdx === -1) continue;
        const contextSide = line.slice(0, arrowIdx);
        if (!contextSide.includes(`{{${slotId}}}`)) continue;
        // Find quoted characters on the output side (after '>').
        const outputSide = line.slice(arrowIdx + 1);
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

  return { successors: result, rejected };
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
  layerId: "default" | "shift" | "rightalt" | "rightalt-shift",
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
 *   - `bySlot`   — a genuine LETTER (or a bare combining mark/other char that
 *                  reaches this path outside a deadkey pattern — see
 *                  {@link classifyOverflowChar}'s "other" bucket) on a vkey
 *                  with a known physical neighbor (OVERFLOW_NEAREST_SLOT) →
 *                  attached as sk[] longpress on that neighbor.
 *   - `unplaced` — everything classifyOverflowChar puts in a more specific
 *                  bucket than "other" (a digit/punctuation/symbol char, or a
 *                  diacritic mark), regardless of whether the vkey has a
 *                  known physical neighbor, PLUS any vkey with no known
 *                  neighbor at all. The caller ({@link buildCompactPhoneLayers})
 *                  routes a digit/symbol onto the numeric/symbol layer and a
 *                  mark onto the sk[] of the vkey producing the base letter
 *                  it decorates, falling back to a dedicated "extras"
 *                  grouping only when neither resolves (never dropped).
 *
 * BUG 3 fix: a number-row vkey (K_1..K_0 etc.) sits in OVERFLOW_NEAREST_SLOT
 * next to a top-row letter purely for PHYSICAL adjacency — that adjacency is
 * only a valid routing for a genuine letter/mark, never for the digits and
 * shift/RAlt symbol variants a number-row key actually produces (e.g. K_3's
 * "3" / "#" / "¾"). Those always go through `unplaced` so they land on the
 * numeric layer instead of contaminating a letter's longpress menu.
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
    for (const layer of ["default", "shift", "rightalt", "rightalt-shift"] as const) {
      const ch = layerMap.get(layer);
      if (ch !== undefined && !chars.includes(ch)) chars.push(ch);
    }
    if (chars.length === 0) continue;

    const slot = OVERFLOW_NEAREST_SLOT[vkey];

    for (const ch of chars) {
      // BUG 3 fix: only a genuine letter ("other") uses the physical-
      // adjacency slot; a digit/punctuation/symbol or a diacritic mark
      // always goes through `unplaced` so the caller's category-specific
      // routing (numeric layer / smart base-letter resolution) handles it,
      // even when `vkey` has a known letter neighbor.
      const kind = classifyOverflowChar(ch);
      if (slot === undefined || kind !== "other") {
        if (!unplaced.includes(ch)) unplaced.push(ch);
        continue;
      }

      const existing = bySlot.get(slot) ?? [];
      if (!existing.includes(ch)) existing.push(ch);
      bySlot.set(slot, existing);
    }
  }

  return { bySlot, unplaced };
}

/**
 * Attach `extras` (characters with no physical neighbor — see
 * {@link collectOverflowEntries}) as an sk[] longpress menu on the default
 * layer's space bar, so nothing produced by the desktop rules is ever
 * silently dropped even when it has no natural key of its own. No-op when
 * `extras` is empty or the default layer / space key aren't present.
 *
 * Searches every row of the default layer for the `K_SPACE` key rather than
 * assuming a fixed row index — the phone skeleton's functional row is always
 * `rows[3]`, but the tablet skeleton's (5 rows, digit row first) is `rows[4]`;
 * this scan finds either without needing to know which shape it was given.
 */
function attachOverflowExtras(
  layers: TouchLayoutIR["platforms"][number]["layers"],
  minter: NodeIdMinter,
  extras: string[],
): void {
  if (extras.length === 0) return;

  const defaultLayer = layers.find((l) => l.id === "default");
  if (defaultLayer === undefined) return;

  for (const row of defaultLayer.rows) {
    const spaceIdx = row.keys.findIndex((k) => k.id === "K_SPACE");
    if (spaceIdx === -1) continue;

    const space = row.keys[spaceIdx]!;
    row.keys[spaceIdx] = {
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
    return;
  }
}

/**
 * INVARIANT (graph-stranding fix): no key's nextlayer may point to a layer
 * that isn't emitted; every emitted layer must reach "default" in finite
 * hops; the secondary-layer ENTRY key (this *RAlt* toggle, on default/shift)
 * must be emitted whenever ANY secondary layer exists (rightalt OR rightalt-shift)
 * — the original design assumed a rightalt layer always exists when
 * rightalt-shift does, which is false (a keyboard can have RALT+SHIFT
 * characters with NO plain-RALT characters, e.g. uppercase-only special
 * letters).
 *
 * BUG 1 fix (extended for rightalt-shift): the *RAlt* toggle key present on
 * every generated layer. Without it, a generated rightalt (or rightalt-shift)
 * layer has no key anywhere with a `nextlayer` pointing to it — every
 * special letter placed there (ə, ŋ, ɔ, ɛ, ɗ, æ, etc.) is unreachable in the
 * compiled keyboard. Modeled on the K_SHIFT round-trip already used here.
 * `originLayer` is the layer this particular toggle key instance lives on;
 * `hasRightAlt` / `hasRightAltShift` (which of the two secondary layers will
 * actually be generated) together determine the default/shift toggle
 * targets, since those are the two in/out pairs whose target depends on
 * which secondary layer(s) exist:
 *   - default  → sp:1, nextlayer: hasRightAlt ? "rightalt" : "rightalt-shift" (the
 *     latter only reached when hasRightAlt is false but hasRightAltShift is true —
 *     otherwise this function is never called for "default" at all, see the
 *     call-site gate below).
 *   - shift    → sp:1, nextlayer: hasRightAltShift ? "rightalt-shift" : "rightalt".
 *   - rightalt    → sp:2, nextlayer:"default" (unchanged — the rightalt<->default
 *     in/out pair is never repurposed; rightalt reaches rightalt-shift via its own
 *     K_SHIFT key instead, not via this toggle).
 *   - rightalt-shift → sp:2, nextlayer:"shift" (releases RAlt, keeps Shift —
 *     "shift" is unconditionally emitted, so this is always safe).
 * Replaces the row-1 trailing spacer (T_ks_sp_<layer>) ONLY when the
 * corresponding layer will actually be generated, so every row still lands
 * at exactly 10 keys in the no-secondary-layer case.
 */
function buildRightAltToggleKey(
  minter: NodeIdMinter,
  originLayer: LayerId,
  hasRightAlt: boolean,
  hasRightAltShift: boolean,
): TouchKeyIR {
  let sp: number;
  let nextlayer: string;
  switch (originLayer) {
    case "default":
      sp = 1;
      nextlayer = hasRightAlt ? "rightalt" : "rightalt-shift";
      break;
    case "shift":
      sp = 1;
      nextlayer = hasRightAltShift ? "rightalt-shift" : "rightalt";
      break;
    case "rightalt":
      sp = 2;
      nextlayer = "default";
      break;
    case "rightalt-shift":
      sp = 2;
      nextlayer = "shift";
      break;
  }
  return {
    nodeId: minter.mint("touchKey"),
    id: "T_ks_rightalt_toggle",
    text: "*RAlt*",
    sp,
    nextlayer,
  };
}

/**
 * Build the compact QWERTY phone default + shift layers (and optionally
 * rightalt) from the compact row structure, populating key text from keyMap.
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
 *   Row 2 (10): spacer(sp:10,w:110) [ ( ) ] + - * /  K_BKSP(sp:1) — K_BKSP at keyIndex 9, no width, matching default/shift/rightalt
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

  // rightalt layer only emits when at least one key has a rightalt mapping (BUG 1
  // fix: computed BEFORE the default/shift layers are built below, since the
  // rightalt-reachability toggle key it drives replaces the row-1 trailing
  // spacer on those layers too — a generated rightalt layer with no key ever
  // reachable from it is otherwise dead weight in the compiled keyboard).
  const hasRightAlt = [...keyMap.values()].some((m) => m.has("rightalt"));
  // rightalt-shift layer (uppercase special letters from RALT+SHIFT) only emits
  // when at least one key has a rightalt-shift mapping — same reasoning and
  // same "computed before the default/shift toggle wiring" requirement as
  // hasRightAlt above, since the shift layer's toggle target depends on it.
  const hasRightAltShift = [...keyMap.values()].some((m) => m.has("rightalt-shift"));

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
      // trailing spacer — replaced by the rightalt toggle key (BUG 1 fix, graph-
      // stranding fix) when EITHER secondary layer (rightalt OR rightalt-shift)
      // will actually be generated, so the row still lands at exactly 10
      // keys either way. Gating on `hasRightAlt` alone stranded the
      // hasRightAlt=false / hasRightAltShift=true case (RALT+SHIFT chars with no
      // plain-RALT chars) with no entry toggle at all. Both layers' toggle
      // targets depend on hasRightAlt/hasRightAltShift together — see
      // buildRightAltToggleKey.
      (hasRightAlt || hasRightAltShift)
        ? buildRightAltToggleKey(minter, layerId, hasRightAlt, hasRightAltShift)
        : ({
            nodeId: minter.mint("touchKey"),
            id: `T_ks_sp_${layerId}`,
            text: "",
            sp: 10,
            width: 10,
          } satisfies TouchKeyIR),
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
  // K_BKSP lands at keyIndex 9 — identical to default/shift/rightalt layers.
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
    // index 9: K_BKSP — no width, matching default/shift/rightalt exactly
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

  // rightalt layer: only emit when at least one key has a rightalt mapping
  // (hasRightAlt computed above, before the default/shift layers). Uses same
  // row structure as default but with rightalt text values.
  if (hasRightAlt) {
    // Row 0: Q W E R T Y U I O P with rightalt text
    const altRow0Keys: TouchKeyIR[] = COMPACT_ROW1_VKEYS.map((vkey) => {
      const text = resolveKeyText(vkey, "rightalt", keyMap);
      return {
        nodeId: minter.mint("touchKey"),
        id: vkey,
        ...(text !== "" ? { text, output: text } : {}),
      };
    });

    // Row 1: A(pad:50) S D F G H J K L  spacer
    const altRow1Keys: TouchKeyIR[] = [
      (() => {
        const text = resolveKeyText("K_A", "rightalt", keyMap);
        return {
          nodeId: minter.mint("touchKey"),
          id: "K_A",
          ...(text !== "" ? { text, output: text } : {}),
          pad: 50,
        };
      })(),
      ...COMPACT_ROW2_VKEYS.slice(1).map((vkey) => {
        const text = resolveKeyText(vkey, "rightalt", keyMap);
        return {
          nodeId: minter.mint("touchKey"),
          id: vkey,
          ...(text !== "" ? { text, output: text } : {}),
        };
      }),
      // The row-1 trailing spacer is always the return-to-default toggle
      // here — this whole rightalt layer only exists because hasRightAlt is true.
      buildRightAltToggleKey(minter, "rightalt", hasRightAlt, hasRightAltShift),
    ];

    // Row 2: K_SHIFT  Z X C V B N M  K_PERIOD  K_BKSP
    // K_SHIFT routes to rightalt-shift (uppercase specials) when that layer
    // will be generated, keeping RAlt held down; falls back to the plain
    // "shift" layer (releasing RAlt) when there is no rightalt-shift layer.
    const altRow2Keys: TouchKeyIR[] = [
      {
        nodeId: minter.mint("touchKey"),
        id: "K_SHIFT",
        text: "*Shift*",
        sp: 1,
        nextlayer: hasRightAltShift ? "rightalt-shift" : "shift",
      },
      ...["K_Z", "K_X", "K_C", "K_V", "K_B", "K_N", "K_M"].map((vkey) => {
        const text = resolveKeyText(vkey, "rightalt", keyMap);
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
      id: "rightalt",
      rows: [
        { keys: altRow0Keys },
        { keys: altRow1Keys },
        { keys: altRow2Keys },
        { keys: altRow3Keys },
      ],
    });
  }

  // rightalt-shift layer: only emit when at least one key has an RALT+SHIFT
  // mapping (hasRightAltShift computed above, before the default/shift layers).
  // Structural clone of the rightalt layer above (same row skeleton), but reads
  // "rightalt-shift" text and reaches the rest of the graph via shift (its own
  // toggle) and — when a rightalt layer actually exists — rightalt (its own
  // K_SHIFT key), instead of default.
  //
  // Full navigable graph, both cases (see the buildRightAltToggleKey /
  // K_SHIFT-exit invariant: no nextlayer targets a non-emitted layer, and
  // every emitted layer reaches "default" in finite hops):
  //   - hasRightAlt=true, hasRightAltShift=true: default<->shift, default<->rightalt,
  //     shift->rightalt-shift, rightalt<->rightalt-shift, rightalt-shift->shift.
  //   - hasRightAlt=false, hasRightAltShift=true: default<->shift (K_SHIFT, always
  //     emitted), default->rightalt-shift (via *RAlt* toggle), shift->rightalt-shift
  //     (via *RAlt* toggle), rightalt-shift->default (via K_SHIFT, since there is
  //     no rightalt to hold), rightalt-shift->shift (via *RAlt* toggle). No key
  //     targets "rightalt" (not emitted).
  if (hasRightAltShift) {
    // Row 0: Q W E R T Y U I O P with rightalt-shift text
    const altShiftRow0Keys: TouchKeyIR[] = COMPACT_ROW1_VKEYS.map((vkey) => {
      const text = resolveKeyText(vkey, "rightalt-shift", keyMap);
      return {
        nodeId: minter.mint("touchKey"),
        id: vkey,
        ...(text !== "" ? { text, output: text } : {}),
      };
    });

    // Row 1: A(pad:50) S D F G H J K L  toggle (row-1 trailing key is always
    // the *RAlt* toggle here — this layer only exists because hasRightAltShift
    // is true).
    const altShiftRow1Keys: TouchKeyIR[] = [
      (() => {
        const text = resolveKeyText("K_A", "rightalt-shift", keyMap);
        return {
          nodeId: minter.mint("touchKey"),
          id: "K_A",
          ...(text !== "" ? { text, output: text } : {}),
          pad: 50,
        };
      })(),
      ...COMPACT_ROW2_VKEYS.slice(1).map((vkey) => {
        const text = resolveKeyText(vkey, "rightalt-shift", keyMap);
        return {
          nodeId: minter.mint("touchKey"),
          id: vkey,
          ...(text !== "" ? { text, output: text } : {}),
        };
      }),
      buildRightAltToggleKey(minter, "rightalt-shift", hasRightAlt, hasRightAltShift),
    ];

    // Row 2: K_SHIFT — returns to rightalt (keeping RAlt held) when a rightalt
    // layer exists; otherwise there IS no rightalt layer to hold RAlt on top
    // of (hasRightAlt=false, hasRightAltShift=true — RALT+SHIFT chars with no
    // plain-RALT chars), so it releases straight to default instead of
    // dangling on the non-emitted "rightalt" (graph-stranding fix).
    // Z X C V B N M  K_PERIOD  K_BKSP
    const altShiftRow2Keys: TouchKeyIR[] = [
      {
        nodeId: minter.mint("touchKey"),
        id: "K_SHIFT",
        text: "*Shift*",
        sp: 2,
        nextlayer: hasRightAlt ? "rightalt" : "default",
      },
      ...["K_Z", "K_X", "K_C", "K_V", "K_B", "K_N", "K_M"].map((vkey) => {
        const text = resolveKeyText(vkey, "rightalt-shift", keyMap);
        return {
          nodeId: minter.mint("touchKey"),
          id: vkey,
          ...(text !== "" ? { text, output: text } : {}),
        };
      }),
      { nodeId: minter.mint("touchKey"), id: "K_PERIOD", text: "." },
      { nodeId: minter.mint("touchKey"), id: "K_BKSP",   text: "*BkSp*", sp: 1 },
    ];

    // Row 3: same functional row as default/rightalt
    const altShiftRow3Keys: TouchKeyIR[] = [
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
      id: "rightalt-shift",
      rows: [
        { keys: altShiftRow0Keys },
        { keys: altShiftRow1Keys },
        { keys: altShiftRow2Keys },
        { keys: altShiftRow3Keys },
      ],
    });
  }

  return layers;
}

// ---------------------------------------------------------------------------
// Tablet layer builder — reseed-from-desktop tablet-style layout.
//
// Modeled on the STRUCTURE of a shipped tablet layout (see e.g.
// sil_cameroon_qwerty.keyman-touch-layout in keymanapp/keyboards): a number
// row, QWERTY/ASDF/ZXCM letter rows, and a functional row — but with digits
// where the reference puts diacritic marks, and diacritics carried instead as
// sk[] longpress under their base letters (same mechanism as the phone path).
// A single prominent "specials" key replaces the reference's per-key RAlt
// toggle-row-spacer approach for reaching the rightalt/rightalt-shift layers, and
// every letter key on those secondary layers auto-returns to "default" after
// a tap (the reference's own convention — see e.g. the "rightalt" layer's
// K_W/K_E/etc, which all carry "nextlayer": "default").
// ---------------------------------------------------------------------------

/** Every vkey a tablet rightalt/rightalt-shift layer letter row covers, in on-screen order. */
const TABLET_RIGHTALT_VKEYS = [
  ...COMPACT_ROW1_VKEYS,
  ...COMPACT_ROW2_VKEYS,
  "K_Z", "K_X", "K_C", "K_V", "K_B", "K_N", "K_M",
] as const;

/**
 * Build a tablet rightalt/rightalt-shift layer's letter key: same text resolution as
 * {@link buildLetterKey}, but always tagged `nextlayer:"default"` (spec item
 * 3 — a tap types the special char and auto-returns, so the user is never
 * stranded on the specials layer) and never carries sk[] (diacritics are a
 * default-layer-only concept, unchanged from the phone path).
 */
function buildTabletRightAltLetterKey(
  vkey: string,
  layerId: "rightalt" | "rightalt-shift",
  keyMap: KeyMap,
  minter: NodeIdMinter,
  pad?: number,
): TouchKeyIR {
  const text = resolveKeyText(vkey, layerId, keyMap);
  return {
    nodeId: minter.mint("touchKey"),
    id: vkey,
    ...(text !== "" ? { text, output: text } : {}),
    ...(pad !== undefined ? { pad } : {}),
    nextlayer: "default",
  };
}

/**
 * Compute the specials-access key's self-label: the first 2-3 non-empty
 * characters the target secondary layer actually produces, in on-screen
 * reading order (mirrors the reference's "əŋɔ" label on its own T_CAM key).
 * Falls back to a generic label on the (should-not-happen, since the caller
 * only builds this key when `hasRightAlt || hasRightAltShift`) case where the
 * target layer produces nothing at all.
 */
function computeSpecialsLabel(keyMap: KeyMap, targetLayer: "rightalt" | "rightalt-shift"): string {
  const chars: string[] = [];
  for (const vkey of TABLET_RIGHTALT_VKEYS) {
    if (chars.length >= 3) break;
    const text = resolveKeyText(vkey, targetLayer, keyMap);
    if (text !== "") chars.push(text);
  }
  return chars.length > 0 ? chars.join("") : "*Specials*";
}

/**
 * Build the tablet's specials-access key (spec item 3's "combo-key model"):
 * ONE prominent key at the end of row 3, self-labeled from the target
 * secondary layer's own produced characters, routing to whichever of
 * rightalt/rightalt-shift actually exists (rightalt preferred — mirrors
 * {@link buildRightAltToggleKey}'s "default" origin case exactly, since this key
 * plays the same graph role that origin's row-1 trailing toggle plays on the
 * phone skeleton, just presented as a single named key instead of a spacer
 * replacement).
 */
function buildTabletSpecialsKey(
  keyMap: KeyMap,
  minter: NodeIdMinter,
  hasRightAlt: boolean,
): TouchKeyIR {
  const targetLayer: "rightalt" | "rightalt-shift" = hasRightAlt ? "rightalt" : "rightalt-shift";
  return {
    nodeId: minter.mint("touchKey"),
    id: "T_ks_specials",
    text: computeSpecialsLabel(keyMap, targetLayer),
    width: 150,
    sp: 1,
    nextlayer: targetLayer,
  };
}

/** Shared functional row (K_LOPT / @ / space / . / K_ENTER) for the tablet's
 *  default/shift/rightalt/rightalt-shift layers — identical shape on every layer. */
function buildTabletFunctionalRow(minter: NodeIdMinter): TouchKeyIR[] {
  return [
    { nodeId: minter.mint("touchKey"), id: "K_LOPT", text: "*Menu*", width: 120, sp: 1 },
    { nodeId: minter.mint("touchKey"), id: charToUnicodeKeyId("@"), text: "@" },
    { nodeId: minter.mint("touchKey"), id: "K_SPACE", text: "", width: 610 },
    { nodeId: minter.mint("touchKey"), id: charToUnicodeKeyId("."), text: "." },
    { nodeId: minter.mint("touchKey"), id: "K_ENTER", text: "*Enter*", width: 150, sp: 1 },
  ];
}

/** The tablet number row's digits, 1-0 — the single source of the digit list
 *  reused by every tablet letter layer's row 0 (default/shift AND
 *  rightalt/rightalt-shift, via {@link buildTabletNumberRow}), so there is
 *  never a second, divergent digit list to keep in sync. */
const TABLET_NUMBER_ROW_DIGITS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"] as const;

/**
 * Digit row (1-0 + K_BKSP) — row 0 for every tablet letter layer
 * (default/shift AND rightalt/rightalt-shift). Column-identical across all
 * four: same digit keys, same trailing K_BKSP geometry.
 *
 * `nextlayer` is applied to every digit key (not K_BKSP) when supplied — used
 * by the rightalt/rightalt-shift layers, whose other keys already
 * auto-return to "default" after one tap (see
 * {@link buildTabletRightAltLetterKey}); tapping a digit on those layers
 * types it and returns the same way, so the whole layer behaves
 * consistently. The default/shift layers call this with no `nextlayer` —
 * they ARE "default"/"shift", so their own number row needs no return trip.
 */
function buildTabletNumberRow(minter: NodeIdMinter, nextlayer?: string): TouchKeyIR[] {
  return [
    ...TABLET_NUMBER_ROW_DIGITS.map((ch) => ({
      nodeId: minter.mint("touchKey"),
      id: charToUnicodeKeyId(ch),
      text: ch,
      ...(nextlayer !== undefined ? { nextlayer } : {}),
    })),
    { nodeId: minter.mint("touchKey"), id: "K_BKSP", text: "*BkSp*", width: 150, sp: 1 },
  ];
}

/**
 * Build the tablet rightalt layer: row 0 (the shared digit row — see
 * {@link buildTabletNumberRow} — column-identical to the default/shift
 * number row, with each digit key auto-returning to "default" after a tap),
 * row 1 (Q-P), row 2 (A-L, pad on A), row 3 (K_SHIFT toggle + Z-M +
 * K_BKSP), row 4 (functional) — five rows, matching the tablet default/shift
 * layers' ROW COUNT so RAlt no longer sits a row short (the letter rows
 * themselves stay narrower than default's, a pre-existing column
 * difference). Every letter key (and now every digit key) carries
 * `nextlayer:"default"` (auto-return); the K_SHIFT toggle keeps
 * {@link buildRightAltToggleKey}'s hasRightAlt/hasRightAltShift-driven target
 * logic so rightalt-shift stays reachable when both secondary layers exist.
 */
function buildTabletRightAltLayer(
  keyMap: KeyMap,
  minter: NodeIdMinter,
  hasRightAltShift: boolean,
): TouchLayoutIR["platforms"][number]["layers"][number] {
  const row0Keys: TouchKeyIR[] = buildTabletNumberRow(minter, "default");

  const row1Keys: TouchKeyIR[] = COMPACT_ROW1_VKEYS.map((vkey, i) =>
    buildTabletRightAltLetterKey(vkey, "rightalt", keyMap, minter, i === 0 ? 55 : undefined),
  );

  const row2Keys: TouchKeyIR[] = [
    buildTabletRightAltLetterKey("K_A", "rightalt", keyMap, minter, 50),
    ...COMPACT_ROW2_VKEYS.slice(1).map((vkey) =>
      buildTabletRightAltLetterKey(vkey, "rightalt", keyMap, minter),
    ),
  ];

  const row3Keys: TouchKeyIR[] = [
    {
      nodeId: minter.mint("touchKey"),
      id: "K_SHIFT",
      text: "*Shift*",
      sp: 1,
      nextlayer: hasRightAltShift ? "rightalt-shift" : "shift",
    },
    ...["K_Z", "K_X", "K_C", "K_V", "K_B", "K_N", "K_M"].map((vkey) =>
      buildTabletRightAltLetterKey(vkey, "rightalt", keyMap, minter),
    ),
    { nodeId: minter.mint("touchKey"), id: "K_BKSP", text: "*BkSp*", sp: 1 },
  ];

  return {
    id: "rightalt",
    rows: [
      { keys: row0Keys },
      { keys: row1Keys },
      { keys: row2Keys },
      { keys: row3Keys },
      { keys: buildTabletFunctionalRow(minter) },
    ],
  };
}

/**
 * Build the tablet rightalt-shift layer — structural mirror of
 * {@link buildTabletRightAltLayer} (including its shared digit top row —
 * see {@link buildTabletNumberRow}), reading "rightalt-shift" text.
 * Its K_SHIFT toggle returns to "rightalt" (keeping RAlt held, uppercase
 * specials done) when a rightalt layer exists, else releases straight to
 * "default" (no rightalt layer to hold) — same graph role as the phone
 * skeleton's rightalt-shift K_SHIFT key.
 */
function buildTabletRightAltShiftLayer(
  keyMap: KeyMap,
  minter: NodeIdMinter,
  hasRightAlt: boolean,
): TouchLayoutIR["platforms"][number]["layers"][number] {
  const row0Keys: TouchKeyIR[] = buildTabletNumberRow(minter, "default");

  const row1Keys: TouchKeyIR[] = COMPACT_ROW1_VKEYS.map((vkey, i) =>
    buildTabletRightAltLetterKey(vkey, "rightalt-shift", keyMap, minter, i === 0 ? 55 : undefined),
  );

  const row2Keys: TouchKeyIR[] = [
    buildTabletRightAltLetterKey("K_A", "rightalt-shift", keyMap, minter, 50),
    ...COMPACT_ROW2_VKEYS.slice(1).map((vkey) =>
      buildTabletRightAltLetterKey(vkey, "rightalt-shift", keyMap, minter),
    ),
  ];

  const row3Keys: TouchKeyIR[] = [
    {
      nodeId: minter.mint("touchKey"),
      id: "K_SHIFT",
      text: "*Shift*",
      sp: 2,
      nextlayer: hasRightAlt ? "rightalt" : "default",
    },
    ...["K_Z", "K_X", "K_C", "K_V", "K_B", "K_N", "K_M"].map((vkey) =>
      buildTabletRightAltLetterKey(vkey, "rightalt-shift", keyMap, minter),
    ),
    { nodeId: minter.mint("touchKey"), id: "K_BKSP", text: "*BkSp*", sp: 1 },
  ];

  return {
    id: "rightalt-shift",
    rows: [
      { keys: row0Keys },
      { keys: row1Keys },
      { keys: row2Keys },
      { keys: row3Keys },
      { keys: buildTabletFunctionalRow(minter) },
    ],
  };
}

/**
 * Build the tablet's numeric/symbol layer: the phone numeric layer's row 1
 * (currency/misc symbols) and row 2 (brackets/math) verbatim, MINUS its digit
 * row (item 5 — digits now live on the tablet default layer's row 1), plus
 * the same "*abc*" return-to-default functional row. Kept under the id
 * "numeric" for continuity with K_SYMBOLS' nextlayer target on the phone path.
 */
function buildTabletSymbolLayer(
  minter: NodeIdMinter,
): TouchLayoutIR["platforms"][number]["layers"][number] {
  const row1Symbols: Array<[string, number | undefined]> = [
    ["$", 50], ["@", undefined], ["#", undefined], ["%", undefined],
    ["&", undefined], ["_", undefined], ["=", undefined],
    ["|", undefined], ["\\", undefined],
  ];
  const row1Keys: TouchKeyIR[] = [
    ...row1Symbols.map(([ch, pad]) => ({
      nodeId: minter.mint("touchKey"),
      id: charToUnicodeKeyId(ch),
      text: ch,
      ...(pad !== undefined ? { pad } : {}),
    })),
    { nodeId: minter.mint("touchKey"), id: "K_BKSP", text: "*BkSp*", width: 150, sp: 1 },
  ];

  const row2Keys: TouchKeyIR[] = [
    { nodeId: minter.mint("touchKey"), id: "K_LBRKT", text: "[" },
    { nodeId: minter.mint("touchKey"), id: charToUnicodeKeyId("("), text: "(" },
    { nodeId: minter.mint("touchKey"), id: charToUnicodeKeyId(")"), text: ")" },
    { nodeId: minter.mint("touchKey"), id: "K_RBRKT", text: "]" },
    { nodeId: minter.mint("touchKey"), id: charToUnicodeKeyId("+"), text: "+" },
    { nodeId: minter.mint("touchKey"), id: charToUnicodeKeyId("-"), text: "-" },
    { nodeId: minter.mint("touchKey"), id: charToUnicodeKeyId("*"), text: "*" },
    { nodeId: minter.mint("touchKey"), id: charToUnicodeKeyId("/"), text: "/" },
  ];

  const row3Keys: TouchKeyIR[] = [
    {
      nodeId: minter.mint("touchKey"),
      id: "K_LOWER",
      text: "*abc*",
      sp: 1,
      width: 150,
      nextlayer: "default",
    },
    { nodeId: minter.mint("touchKey"), id: "K_LOPT", text: "*Menu*", sp: 1, width: 120 },
    { nodeId: minter.mint("touchKey"), id: "K_SPACE", text: "", width: 610 },
    { nodeId: minter.mint("touchKey"), id: "K_ENTER", text: "*Enter*", sp: 1, width: 150 },
  ];

  return {
    id: "numeric",
    rows: [{ keys: row1Keys }, { keys: row2Keys }, { keys: row3Keys }],
  };
}

/**
 * Build the tablet default + shift layers (and, when the desktop rules carry
 * RAlt mappings, the rightalt / rightalt-shift secondary layers), plus the tablet
 * numeric/symbol layer — sibling to {@link buildCanonicalPhoneLayers}, used
 * ONLY by the reseed-from-desktop tablet path (spec item 1's `platformStyle`
 * gate). Default layer rows top-to-bottom (spec item 2):
 *
 *   Row 1 (number row): 1 2 3 4 5 6 7 8 9 0 + K_BKSP.
 *   Row 2: Q-P (leading pad on Q) + trailing literal apostrophe.
 *   Row 3: K_SYMBOLS (nextlayer "numeric") + A-L + the specials-access key
 *          (only when the desktop rules carry any RAlt mapping at all).
 *   Row 4: K_SHIFT + Z-M + "." + "," + K_BKSP (widened to accommodate 11 keys).
 *   Row 5 (functional): K_LOPT + "@" + K_SPACE (wide) + "." + K_ENTER.
 *
 * The shift layer mirrors this with uppercase letters and the phone
 * skeleton's established "tap a shift-layer letter, auto-return to default"
 * convention (same `buildLetterKey` nextlayer wiring already used by
 * {@link buildCanonicalPhoneLayers}). Diacritics remain layer-agnostic sk[]
 * attached to the default layer's letter keys via `buildLetterKey` — reused
 * as-is, so {@link resolveDiacriticBaseVkey}/{@link buildDeadkeySuccessors}
 * need no changes for the tablet path (spec item 4).
 */
function buildTabletLayers(
  keyMap: KeyMap,
  deadkeySuccessors: DeadkeySuccessors,
  minter: NodeIdMinter,
): TouchLayoutIR["platforms"][number]["layers"] {
  const layers: TouchLayoutIR["platforms"][number]["layers"] = [];

  const hasRightAlt = [...keyMap.values()].some((m) => m.has("rightalt"));
  const hasRightAltShift = [...keyMap.values()].some((m) => m.has("rightalt-shift"));

  const letterLayers: Array<"default" | "shift"> = ["default", "shift"];
  for (const layerId of letterLayers) {
    const isDefault = layerId === "default";

    const row1Keys = buildTabletNumberRow(minter);

    const row2Keys: TouchKeyIR[] = [
      buildLetterKey("K_Q", layerId, keyMap, deadkeySuccessors, minter, 55,
        isDefault ? undefined : "default"),
      ...COMPACT_ROW1_VKEYS.slice(1).map((vkey) =>
        buildLetterKey(vkey, layerId, keyMap, deadkeySuccessors, minter, undefined,
          isDefault ? undefined : "default"),
      ),
      { nodeId: minter.mint("touchKey"), id: "U_0027", text: "'" },
    ];

    const row3Keys: TouchKeyIR[] = [
      {
        nodeId: minter.mint("touchKey"),
        id: "K_SYMBOLS",
        text: "*Symbol*",
        sp: 1,
        nextlayer: "numeric",
      },
      ...COMPACT_ROW2_VKEYS.map((vkey) =>
        buildLetterKey(vkey, layerId, keyMap, deadkeySuccessors, minter, undefined,
          isDefault ? undefined : "default"),
      ),
      ...(hasRightAlt || hasRightAltShift
        ? [buildTabletSpecialsKey(keyMap, minter, hasRightAlt)]
        : []),
    ];

    const shiftSp = isDefault ? 1 : 2;
    const shiftNextlayer = isDefault ? "shift" : "default";
    const row4Keys: TouchKeyIR[] = [
      {
        nodeId: minter.mint("touchKey"),
        id: "K_SHIFT",
        text: "*Shift*",
        width: 150,
        sp: shiftSp,
        nextlayer: shiftNextlayer,
      },
      ...["K_Z", "K_X", "K_C", "K_V", "K_B", "K_N", "K_M"].map((vkey) =>
        buildLetterKey(vkey, layerId, keyMap, deadkeySuccessors, minter, undefined,
          isDefault ? undefined : "default"),
      ),
      { nodeId: minter.mint("touchKey"), id: "K_PERIOD", text: "." },
      { nodeId: minter.mint("touchKey"), id: charToUnicodeKeyId(","), text: "," },
      { nodeId: minter.mint("touchKey"), id: "K_BKSP", text: "*BkSp*", width: 150, sp: 1 },
    ];

    layers.push({
      id: layerId,
      rows: [
        { keys: row1Keys },
        { keys: row2Keys },
        { keys: row3Keys },
        { keys: row4Keys },
        { keys: buildTabletFunctionalRow(minter) },
      ],
    });
  }

  layers.push(buildTabletSymbolLayer(minter));

  if (hasRightAlt) layers.push(buildTabletRightAltLayer(keyMap, minter, hasRightAltShift));
  if (hasRightAltShift) layers.push(buildTabletRightAltShiftLayer(keyMap, minter, hasRightAlt));

  return layers;
}

/**
 * Signature shared by the two compact layer-skeleton builders
 * ({@link buildCanonicalPhoneLayers}, {@link buildTabletLayers}) so
 * {@link buildCompactLayers} can be parametrized over either.
 */
type CompactLayerSkeletonBuilder = (
  keyMap: KeyMap,
  deadkeySuccessors: DeadkeySuccessors,
  minter: NodeIdMinter,
) => TouchLayoutIR["platforms"][number]["layers"];

/**
 * Shared overflow-routing pipeline for the compact phone/tablet builders
 * ({@link buildCompactPhoneLayers}, {@link buildCompactTabletLayers}): mark
 * placement onto a base letter's sk[], numeric-overflow attachment, space-bar
 * "extras" fallback — spec item 6. `buildLayers` supplies the layer skeleton
 * ({@link buildCanonicalPhoneLayers} or {@link buildTabletLayers}) the
 * overflow entries are then routed onto; the routing logic itself is
 * identical for both paths.
 *
 * BUG 2/3 fix: an overflow char (collectOverflowEntries' `unplaced` list —
 * now including every digit/punctuation/symbol char, per BUG 3, whether or
 * not its vkey has a physical letter neighbor) is no longer dumped straight
 * onto a letter's sk[] or the space bar's "extras" grouping — it is
 * classified first ({@link classifyOverflowChar}) and routed to a more
 * sensible home:
 *   - a diacritic mark   -> the sk[] of the vkey that produces the base
 *     letter it decorates ({@link resolveDiacriticBaseVkey}, falling back to
 *     {@link MARK_FALLBACK_VKEY});
 *   - a digit/punctuation/symbol char already rendered by the numeric
 *     layer's literal keys ({@link NUMERIC_LAYER_LITERAL_CHARS}) -> needs no
 *     further placement (e.g. a number-row key's plain digit is already on
 *     the numeric layer);
 *   - any other digit/punctuation/symbol char -> the numeric layer's nearest
 *     literal key ({@link NUMERIC_NEAREST_SLOT} / {@link attachNumericOverflowExtra});
 *   - anything else, or a mark/digit/punctuation/symbol char neither table
 *     above can resolve -> the space bar's "extras" grouping, same as before.
 *
 * Logs a console-only warning (no emoji, per convention) naming any character
 * that still landed in the extras grouping — an unresolved mark is tagged
 * distinctly (e.g. "<mark> (no resolvable base letter)") so the gap is
 * visible rather than only inferred from the layout. This is placement
 * bookkeeping, not the caller-facing data-loss diagnostic: everything routed
 * here DOES land somewhere in the emitted layout (the space bar's longpress),
 * so it is reachable and therefore not part of
 * {@link scaffoldTouchLayoutWithDiagnostics}'s `unplacedChars` (which is
 * computed separately from TRUE post-build reachability, not from this
 * function's placement bookkeeping).
 */
function buildCompactLayers(
  keyMap: KeyMap,
  deadkeySuccessors: DeadkeySuccessors,
  minter: NodeIdMinter,
  buildLayers: CompactLayerSkeletonBuilder,
): { layers: TouchLayoutIR["platforms"][number]["layers"] } {
  const { bySlot: overflowBySlot, unplaced } = collectOverflowEntries(keyMap, COVERED_VKEYS);
  const charToVkey = buildCharToVkeyMap(keyMap);

  const markSuccessors = new Map<string, string[]>();
  const numericAttachments: Array<{ ch: string; nearestChar: string }> = [];
  const stillUnplaced: string[] = [];
  const unresolvedMarks = new Set<string>();

  for (const ch of unplaced) {
    const kind = classifyOverflowChar(ch);

    if (kind === "diacritic-mark") {
      const vkey =
        resolveDiacriticBaseVkey(ch, keyMap, deadkeySuccessors, charToVkey) ??
        MARK_FALLBACK_VKEY[ch];
      if (vkey !== undefined) {
        const existing = markSuccessors.get(vkey) ?? [];
        if (!existing.includes(ch)) existing.push(ch);
        markSuccessors.set(vkey, existing);
        continue;
      }
      unresolvedMarks.add(ch);
      stillUnplaced.push(ch);
      continue;
    }

    if (kind === "numeric-or-symbol") {
      if (NUMERIC_LAYER_LITERAL_CHARS.has(ch)) continue; // already reachable
      const nearestChar = NUMERIC_NEAREST_SLOT[ch];
      if (nearestChar !== undefined) {
        numericAttachments.push({ ch, nearestChar });
        continue;
      }
      stillUnplaced.push(ch);
      continue;
    }

    stillUnplaced.push(ch);
  }

  const combinedSuccessors = mergeSuccessorMaps(
    mergeSuccessorMaps(deadkeySuccessors, overflowBySlot),
    markSuccessors,
  );

  const layers = buildLayers(keyMap, combinedSuccessors, minter);

  // [QC P2 fix] attachNumericOverflowExtra's boolean return is honored: when
  // it can't find the target numeric-layer key (no-op), the char falls back
  // to the space bar's extras grouping instead of being silently dropped.
  for (const { ch, nearestChar } of numericAttachments) {
    const attached = attachNumericOverflowExtra(layers, minter, ch, nearestChar);
    if (!attached) stillUnplaced.push(ch);
  }

  if (stillUnplaced.length > 0) {
    const tagged = stillUnplaced.map((ch) =>
      unresolvedMarks.has(ch) ? `${ch} (no resolvable base letter)` : ch,
    );
    attachOverflowExtras(layers, minter, stillUnplaced);
    console.warn(
      `[scaffoldTouchLayout] ${stillUnplaced.length} character(s) produced by the desktop rules ` +
        "have no compact-layout key and no known adjacent slot; placed on the space bar's " +
        `longpress ("extras") menu instead of being dropped: ${tagged.join(", ")}`,
    );
  }

  return { layers };
}

/**
 * Tablet counterpart to {@link buildCompactPhoneLayers}: thin wrapper over
 * the shared {@link buildCompactLayers} overflow-routing pipeline, building
 * the tablet layer skeleton ({@link buildTabletLayers}) instead of the phone
 * one.
 */
function buildCompactTabletLayers(
  keyMap: KeyMap,
  deadkeySuccessors: DeadkeySuccessors,
  minter: NodeIdMinter,
): { layers: TouchLayoutIR["platforms"][number]["layers"] } {
  return buildCompactLayers(keyMap, deadkeySuccessors, minter, buildTabletLayers);
}

/**
 * BUG 2 fix (marks): resolve the vkey that already produces the base letter
 * `mark` decorates, by scanning every char already known to the keyboard
 * (every keyMap-produced char, plus every already-collected deadkey
 * successor) for one whose `decomposeGrapheme()` includes `mark` among its
 * marks — then mapping THAT base letter to its physical key via
 * `charToVkey`. Returns undefined when no such char exists anywhere in the
 * IR; the caller then falls back to {@link MARK_FALLBACK_VKEY}.
 */
function resolveDiacriticBaseVkey(
  mark: string,
  keyMap: KeyMap,
  deadkeySuccessors: DeadkeySuccessors,
  charToVkey: ReadonlyMap<string, string>,
): string | undefined {
  const candidates: string[] = [];
  for (const layerMap of keyMap.values()) {
    for (const ch of layerMap.values()) candidates.push(ch);
  }
  for (const successors of deadkeySuccessors.values()) {
    for (const ch of successors) candidates.push(ch);
  }

  for (const ch of candidates) {
    const decomposed = decomposeGrapheme(ch);
    if (decomposed === null || !decomposed.marks.includes(mark)) continue;
    const vkey = charToVkey.get(decomposed.base);
    if (vkey !== undefined) return vkey;
  }
  return undefined;
}

/**
 * BUG 2 fix (punctuation/symbols): attach `ch` as an sk[] longpress entry on
 * the numeric layer's existing literal key for `nearestChar` (looked up by
 * the same U_<HEX> id {@link charToUnicodeKeyId} used to mint that key).
 * Returns false (no-op) when the numeric layer or the target key can't be
 * found, so the caller falls back to the space bar's extras grouping.
 */
function attachNumericOverflowExtra(
  layers: TouchLayoutIR["platforms"][number]["layers"],
  minter: NodeIdMinter,
  ch: string,
  nearestChar: string,
): boolean {
  const numericLayer = layers.find((l) => l.id === "numeric");
  if (numericLayer === undefined) return false;

  const targetId = charToUnicodeKeyId(nearestChar);
  for (const row of numericLayer.rows) {
    const idx = row.keys.findIndex((k) => k.id === targetId);
    if (idx === -1) continue;
    const key = row.keys[idx]!;
    row.keys[idx] = {
      ...key,
      sk: [
        ...(key.sk ?? []),
        {
          nodeId: minter.mint("touchKey"),
          id: charToUnicodeKeyId(ch),
          text: ch,
          provenance: "physical-suggested" as const,
        },
      ],
    };
    return true;
  }
  return false;
}

/**
 * Build the compact phone layers AND route every character the desktop
 * rules produce that falls outside the compact skeleton's slots (see
 * {@link collectOverflowEntries}) onto a real key's sk[] longpress menu.
 *
 * Thin wrapper over the shared {@link buildCompactLayers} overflow-routing
 * pipeline (see its doc comment for the full routing rules), building the
 * phone layer skeleton ({@link buildCanonicalPhoneLayers}).
 */
function buildCompactPhoneLayers(
  keyMap: KeyMap,
  deadkeySuccessors: DeadkeySuccessors,
  minter: NodeIdMinter,
): { layers: TouchLayoutIR["platforms"][number]["layers"] } {
  return buildCompactLayers(keyMap, deadkeySuccessors, minter, buildCanonicalPhoneLayers);
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

/**
 * Walk a touch key (and its sk[] longpress sub-keys, flick{} directional
 * sub-keys, and multitap[] sub-keys, recursively) collecting every non-empty
 * `text` / `output` value it carries. Used by {@link collectReachableChars}
 * to build the "reachable anywhere in the emitted layout" set a produced
 * character is checked against — the true data-loss test, replacing the old
 * rejection-event/overflow-spill bookkeeping (which over-reported: a
 * character reachable via the rightalt layer, the numeric layer, or its own key
 * is not lost just because it was also rejected from — or routed off of —
 * some OTHER key's longpress menu).
 */
function collectKeyText(key: TouchKeyIR, into: Set<string>): void {
  if (key.text) into.add(key.text);
  if (key.output) into.add(key.output);
  for (const sub of key.sk ?? []) collectKeyText(sub, into);
  for (const sub of Object.values(key.flick ?? {})) collectKeyText(sub, into);
  for (const sub of key.multitap ?? []) collectKeyText(sub, into);
}

/**
 * The set of every character (or multi-char literal, e.g. "FCFA") reachable
 * anywhere in the given platform layers — every key's text/output, plus
 * every sk[]/flick{}/multitap[] sub-key's text/output, across every layer
 * (default, shift, numeric, rightalt, and any other layer present). Computed
 * AFTER all placement (deadkey sk[] attachment, overflow routing, space-bar
 * extras spill) has already happened, so it reflects the layout the author
 * actually sees/gets, not the intermediate placement bookkeeping.
 */
function collectReachableChars(
  layers: TouchLayoutIR["platforms"][number]["layers"],
): Set<string> {
  const reachable = new Set<string>();
  for (const layer of layers) {
    for (const row of layer.rows) {
      for (const key of row.keys) collectKeyText(key, reachable);
    }
  }
  return reachable;
}

/**
 * The set of every character the desktop rules actually produce — the input
 * inventory the derivation is trying to place. Union of every keyMap value
 * (every vkey's default/shift/rightalt output, whatever the compact skeleton
 * does or doesn't have a slot for) and every deadkey-successor candidate
 * {@link buildDeadkeySuccessors} considered, whether it was accepted onto a
 * sk[] longpress menu or rejected as unrelated to its vkey's own base letter
 * — a rejected candidate is still something the desktop's rules produce; the
 * question this set exists to answer is only whether it ends up reachable
 * SOMEWHERE, not whether that one placement attempt succeeded.
 */
function collectDesktopProducedChars(
  keyMap: KeyMap,
  rejectedSuccessors: ReadonlyArray<{ ch: string; vkey: string }>,
): Set<string> {
  const produced = new Set<string>();
  for (const layerMap of keyMap.values()) {
    for (const ch of layerMap.values()) produced.add(ch);
  }
  for (const { ch } of rejectedSuccessors) produced.add(ch);
  return produced;
}

/**
 * The TRUE data-loss diagnostic (spec's "no silent drops" principle,
 * scoped correctly this time): every desktop-produced character that is NOT
 * reachable anywhere in the final phone-platform layers. A rejected deadkey
 * candidate or a spilled overflow character that landed on a DIFFERENT key
 * (the rightalt layer, the numeric layer, the space bar's extras, its own vkey)
 * is reachable and therefore not reported here — only a character that ends
 * up nowhere at all is. Order is the (deterministic) Set insertion order —
 * keyMap first, then rejected candidates — so results are stable across
 * calls for the same IR.
 */
function computeUnplacedChars(
  keyMap: KeyMap,
  rejectedSuccessors: ReadonlyArray<{ ch: string; vkey: string }>,
  phoneLayers: TouchLayoutIR["platforms"][number]["layers"],
): string[] {
  const produced = collectDesktopProducedChars(keyMap, rejectedSuccessors);
  const reachable = collectReachableChars(phoneLayers);
  const unplaced: string[] = [];
  for (const ch of produced) {
    if (!reachable.has(ch)) unplaced.push(ch);
  }
  return unplaced;
}

/** The result of {@link scaffoldTouchLayoutWithDiagnostics}. */
export interface ScaffoldTouchLayoutResult {
  /** The derived TouchLayoutIR — identical to {@link scaffoldTouchLayout}'s return. */
  layout: TouchLayoutIR;
  /**
   * Characters the desktop rules produce that are reachable NOWHERE in the
   * final phone-platform layout — not on their own key, not on the rightalt or
   * numeric layer, not on any key's sk[]/flick{}/multitap[] longpress menu
   * (see {@link computeUnplacedChars}). Empty when every desktop-produced
   * character is reachable somewhere. Advisory only — never gates anything;
   * a caller with a UI (e.g. the studio's live seed preview) can surface this
   * list to the author.
   *
   * This is a TRUE reachability check, not a log of internal placement
   * decisions — a deadkey-successor candidate rejected from one key's
   * longpress menu, or an overflow character routed off its "natural" key,
   * is NOT reported here as long as it is reachable somewhere else in the
   * layout (see {@link buildDeadkeySuccessors} / {@link collectOverflowEntries}
   * for those internal, non-user-facing decisions).
   */
  unplacedChars: string[];
}

/**
 * Derive a {@link TouchLayoutIR} for the phone (or, when requested, tablet)
 * platform from the keyboard IR, plus the structured diagnostics
 * {@link scaffoldTouchLayout} only logs to the console. See
 * {@link scaffoldTouchLayout} for the derivation itself — this is the same
 * logic, returning `unplacedChars` alongside the layout for callers that need
 * it (e.g. a UI preview) rather than re-deriving it.
 *
 * The function is pure — it does not mutate `ir`.
 *
 * @param platformStyle  Which Case-A ("no existing touch layout") skeleton to
 *   generate: `"phone"` (default, {@link buildCanonicalPhoneLayers}'s compact
 *   3-layer QWERTY) or `"tablet"` ({@link buildTabletLayers}'s richer
 *   tablet-style skeleton — spec's reseed-from-desktop tablet derivation).
 *   Has no effect on Case B (an existing `ir.touchLayout` is always
 *   preserved-and-augmented on its own phone platform, unchanged).
 * @see spec.md §8 Phase E (touch gallery)
 */
export function scaffoldTouchLayoutWithDiagnostics(
  ir: KeyboardIR,
  platformStyle: "phone" | "tablet" = "phone",
): ScaffoldTouchLayoutResult {
  const minter = new NodeIdMinter();
  const keyMap = buildKeyMap(ir);
  const charToVkey = buildCharToVkeyMap(keyMap);
  const { successors: deadkeySuccessors, rejected: rejectedSuccessors } = buildDeadkeySuccessors(
    ir,
    charToVkey,
  );

  // A rejected deadkey-successor candidate is internal hygiene bookkeeping,
  // not a user-facing signal by itself — most rejected candidates ARE
  // reachable elsewhere (their own key, the rightalt layer). A single aggregated
  // console.debug records that the filtering ran, without claiming any of
  // these characters are lost — the actual data-loss check is the
  // post-build reachability computation below (computeUnplacedChars).
  if (rejectedSuccessors.length > 0) {
    console.debug(
      `[scaffoldTouchLayout] ${rejectedSuccessors.length} deadkey-successor candidate(s) filtered ` +
        "as unrelated to their vkey's own base letter (internal hygiene; see unplacedChars for any " +
        "that turn out to be genuinely unreachable elsewhere in the layout)",
    );
  }

  // ------------------------------------------------------------------
  // Case A: no existing touch layout — generate from scratch using
  //         the compact 3-layer phone template, or (platformStyle:"tablet")
  //         the richer tablet template.
  // ------------------------------------------------------------------
  if (ir.touchLayout === undefined) {
    if (platformStyle === "tablet") {
      const { layers: tabletLayers } = buildCompactTabletLayers(
        keyMap,
        deadkeySuccessors,
        minter,
      );

      return {
        layout: {
          platforms: [
            {
              id: "tablet",
              layers: tabletLayers,
            },
          ],
          nodeIds: [],
        },
        unplacedChars: computeUnplacedChars(keyMap, rejectedSuccessors, tabletLayers),
      };
    }

    const { layers: phoneLayers } = buildCompactPhoneLayers(
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
      unplacedChars: computeUnplacedChars(keyMap, rejectedSuccessors, phoneLayers),
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
    const built = buildCompactPhoneLayers(
      keyMap,
      deadkeySuccessors,
      minter,
    );
    platforms = [
      ...ir.touchLayout.platforms,
      {
        id: "phone" as const,
        layers: built.layers,
      },
    ];
  }

  const phonePlatform = platforms.find((p) => p.id === "phone")!;

  return {
    layout: {
      platforms,
      // Preserve existing nodeId entries; new keys added during augmentation
      // carry fresh nodeIds but are not back-referenced here (they are
      // transient Phase E output, not committed to the IR).
      nodeIds: [...ir.touchLayout.nodeIds],
    },
    unplacedChars: computeUnplacedChars(keyMap, rejectedSuccessors, phonePlatform.layers),
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
