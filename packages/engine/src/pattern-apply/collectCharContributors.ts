/**
 * collectCharContributors — capability-agnostic contributor discovery for carve cascade-delete.
 *
 * Finds every place in the IR that contributes to producing a given target character:
 *   - ruleNodeIds:  whole-rule delete candidates (entire NFC output === targetChar)
 *   - storeSlotIds: output-store slot ids to remove ("<storeNodeId>#<i>")
 *   - locations:    human-readable origin labels for the confirmation dialog
 *   - blocked:      multi-char / opaque producers that cannot be surgically removed
 *   - descriptors:  structured, author-friendly view of the above (spec follow-up —
 *                   engine returns STRUCTURED fields, never a pre-rendered English
 *                   string or a raw internal identifier; the studio composes the
 *                   localized display label). See `ContributorDescriptor` below for
 *                   exactly what's cheaply derivable vs. left absent for a template
 *                   fallback.
 *
 * Design constraints (from km-strategy, treated as requirements):
 *   - CAPABILITY-AGNOSTIC: does not gate on RemovalCapability; a misclassified
 *     RAlt/S-08 duplicate must still be found.
 *   - S-02 TRIGGER RULE EXCLUSION: the `+ deadkeyKey > dk(X)` trigger rule must
 *     NEVER enter the contributor set; only the fan-out rule's single matching
 *     SLOT is a contributor. A trigger rule is detected as: output is exactly one
 *     `{kind:"deadkey"}` element.
 *   - OUTPUT + INPUT STORE SLOTS ("remove everywhere", #525 v2): every matching
 *     slot index in an output store (`index()`/`outs()`) AND every matching
 *     slot index in an `any()`-consumed INPUT store is added to `storeSlotIds`
 *     — a character removal must reach every store it appears in, not just the
 *     one it's emitted through. `notany()` stores are deliberately NOT scanned:
 *     dropping a char from a `notany()` store WIDENS what that rule matches,
 *     the opposite of removal. This function only ever names the DIRECTLY
 *     matching slot on each store; applyStoreSlotRemovals is still the one that
 *     resolves the pairing graph and coordinates the drop across any OTHER
 *     paired store at the same position, so the caller doesn't need to (and
 *     shouldn't) duplicate that resolution here.
 *   - SINGLE-CHAR WHOLE-DELETE: whole-rule-delete only when the rule's ENTIRE
 *     NFC output === targetChar (single-char producer). Multi-char producers go
 *     to `blocked`.
 *   - OPAQUE FRAGMENTS: RawKmnFragment producers can only be whole-fragment-
 *     deleted; listed in `blocked`.
 */

import type { ContextElement, IRRule, KeyboardIR, StoreItem } from "@keyboard-studio/contracts";
import { collectFromElements } from "@keyboard-studio/contracts";
import { isDeadkeyOnlyOutput, isPlusSeparator } from "../shared/rule-shape.js";
import { makeSlotId } from "./slotId.js";

// ---------------------------------------------------------------------------
// Public contract (shared with km-frontend — do not deviate)
// ---------------------------------------------------------------------------

export interface CharContributors {
  /** The target character that was queried. */
  targetChar: string;
  /** nodeIds of rules whose ENTIRE NFC output equals targetChar — whole-rule delete. */
  ruleNodeIds: string[];
  /** "<storeNodeId>#<index>" output-store slots to remove (one slot per matching position). */
  storeSlotIds: string[];
  /**
   * Parallel, role-tagged view of `storeSlotIds` (spec 051 T006).
   *
   * INVARIANT D1: `storeSlots.map(s => s.slotId)` equals `storeSlotIds`,
   * element-for-element. This is a projection, never a different set.
   *
   * `storeSlotIds` merges input and output slots by design (a removal must reach
   * every store a char appears in), which leaves callers unable to ask "is this
   * slot a PRODUCER?". The collateral guard needs exactly that. Additive rather
   * than a shape change to `storeSlotIds`, which is threaded positionally through
   * `cascadeDelete`, `coordinatedCollateralForSlots`, `buildPendingCascade`, and
   * the restore path.
   *
   * A slot reached by both roles (a store any()-consumed in one rule and an
   * index() target in another) is tagged "output" — the producing role dominates,
   * since that is what the guard asks about.
   */
  storeSlots: { slotId: string; role: 'input' | 'output' }[];
  /** Human-readable origin labels for the confirmation dialog. */
  locations: { kind: 'group' | 'pattern' | 'store'; label: string; nodeId: string }[];
  /** Opaque or multi-char producers that cannot be surgically removed. */
  blocked: { reason: string; label: string }[];
  /**
   * Structured, author-friendly view of every contributor — one entry per
   * `ruleNodeIds` element (`kind: "keystroke"`), one per `storeSlots` element
   * in the SAME order (`kind: "deadkey"` or `kind: "store-slot"`), and one per
   * `blocked` element in the same order (`kind: "blocked"`). Deliberately
   * INDEX-PARALLEL to those three arrays/views rather than a re-keyed map, so
   * a caller that already walks `ruleNodeIds`/`storeSlots`/`blocked` can zip
   * this array alongside without a lookup.
   *
   * Fields the studio can't derive cheaply (an unresolvable deadkey mark/base,
   * an un-humanizable store name) are left ABSENT rather than guessed — the
   * studio falls back to a generic template in that case (see field docs).
   */
  descriptors: ContributorDescriptor[];
}

/**
 * One structured, author-friendly description of a contributor to
 * `targetChar`. Never a pre-rendered English string (engine code must not
 * hardcode UI copy — the studio composes the localized label from these
 * fields next).
 */
export interface ContributorDescriptor {
  /**
   * `'composition'` and `'unattributed'` are never produced by
   * {@link collectCharContributors} itself (its job is cascade-DELETE
   * contributor discovery over the base IR) — they are synthesized by the
   * studio ("Existing methods" SHOW-ALL floor, spec follow-up) via the
   * engine's `collectCompositionMethod` (`'composition'`) or directly by the
   * gallery (`'unattributed'`), reusing this same shared descriptor/label
   * shape so the two galleries render every kind through one composer
   * (`composeContributorLabel`).
   */
  kind: 'keystroke' | 'deadkey' | 'store-slot' | 'blocked' | 'composition' | 'unattributed';
  /** The character this contributor produces (or, for `blocked`, that it can't cleanly remove). */
  producedChar: string;
  /**
   * `kind: "keystroke"` only — a "Shift+A"-style rendering of the rule's
   * triggering vkey + modifiers. Absent when the rule's context isn't a
   * single simple vkey match (an elaborate context isn't cheaply
   * summarizable as one keystroke) — the studio falls back to a generic
   * "Press a key" phrasing in that case.
   */
  keystrokeDisplay?: string;
  /**
   * `kind: "deadkey"` only — the keystroke that sets the deadkey (e.g.
   * "Semicolon"), when the triggering rule for this deadkey id is resolvable
   * and expressible as one keystroke. Absent when not cheaply derivable —
   * the studio falls back to "Part of a two-step combination".
   */
  mark?: string;
  /**
   * `kind: "deadkey"` only — the base character combined with `mark`,
   * resolved from the aligned `any()`-consumed store at the SAME slot
   * position as the matched output. Absent when not cheaply derivable.
   */
  base?: string;
  /**
   * `kind: "store-slot"` only — a human-readable rendering of the store's
   * own name (Keyman-y prefixes stripped, camelCase split into words),
   * never the raw variable name. Absent when nothing legible could be
   * derived — the studio falls back to "Also produces {char}".
   */
  storeDisplayName?: string;
  /**
   * `kind: "store-slot"` only — the literal char typed to reach this slot,
   * resolved from the SAME aligned `any()`-consumed store item `base` uses
   * for a `"deadkey"` descriptor (the item at the matched output's slot
   * index), when that item is itself a `{kind:"char"}` store item. Mutually
   * exclusive with `inputKeystroke` (a slot's aligned item is one StoreItem
   * kind, never both). Absent when there is no aligned item, or it isn't a
   * `char` — the studio falls back to `storeDisplayName`/generic phrasing.
   */
  inputChar?: string;
  /**
   * `kind: "store-slot"` only — a friendly keystroke rendering (via the same
   * `vkeyDisplayName` helper `keystrokeDisplay` uses) of the aligned item,
   * when that item is a `{kind:"vkey"}` store item instead of a `char`.
   * Mutually exclusive with `inputChar`. Absent when not applicable/cheaply
   * derivable.
   */
  inputKeystroke?: string;
  /** `kind: "blocked"` only — which of the two blocked shapes this is. */
  blockedReasonCode?: 'opaque-fragment' | 'multi-char-output';
  /**
   * `kind: "composition"` only — the NFD-decomposed components (in NFD
   * order) that, together, canonical-compose to `producedChar` — e.g. `["U",
   * "̂"]` for "Û". Synthesized by the studio's `collectCompositionMethod`
   * (spec follow-up: a green-badged composable char must still show >=1
   * "Existing methods" row) — never produced by `collectCharContributors`
   * itself.
   */
  components?: string[];
  /**
   * The FULL ordered, friendly input sequence for this contributor's rule —
   * one token per `rule.context` element, e.g. `["A", "Shift+B"]` or
   * `["´", "a"]` (deadkey mark then base). Present only when EVERY context
   * element rendered to a friendly token (see `buildContextInputSequence`);
   * absent — never fabricated — the moment one element can't be (e.g. a
   * `context(n)`/`notany()`/`baselayout`/`raw` element, or an `any()`/deadkey
   * element with nothing cheaply resolvable). The studio falls back to the
   * per-`kind` generic template in that case.
   */
  inputSequence?: string[];
  /**
   * The exact produced output string for this contributor, paired with
   * `inputSequence` (present iff `inputSequence` is). For a whole-rule
   * keystroke contributor this is the rule's full literal output (e.g.
   * `"GHG"`); for a store-slot/deadkey contributor it is `producedChar`.
   */
  output?: string;
}

// ---------------------------------------------------------------------------
// Internal helpers — friendly-name derivation
// ---------------------------------------------------------------------------

/**
 * True when a rule is an S-02 trigger rule: output is exactly one `{kind:"deadkey"}` element.
 * Such rules must NEVER be added to the contributor set — removing them destroys the
 * whole deadkey family.
 */
const isTriggerRule = isDeadkeyOnlyOutput;

/** Friendly names for the handful of non-letter vkeys likely to trigger a deadkey/keystroke. */
const VKEY_DISPLAY_NAMES: Record<string, string> = {
  K_BKSP: 'Backspace',
  K_ENTER: 'Enter',
  K_TAB: 'Tab',
  K_ESC: 'Escape',
  K_SPACE: 'Space',
  K_DEL: 'Delete',
  K_LEFT: 'Left',
  K_RIGHT: 'Right',
  K_UP: 'Up',
  K_DOWN: 'Down',
  K_LBRKT: '[',
  K_RBRKT: ']',
  K_BKQUOTE: '`',
  K_COLON: ';',
  K_QUOTE: "'",
  K_SLASH: '/',
  K_BKSLASH: '\\',
  K_COMMA: ',',
  K_PERIOD: '.',
  K_HYPHEN: '-',
  K_EQUAL: '=',
};

/**
 * "K_A" -> "A", "K_BKSP" -> "Backspace", "K_SEMICOLON" -> "SEMICOLON"
 * (unrecognized name, stripped-prefix fallback). Returns undefined only for
 * a blank name.
 */
function vkeyDisplayName(name: string): string | undefined {
  if (!name) return undefined;
  const upper = name.toUpperCase();
  const named = VKEY_DISPLAY_NAMES[upper];
  if (named !== undefined) return named;
  const simple = /^K_([A-Z0-9])$/.exec(upper);
  if (simple?.[1] !== undefined) return simple[1];
  const stripped = upper.startsWith('K_') ? upper.slice(2) : upper;
  return stripped || undefined;
}

const MODIFIER_DISPLAY_NAMES: Record<string, string> = {
  SHIFT: 'Shift',
  RSHIFT: 'Shift',
  RALT: 'AltGr',
  RIGHTALT: 'AltGr',
  CTRL: 'Ctrl',
  LCTRL: 'Ctrl',
  RCTRL: 'Ctrl',
  ALT: 'Alt',
  LALT: 'Alt',
  CAPS: 'Caps',
  NCAPS: 'NCaps',
};

/** "Shift+Ctrl"-style modifier prefix, deduplicated, in token order. Empty string for none. */
function modifierDisplayPrefix(modifiers: readonly string[]): string {
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const tok of modifiers) {
    const pretty = MODIFIER_DISPLAY_NAMES[tok.toUpperCase()] ?? tok;
    if (!seen.has(pretty)) {
      seen.add(pretty);
      parts.push(pretty);
    }
  }
  return parts.join('+');
}

/**
 * Build a "Shift+A"-style keystroke display from a rule's context — only
 * when the context carries EXACTLY ONE `vkey` element (the common single-key
 * case this feature targets). Returns undefined for anything more elaborate
 * rather than fabricating a summary — the studio falls back to a generic
 * phrasing in that case.
 */
function keystrokeDisplayForContext(context: IRRule['context']): string | undefined {
  const vkeyEls = context.filter(
    (el): el is { kind: 'vkey'; name: string; modifiers: string[] } => el.kind === 'vkey',
  );
  if (vkeyEls.length !== 1) return undefined;
  const vkeyEl = vkeyEls[0]!;
  const keyName = vkeyDisplayName(vkeyEl.name);
  if (keyName === undefined) return undefined;
  const prefix = modifierDisplayPrefix(vkeyEl.modifiers);
  return prefix ? `${prefix}+${keyName}` : keyName;
}

/**
 * Render ONE `rule.context` element to a friendly input-sequence token, or
 * `undefined` when it isn't cheaply resolvable (the caller then aborts the
 * WHOLE sequence rather than fabricate a placeholder):
 *   - `char`    — the literal character itself.
 *   - `vkey`    — modifier-prefixed friendly key label (`vkeyDisplayName` +
 *                 `modifierDisplayPrefix`, same helpers as the single-vkey
 *                 `keystrokeDisplay` above, extended to a MULTI-element
 *                 context here).
 *   - `deadkey` — the triggering rule's keystroke display, from the same
 *                 `triggerKeystrokeByDeadkeyId` pre-pass that fills the
 *                 `mark` field; undefined (abort) when that trigger rule
 *                 isn't cheaply resolvable.
 *   - `any`     — the aligned store item at `slotIndex`, but ONLY for the
 *                 element identified as `alignedAnyElement` (resolved by
 *                 {@link resolveAlignedAnyElement} from the matched output's
 *                 `index()` offset — the fan-out mechanism's own
 *                 position-pairing invariant, same alignment `base` uses
 *                 below). A rule can carry more than one `any()` context
 *                 element; only the one the output actually pairs with has a
 *                 known slot position, so every OTHER `any()` element always
 *                 returns undefined (abort) rather than guess. Also
 *                 undefined when `slotIndex` is absent (no known aligned
 *                 position, e.g. a plain literal rule with no store
 *                 production) or the aligned item isn't a `char`.
 *   - `notany`, `context`, `index` (in context position), `baselayout`,
 *     `raw` — none cheaply resolvable to a single friendly token without
 *     simulating the input buffer, walking a large excluded set, or
 *     re-deriving an opaque construct — always undefined (abort).
 */
function contextElementTokenDisplay(
  el: ContextElement,
  storeMap: ReadonlyMap<string, KeyboardIR['stores'][number]>,
  triggerKeystrokeByDeadkeyId: ReadonlyMap<number, string>,
  slotIndex: number | undefined,
  alignedAnyElement: ContextElement | undefined,
): string | undefined {
  switch (el.kind) {
    case 'char':
      return el.value;
    case 'vkey': {
      const keyName = vkeyDisplayName(el.name);
      if (keyName === undefined) return undefined;
      const prefix = modifierDisplayPrefix(el.modifiers);
      return prefix ? `${prefix}+${keyName}` : keyName;
    }
    case 'deadkey':
      return triggerKeystrokeByDeadkeyId.get(el.id);
    case 'any': {
      if (slotIndex === undefined || el !== alignedAnyElement) return undefined;
      const store = storeMap.get(el.storeRef);
      const item = store?.items[slotIndex];
      return item !== undefined && item.kind === 'char' ? item.value : undefined;
    }
    case 'notany':
    case 'context':
    case 'index':
    case 'baselayout':
    case 'raw':
      return undefined;
    default: {
      // Exhaustiveness guard: a new ContextElement kind must be handled above.
      const _exhaustive: never = el;
      return _exhaustive;
    }
  }
}

/**
 * Resolve WHICH `any()` context element is paired with a matched output
 * store slot, using the SAME offset convention as
 * `applyStoreSlotRemovals.ts`'s index()/context pairing invariant:
 * `effectiveContext[offset - 1]` — a 1-based `index()` `offset` into the
 * rule's context with the codec's synthetic `+` keystroke-boundary separator
 * filtered out first (see `isPlusSeparator`).
 *
 * A rule's context may carry more than one `any()` element (e.g. two
 * fan-out stores consumed by the same rule); picking the FIRST one
 * positionally — as opposed to the one the OUTPUT actually pairs with — can
 * mislabel which store the "base" input comes from. This function is the
 * one place that resolves the pairing:
 *
 *   - When the matched output element is `index()` (the only OutputElement
 *     kind that carries an `offset`), the pairing is UNAMBIGUOUS: resolve
 *     the exact context position and require it to be `kind === 'any'`.
 *   - When the matched output element is `outs()` (no `offset` — the same
 *     "can't be statically paired" shape `applyStoreSlotRemovals` fails
 *     closed on) or there is no output element at all (a plain literal-
 *     output rule), fall back to the single-`any()` convenience: with
 *     EXACTLY ONE `any()` in context, that one is unambiguous by
 *     elimination; with zero or more than one, there's no safe pairing.
 *
 * Returns the exact `ContextElement` instance (by reference, from
 * `context`) so callers can identify it via `===` — never a copy — or
 * `undefined` when the pairing can't be resolved unambiguously (callers then
 * abort rather than guess).
 */
function resolveAlignedAnyElement(
  context: readonly ContextElement[],
  matchedOutputEl: { kind: string; offset: number | undefined } | undefined,
): (ContextElement & { kind: 'any' }) | undefined {
  const effectiveContext = context.filter((el) => !isPlusSeparator(el));

  if (matchedOutputEl?.kind === 'index' && matchedOutputEl.offset !== undefined) {
    const target = effectiveContext[matchedOutputEl.offset - 1];
    return target !== undefined && target.kind === 'any' ? target : undefined;
  }

  const anyEls = effectiveContext.filter(
    (el): el is ContextElement & { kind: 'any' } => el.kind === 'any',
  );
  return anyEls.length === 1 ? anyEls[0] : undefined;
}

/**
 * Build the FULL ordered friendly input sequence from a rule's `context`
 * (spec follow-up: pre-existing-method labels show the whole input sequence,
 * not just a single keystroke). `slotIndex` — when known — lets the ALIGNED
 * `any()` element (`alignedAnyElement`, resolved by
 * {@link resolveAlignedAnyElement} from the matched output's `index()`
 * offset) resolve to its aligned store item (a fan-out base char); pass
 * `undefined` for both when no aligned position exists (a plain
 * literal-output rule). Any OTHER `any()` element in `context` — i.e. one
 * that isn't `alignedAnyElement` — always aborts the sequence: only the
 * offset-paired position has a known slot index.
 *
 * Returns `undefined` — never a partially-fabricated array — the moment any
 * ONE element can't be rendered, or when `context` is empty.
 */
function buildContextInputSequence(
  context: readonly ContextElement[],
  storeMap: ReadonlyMap<string, KeyboardIR['stores'][number]>,
  triggerKeystrokeByDeadkeyId: ReadonlyMap<number, string>,
  slotIndex: number | undefined,
  alignedAnyElement: ContextElement | undefined,
): string[] | undefined {
  if (context.length === 0) return undefined;
  const tokens: string[] = [];
  for (const el of context) {
    const token = contextElementTokenDisplay(
      el,
      storeMap,
      triggerKeystrokeByDeadkeyId,
      slotIndex,
      alignedAnyElement,
    );
    if (token === undefined) return undefined;
    tokens.push(token);
  }
  return tokens;
}

/**
 * Turn a raw Keyman store variable name into a human-readable table label —
 * strips a single leading Hungarian-notation "k" (only when followed by an
 * uppercase letter, so "keys" is never mangled into "eys"), splits
 * camelCase/PascalCase into words, and Title Cases the result.
 *
 * Returns undefined (rather than a still-opaque guess) for a single token
 * that also carries digits after that transform (e.g. "dkt003b") — those are
 * raw internal identifiers, not words, and must not be surfaced to authors.
 */
function humanizeStoreName(name: string): string | undefined {
  if (!name) return undefined;
  const withoutPrefix = /^k[A-Z]/.test(name) ? name.slice(1) : name;
  const words = withoutPrefix
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0);
  if (words.length === 0) return undefined;
  if (words.length === 1 && /\d/.test(words[0]!)) return undefined;
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

/**
 * `exactOptionalPropertyTypes`-safe helper: spreads `{ storeDisplayName }`
 * only when {@link humanizeStoreName} actually resolved something, so the
 * field is OMITTED (never present-but-`undefined`) on the fallback path.
 */
function storeDisplayNameField(storeName: string): { storeDisplayName: string } | Record<string, never> {
  const displayName = humanizeStoreName(storeName);
  return displayName !== undefined ? { storeDisplayName: displayName } : {};
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Collect every contributor to `targetChar` in the IR.
 *
 * @param ir         The KeyboardIR (after recognizePatterns() has run, if applicable).
 * @param targetChar The NFC character to find producers for.
 * @returns          A CharContributors record (see interface above).
 */
export function collectCharContributors(ir: KeyboardIR, targetChar: string): CharContributors {
  // Normalize the target to NFC so comparisons are canonical.
  const target = targetChar.normalize("NFC");

  const ruleNodeIds: string[] = [];
  const storeSlotIds: string[] = [];
  const storeSlots: CharContributors['storeSlots'] = [];
  const storeSlotDescriptors: ContributorDescriptor[] = [];
  const locations: CharContributors['locations'] = [];
  const blocked: CharContributors['blocked'] = [];
  const ruleDescriptors: ContributorDescriptor[] = [];
  const blockedDescriptors: ContributorDescriptor[] = [];

  // Pre-build store map (name → store) for store-output expansion.
  const storeMap = new Map(ir.stores.map((s) => [s.name, s]));

  // Pre-pass: map deadkey id -> triggering keystroke display, from every S-02
  // trigger rule (output is exactly one `{kind:"deadkey"}` element) whose
  // context is cheaply summarizable as one keystroke. Used below to fill in
  // `mark` on a "deadkey" descriptor without a second full scan per slot.
  //
  // A deadkey id is normally set by exactly one trigger rule, but nothing in
  // the IR enforces that — two trigger rules CAN legitimately share an id
  // (e.g. two different keystrokes both arming the same deadkey family).
  // When that happens with genuinely different keystrokes, last-write-wins
  // on a plain Map would silently pick one iteration-order-dependently and
  // mislabel `mark` for every slot that id feeds. Instead: the first
  // resolved display for an id wins; a SECOND, DIFFERENT display for the
  // same id makes that id permanently ambiguous — its entry is removed (and
  // never re-added by a later rule) so `mark` is left absent, and the
  // studio's generic "Part of a two-step combination" template covers it,
  // rather than guessing which trigger is "the" one.
  const triggerKeystrokeByDeadkeyId = new Map<number, string>();
  const ambiguousDeadkeyIds = new Set<number>();
  for (const group of ir.groups) {
    for (const rule of group.rules) {
      if (!isTriggerRule(rule)) continue;
      const deadkeyId = (rule.output[0] as { kind: 'deadkey'; id: number }).id;
      if (ambiguousDeadkeyIds.has(deadkeyId)) continue;
      const display = keystrokeDisplayForContext(rule.context);
      if (display === undefined) continue;
      const existing = triggerKeystrokeByDeadkeyId.get(deadkeyId);
      if (existing === undefined) {
        triggerKeystrokeByDeadkeyId.set(deadkeyId, display);
      } else if (existing !== display) {
        triggerKeystrokeByDeadkeyId.delete(deadkeyId);
        ambiguousDeadkeyIds.add(deadkeyId);
      }
    }
  }

  // Build a set of recognized-pattern IDs to patternTitle, for location labels.
  const patternById = new Map(
    ir.recognizedPatterns
      .filter((p) => p.origin === 'recognized')
      .map((p) => [p.id, p.title]),
  );

  // Track already-seen locations to avoid duplicates in the locations array.
  const seenLocationNodeIds = new Set<string>();

  const addLocation = (kind: 'group' | 'pattern' | 'store', label: string, nodeId: string) => {
    if (!seenLocationNodeIds.has(nodeId)) {
      seenLocationNodeIds.add(nodeId);
      locations.push({ kind, label, nodeId });
    }
  };

  // Track already-added ruleNodeIds / storeSlotIds to avoid duplicates.
  const seenRuleNodeIds = new Set<string>();
  // slotId -> its position in `storeSlots`, so a slot first seen on the input
  // side can be upgraded to "output" without disturbing `storeSlotIds` order.
  const storeSlotIndexById = new Map<string, number>();

  /**
   * Record a matching store slot, keeping `storeSlots` a strict projection of
   * `storeSlotIds` (invariant D1). Output role dominates on a re-visit, and
   * (since the output side is where mark/base are cheaply derivable) its
   * descriptor dominates too.
   */
  const addStoreSlot = (slotId: string, role: 'input' | 'output', descriptor: ContributorDescriptor) => {
    const existing = storeSlotIndexById.get(slotId);
    if (existing !== undefined) {
      if (role === 'output') {
        const entry = storeSlots[existing];
        if (entry !== undefined) entry.role = 'output';
        storeSlotDescriptors[existing] = descriptor;
      }
      return;
    }
    storeSlotIndexById.set(slotId, storeSlots.length);
    storeSlotIds.push(slotId);
    storeSlots.push({ slotId, role });
    storeSlotDescriptors.push(descriptor);
  };

  // --- 1. Check opaque fragments (RawKmnFragment) ---
  // These can only be whole-fragment-deleted; list in blocked. Rather than a
  // textual scan of `sourceText` for the target char after a `>` (which can't
  // tell an OUTPUT-side literal from one that merely matches inside a guard
  // or context), walk the codec-extracted `producedOutput` sketch structurally
  // — the SAME run-merge + store-resolution element-walk `buildProducedSet`
  // uses (shared via the exported `collectFromElements`), so a char actually
  // produced by an opaque fragment is attributed here exactly when it's
  // attributed to `produced` there. Fragments without a `producedOutput`
  // sketch (non-rule fragments, older parses, or a RHS with no statically
  // producible content) are never flagged here — a truthful structural
  // attribution isn't cheap for those, so they're left to the caller's own
  // default-safe fallback rather than a fabricated guess.
  for (const frag of ir.raw) {
    if (frag.producedOutput === undefined) continue;
    const fragProduced = new Set<string>();
    collectFromElements(frag.producedOutput, storeMap, fragProduced, false);
    if (fragProduced.has(target)) {
      blocked.push({
        reason: `Opaque fragment (${frag.reason}): cannot surgically remove individual characters`,
        label: frag.reason,
      });
      blockedDescriptors.push({
        kind: 'blocked',
        producedChar: target,
        blockedReasonCode: 'opaque-fragment',
      });
    }
  }

  // Record where a contributing rule lives (its owning pattern, else its group)
  // so the confirm dialog can name the place.
  const addRuleLocation = (
    r: { ownedByPattern?: string | undefined },
    group: { name: string; nodeId: string },
  ) => {
    if (r.ownedByPattern !== undefined) {
      addLocation('pattern', patternById.get(r.ownedByPattern) ?? r.ownedByPattern, r.ownedByPattern);
    } else {
      addLocation('group', group.name, group.nodeId);
    }
  };

  // --- 2. Walk all groups → all rules ---
  for (const group of ir.groups) {
    for (const rule of group.rules) {
      // Skip S-02 trigger rules (output is exactly one deadkey element) — deleting
      // one would destroy the whole deadkey family, not this single character.
      // NOTE: this `continue` skips the WHOLE rule, including any any()-context
      // element it carries — so a store consumed only via any() on a trigger
      // rule (e.g. a guarded registration rule) would be missed here as a
      // contributor. No corpus example currently exercises this shape.
      if (isTriggerRule(rule)) continue;

      const isDeadkeyRule = rule.context.some((el) => el.kind === 'deadkey');

      // (0) Input-store occurrences — any() context elements ("remove everywhere",
      //     #525 v2). Independent of the output-store/literal classification below
      //     (no early `continue` here): a rule's INPUT store slot for this char is a
      //     contributor regardless of what that same rule's OUTPUT does. `notany()`
      //     is deliberately excluded (see the module doc comment) — only `any()`.
      for (const el of rule.context) {
        if (el.kind !== 'any') continue;
        const inputStore = storeMap.get(el.storeRef);
        if (inputStore === undefined) continue;
        let inputMatched = false;
        for (let i = 0; i < inputStore.items.length; i++) {
          const item = inputStore.items[i];
          if (item !== undefined && item.kind === 'char' && item.value.normalize('NFC') === target) {
            // The input side alone doesn't cheaply resolve a deadkey's
            // mark/base (that requires the OUTPUT-side alignment below), so
            // this descriptor deliberately leaves mark/base/storeDisplayName
            // absent when it's a deadkey-context rule — the studio's
            // fallback template covers it. A non-deadkey input match still
            // gets a `storeDisplayName`, same as an output-side match.
            addStoreSlot(
              makeSlotId(inputStore.nodeId, i),
              'input',
              isDeadkeyRule
                ? { kind: 'deadkey', producedChar: target }
                : { kind: 'store-slot', producedChar: target, ...storeDisplayNameField(inputStore.name) },
            );
            addLocation('store', inputStore.name, inputStore.nodeId);
            inputMatched = true;
          }
        }
        if (inputMatched) addRuleLocation(rule, group);
      }

      const outEls = rule.output as { kind: string; value?: string; storeRef?: string; offset?: number }[];

      // (a) Store-produced target — the character is emitted through an
      //     index()/outs() over a store (base-layer alphabet fan-out OR a
      //     deadkey fan-out). The surgical unit is the matching store SLOT
      //     (a drop, coordinated by applyStoreSlotRemovals with any paired
      //     store), NEVER the whole rule — the rule produces the entire
      //     store's worth of characters, so deleting it would remove them all.
      let storeMatched = false;
      for (const el of outEls) {
        if ((el.kind === 'index' || el.kind === 'outs') && el.storeRef !== undefined) {
          const store = storeMap.get(el.storeRef);
          if (store === undefined) continue;
          for (let i = 0; i < store.items.length; i++) {
            const item = store.items[i];
            if (item !== undefined && item.kind === 'char' && item.value.normalize('NFC') === target) {
              addStoreSlot(
                makeSlotId(store.nodeId, i),
                'output',
                buildOutputSlotDescriptor(
                  rule,
                  isDeadkeyRule,
                  target,
                  store.name,
                  i,
                  storeMap,
                  triggerKeystrokeByDeadkeyId,
                  { kind: el.kind, offset: el.offset },
                ),
              );
              addLocation('store', store.name, store.nodeId);
              storeMatched = true;
            }
          }
        }
      }
      if (storeMatched) {
        addRuleLocation(rule, group);
        continue;
      }

      // (b) Literal target — the character is written out directly as one or
      //     more `char` elements (base+combining runs NFC-compose to one glyph).
      const charVals = outEls.filter((el) => el.kind === 'char').map((el) => el.value ?? '');
      if (charVals.length === 0) continue;
      const onlyCharOutput = charVals.length === outEls.length;
      const wholeOutput = charVals.join('').normalize('NFC');

      if (onlyCharOutput && wholeOutput === target) {
        // The rule's entire output is exactly this character → whole-rule delete.
        if (!seenRuleNodeIds.has(rule.nodeId)) {
          seenRuleNodeIds.add(rule.nodeId);
          ruleNodeIds.push(rule.nodeId);
          const keystrokeDisplay = keystrokeDisplayForContext(rule.context);
          // No aligned store slot for a plain literal-output rule — an
          // any()/index() context element (rare here) always falls back
          // (both slotIndex and alignedAnyElement are absent).
          const inputSequence = buildContextInputSequence(
            rule.context,
            storeMap,
            triggerKeystrokeByDeadkeyId,
            undefined,
            undefined,
          );
          ruleDescriptors.push({
            kind: 'keystroke',
            producedChar: target,
            ...(keystrokeDisplay !== undefined ? { keystrokeDisplay } : {}),
            ...(inputSequence !== undefined ? { inputSequence, output: wholeOutput } : {}),
          });
        }
        addRuleLocation(rule, group);
      } else if (wholeOutput.includes(target)) {
        // The character is only part of a longer literal output that can't be
        // split surgically (rare) → genuinely blocked.
        blocked.push({
          reason: `produces "${wholeOutput}" — "${target}" can't be removed without affecting the rest of that output`,
          label: `${group.name} / ${rule.nodeId}`,
        });
        blockedDescriptors.push({
          kind: 'blocked',
          producedChar: target,
          blockedReasonCode: 'multi-char-output',
        });
      }
    }
  }

  return {
    targetChar: target,
    ruleNodeIds,
    storeSlotIds,
    storeSlots,
    locations,
    blocked,
    descriptors: [...ruleDescriptors, ...storeSlotDescriptors, ...blockedDescriptors],
  };
}

// ---------------------------------------------------------------------------
// Internal helper — output-side store-slot descriptor (deadkey mark/base or
// plain store-slot friendly name)
// ---------------------------------------------------------------------------

/**
 * Build the descriptor for an OUTPUT-side store-slot match (the "(a)
 * Store-produced target" loop). For a plain alphabet fan-out, this is just a
 * `storeDisplayName`. For an S-02 deadkey fan-out (`rule.context` carries a
 * `deadkey` element), attempts the cheap `mark`/`base` derivation:
 *   - `mark`  — via `triggerKeystrokeByDeadkeyId`, keyed by the rule's own
 *     `deadkey` context element's id (resolved by the trigger-rule pre-pass).
 *   - `base`  — the `any()`-consumed store's item at the SAME slot index as
 *     the matched output slot, from the SPECIFIC `any()` context element the
 *     matched output's `index()` `offset` pairs with (resolved once, via
 *     {@link resolveAlignedAnyElement}, and reused for both `base` and
 *     `inputSequence` below) — never just the first `any()` found
 *     positionally, which mislabels the base when a rule carries more than
 *     one `any()` context element.
 * Either piece is left absent (not fabricated) when it doesn't resolve.
 */
function buildOutputSlotDescriptor(
  rule: IRRule,
  isDeadkeyRule: boolean,
  target: string,
  storeName: string,
  slotIndex: number,
  storeMap: ReadonlyMap<string, KeyboardIR['stores'][number]>,
  triggerKeystrokeByDeadkeyId: ReadonlyMap<number, string>,
  matchedOutputEl: { kind: string; offset: number | undefined },
): ContributorDescriptor {
  // Resolve ONCE which `any()` context element the matched output slot is
  // actually paired with (see resolveAlignedAnyElement's doc comment for the
  // offset convention, matched to applyStoreSlotRemovals.ts) — both the
  // `base` derivation and `inputSequence` below use this SAME element, so
  // they can never disagree about which store is "the base".
  const alignedAnyEl = resolveAlignedAnyElement(rule.context, matchedOutputEl);

  const inputSequence = buildContextInputSequence(
    rule.context,
    storeMap,
    triggerKeystrokeByDeadkeyId,
    slotIndex,
    alignedAnyEl,
  );
  const sequenceFields = inputSequence !== undefined ? { inputSequence, output: target } : {};

  // Resolve ONCE — the item at the aligned store's SAME slot index — reused
  // by `inputChar`/`inputKeystroke` below (non-deadkey) and `base` further
  // down (deadkey); both readings must agree on which item is "the input".
  const anyStore = alignedAnyEl !== undefined ? storeMap.get(alignedAnyEl.storeRef) : undefined;
  const baseItem = anyStore?.items[slotIndex];

  if (!isDeadkeyRule) {
    return {
      kind: 'store-slot',
      producedChar: target,
      ...storeDisplayNameField(storeName),
      ...typedInputField(baseItem),
      ...sequenceFields,
    };
  }

  const deadkeyEl = rule.context.find(
    (el): el is { kind: 'deadkey'; id: number } => el.kind === 'deadkey',
  );
  const mark = deadkeyEl !== undefined ? triggerKeystrokeByDeadkeyId.get(deadkeyEl.id) : undefined;

  const base = baseItem !== undefined && baseItem.kind === 'char' ? baseItem.value : undefined;

  return {
    kind: 'deadkey',
    producedChar: target,
    ...(mark !== undefined ? { mark } : {}),
    ...(base !== undefined ? { base } : {}),
    ...sequenceFields,
  };
}

/**
 * `exactOptionalPropertyTypes`-safe helper: derive a typed single-token input
 * field for a STORE-SLOT (non-deadkey) descriptor from the item aligned with
 * the matched output slot (the SAME item `base` uses for a deadkey
 * descriptor) — `inputChar` when it's a literal char item, `inputKeystroke`
 * when it's a vkey item (via `vkeyDisplayName`). Mutually exclusive; omits
 * both when `baseItem` is absent or a kind (deadkey/any/raw) with no single
 * cheap rendering — never fabricated.
 */
function typedInputField(
  baseItem: StoreItem | undefined,
): { inputChar: string } | { inputKeystroke: string } | Record<string, never> {
  if (baseItem === undefined) return {};
  if (baseItem.kind === 'char') return { inputChar: baseItem.value };
  if (baseItem.kind === 'vkey') {
    const keyName = vkeyDisplayName(baseItem.name);
    return keyName !== undefined ? { inputKeystroke: keyName } : {};
  }
  return {};
}
