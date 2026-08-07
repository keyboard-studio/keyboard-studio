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
 *   - "IS IT A METHOD?" IS NOT "DOES IT DEPEND ON THE CHAR?": these two
 *     questions have separate answers, and conflating them was a shipped
 *     defect. A backspace-reached slot (`any(composed) + [K_BKSP] >
 *     index(comp-dia,1)`, either spelling — see
 *     `contributorInputHasBackspace`) is NOT a producing method, so it is
 *     tagged `producedRole: 'used'` and never surfaces as an "existing
 *     method". But such a store is a DECONSTRUCTION table whose rows exist
 *     only for as long as their characters do, so its slots ARE nominated for
 *     removal. Omitting them instead left the carved character behind in the
 *     store, which kept it inside `buildProducedSet` and so left its keycap
 *     standing in both touch paths — see `carveDependentCombos.test.ts` for
 *     the worked `sil_cameroon_qwerty` `æ` case and the two consumers it
 *     broke. Whole-rule deletion and the `blocked` classification remain
 *     excluded for such rules: the surgical unit is the slot, since the rule's
 *     other rows serve other characters.
 *   - UNREFERENCED STORES: a store DECLARED but referenced by no rule is
 *     invisible to the rule walk, so a carved character would survive there in
 *     the emitted `.kmn` (sil_cameroon_qwerty declares `letter`, `lc` and `uc`
 *     this way — each appears exactly once in the file, its own declaration).
 *     A final sweep nominates those slots. Scoped to ZERO-reference stores
 *     precisely because that makes the drop provably behaviour-neutral, and in
 *     particular can never reach a `notany()`-consumed store and widen it.
 *   - PRODUCED vs. USED (the §0 "used" gate): a rule's `any()`-consumed INPUT
 *     store occurrence of `target` is only tagged `producedRole: "used"`
 *     (blue, non-deletable) when that SAME rule does NOT also produce
 *     `target` on its output side. A rule that outputs `target` is green/
 *     "produced" for it even when `target` also happens to sit in that
 *     rule's own input store (e.g. an identity-mapped deadkey combination, or
 *     a fan-out whose input and output stores share an item) — see
 *     `ruleProducesChar` below, the single predicate both this gate and the
 *     canonical deadkey example (`A + ◌̂ → Â`: green on Â's card, blue on A's)
 *     are decided from.
 *   - SINGLE-CHAR WHOLE-DELETE: whole-rule-delete only when the rule's ENTIRE
 *     NFC output === targetChar (single-char producer). Multi-char producers go
 *     to `blocked`.
 *   - OPAQUE FRAGMENTS: RawKmnFragment producers can only be whole-fragment-
 *     deleted; listed in `blocked`.
 */

import type { ContextElement, IRRule, KeyboardIR, StoreItem } from "@keyboard-studio/contracts";
import { collectFromElements, contextHasDirectBackspace, isBackspaceVkeyName } from "@keyboard-studio/contracts";
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
   * Whether this contributor genuinely PRODUCES `producedChar` (`'produced'`)
   * or merely USES it as input (`'used'`) — the §0 "Input-store occurrences"
   * branch, where the char sits in an `any()`-consumed INPUT store the rule
   * matches (a deadkey's base char, or a non-deadkey rule's own input-store
   * slot). A `'used'` contributor's rule may produce a DIFFERENT character
   * entirely; it is never a removal target for `producedChar` and the studio
   * renders it as informational, not deletable.
   *
   * Set explicitly at every construction site in this module (never derived
   * later) so the value always reflects the visit that WON for a given
   * descriptor. For a `storeSlots` entry, that visit is decided by the SAME
   * output-dominance rule `addStoreSlot` already applies to `role`: a slot
   * reached by BOTH an input-side match (one rule) and an output-side
   * production (another rule) always ends up `'produced'`, in either visit
   * order — the output-side descriptor (always tagged `'produced'`)
   * unconditionally overwrites a prior input-side one when `addStoreSlot` is
   * called with `role: 'output'`, and an input-side visit never overwrites
   * an existing entry at all. So a genuinely-produced slot is never
   * downgraded to `'used'` just because some other rule also consumes it as
   * input.
   *
   * Always set (never absent) on every descriptor this module constructs
   * (`'keystroke'`, `'deadkey'`, `'store-slot'`, `'blocked'`). Optional only
   * for the two kinds this module never constructs itself — `'composition'`
   * and `'unattributed'`, synthesized by the studio — which are always
   * `'produced'` too; absence there is equivalent to `'produced'`, never to
   * `'used'`.
   */
  producedRole?: 'produced' | 'used';
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

/**
 * True when a contributor's INPUT includes the backspace virtual key
 * (`K_BKSP`) by EITHER of the two known paths — the ONE place both are
 * decided, so they can't drift apart:
 *
 *   1. DIRECT: `{kind:"vkey", name:"K_BKSP"}` appears literally in the rule's
 *      `context` — the diacritic-removal / correction shape ("type é then
 *      backspace -> e"). Keys off the CONTEXT (input), never the output: a
 *      rule whose output happens to include a deadkey/backspace-adjacent
 *      construct but whose INPUT is a normal keystroke is a legitimate
 *      producer and must not be dropped by this check. Delegates to the
 *      shared `contextHasDirectBackspace` (`@keyboard-studio/contracts`) —
 *      the SAME predicate `buildProducedSet`'s opt-in
 *      `excludeBackspaceCorrections` uses, so the two can't diverge.
 *   2. STORE-RESOLVED: the rule consumes an `any()`-context store whose item
 *      at the slot ALIGNED with the currently-evaluated output ({@link
 *      resolveAlignedAnyElement}'s pairing — the SAME item `base`/
 *      `inputKeystroke` are derived from) resolves to
 *      `{kind:"vkey", name:"K_BKSP"}` — a store-slot contributor reached only
 *      by pressing backspace, never typed directly in the context, but still
 *      genuinely a "press Backspace" method rather than a producing one.
 *      This half is per-slot (depends on which output slot is being
 *      evaluated) and stays local to this module.
 *
 * `resolvedItem` is the aligned store item for the SPECIFIC contributor slot
 * being evaluated right now (absent for a plain literal-output rule with no
 * aligned slot, or for the whole-rule direct-context check, which has no
 * single slot) — pass `undefined` when there is none.
 */
function contributorInputHasBackspace(
  context: readonly ContextElement[],
  resolvedItem: StoreItem | undefined,
): boolean {
  if (contextHasDirectBackspace(context)) return true;
  return resolvedItem !== undefined && resolvedItem.kind === 'vkey' && isBackspaceVkeyName(resolvedItem.name);
}

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
 * "K_A" -> "a", "K_0" -> "0", "K_BKSP" -> "Backspace", "K_SEMICOLON" ->
 * "SEMICOLON" (unrecognized name, stripped-prefix fallback). Returns
 * undefined only for a blank name.
 *
 * Letter keys are lowercased (physical-key-naming ambiguity fix): a bare
 * uppercase "A" in a keystroke diagnostic like "Shift+A" reads as the
 * capital CHARACTER A, not the physical a key that, held with Shift,
 * PRODUCES that capital. Digits/symbols/named keys are unchanged; any
 * casing is conveyed by the modifier word ("Shift+") in the surrounding
 * diagnostic, never by casing the key letter itself. See the studio's
 * matching UI-side convention in lib/keyLabel.ts.
 */
function vkeyDisplayName(name: string): string | undefined {
  if (!name) return undefined;
  const upper = name.toUpperCase();
  const named = VKEY_DISPLAY_NAMES[upper];
  if (named !== undefined) return named;
  const simple = /^K_([A-Z0-9])$/.exec(upper);
  if (simple?.[1] !== undefined) return simple[1].toLowerCase();
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

/**
 * True when RULE's OUTPUT side produces `target` — i.e. the SAME production
 * test the "(a) Store-produced target" and "(b) Literal target" loops below
 * perform when they build their own descriptors, computed once, ahead of
 * §0, so §0's input-side loop can ask "does this rule ALSO produce the char
 * I'm about to tag 'used' for?" without a second, potentially-divergent
 * definition of "produces".
 *
 * Two ways a rule's output can produce `target` (either is sufficient):
 *   - STORE OUTPUT: an `index()`/`outs()` element over a store that contains
 *     `target` at a slot the "(a)" loop would ITSELF attribute a production
 *     to — i.e. every index is scanned (not just the offset-paired one), but
 *     an index whose ALIGNED any()-consumed input item resolves to backspace
 *     (`K_BKSP`) is skipped, via the SAME `resolveAlignedAnyElement` +
 *     `contributorInputHasBackspace` pairing the "(a)" loop uses at its own
 *     per-slot backspace check below. Without this exclusion, a store whose
 *     ONLY occurrence of `target` sits at such a backspace-aligned index
 *     would report a production here that "(a)" itself would never
 *     attribute — a divergent, false-positive definition of "produces" that
 *     would wrongly suppress a legitimate blue "used" row for `target`'s
 *     other, non-backspace input occurrence.
 *   - LITERAL OUTPUT: `target` appears in the NFC-joined literal `char`
 *     output (the same `charVals`/`wholeOutput` computation the "(b)" loop
 *     uses, whether as a single-char whole-rule match or as part of a
 *     longer, unsplittable literal run).
 *
 * A rule producing `target` is GREEN ("produced") for it regardless of
 * whether `target` ALSO appears on that same rule's input side — the
 * canonical case being a deadkey combination rule whose base char happens to
 * equal its own output (an identity mapping), or a fan-out rule where the
 * any()-consumed store and the index()-targeted store happen to share an
 * item. Per the produced/used contract, such a rule must never ALSO surface
 * a spurious blue "used" row for `target` — it is attributed via the
 * output-side branch alone.
 */
function ruleProducesChar(
  outEls: { kind: string; value?: string; storeRef?: string; offset?: number }[],
  target: string,
  storeMap: ReadonlyMap<string, KeyboardIR['stores'][number]>,
  context: readonly ContextElement[],
): boolean {
  for (const el of outEls) {
    if ((el.kind === 'index' || el.kind === 'outs') && el.storeRef !== undefined) {
      const store = storeMap.get(el.storeRef);
      if (store === undefined) continue;
      const alignedAnyEl = resolveAlignedAnyElement(context, { kind: el.kind, offset: el.offset });
      const anyStore = alignedAnyEl !== undefined ? storeMap.get(alignedAnyEl.storeRef) : undefined;
      for (let i = 0; i < store.items.length; i++) {
        const item = store.items[i];
        if (item === undefined || item.kind !== 'char' || item.value.normalize('NFC') !== target) continue;
        const baseItem = anyStore?.items[i];
        if (contributorInputHasBackspace(context, baseItem)) continue;
        return true;
      }
    }
  }
  const charVals = outEls.filter((el) => el.kind === 'char').map((el) => el.value ?? '');
  if (charVals.length === 0) return false;
  const wholeOutput = charVals.join('').normalize('NFC');
  return wholeOutput.includes(target);
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
        producedRole: 'produced',
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

      // Diacritic-removal / correction rules ("type é then backspace -> e")
      // are not a PRODUCING method for a character. That answers the
      // "existing methods" question — but NOT the removal question, and
      // conflating the two is a defect. Such a rule's output store is a
      // DECONSTRUCTION table: `any(composed) + [K_BKSP] > index(comp-dia,1)`
      // pairs each composable output with the same output minus one diacritic.
      // A row exists there BECAUSE its character exists, so carving that
      // character must drop the row (and, via applyStoreSlotRemovals' pairing
      // graph, the coordinated `composed` partner — the now-dead combo).
      //
      // Concretely, on sil_cameroon_qwerty: carving `æ` must drop
      // `comp-dia#52`/`#98`, taking `composed#52` (`ǽ`) and `#98` (`ǣ`) with
      // them. Skipping the whole rule left `æ` sitting in `comp-dia`, which in
      // turn kept `æ` inside `buildProducedSet` — so BOTH touch consumers
      // concluded it was still produced and left its keycap standing:
      // `collectCarvedKeycapTexts`' survivor guard saw a live cross-paired
      // producer, and `deriveDesktopModifications`' produced-set diff saw no
      // change. Nominating the slot here fixes both at once; neither of those
      // two needs a change of its own.
      //
      // So: flag the rule instead of skipping it. Its store slots are still
      // swept below (nominated for removal, tagged `producedRole: 'used'` so
      // it never surfaces as a green "this is how you type it" method), while
      // whole-rule deletion and the `blocked` classification stay excluded
      // exactly as before — the surgical unit for a correction rule is always
      // the slot, never the rule, whose other rows serve other characters.
      const isBackspaceCorrectionRule = contributorInputHasBackspace(rule.context, undefined);

      const isDeadkeyRule = rule.context.some((el) => el.kind === 'deadkey');

      const outEls = rule.output as { kind: string; value?: string; storeRef?: string; offset?: number }[];

      // Does THIS rule produce `target` on its own output side (store or
      // literal)? Computed once, ahead of §0, so §0 can gate its "used"
      // emission on it — see `ruleProducesChar`'s doc comment. A rule that
      // produces `target` is GREEN for it regardless of whether `target`
      // also appears on that rule's input side; only a rule that does NOT
      // produce `target` gets to tag an input-side occurrence "used".
      const ruleProducesTarget = ruleProducesChar(outEls, target, storeMap, rule.context);

      // (0) Input-store occurrences — any() context elements ("remove everywhere",
      //     #525 v2). Independent of the output-store/literal classification below
      //     (no early `continue` here): a rule's INPUT store slot for this char is a
      //     contributor regardless of what that same rule's OUTPUT does — UNLESS
      //     that same rule's output ALSO produces `target` (`ruleProducesTarget`),
      //     in which case the char is attributed via the output-side branch alone
      //     (green/"produced"), never a second, spurious blue "used" row. `notany()`
      //     is deliberately excluded (see the module doc comment) — only `any()`.
      if (!ruleProducesTarget) {
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
                  ? { kind: 'deadkey', producedChar: target, producedRole: 'used' }
                  : {
                      kind: 'store-slot',
                      producedChar: target,
                      producedRole: 'used',
                      ...storeDisplayNameField(inputStore.name),
                    },
              );
              addLocation('store', inputStore.name, inputStore.nodeId);
              inputMatched = true;
            }
          }
          if (inputMatched) addRuleLocation(rule, group);
        }
      }

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
              // Resolve the SAME aligned any()-consumed item buildOutputSlotDescriptor
              // would derive `base`/`inputKeystroke` from, ONCE, so the backspace
              // check and the descriptor build can never disagree about which
              // item is "the input" for this slot (per-slot: a DIFFERENT slot
              // index on the same store/rule can align to a different, non-
              // backspace item, so this can't be decided once for the whole rule).
              const alignedAnyEl = resolveAlignedAnyElement(rule.context, { kind: el.kind, offset: el.offset });
              const anyStore = alignedAnyEl !== undefined ? storeMap.get(alignedAnyEl.storeRef) : undefined;
              const baseItem = anyStore?.items[i];

              // Reached only by pressing backspace — either the rule's context
              // carries K_BKSP directly, or this slot's ALIGNED input item
              // resolves to it. Not a producing method, so it gets the `'used'`
              // role/descriptor (never a green "existing method" row) — but it
              // IS nominated for removal, because a deconstruction row exists
              // only for as long as its character does. See the
              // `isBackspaceCorrectionRule` comment above for the worked
              // sil_cameroon_qwerty case.
              if (contributorInputHasBackspace(rule.context, baseItem)) {
                addStoreSlot(makeSlotId(store.nodeId, i), 'input', {
                  kind: 'store-slot',
                  producedChar: target,
                  producedRole: 'used',
                  ...storeDisplayNameField(store.name),
                });
                addLocation('store', store.name, store.nodeId);
                // Deliberately does NOT set `storeMatched`: that flag drives
                // `addRuleLocation` + the `continue` that suppresses the
                // literal-output branch below, both of which are producer-side
                // bookkeeping this slot must not claim.
                continue;
              }

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
                  alignedAnyEl,
                  baseItem,
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

      // A correction rule never reaches the whole-rule / `blocked` branches
      // below — unchanged from before this rule stopped being skipped
      // outright. Its surgical unit is the slot (handled above): the rule
      // itself serves every OTHER character in its deconstruction table, so
      // deleting it would strip backspace behaviour from all of them, and a
      // multi-char literal output reached only by backspace is not a producer
      // this character can be "blocked" on.
      if (isBackspaceCorrectionRule) continue;

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
            producedRole: 'produced',
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
          producedRole: 'produced',
          blockedReasonCode: 'multi-char-output',
        });
      }
    }
  }

  // --- 3. Unreferenced-store sweep ("remove it everywhere", file hygiene) ---
  //
  // The rule walk above can only reach a store some rule actually mentions. A
  // store DECLARED but never referenced is invisible to it, so a carved
  // character stays behind in the emitted `.kmn` — e.g. sil_cameroon_qwerty
  // declares `store(letter)`, `store(lc)`, `store(uc)`, each appearing exactly
  // once in the whole file (its own declaration) and consumed by nothing.
  // Carving `æ` left `æ`/`Æ` sitting in all three.
  //
  // Scoped DELIBERATELY to stores with ZERO rule references, which makes the
  // drop provably behaviour-neutral: no rule matches through them, so nothing
  // can start or stop firing. In particular this never touches a store reached
  // by `notany()`, where dropping an item WIDENS what the rule matches — the
  // opposite of removal, and the hazard the module doc already calls out. A
  // store referenced by `any()`/`index()`/`outs()` is left entirely to the
  // rule walk above, which has the rule context needed to judge it.
  //
  // System stores (`&NAME`, `&VERSION`, …) are metadata, never character
  // inventory, and are excluded.
  const referencedStoreNames = new Set<string>();
  for (const group of ir.groups) {
    for (const rule of group.rules) {
      for (const el of rule.context) {
        const ref = (el as { storeRef?: string }).storeRef;
        if (ref !== undefined) referencedStoreNames.add(ref);
      }
      for (const el of rule.output) {
        const ref = (el as { storeRef?: string }).storeRef;
        if (ref !== undefined) referencedStoreNames.add(ref);
      }
    }
  }
  for (const frag of ir.raw) {
    for (const el of frag.producedOutput ?? []) {
      const ref = (el as { storeRef?: string }).storeRef;
      if (ref !== undefined) referencedStoreNames.add(ref);
    }
  }

  for (const store of ir.stores) {
    if (store.name.startsWith('&')) continue;
    if (referencedStoreNames.has(store.name)) continue;
    let matched = false;
    store.items.forEach((item, i) => {
      if (item.kind !== 'char' || item.value.normalize('NFC') !== target) return;
      addStoreSlot(makeSlotId(store.nodeId, i), 'input', {
        kind: 'store-slot',
        producedChar: target,
        producedRole: 'used',
        ...storeDisplayNameField(store.name),
      });
      matched = true;
    });
    if (matched) addLocation('store', store.name, store.nodeId);
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
 *     matched output's `index()` `offset` pairs with.
 * Either piece is left absent (not fabricated) when it doesn't resolve.
 *
 * `alignedAnyEl`/`baseItem` are resolved ONCE by the caller (the "(a)"
 * loop, via {@link resolveAlignedAnyElement}) — BEFORE deciding whether to
 * call this at all, so the caller's backspace skip check and this
 * descriptor's `base`/`inputChar`/`inputKeystroke` derivation always agree
 * on which item is "the input" for this slot; passed in rather than
 * re-resolved here to keep that single resolution the only one.
 */
function buildOutputSlotDescriptor(
  rule: IRRule,
  isDeadkeyRule: boolean,
  target: string,
  storeName: string,
  slotIndex: number,
  storeMap: ReadonlyMap<string, KeyboardIR['stores'][number]>,
  triggerKeystrokeByDeadkeyId: ReadonlyMap<number, string>,
  alignedAnyEl: (ContextElement & { kind: 'any' }) | undefined,
  baseItem: StoreItem | undefined,
): ContributorDescriptor {
  const inputSequence = buildContextInputSequence(
    rule.context,
    storeMap,
    triggerKeystrokeByDeadkeyId,
    slotIndex,
    alignedAnyEl,
  );
  const sequenceFields = inputSequence !== undefined ? { inputSequence, output: target } : {};

  if (!isDeadkeyRule) {
    return {
      kind: 'store-slot',
      producedChar: target,
      producedRole: 'produced',
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
    producedRole: 'produced',
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
