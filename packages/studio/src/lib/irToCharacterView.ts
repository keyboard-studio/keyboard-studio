// irToCharacterView — #1399 character-first carve gallery (CarveGalleryV2).
//
// Flattens the RAIL projection (toRailNodes, irToCarveNodes.ts) into a flat,
// deduped list of "every character this keyboard can type" — the data shape
// CarveGalleryV2 renders. Deliberately reuses toRailNodes + collectCharContributors
// rather than re-deriving a second projection over the IR: this file adds only
// the flatten/classify/dedupe pass on top of what already exists.
//
// Kept pure (no store reads, no React) so the derivation is unit-testable in
// isolation from the component.

import type { KeyboardIR, RemovalCapability, StoreItem } from '@keyboard-studio/contracts';
import { buildProducedSet } from '@keyboard-studio/contracts';
import { collectCharContributors, isParallelIndexFanOut, isPlusSeparator } from '@keyboard-studio/engine';
import type { CharContributors } from '@keyboard-studio/engine';
import { toRailNodes, invisibleCharLabel, keySequenceLabel, vkeyLabel, isTouchOnlyVkeyName, displayChar, charProducers, isNotAForwardTypingPath } from './irToCarveNodes.ts';
import type { CharProducer } from './irToCarveNodes.ts';

// ---------------------------------------------------------------------------
// Category / source classification
// ---------------------------------------------------------------------------

/**
 * Category grouping shown in the right-hand grid (default grouping attribute).
 * Order here is also the default DISPLAY order (CATEGORY_ORDER below).
 */
export type CharacterCategory =
  | 'basic-letter'
  | 'special-letter'
  | 'accented-letter'
  | 'digit'
  | 'punctuation-symbol';

/** Secondary ("by source") grouping attribute. */
export type CharacterSource = 'direct-key' | 'deadkey-sequence' | 'store' | 'advanced-rule';

export const CATEGORY_ORDER: readonly CharacterCategory[] = [
  'basic-letter', 'special-letter', 'accented-letter', 'digit', 'punctuation-symbol',
];

/** Plural group-header labels (right-hand grid). */
export const CATEGORY_LABELS: Record<CharacterCategory, string> = {
  'basic-letter': 'Basic letters',
  'special-letter': 'Special letters',
  'accented-letter': 'Accented letters',
  digit: 'Digits & numerals',
  'punctuation-symbol': 'Punctuation & symbols',
};

export const SOURCE_ORDER: readonly CharacterSource[] = ['direct-key', 'deadkey-sequence', 'store', 'advanced-rule'];

/** Plural group-header labels for the (nice-to-have) "by source" grouping. */
export const SOURCE_LABELS: Record<CharacterSource, string> = {
  'direct-key': 'Direct keys',
  'deadkey-sequence': 'Deadkey sequences',
  store: 'From stores',
  'advanced-rule': 'From advanced rules',
};

/** Singular labels for the left "Character details" panel's "Comes from" row. */
export const SOURCE_DETAIL_LABEL: Record<CharacterSource, string> = {
  'direct-key': 'Direct key',
  'deadkey-sequence': 'Deadkey sequence',
  store: 'Store',
  'advanced-rule': 'Advanced rule',
};

const ASCII_LETTER_RE = /^[A-Za-z]$/;

/**
 * Classify a single (already-NFC, dotted-circle-stripped) character into a
 * display category.
 *
 * Heuristic, review-flagged (see CarveGalleryV2 report): there is no
 * per-script "is this letter plain vs special" table in the repo, so the
 * split leans on generic Unicode properties:
 *   - \p{N}            -> digit
 *   - \p{P} or \p{S}    -> punctuation-symbol
 *   - standalone \p{M}  -> accented-letter (a combining mark on its own)
 *   - \p{L} whose NFD form decomposes to >1 codepoint -> accented-letter
 *     (a precomposed base+mark letter, e.g. "e" + combining acute)
 *   - \p{L}, ASCII A-Z/a-z -> basic-letter
 *   - \p{L}, anything else -> special-letter (extra script letters, e.g. ŋ, ə)
 *   - anything else (control chars etc.) -> punctuation-symbol (safe fallback)
 */
export function classifyCharacterCategory(ch: string): CharacterCategory {
  if (/^\p{N}$/u.test(ch)) return 'digit';
  if (/^\p{P}$/u.test(ch) || /^\p{S}$/u.test(ch)) return 'punctuation-symbol';
  if (/^\p{M}$/u.test(ch)) return 'accented-letter';
  if (/^\p{L}/u.test(ch)) {
    if (ch.normalize('NFD').length > 1) return 'accented-letter';
    return ASCII_LETTER_RE.test(ch) ? 'basic-letter' : 'special-letter';
  }
  return 'punctuation-symbol';
}

/** Classify a glyph's `source` bucket from its RemovalCapability (store chips pass undefined and are classified 'store' by the caller). */
export function classifySourceFromCapability(capability: RemovalCapability | undefined): CharacterSource {
  return capability === 'removable:slot-fill' ? 'deadkey-sequence' : 'direct-key';
}

// ---------------------------------------------------------------------------
// CharacterCell — one row of the flattened character view
// ---------------------------------------------------------------------------

export interface CharacterCell {
  /** NFC-normalized, display-ready character (dotted-circle stripped — re-add via displayChar() for render). */
  ch: string;
  /**
   * "How it's typed" key sequence for the PRIMARY (first) way — e.g. ['K_A']
   * or ['‹dk›', 'K_QUOTE']. Empty for store-only characters (see report).
   * Kept for the grid-cell footer, which stays uncrowded by showing only one
   * sequence; the full producer list lives in `waysToType` (#1399). Sourced
   * from `waysToType[0]?.steps` when at least one producer resolves, so the
   * footer never disagrees with the details panel's first entry.
   */
  keys: string[];
  /**
   * Every faithful way to type this character (#1399) — one entry per
   * producing rule (or producing store slot, for a fan-out/sequence rule).
   * Empty when the character has no TYPED rule producer at all. TOTAL FLOOR
   * (#1399 follow-on): the two former placeholder phrases ("Not tied to a
   * single key" / "Not shown — context-dependent") have NO render path
   * anymore — the panel cascades per producer instead:
   *   1. `steps.length > 0`             — render the faithful key sequence.
   *   2. else `triggerFloor !== undefined` — render "Typed with <triggerFloor>"
   *      (a human-readable description of the rule's own trigger element,
   *      e.g. "Backspace" or "one of: b c d" for a store trigger).
   *   3. else                            — drop the entry; a character with
   *      zero renderable producers shows no "way" line at all.
   *   `source: 'advanced-rule'` keeps its own distinct, non-banned message
   *   ("Produced by an advanced rule — the keystroke can't be shown") since
   *   it has no typed-rule producer to enumerate at all — an honest
   *   codec-limit case, not a placeholder.
   */
  waysToType: CharProducer[];
  category: CharacterCategory;
  source: CharacterSource;
  /** True when `ch` (NFC) is in the author's confirmed Phase B inventory. */
  inAlpha: boolean;
  /** Strategy id (e.g. "S-02"), when the producing node is a recognized pattern. */
  strategy?: string | undefined;
  /** True when `ch` is in the current removal-recommendation set (recommendedRemovalChars). */
  reco: boolean;
  /** Contributor ids for removal — pass straight to cascadeDelete(contributors.ruleNodeIds, contributors.storeSlotIds) / cascadeRestore([...ruleNodeIds, ...storeSlotIds]). */
  contributors: CharContributors;
}

/** Every item-channel id (rule + store-slot) that toggling this cell affects. Empty when the character has no surgically-removable producer (always kept). */
export function characterCellIds(cell: CharacterCell): string[] {
  return [...cell.contributors.ruleNodeIds, ...cell.contributors.storeSlotIds];
}

/** True when the cell can be toggled at all (has at least one removable producer). */
export function characterCellIsToggleable(cell: CharacterCell): boolean {
  return characterCellIds(cell).length > 0;
}

// Non-literal placeholder markers outputToChar()/displayChar() can emit — never
// real characters (mirrors the same guard in irToCarveNodes.ts's producedCharsOf).
const PLACEHOLDER_CHARS = new Set(['…', '‹dk›', '🔔', '?']);

/**
 * Flatten a KeyboardIR into the deduped, flat character list CarveGalleryV2
 * renders. Built from toRailNodes()'s already-assembled glyphs/store chips,
 * plus a final supplemental pass (#1399) over `ir.raw`'s opaque fragments —
 * never a second IR walk of the typed pattern/group/store shapes themselves.
 *
 * Dedup rule: first-seen wins, and toRailNodes yields patterns, then groups,
 * then stores (see its source) — so a character produced by BOTH a glyph
 * (pattern/group; carries real key sequence) and a store chip (no keys) keeps
 * the glyph's richer entry. A character that lives ONLY in a store (e.g.
 * punctuation held in a store, never emitted through a plain rule) still
 * surfaces via the store branch — see the `source: 'store'` cells this
 * produces, keys deliberately [] (no single keystroke to name — see report).
 * A character producible ONLY through an opaque `RawKmnFragment` (never a
 * typed rule) surfaces via the LAST, `source: 'advanced-rule'` pass (#1399)
 * — same first-seen-wins protection, so a readable rule/store entry always
 * wins over the advanced-only fallback.
 *
 * @param confirmedInventory NFC-normalized set — session.confirmedInventory as a Set.
 * @param recommendedChars   NFC-normalized set of chars recommendedRemovalChars() flagged.
 */
export function irToCharacterView(
  ir: KeyboardIR,
  removalCapabilities: Map<string, RemovalCapability>,
  confirmedInventory: ReadonlySet<string>,
  recommendedChars: ReadonlySet<string>,
): CharacterCell[] {
  const nodes = toRailNodes(ir, removalCapabilities);
  const seen = new Map<string, CharacterCell>();

  const consider = (rawCh: string, keys: string[], source: CharacterSource, strategy: string | undefined) => {
    const stripped = rawCh.startsWith('◌') ? rawCh.slice(1) : rawCh;
    const ch = stripped.normalize('NFC');
    if (ch.length === 0 || PLACEHOLDER_CHARS.has(ch)) return;
    if (seen.has(ch)) return;

    const contributors = collectCharContributors(ir, ch);
    // Full producer enumeration (#1399) — every rule that produces `ch`, as a
    // faithful step sequence + plain-language condition. `keys` (the
    // grid-cell footer, kept uncrowded) is re-sourced from the PRIMARY
    // (first) producer so it never disagrees with the details panel's first
    // list entry; falls back to the caller-supplied `keys` when no producer
    // resolved at all (e.g. a store-only character with no rule producer).
    const waysToType = charProducers(ir, ch);
    const primarySteps = waysToType[0]?.steps;
    seen.set(ch, {
      ch,
      keys: primarySteps !== undefined && primarySteps.length > 0 ? primarySteps : keys,
      waysToType,
      category: classifyCharacterCategory(ch),
      source,
      inAlpha: confirmedInventory.has(ch),
      strategy,
      reco: recommendedChars.has(ch),
      contributors,
    });
  };

  // Pattern/group glyphs first (richest entries — faithful key STEPS, #1399:
  // CharacterCell.keys comes from the new g.keySteps, never the display-only
  // g.keys the old rule/node Rail view (CarveGallery.tsx) reads).
  for (const node of nodes) {
    if (node.kind !== 'pattern' && node.kind !== 'group') continue;
    for (const g of node.glyphs ?? []) {
      consider(g.ch, g.keySteps ?? [], classifySourceFromCapability(g.capability), node.kind === 'pattern' ? node.strategy : undefined);
    }
  }

  // Supplemental: S-03 "sequence" shape — see sequenceShapeCells doc. Runs
  // BEFORE store chips so a character this resolves also wins over the bare
  // (keys: []) store-chip entry for the same store's items.
  for (const cell of sequenceShapeCells(ir)) {
    consider(cell.ch, cell.keys, 'deadkey-sequence', undefined);
  }

  // Store chips (bare fallback — no single keystroke to name).
  for (const node of nodes) {
    if (node.kind !== 'store') continue;
    for (const c of node.storeChips ?? []) {
      consider(c.ch, [], 'store', undefined);
    }
  }

  // FINAL pass (#1399): characters producible ONLY through an opaque
  // RawKmnFragment block — never reachable via the typed pattern/group/store
  // passes above, so without this they were silently missing from the
  // gallery entirely. Runs LAST: consider() is first-seen-wins, so a
  // character already listed via a readable rule (or a store chip) keeps
  // its richer entry — this pass only fills the genuine gap.
  for (const ch of advancedRuleOnlyChars(ir)) {
    consider(ch, [], 'advanced-rule', undefined);
  }

  return [...seen.values()];
}

/**
 * Characters producible ONLY through one or more opaque RawKmnFragment
 * blocks' `producedOutput` sketch (#1399) — never reachable via any typed
 * rule the pattern/group/store passes above already walk.
 *
 * Computed as a set difference over `buildProducedSet` — the SAME canonical
 * produced-set walk the §8 inventory diff and keyboard-lint's §18.6 coverage
 * check already use (run-merge NFC, store resolution, exclusion rules all
 * apply identically) — rather than a second, divergent decoder:
 *   fullSet  = buildProducedSet(ir)               // typed rules + raw fragments
 *   rulesOnly = buildProducedSet({ ...ir, raw: [] }) // typed rules only
 *   onlyAdvanced = fullSet \ rulesOnly
 * Any character also reachable via a typed rule is in `rulesOnly` and so is
 * excluded here by construction — the caller's readable entry always wins.
 */
function advancedRuleOnlyChars(ir: KeyboardIR): Set<string> {
  const withRaw = buildProducedSet(ir);
  const rulesOnly = buildProducedSet({ ...ir, raw: [] });
  const onlyAdvanced = new Set<string>();
  for (const ch of withRaw) {
    if (!rulesOnly.has(ch)) onlyAdvanced.add(ch);
  }
  return onlyAdvanced;
}

// ---------------------------------------------------------------------------
// sequenceShapeCells — supplemental resolution for the "S-03 sequence" shape
// (#1399): a store-driven base character immediately followed by a FIXED
// literal trigger, whose output is index(store, offset) where `offset`
// addresses the base any()'s OWN 1-based position in the (raw '+'-filtered)
// context — not context.length, the terminal-any parallel-fan-out shape
// isParallelIndexFanOut / irToCarveNodes.ts's expandParallelStoreRule already
// cover. This shape's terminal context element is the literal TRIGGER, not
// the any(), so isParallelIndexFanOut (which requires a terminal any())
// never routes it to expandParallelStoreRule — the standard ruleToGlyphs
// path drops it as an unresolved '…' placeholder instead.
//
// Deliberately additive and LOCAL to this file: walks ir.groups directly
// rather than changing irToCarveNodes.ts's shared glyph-production path, so
// the rule/node Rail view (CarveGallery.tsx) is completely unaffected — this
// widens only the character-first view's coverage.
// ---------------------------------------------------------------------------

function sequenceShapeCells(ir: KeyboardIR): { ch: string; keys: string[] }[] {
  const cells: { ch: string; keys: string[] }[] = [];
  const storeMap = new Map(ir.stores.map((s) => [s.name, s]));

  const baseSlotLabel = (item: StoreItem | undefined): string | undefined => {
    if (item === undefined) return undefined;
    if (item.kind === 'char') return displayChar(item.value);
    // Touch-only vkey id (T_xxxx): no physical desktop key behind it — never
    // render it as a desktop step (#1399 follow-on; mirrors irToCarveNodes.ts's
    // desktopVkeyLabel, kept as a small local duplicate per this function's own
    // doc comment above).
    if (item.kind === 'vkey') return isTouchOnlyVkeyName(item.name) ? undefined : (vkeyLabel(item.name) ?? item.name);
    return undefined;
  };

  for (const group of ir.groups) {
    for (const rule of group.rules) {
      if (isParallelIndexFanOut(rule)) continue; // already covered by expandParallelStoreRule
      if (isNotAForwardTypingPath(rule)) continue; // editing (K_BKSP/K_DEL) trigger, not a way to type (#1399)
      if (rule.output.length !== 1) continue;
      const outEl = rule.output[0];
      if (outEl === undefined || outEl.kind !== 'index') continue;
      if (rule.context.findIndex(isPlusSeparator) === -1) continue; // needs a literal trailing trigger

      const effectiveCtx = rule.context.filter((el) => !isPlusSeparator(el));
      const baseEl = effectiveCtx[outEl.offset - 1];
      if (baseEl === undefined || baseEl.kind !== 'any') continue;

      const baseStore = storeMap.get(baseEl.storeRef);
      const outStore = storeMap.get(outEl.storeRef);
      if (baseStore === undefined || outStore === undefined) continue;

      const len = Math.min(baseStore.items.length, outStore.items.length);
      for (let i = 0; i < len; i++) {
        const outItem = outStore.items[i];
        if (outItem === undefined || outItem.kind !== 'char') continue;
        const label = baseSlotLabel(baseStore.items[i]);
        if (label === undefined) continue;
        const steps = keySequenceLabel(rule, ir, label);
        if (steps === undefined) continue;
        cells.push({ ch: displayChar(outItem.value), keys: steps });
      }
    }
  }
  return cells;
}

// ---------------------------------------------------------------------------
// Grouping — right-hand grid sections
// ---------------------------------------------------------------------------

export interface CharacterGroup {
  key: string;
  label: string;
  cells: CharacterCell[];
}

/** Group cells by category (default) or source (nice-to-have secondary grouping). Empty groups are omitted; non-empty groups keep the fixed display order above. */
export function groupCharacterCells(cells: readonly CharacterCell[], by: 'category' | 'source'): CharacterGroup[] {
  const order: readonly string[] = by === 'category' ? CATEGORY_ORDER : SOURCE_ORDER;
  const labels: Record<string, string> = by === 'category' ? CATEGORY_LABELS : SOURCE_LABELS;
  const buckets = new Map<string, CharacterCell[]>();
  for (const cell of cells) {
    const key = by === 'category' ? cell.category : cell.source;
    const arr = buckets.get(key);
    if (arr) arr.push(cell); else buckets.set(key, [cell]);
  }
  return order
    .filter((key) => buckets.has(key))
    .map((key) => ({ key, label: labels[key] ?? key, cells: buckets.get(key)! }));
}

// ---------------------------------------------------------------------------
// Best-effort display name (NOT a full Unicode name-database lookup — see report)
// ---------------------------------------------------------------------------

/**
 * Best-effort author-facing "name" for the left detail panel. This is
 * deliberately NOT a full Unicode UnicodeData.txt name lookup (e.g. "LATIN
 * SMALL LETTER E WITH ACUTE") — no such table is checked into the repo, and
 * adding one is out of scope for this first pass (flagged in the report for
 * review). Falls back to a generic "Character U+XXXX" label so the UI never
 * fabricates an incorrect name.
 */
export function characterDisplayName(ch: string): string {
  const invisible = invisibleCharLabel(ch);
  if (invisible !== null) return invisible;
  return `Character U+${ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}`;
}
