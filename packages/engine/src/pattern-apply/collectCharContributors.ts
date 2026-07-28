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

import type { IRRule, KeyboardIR } from "@keyboard-studio/contracts";
import { isDeadkeyOnlyOutput } from "../shared/rule-shape.js";
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
  kind: 'keystroke' | 'deadkey' | 'store-slot' | 'blocked';
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
  /** `kind: "blocked"` only — which of the two blocked shapes this is. */
  blockedReasonCode?: 'opaque-fragment' | 'multi-char-output';
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
  const triggerKeystrokeByDeadkeyId = new Map<number, string>();
  for (const group of ir.groups) {
    for (const rule of group.rules) {
      if (!isTriggerRule(rule)) continue;
      const deadkeyId = (rule.output[0] as { kind: 'deadkey'; id: number }).id;
      const display = keystrokeDisplayForContext(rule.context);
      if (display !== undefined) triggerKeystrokeByDeadkeyId.set(deadkeyId, display);
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
  // These can only be whole-fragment-deleted; list in blocked.
  for (const frag of ir.raw) {
    // We can't statically determine what a raw fragment produces. To avoid a
    // false "cannot be removed" warning on every chip (a fragment's source may
    // merely MATCH a common character on the input side), only flag it when the
    // target appears on the OUTPUT side of a rule — i.e. after a `>`.
    const outputSide = frag.sourceText.split('>').slice(1).join('>');
    if (outputSide.includes(target)) {
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

      const outEls = rule.output as { kind: string; value?: string; storeRef?: string }[];

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
                buildOutputSlotDescriptor(rule, isDeadkeyRule, target, store.name, i, storeMap, triggerKeystrokeByDeadkeyId),
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
          ruleDescriptors.push({
            kind: 'keystroke',
            producedChar: target,
            ...(keystrokeDisplay !== undefined ? { keystrokeDisplay } : {}),
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
 *   - `base`  — the aligned `any()`-consumed store's item at the SAME slot
 *     index as the matched output slot (the fan-out mechanism's own
 *     alignment invariant — the two stores are position-paired by
 *     construction, the same alignment `applyStoreSlotRemovals` relies on).
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
): ContributorDescriptor {
  if (!isDeadkeyRule) {
    return { kind: 'store-slot', producedChar: target, ...storeDisplayNameField(storeName) };
  }

  const deadkeyEl = rule.context.find(
    (el): el is { kind: 'deadkey'; id: number } => el.kind === 'deadkey',
  );
  const mark = deadkeyEl !== undefined ? triggerKeystrokeByDeadkeyId.get(deadkeyEl.id) : undefined;

  const anyEl = rule.context.find(
    (el): el is { kind: 'any'; storeRef: string } => el.kind === 'any',
  );
  const anyStore = anyEl !== undefined ? storeMap.get(anyEl.storeRef) : undefined;
  const baseItem = anyStore?.items[slotIndex];
  const base = baseItem !== undefined && baseItem.kind === 'char' ? baseItem.value : undefined;

  return {
    kind: 'deadkey',
    producedChar: target,
    ...(mark !== undefined ? { mark } : {}),
    ...(base !== undefined ? { base } : {}),
  };
}
