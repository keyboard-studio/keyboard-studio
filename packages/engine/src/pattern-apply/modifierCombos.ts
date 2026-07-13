/**
 * modifierCombos — shared vocabulary for arbitrary desktop modifier COMBOS
 * used by the generalized S-08 "modifier_as_layer_switch" mechanism.
 *
 * A combo is a set of up to four {@link ModifierToken}s, at most one drawn
 * from each of four mutually-exclusive families (see {@link MODIFIER_EXCLUSIONS}):
 *   - SHIFT (no exclusions besides itself)
 *   - the ctrl family:  CTRL, RCTRL
 *   - the alt family:   ALT, RALT, LALT
 *   - the caps family:  CAPS, NCAPS
 * LCTRL is intentionally excluded from {@link ModifierToken} by product
 * decision — chiral-left-ctrl combos are not offered in the mechanism
 * gallery even though the codec can parse `LCTRL` elsewhere.
 *
 * This module is the single place that:
 *   - validates/canonicalizes a combo (dedupe + stable order + exclusion
 *     check + two normalizing folds — see below),
 *   - converts a combo to/from the `.kmn` `[TOK1 TOK2 K_X]` bracket notation,
 *   - maps a combo to its `.keyman-touch-layout` layer id (or `null` — touch
 *     has no CapsLock state, so any combo containing CAPS is desktop-only
 *     and must never be silently folded into another layer),
 *   - maps a combo to its `.kvks` `shift="..."` token (or `null`, same CAPS
 *     restriction),
 *   - scans a {@link KeyboardIR} for the modifier tokens / combos already in
 *     use, generalizing scaffoldTouchLayout.ts's `classifyModifiers` (which
 *     stays untouched — it buckets into the fixed 3-layer touch template and
 *     has its own callers).
 *
 * `canonicalizeCombo` applies two normalizing steps AFTER the exclusion
 * check, so a combo that reaches either one is already guaranteed
 * exclusion-consistent (at most one token per family):
 *   - Chirality unification: a combo mixing a GENERIC ctrl-or-alt token
 *     (CTRL/ALT) with a CHIRAL ctrl-or-alt token (RCTRL/RALT/LALT, plus raw
 *     spellings LCTRL/LEFTCTRL/RIGHTCTRL/LEFTALT/RIGHTALT recognized before
 *     the `ModifierToken` narrowing filter) is kmcmplib-invalid
 *     (`KM_WARNING_KMCMP_4202659`: "contains Ctrl,Alt and
 *     LCtrl,LAlt,RCtrl,RAlt sets of modifiers. Use only one or the other set
 *     for web target") and can never be delivered by a physical keypress
 *     either (hardware/OS delivers either all-chiral bits or the all-generic
 *     K_CTRLFLAG/K_ALTFLAG pair, never a mix). On such a mix, every chiral
 *     ctrl/alt token is demoted to its generic form — see
 *     {@link unifyChiralityWords} — rather than picking one side, because the
 *     resulting all-generic combo (e.g. `[CTRL ALT]`) matches BOTH a genuine
 *     physical Ctrl+Alt press and a Windows AltGr ghost via Keyman core's
 *     `IsEquivalentShift`. A combo carrying ONLY chiral tokens (no generic
 *     CTRL/ALT present) — e.g. `[RALT]` alone or the valid all-chiral
 *     `[LCTRL RALT]` — is left untouched.
 *   - NCAPS collapse: NCAPS is not modeled as a first-class layer — a rule
 *     with no caps token already matches caps-off, so `[X]` and
 *     `[X NCAPS]` are functionally identical. A bare NCAPS token is
 *     stripped outright (`["RALT","NCAPS"]` -> `["RALT"]`,
 *     `["NCAPS"]` -> `[]`). CAPS (caps-lock-ON) is untouched — it is a
 *     genuine distinct layer. The caps-ON/caps-OFF case-pair *quad* this
 *     collapse is not about is built directly by `buildCasePairRuleLines`/
 *     `buildBaseRuleLines` (shiftRules.ts), not through this function.
 */

import type { KeyboardIR, IRRule, StoreItem } from "@keyboard-studio/contracts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ModifierToken =
  | "SHIFT"
  | "CAPS"
  | "NCAPS"
  | "ALT"
  | "RALT"
  | "LALT"
  | "CTRL"
  | "RCTRL";

/**
 * Canonical emission order (spec-confirmed, compiler-irrelevant but must be
 * stable): SHIFT, then the ctrl family, then the alt family, then the caps
 * family. Because each family contributes at most one token to a valid
 * combo (see {@link MODIFIER_EXCLUSIONS}), this also fully determines combo
 * ordering — no two tokens from the same family can coexist to fight over
 * intra-family order.
 */
const CANONICAL_ORDER: readonly ModifierToken[] = [
  "SHIFT",
  "CTRL",
  "RCTRL",
  "ALT",
  "RALT",
  "LALT",
  "CAPS",
  "NCAPS",
];

const MODIFIER_TOKEN_SET: ReadonlySet<string> = new Set(CANONICAL_ORDER);

function isModifierToken(value: string): value is ModifierToken {
  return MODIFIER_TOKEN_SET.has(value);
}

/**
 * Exclusion matrix (GATE-confirmed): choosing a token removes it (self) and
 * its family-mates from later dropdown slots. Symmetric and self-inclusive —
 * every token's own entry always includes itself.
 */
export const MODIFIER_EXCLUSIONS: Record<ModifierToken, readonly ModifierToken[]> = {
  SHIFT: ["SHIFT"],
  CAPS: ["CAPS", "NCAPS"],
  NCAPS: ["NCAPS", "CAPS"],
  ALT: ["ALT", "RALT", "LALT"],
  RALT: ["RALT", "LALT", "ALT"],
  LALT: ["LALT", "RALT", "ALT"],
  CTRL: ["CTRL", "RCTRL"],
  RCTRL: ["RCTRL", "CTRL"],
};

// ---------------------------------------------------------------------------
// Chirality unification — see module doc. A combo mixing a GENERIC ctrl/alt
// token with a CHIRAL one is kmcmplib-invalid and physically undeliverable;
// demote the chiral ctrl/alt tokens to generic so the combo becomes valid.
// ---------------------------------------------------------------------------

/** Generic ctrl/alt words — the family-neutral tokens a mix normalizes onto. */
const GENERIC_CTRL_ALT_WORDS: ReadonlySet<string> = new Set(["CTRL", "ALT"]);

/**
 * Chiral ctrl-family words — deliberately broader than {@link ModifierToken}
 * itself. LCTRL/LEFTCTRL/RIGHTCTRL are included even though only RCTRL is a
 * chooseable `ModifierToken` (see module doc): the codec can still parse a
 * hand-written `LCTRL` from `.kmn` text, and without recognizing it here a
 * raw `[LCTRL ALT K_X]` rule would have its LCTRL silently dropped by
 * `isModifierToken`/`normalizeModifierWord` BEFORE this normalization ever
 * saw it, misreading a mixed rule as bare generic ALT.
 */
const CHIRAL_CTRL_WORDS: ReadonlySet<string> = new Set([
  "LCTRL",
  "RCTRL",
  "LEFTCTRL",
  "RIGHTCTRL",
]);

/** Chiral alt-family words — RIGHTALT/LEFTALT are the long-form spellings. */
const CHIRAL_ALT_WORDS: ReadonlySet<string> = new Set(["LALT", "RALT", "LEFTALT", "RIGHTALT"]);

function demoteChiralCtrlAltWord(word: string): string {
  if (CHIRAL_CTRL_WORDS.has(word)) return "CTRL";
  if (CHIRAL_ALT_WORDS.has(word)) return "ALT";
  return word;
}

/**
 * Demote every chiral ctrl/alt word to its generic form IF the combo mixes a
 * generic ctrl/alt token (CTRL or ALT) with a chiral one — a no-op otherwise,
 * in particular for a combo carrying ONLY chiral tokens (no generic present),
 * which is left untouched (e.g. `[RALT]` alone, or the valid all-chiral
 * `[LCTRL RALT]`). Operates on raw strings so it can run both on `.kmn`/IR
 * text (before the `ModifierToken` narrowing filter drops an unrecognized
 * LCTRL) and, via {@link unifyChirality}, on already-typed combos (the
 * picker's path).
 */
function unifyChiralityWords(words: readonly string[]): string[] {
  const hasGeneric = words.some((w) => GENERIC_CTRL_ALT_WORDS.has(w));
  const hasChiral = words.some((w) => CHIRAL_CTRL_WORDS.has(w) || CHIRAL_ALT_WORDS.has(w));
  if (!hasGeneric || !hasChiral) return [...words];
  return words.map(demoteChiralCtrlAltWord);
}

/**
 * Typed wrapper around {@link unifyChiralityWords} for `canonicalizeCombo`'s
 * already-`ModifierToken[]` input. The cast is safe: the function only ever
 * maps input members to other `ModifierToken` values (CTRL/ALT) or leaves
 * them as-is.
 */
function unifyChirality(tokens: readonly ModifierToken[]): ModifierToken[] {
  return unifyChiralityWords(tokens) as ModifierToken[];
}

// ---------------------------------------------------------------------------
// Canonicalization
// ---------------------------------------------------------------------------

/**
 * Dedupe and order a modifier combo canonically (see {@link CANONICAL_ORDER}),
 * after applying chirality unification and the NCAPS collapse (see module
 * doc).
 *
 * @throws if two mutually-exclusive tokens (per {@link MODIFIER_EXCLUSIONS})
 *         are both present — this can only happen for a hand-built or
 *         corrupted combo; a combo produced by the mechanism gallery's own
 *         dropdown exclusion logic can never reach this state. Checked
 *         BEFORE the normalization below, so a combo that reaches it is
 *         already guaranteed to carry at most one token per family.
 */
export function canonicalizeCombo(tokens: readonly ModifierToken[]): ModifierToken[] {
  const unique = [...new Set(tokens)];
  for (const token of unique) {
    for (const excluded of MODIFIER_EXCLUSIONS[token]) {
      if (excluded === token) continue;
      if (unique.includes(excluded)) {
        throw new Error(
          `modifierCombos: "${token}" and "${excluded}" are mutually exclusive and cannot combine`,
        );
      }
    }
  }

  const unified = [...new Set(unifyChirality(unique))];
  const withoutNcaps = unified.filter((t) => t !== "NCAPS");

  return withoutNcaps.sort(
    (a, b) => CANONICAL_ORDER.indexOf(a) - CANONICAL_ORDER.indexOf(b),
  );
}

function comboJoinKey(tokens: readonly ModifierToken[]): string {
  return tokens.join("+");
}

// ---------------------------------------------------------------------------
// .kmn `[TOK1 TOK2 K_X]` bracket notation
// ---------------------------------------------------------------------------

/** Build a `.kmn` vkey-bracket spec, e.g. `comboToKeySpec(["SHIFT","RALT"], "K_X")` → `"[SHIFT RALT K_X]"`. */
export function comboToKeySpec(tokens: readonly ModifierToken[], vkey: string): string {
  const canon = canonicalizeCombo(tokens);
  return `[${[...canon, vkey].join(" ")}]`;
}

/**
 * Parse a `.kmn` vkey-bracket spec (e.g. `"[SHIFT RALT K_X]"`, or a bare
 * `"[K_X]"`) into its canonicalized token list and vkey name.
 *
 * Returns `null` when there is no bracket group or it contains no vkey.
 * Unrecognized modifier words (e.g. a stray `LCTRL`/`RSHIFT` the codec can
 * parse but this module's gallery doesn't offer) are silently dropped rather
 * than rejected, matching the pre-existing `parseLastTokenFromBracket`
 * tolerance in applyKeycapLabelsToVfs.ts.
 */
export function parseKeySpec(spec: string): { tokens: ModifierToken[]; vkey: string } | null {
  const bracketMatch = /\[([^\]]+)\]/.exec(spec);
  if (!bracketMatch) return null;

  const parts = (bracketMatch[1] ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return null;

  const vkey = parts[parts.length - 1] ?? "";
  if (!vkey) return null;

  // Unify a raw generic+chiral ctrl/alt mix (including a hand-written LCTRL —
  // see unifyChiralityWords) BEFORE the ModifierToken narrowing filter below,
  // which would otherwise silently drop an unrecognized LCTRL and misread
  // the rule as bare generic ALT (or, for a pure-chiral pairing with no
  // generic present, leave it alone — see module doc).
  const rawWords = unifyChiralityWords(parts.slice(0, -1));
  const rawTokens = rawWords.filter(isModifierToken);
  return { tokens: canonicalizeCombo(rawTokens), vkey };
}

// ---------------------------------------------------------------------------
// Touch layer id mapping
// ---------------------------------------------------------------------------

/** Per-token id fragment used to build a combo's touch layer id. */
const TOUCH_ID_FRAGMENT: Partial<Record<ModifierToken, string>> = {
  SHIFT: "shift",
  CTRL: "ctrl",
  RCTRL: "rightctrl",
  ALT: "alt",
  RALT: "rightalt",
  LALT: "alt",
};

/**
 * Precedence order for joining a combo's tokens into a `.keyman-touch-layout`
 * layer id — mirrors the LIVE embedded KeymanWeb engine's own navigable-
 * layer-id construction, `Layouts.getLayerId` (vendored at
 * simulator/vendor/keyman/engine/keyboard/keyboards/defaultLayouts.ts),
 * which checks bit flags in ascending value order: LCTRLFLAG, RCTRLFLAG,
 * LALTFLAG, RALTFLAG, K_SHIFTFLAG, K_CTRLFLAG, K_ALTFLAG. LCTRL is omitted
 * below — it is not an offered {@link ModifierToken} (see module doc) — so
 * the order here is RCTRL, LALT, RALT, SHIFT, CTRL, ALT.
 *
 * This is DELIBERATELY DIFFERENT from {@link CANONICAL_ORDER} (SHIFT, then
 * the ctrl family, then the alt family), which governs the `.kmn` bracket
 * notation and the `.kvks` shift token — both of those follow their own,
 * separately-verified corpus convention (see comboToKvksShiftToken's doc),
 * not the KMW runtime's bit order. The original bug was exactly this: the
 * touch-layer-id builder used to reuse CANONICAL_ORDER instead of this order.
 */
const TOUCH_LAYER_PRECEDENCE_ORDER: readonly ModifierToken[] = [
  "RCTRL",
  "LALT",
  "RALT",
  "SHIFT",
  "CTRL",
  "ALT",
];

/**
 * Map a combo to its `.keyman-touch-layout` layer id.
 *
 * Returns `null` for any combo containing CAPS — touch has no CapsLock
 * state, so a CAPS-bearing combo is desktop-only; callers MUST treat `null`
 * as "no touch surface for this combo", never silently merge it into
 * another layer (e.g. plain shift). NCAPS never reaches this check: it is
 * stripped by {@link canonicalizeCombo} before this function ever sees it —
 * a bare NCAPS combo collapses to the base/`"default"` layer, same as `[]`.
 *
 * Tokens are joined in {@link TOUCH_LAYER_PRECEDENCE_ORDER} order — every id
 * this produces has been verified to reproduce the full set of ids this
 * module used to hand-code as "attested corpus fact" (see
 * modifierCombos.test.ts), so that lookup table has been removed as
 * redundant; this is now the single source of truth for the id.
 */
export function comboToTouchLayerId(tokens: readonly ModifierToken[]): string | null {
  const canon = canonicalizeCombo(tokens);
  if (canon.includes("CAPS")) return null;
  if (canon.length === 0) return "default";

  const ordered = [...canon].sort(
    (a, b) => TOUCH_LAYER_PRECEDENCE_ORDER.indexOf(a) - TOUCH_LAYER_PRECEDENCE_ORDER.indexOf(b),
  );
  return ordered.map((t) => TOUCH_ID_FRAGMENT[t]).join("-");
}

// ---------------------------------------------------------------------------
// .kvks shift-token mapping
// ---------------------------------------------------------------------------

/** Per-token `.kvks` `shift="..."` fragment. */
const KVKS_FRAGMENT: Partial<Record<ModifierToken, string>> = {
  SHIFT: "S",
  CTRL: "C",
  RCTRL: "RC",
  ALT: "A",
  RALT: "RA",
  LALT: "LA",
};

/**
 * Map a combo to its `.kvks` `<layer shift="...">` token, e.g.
 * `["SHIFT","RALT"]` → `"SRA"` (matching the pre-existing hard-coded
 * RA/SRA convention exactly, since {@link CANONICAL_ORDER} sorts SHIFT
 * before the ctrl family before the alt family — independently confirmed
 * against shipped `.kvks` corpus data, e.g. `"SCA"`/`"SRCRA"`/`"SLA"`. Unlike
 * {@link comboToTouchLayerId}, this does NOT follow the live KMW engine's
 * bit-precedence order — the two surfaces use different conventions).
 *
 * Returns `null` for any combo containing CAPS — `.kvks` has no
 * caps-lock-state layer; a CAPS-including combo has no distinct desktop OSK
 * keycap of its own (mirrors `parseS01RuleLine`'s CAPS-line skip). NCAPS
 * never reaches this check: it is stripped by {@link canonicalizeCombo} first.
 */
export function comboToKvksShiftToken(tokens: readonly ModifierToken[]): string | null {
  const canon = canonicalizeCombo(tokens);
  if (canon.includes("CAPS")) return null;

  return canon.map((t) => KVKS_FRAGMENT[t]).join("");
}

// ---------------------------------------------------------------------------
// IR scanning — generalized from scaffoldTouchLayout.ts's classifyModifiers
// ---------------------------------------------------------------------------

/** `RIGHTALT` is a defensive alias scaffoldTouchLayout.ts also recognizes. */
function normalizeModifierWord(word: string): ModifierToken | undefined {
  if (word === "RIGHTALT") return "RALT";
  return isModifierToken(word) ? word : undefined;
}

/** Extract the raw (unordered, pre-exclusion-check) modifier set of a rule's vkey context element(s). */
function extractRuleModifiers(rule: IRRule): ModifierToken[] {
  const found = new Set<ModifierToken>();
  for (const el of rule.context) {
    if (el.kind !== "vkey") continue;
    // Unify a raw generic+chiral ctrl/alt mix before the normalizeModifierWord
    // narrowing below — same rationale as parseKeySpec: an existing
    // hand-written `[LCTRL ALT K_X]` rule must not be misread as bare
    // generic ALT once LCTRL is silently dropped.
    for (const mod of unifyChiralityWords(el.modifiers)) {
      const token = normalizeModifierWord(mod);
      if (token) found.add(token);
    }
  }
  return [...found];
}

function extractRuleVkey(rule: IRRule): string | undefined {
  for (const el of rule.context) {
    if (el.kind === "vkey") return el.name;
  }
  return undefined;
}

function firstRuleCharOutput(rule: IRRule): string | undefined {
  for (const el of rule.output) {
    if (el.kind === "char") return el.value;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// `any(store) > index(store, N)` store-indirection resolution — the shape
// the production S-08 pattern uses (content/patterns/desktop-input/
// modifier-as-layer-switch.yaml) instead of one `[MODS VKEY] > 'char'` rule
// per key. Mirrors collectCharContributors.ts's store/index resolution
// approach (walk `ir.stores` by name, pair positions), generalized here to
// also recover each entry's modifier combo.
// ---------------------------------------------------------------------------

/**
 * Resolve a single store item that names a key (with or without modifiers)
 * into its combo tokens + vkey, or `null` for an item that isn't a key-spec
 * entry (e.g. the bare `any` marker).
 *
 * A modifier-free bracket (`[K_E]`) parses to a typed `{kind:"vkey"}` store
 * item (parse.ts's parseStoreItems) — resolved here with an empty token list.
 * A modifier-bearing bracket (`[SHIFT RALT K_E]`) has no typed StoreItem
 * representation (the locked `StoreItem` union has no modifiers field), so
 * the codec preserves it verbatim as `{kind:"raw"}` — resolved here by
 * re-parsing that text through {@link parseKeySpec}.
 */
function resolveStoreKeyItem(item: StoreItem): { tokens: ModifierToken[]; vkey: string } | null {
  if (item.kind === "vkey") return { tokens: [], vkey: item.name };
  if (item.kind === "raw") return parseKeySpec(item.text);
  return null;
}

/** One resolved position of an `any(inputStore) > index(outputStore, N)` rule. */
interface AnyIndexEntry {
  tokens: ModifierToken[];
  vkey: string;
  /** `undefined` when the output store has no char at the matching position. */
  char: string | undefined;
}

/**
 * Resolve the `any(store) > index(store, N)` store-indirection form into
 * per-position combo/vkey/char entries, positionally pairing each entry in
 * the `any()` store with the same-position entry in the `index()` store
 * (KMN's `index(store, N)` here always refers back to the sole `any()`
 * context group, so position i of the input store maps to position i of the
 * output store). Returns `[]` for rules that aren't this shape — including
 * ordinary per-key `[MODS VKEY] > 'char'` rules, which extractRuleModifiers/
 * extractRuleVkey already handle directly.
 */
function resolveAnyIndexEntries(ir: KeyboardIR, rule: IRRule): AnyIndexEntry[] {
  const anyEl = rule.context.find(
    (el): el is Extract<IRRule["context"][number], { kind: "any" }> => el.kind === "any",
  );
  if (!anyEl) return [];

  const indexEl = rule.output.find(
    (el): el is Extract<IRRule["output"][number], { kind: "index" }> => el.kind === "index",
  );

  const inputStore = ir.stores.find((s) => s.name === anyEl.storeRef);
  if (!inputStore) return [];
  const outputStore = indexEl ? ir.stores.find((s) => s.name === indexEl.storeRef) : undefined;

  const entries: AnyIndexEntry[] = [];
  for (let i = 0; i < inputStore.items.length; i++) {
    const item = inputStore.items[i];
    if (!item) continue;

    const resolved = resolveStoreKeyItem(item);
    if (!resolved) continue;

    let tokens: ModifierToken[];
    try {
      tokens = canonicalizeCombo(resolved.tokens);
    } catch {
      continue;
    }

    const outItem = outputStore?.items[i];
    const char = outItem?.kind === "char" ? outItem.value : undefined;

    entries.push({ tokens, vkey: resolved.vkey, char });
  }
  return entries;
}

/**
 * Collect every distinct {@link ModifierToken} used anywhere in the IR's
 * (non-readonly) rule groups — both from direct `[MODS VKEY] > 'char'` rules
 * and from the `any(store) > index(store, N)` store-indirection form (see
 * {@link resolveAnyIndexEntries}).
 */
export function collectModifierTokensInUse(ir: KeyboardIR): Set<ModifierToken> {
  const result = new Set<ModifierToken>();
  for (const group of ir.groups) {
    if (group.readonly) continue;
    for (const rule of group.rules) {
      for (const token of extractRuleModifiers(rule)) result.add(token);
      for (const entry of resolveAnyIndexEntries(ir, rule)) {
        for (const token of entry.tokens) result.add(token);
      }
    }
  }
  return result;
}

/**
 * Collect every distinct modifier combo (canonicalized, deduplicated) used
 * anywhere in the IR's (non-readonly) rule groups — the desktop-side
 * "layers" a keyboard's rules already imply, generalized beyond
 * scaffoldTouchLayout's fixed default/shift/altgr buckets.
 *
 * Rules whose raw modifier set is internally exclusion-inconsistent (which
 * cannot come from a `.kmn` source kmcmplib would have accepted) are skipped
 * defensively rather than thrown on during this read-only scan. Also reports
 * combos that exist only inside `any(store) > index(store, N)` rules — the
 * store-indirection form the production S-08 pattern uses (see
 * {@link resolveAnyIndexEntries}) — not just direct per-key rules.
 */
export function collectLayerCombosInUse(ir: KeyboardIR): ModifierToken[][] {
  const seen = new Set<string>();
  const combos: ModifierToken[][] = [];

  const addCombo = (canon: ModifierToken[]): void => {
    const key = comboJoinKey(canon);
    if (seen.has(key)) return;
    seen.add(key);
    combos.push(canon);
  };

  for (const group of ir.groups) {
    if (group.readonly) continue;
    for (const rule of group.rules) {
      const raw = extractRuleModifiers(rule);
      if (raw.length > 0) {
        try {
          addCombo(canonicalizeCombo(raw));
        } catch {
          // Internally exclusion-inconsistent — skip defensively.
        }
      }

      for (const entry of resolveAnyIndexEntries(ir, rule)) {
        if (entry.tokens.length === 0) continue; // no-modifier entry is not a "layer" combo
        addCombo(entry.tokens);
      }
    }
  }

  return combos;
}

/**
 * Build a (vkey → output char) map for rules matching EXACTLY the given
 * combo — the per-combo generalization of scaffoldTouchLayout's `buildKeyMap`
 * (which buckets into "default"/"shift"/"altgr" instead of an arbitrary
 * combo). First-wins per vkey, same as `buildKeyMap`.
 *
 * Resolves both direct `+ [MODS VKEY] > 'char'` rules and the `any(store) >
 * index(store, N)` store-indirection form the production S-08 pattern uses
 * (see {@link resolveAnyIndexEntries}) — a single store can mix entries
 * across several combos (e.g. some RALT-only, some SHIFT+RALT), so each
 * entry's own combo is checked against `combo` individually.
 *
 * @param combo Canonicalized combo (as returned by {@link collectLayerCombosInUse}
 *              or {@link parseKeySpec}).
 */
export function buildComboKeyMap(
  ir: KeyboardIR,
  combo: readonly ModifierToken[],
): Map<string, string> {
  const targetKey = comboJoinKey(combo);
  const map = new Map<string, string>();

  for (const group of ir.groups) {
    if (group.readonly) continue;
    for (const rule of group.rules) {
      const vkey = extractRuleVkey(rule);
      if (vkey) {
        const raw = extractRuleModifiers(rule);
        let canon: ModifierToken[];
        try {
          canon = canonicalizeCombo(raw);
        } catch {
          continue;
        }
        if (comboJoinKey(canon) !== targetKey) continue;

        const char = firstRuleCharOutput(rule);
        if (!char) continue;

        if (!map.has(vkey)) map.set(vkey, char);
        continue;
      }

      // Store-indirection form: `+ any(store) > index(store, N)`.
      for (const entry of resolveAnyIndexEntries(ir, rule)) {
        if (comboJoinKey(entry.tokens) !== targetKey) continue;
        if (entry.char === undefined) continue;
        if (!map.has(entry.vkey)) map.set(entry.vkey, entry.char);
      }
    }
  }

  return map;
}
