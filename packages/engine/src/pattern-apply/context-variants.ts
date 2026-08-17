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

import type {
  ContextElement,
  ContextVariant,
  IRGroup,
  IRRule,
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
import { entryGroupOf } from './ir-insert.js';

export const GENERATED_MARKER_PREFIX = 'generated_tolerance_';

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

function charsToOutput(text: string): IRRule['output'] {
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

  // Strip previously generated rules first — idempotent re-run, and also the
  // correct pre-fix baseline to compile for determining correct outputs.
  const strippedGroups: IRGroup[] = ir.groups.map((g) => ({
    ...g,
    rules: g.rules.filter((r) => !r.nodeId.startsWith(GENERATED_MARKER_PREFIX)),
  }));
  const strippedIr: KeyboardIR = { ...ir, groups: strippedGroups };

  if (gapRuleIds.size === 0) {
    return { ir: strippedIr, variants: [] };
  }

  const storeChars = buildStoreCharIndex(ir);
  const entry = entryGroupOf(strippedGroups);
  if (entry === undefined) {
    return { ir: strippedIr, variants: [] };
  }

  const vfs = createVirtualFS([
    { path: `source/${ir.header.keyboardId}.kmn`, content: emit(stripAssetStoresForCompile(strippedIr)), isBinary: false },
  ]);
  const compiled = await compile(vfs, ir.header.keyboardId);
  if (!compiled.success) {
    return { ir: strippedIr, variants: [] };
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
    return { ir: strippedIr, variants: [] };
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

  return { ir: { ...ir, groups: newGroups }, variants };
}
