// Context-variant generator (spec 062, US1): for every rule the context-
// tolerance diagnostic (validator/context-tolerance.ts) found a behavioural
// gap in, synthesizes a new IR rule that matches the canonically-decomposed
// form of the same context and reproduces the exact output the keyboard
// already produces for the precomposed form — so the rule fires identically
// regardless of which canonical form the host buffer holds, without ever
// changing what the keyboard's own output looks like (FR-009: proposed only,
// never applied silently; FR-010: rules the codec could not model are never
// touched; FR-011: idempotent re-run).
//
// Follows the `mark-guards.ts` idempotent-generator pattern: pure IR->IR,
// groups rebuilt via spread rather than mutating shared rule objects, every
// generated rule named with a recognizable prefix so a re-run replaces
// rather than duplicates.
//
// Scope note: only `ContextVariant.kind === "added-rule"` is generated today.
// "added-store-members" — extending an existing store with a decomposed
// entry in lockstep with its index()-paired output store — is a real,
// documented mutation shape (spec's "stores used with paired index()" edge
// case) but is deliberately NOT implemented here: the added-rule strategy
// covers every case the diagnostic reports a gap for (it never depends on
// which store, if any, the rule's context is backed by) and never risks
// desynchronizing a paired store. Left as a documented future optimization
// (a store-member variant would be smaller than a parallel rule set), not a
// silently-dropped requirement.
//
// Write-back policy note (spec 062 US3, FR-007): the baked `result.ir`
// returned here always uses the keyboard's own ("own-form") output bytes —
// unchanged since before US3 existed, so Story 1's tests (context-
// variants.test.ts, the sil_yoruba8 canary) keep testing generator mechanics
// in isolation, independent of the write-back setting. FR-007's actual
// default ("echo") is applied one layer up, at commit time, by
// `facet-transform/migrations/context-tolerance.ts`'s
// `createContextToleranceMigrationRule`, which switches an accepted variant's
// generated-rule output between this baked own-form byte string
// (`ContextVariant.precomposedOutput`) and its NFD-normalized echo form
// without recompiling.

import type {
  ContextElement,
  ContextVariant,
  IRGroup,
  IRRule,
  IRStore,
  KeyboardIR,
  SimKeyInput,
  ToleranceReport,
} from '@keyboard-studio/contracts';
import { createVirtualFS } from '@keyboard-studio/contracts';

import { compile } from '../compiler/index.js';
import { emit } from '../codec/emit.js';
import { simulate } from '../simulator/index.js';
import {
  buildStoreCharIndex,
  stripAssetStoresForCompile,
  resolveContextCandidates,
  resolveKeyPart,
  splitRuleAtPlus,
} from '../validator/context-tolerance.js';
import { entryGroupOf, insertBlockBeforeTerminalRules } from './ir-insert.js';
import { oneMarkShorterPair, type OneMarkShorterPair } from './mark-decomposition.js';

export const GENERATED_MARKER_PREFIX = 'generated_tolerance_';
const BACKSPACE_UNWRAP_FROM_STORE = `${GENERATED_MARKER_PREFIX}bksp_unwrap_from`;
const BACKSPACE_UNWRAP_TO_STORE = `${GENERATED_MARKER_PREFIX}bksp_unwrap_to`;
/**
 * Prefix shared by every backspace-unwrap variant's `sourceRuleId`/
 * `generatedMarker` (spec 062 US4: one precomposed-context rule plus one
 * decomposed-context rule per composed unit — see `addBackspaceUnwrap`'s
 * doc for why there are several, not one). `migrations/context-tolerance.ts`
 * distinguishes a backspace-unwrap variant from a diacritic one type-safely
 * via `ContextVariant.precomposedOutput === undefined` instead of this
 * prefix (a backspace-unwrap variant never has one — see `ContextVariant`'s
 * doc); this constant is exported for tests and any future caller that
 * specifically needs to identify backspace-unwrap variants by id rather
 * than by that field's presence.
 */
export const BACKSPACE_UNWRAP_RULE_PREFIX = `${GENERATED_MARKER_PREFIX}bksp_unwrap_rule`;

export interface ContextVariantsResult {
  ir: KeyboardIR;
  variants: ContextVariant[];
}

/**
 * Whether two resolved keys represent the same physical keystroke. Compared
 * by resolved `SimKeyInput`, not raw `ContextElement` shape — a rule's key
 * part may be written as `[K_RBRKT]`, `']'`, or `any(key.act)` and still be
 * the exact same key a diagnosed rule's own key part resolves to.
 */
function sameKey(a: SimKeyInput, b: SimKeyInput): boolean {
  return (
    a.vkey === b.vkey &&
    (a.caps ?? false) === (b.caps ?? false) &&
    JSON.stringify([...a.modifiers].sort()) === JSON.stringify([...b.modifiers].sort())
  );
}

/**
 * Find where a batch of generated rules (all sharing `key`) must be
 * inserted in `rules`: immediately before the first rule that would
 * otherwise win against them — an existing bare-context fallback for the
 * same key (spec Story 1 Acceptance Scenario 3), or (per kmcmplib's
 * requirement that match/nomatch rules be last) the first match/nomatch
 * rule, whichever comes first. Returns the insertion index and the
 * conflicting fallback rule's id, if any.
 */
function findInsertionPoint(
  rules: IRRule[],
  key: SimKeyInput,
  storeChars: Map<string, string[]>,
): { index: number; fallbackRuleId?: string } {
  for (let i = 0; i < rules.length; i++) {
    const r = rules[i]!;
    if (r.matchKind === 'match' || r.matchKind === 'nomatch') {
      return { index: i };
    }
    const split = splitRuleAtPlus(r);
    if (split !== undefined && split.before.length === 0) {
      const keyResolution = resolveKeyPart(split.keyPart, storeChars);
      if ('key' in keyResolution && sameKey(keyResolution.key, key)) {
        return { index: i, fallbackRuleId: r.nodeId };
      }
    }
  }
  return { index: rules.length };
}

export function charsToOutput(text: string): IRRule['output'] {
  return [...text].map((ch) => ({ kind: 'char' as const, value: ch }));
}

function charsToContext(text: string): ContextElement[] {
  return [...text].map((ch) => ({ kind: 'char' as const, value: ch }));
}

/**
 * Generate context variants for every rule `toleranceReport` diagnosed a
 * behavioural gap in. Pure IR -> IR: returns a new `KeyboardIR` with the
 * generated rules inserted (idempotently — a prior run's generated rules are
 * always stripped first) and the list of variants produced. Never mutates
 * `ir` or any of its rule objects.
 *
 * Compiles `ir` once (after stripping any previously generated rules) to
 * determine, for every decomposable candidate character attested in a gap
 * rule's own context store, whether that specific candidate has a gap and —
 * if so — the exact output the keyboard already produces for its
 * precomposed form (spec 062 SC-001: every attested pair, not just the one
 * example the diagnostic report happened to record).
 */
export async function proposeContextVariants(
  ir: KeyboardIR,
  toleranceReport: ToleranceReport,
): Promise<ContextVariantsResult> {
  const gapRuleIds = new Set(
    toleranceReport.findings.filter((f) => f.failingKeystrokes !== undefined).map((f) => f.ruleId),
  );

  // Strip previously generated rules/stores first — idempotent re-run, and
  // also the correct pre-fix baseline to compile for determining correct
  // outputs.
  const strippedGroups: IRGroup[] = ir.groups.map((g) => ({
    ...g,
    rules: g.rules.filter((r) => !r.nodeId.startsWith(GENERATED_MARKER_PREFIX)),
  }));
  const strippedStores: IRStore[] = ir.stores.filter((s) => !s.name.startsWith(GENERATED_MARKER_PREFIX));
  const strippedIr: KeyboardIR = { ...ir, groups: strippedGroups, stores: strippedStores };

  if (gapRuleIds.size === 0) {
    return addBackspaceUnwrap(strippedIr);
  }

  const storeChars = buildStoreCharIndex(ir);
  const entry = entryGroupOf(strippedGroups);
  if (entry === undefined) {
    return addBackspaceUnwrap(strippedIr);
  }

  const vfs = createVirtualFS([
    { path: `source/${ir.header.keyboardId}.kmn`, content: emit(stripAssetStoresForCompile(strippedIr)), isBinary: false },
  ]);
  const compiled = await compile(vfs, ir.header.keyboardId);
  if (!compiled.success) {
    return addBackspaceUnwrap(strippedIr);
  }

  const variants: ContextVariant[] = [];
  // Per group, an ordered list of independent batches — one per source rule
  // that got a fix — each carrying its own key part so its insertion point
  // is computed against that specific key, not assumed shared across a
  // group's several distinct gap rules.
  const batchesByGroup = new Map<string, Array<{ key: SimKeyInput; rules: IRRule[] }>>();

  for (const group of strippedGroups) {
    for (const rule of group.rules) {
      if (!gapRuleIds.has(rule.nodeId)) continue;
      const split = splitRuleAtPlus(rule);
      if (split === undefined || split.before.length !== 1) continue;

      const beforeEl = split.before[0]!;
      const candidateResolution = resolveContextCandidates(beforeEl, storeChars);
      if ('reason' in candidateResolution) continue;
      const keyResolution = resolveKeyPart(split.keyPart, storeChars);
      if ('reason' in keyResolution) continue;
      const key = keyResolution.key;

      const decomposable = candidateResolution.chars.filter(
        (c) => [...c].length === 1 && c.normalize('NFD') !== c,
      );
      if (decomposable.length === 0) continue;

      const { fallbackRuleId } = findInsertionPoint(group.rules, key, storeChars);

      let variantIndex = 0;
      const generatedForRule: IRRule[] = [];
      for (const candidate of decomposable) {
        const decomposed = candidate.normalize('NFD');
        const precomposedOutput = simulate(compiled, [key], { text: candidate }).finalOutput;
        const decomposedOutput = simulate(compiled, [key], { text: decomposed }).finalOutput;
        if (precomposedOutput === decomposedOutput) continue; // this candidate is already tolerant

        const marker = `${GENERATED_MARKER_PREFIX}${rule.nodeId}_${variantIndex++}`;
        generatedForRule.push({
          nodeId: marker,
          context: [...charsToContext(decomposed), { kind: 'raw', text: '+' }, ...split.keyPart],
          output: charsToOutput(precomposedOutput),
          trailingComment: 'generated: context tolerance (spec 062)',
        });
        variants.push({
          sourceRuleId: rule.nodeId,
          kind: 'added-rule',
          generatedMarker: marker,
          precomposedOutput,
          ...(fallbackRuleId !== undefined ? { precedesFallbackRuleId: fallbackRuleId } : {}),
        });
      }

      if (generatedForRule.length > 0) {
        const existing = batchesByGroup.get(group.nodeId) ?? [];
        batchesByGroup.set(group.nodeId, [...existing, { key, rules: generatedForRule }]);
      }
    }
  }

  if (variants.length === 0) {
    return addBackspaceUnwrap(strippedIr);
  }

  const newGroups = strippedGroups.map((group) => {
    const batches = batchesByGroup.get(group.nodeId);
    if (batches === undefined || batches.length === 0) return group;
    // Insert each source rule's batch independently, against its own key
    // part, updating the working array after each so later batches see
    // earlier insertions (and don't miscompute their own index).
    let rules = group.rules;
    for (const batch of batches) {
      const { index } = findInsertionPoint(rules, batch.key, storeChars);
      rules = [...rules.slice(0, index), ...batch.rules, ...rules.slice(index)];
    }
    return { ...group, rules };
  });

  return addBackspaceUnwrap({ ...strippedIr, groups: newGroups }, variants);
}

/**
 * Story 4 (spec 062, FR-014): generate a decomposed-context mirror of
 * `mark-guards.ts`'s own precomposed-context stepwise backspace-unwrap rule
 * (`MARKS_UNWRAP_FROM_STORE`/`MARKS_UNWRAP_TO_STORE`), for every composed
 * (precomposed) multi-mark unit attested anywhere in the keyboard's own
 * stores or rule outputs — so backspace peels exactly one mark whether the
 * buffer holds the precomposed unit or its canonically-decomposed sequence,
 * even on a host that deletes a whole grapheme cluster per backspace rather
 * than one code point (Acceptance Scenario 2). Runs unconditionally
 * (independent of `toleranceReport` — there is no "gap rule" to fix here,
 * only an inventory of composed units to protect), idempotently (strips and
 * regenerates its own stores/rules, recognized by `GENERATED_MARKER_PREFIX`).
 *
 * Unlike `mark-guards.ts`'s `buildUnwrap` — which only ever runs for
 * SCAFFOLDED keyboards via spec 071's placement worklist and only matches
 * the precomposed context (its own doc: "under base-plus-mark output the
 * peel is native... so no rules are generated") — this generator runs for
 * ANY `KeyboardIR`, including an IMPORTED keyboard that never went through
 * that placement pipeline at all (spec 062's actual target domain: adapted
 * corpus keyboards like `sil_yoruba8`, which has no backspace-unwrap
 * infrastructure of its own). So it covers BOTH context forms — for a
 * scaffolded keyboard where `mark-guards.ts` already generated its own
 * precomposed-context rule, this makes that half redundant (dead, not
 * wrong: first-match-wins means one of the two identical-effect rules never
 * fires) rather than leaving imported keyboards' precomposed-context half
 * uncovered — the latter is the one FLEx actually hits.
 *
 * Two DIFFERENT shapes, not one shared store-pair, because a `char` store
 * item is one codepoint (every existing store in this codebase, including
 * `mark-guards.ts`'s own pairs, only ever holds single-codepoint items).
 * Real `.kmn` DOES allow a multi-codepoint quoted string as one atomic store
 * item (confirmed against real Keyman docs and `sil_cameroon_qwerty`-style
 * paired-store idioms), but THIS codebase's `emit()` cannot round-trip one:
 * `codec/emit.ts`'s `emitStoreItems` concatenates every item's characters
 * into one shared buffer with no per-item separator, so a multi-codepoint
 * item silently loses its boundary against its neighbor on emit. That is a
 * real, separate codec gap (tracked here, not fixed here — out of this
 * feature's scope; a future store-item-boundary-preserving `emit()` would
 * let a unified store-pair replace the two-shape split below).
 * - Precomposed context: `any(FROM) + [K_BKSP] > index(TO,1)`, mirroring
 *   `mark-guards.ts` exactly — both stores hold single-codepoint items.
 * - Decomposed context: one literal-context rule per composed unit, built
 *   the same way `proposeContextVariants` above builds a diacritic fix's
 *   context/output (`charsToContext`/`charsToOutput` over the unit's own
 *   NFD codepoint sequence) — no store needed, since the match length
 *   varies per unit (a two-mark unit's decomposed context is one codepoint
 *   longer than a one-mark unit's).
 *
 * KNOWN LIMITATION 1 — mnemonic layouts (confirmed against the real WASM
 * kmc-kmn compiler + this repo's KeymanWeb-model simulator, root-caused, not
 * merely suspected): on a MNEMONIC-layout keyboard — `sil_yoruba8` itself,
 * this feature's own motivating example, included — neither the
 * precomposed-context rule above NOR its `mark-guards.ts` twin ever fires;
 * a bare `[K_BKSP]` context match falls straight through to native
 * per-codepoint delete regardless. Root cause, traced into the vendored
 * engine: `simulator/vendor/keyman/engine/keyboard/keyEvent.ts`'s
 * `setMnemonicCode` deletes `Lcode` outright for any non-modifier key with
 * no default character mapping — true of `K_BKSP`, never true of a
 * printable diacritic key — so `keyMatch()` can never match `[K_BKSP]` in
 * context. This is long-standing, documented upstream KeymanWeb behavior
 * (the vendored source itself carries a `FIXME` cross-referencing
 * `keymanapp/keyman#3744`), and — per the real corpus file's own compile
 * diagnostics — applies to virtual keys under mnemonic layouts generally,
 * not `[K_BKSP]` specifically (plausibly the same mechanism behind the
 * pre-existing, unrelated `recognizer/integration.test.ts` "RALT K_7"
 * failure). Scope the claim precisely: this is confirmed for the KeymanWeb
 * runtime this simulator models, not verified against Keyman's native
 * Windows/macOS/Linux Core engine, which may or may not share it.
 * `sil_cameroon_qwerty`'s hand-written 236-entry version of this idiom
 * (spec's own cited precedent) is NOT mnemonic, so it never exercises this
 * path. The decomposed-context rule above is unaffected ONLY when its match
 * already agrees with native per-codepoint deletion (e.g. a one-mark unit,
 * where "peel the last mark" and "delete the last codepoint" coincide) —
 * for a genuine two-or-more-mark unit it has the same problem. Acceptance
 * Scenario 2's "grapheme-cluster-deleting host" case is consequently
 * unaddressed for mnemonic keyboards specifically — the tests alongside
 * this function use a non-mnemonic fixture, where the mechanism is
 * confirmed working.
 *
 * KNOWN LIMITATION 2 — canonical order vs. typing order: "the one-mark-
 * shorter predecessor" is computed by dropping the CANONICALLY-last NFD
 * element (`nfd.slice(0, -1)`), not the most-recently-TYPED mark. Unicode's
 * canonical ordering sorts combining marks by combining class, not by
 * attachment order, so for a base carrying two marks from DIFFERENT classes
 * (e.g. a below mark and an above mark — Vietnamese circumflex+tone is the
 * textbook case, present in this project's own corpus) this can drop the
 * mark the typist added first while keeping the one added second — the
 * reverse of what backspace-peels-most-recent muscle memory expects.
 * `mark-guards.ts`'s own `buildUnwrap`, the precedent this function
 * deliberately mirrors, has the identical property; its own doc-comment
 * example happens to use two marks of the SAME combining class, where
 * canonical order and typing order coincide, which is why this was not
 * previously visible. Spec 062 Story 4 / FR-014 ask only for canonical-
 * equivalence and a one-mark-per-keystroke COUNT, not typing-order fidelity,
 * so this is spec-compliant as written — but it is not necessarily what a
 * native speaker of an affected orthography would expect from backspace.
 * Fixing it would mean deriving "one-mark-shorter predecessor" from an
 * attested attachment-order stack list (a `ConfirmedAlphabet`-level input,
 * per the Scope note below) rather than raw NFD, which is a bigger change
 * affecting `mark-guards.ts` too — out of scope here, flagged rather than
 * silently assumed correct.
 *
 * Scope note: only precomposed-output ("ready-made") composed units are
 * covered — those are the only ones detectable directly from a bare
 * `KeyboardIR` (they appear as a single literal codepoint somewhere in it).
 * A base-plus-mark (decomposed-output) keyboard's own composed units never
 * appear as a single codepoint anywhere in its IR, so there is nothing to
 * detect them from without a confirmed-alphabet-level inventory
 * (`nfcPostureOfInventory` needs a `ConfirmedAlphabet`, not a bare
 * `KeyboardIR` — the same reason `proposeContextVariants` above cannot call
 * it either, despite research.md's Phase 0 record naming it as the intended
 * per-pair table; see this module's write-back-policy note for the same
 * substitution). Closing that case for a grapheme-cluster-deleting host is
 * a follow-up, not silently claimed here.
 */
function addBackspaceUnwrap(ir: KeyboardIR, existingVariants: ContextVariant[] = []): ContextVariantsResult {
  const units = new Set<string>();
  for (const store of ir.stores) {
    for (const item of store.items) {
      if (item.kind !== 'char') continue;
      if ([...item.value].length === 1 && item.value.normalize('NFD') !== item.value) units.add(item.value);
    }
  }
  for (const group of ir.groups) {
    for (const rule of group.rules) {
      for (const el of rule.output) {
        if (el.kind !== 'char') continue;
        if ([...el.value].length === 1 && el.value.normalize('NFD') !== el.value) units.add(el.value);
      }
    }
  }

  const pairs = [...units].map((unit) => oneMarkShorterPair(unit)).filter((p): p is OneMarkShorterPair => p !== undefined);

  if (pairs.length === 0) return { ir, variants: existingVariants };

  const entry = entryGroupOf(ir.groups);
  if (entry === undefined) return { ir, variants: existingVariants };

  const bkspKey: ContextElement[] = [{ kind: 'vkey', name: 'K_BKSP', modifiers: [] }];

  const fromStore: IRStore = {
    nodeId: `${BACKSPACE_UNWRAP_FROM_STORE}_store`,
    name: BACKSPACE_UNWRAP_FROM_STORE,
    isSystem: false,
    items: pairs.map((p) => ({ kind: 'char' as const, value: p.unit })),
  };
  const toStore: IRStore = {
    nodeId: `${BACKSPACE_UNWRAP_TO_STORE}_store`,
    name: BACKSPACE_UNWRAP_TO_STORE,
    isSystem: false,
    items: pairs.map((p) => ({ kind: 'char' as const, value: p.to })),
  };
  const precomposedRule: IRRule = {
    nodeId: BACKSPACE_UNWRAP_RULE_PREFIX,
    context: [
      { kind: 'any', storeRef: BACKSPACE_UNWRAP_FROM_STORE },
      { kind: 'raw', text: '+' },
      ...bkspKey,
    ],
    output: [{ kind: 'index', storeRef: BACKSPACE_UNWRAP_TO_STORE, offset: 1 }],
    trailingComment: 'generated: precomposed-context backspace unwrap (spec 062, US4)',
  };

  const decomposedRules: IRRule[] = pairs.map((p, i) => ({
    nodeId: `${BACKSPACE_UNWRAP_RULE_PREFIX}_decomposed_${i}`,
    context: [...charsToContext(p.nfd.join('')), { kind: 'raw', text: '+' }, ...bkspKey],
    output: charsToOutput(p.to),
    trailingComment: 'generated: decomposed-context backspace unwrap (spec 062, US4)',
  }));

  const groups = ir.groups.map((g) =>
    g.nodeId === entry.nodeId
      ? { ...g, rules: insertBlockBeforeTerminalRules(g.rules, [...decomposedRules, precomposedRule]) }
      : g,
  );

  // No `precomposedOutput` — not a per-candidate output string in the
  // diacritic-variant sense (see this function's own doc for the two rule
  // shapes' real outputs). Both consumers that would otherwise read this
  // field (migrations/context-tolerance.ts's echo/own-form rewrite and its
  // output-diff preview) also skip every backspace-unwrap variant via
  // `BACKSPACE_UNWRAP_RULE_PREFIX` — belt-and-suspenders, not either-or.
  const variants: ContextVariant[] = [precomposedRule, ...decomposedRules].map((r) => ({
    sourceRuleId: r.nodeId,
    kind: 'added-rule',
    generatedMarker: r.nodeId,
  }));

  return {
    ir: { ...ir, stores: [...ir.stores, fromStore, toStore], groups },
    variants: [...existingVariants, ...variants],
  };
}
