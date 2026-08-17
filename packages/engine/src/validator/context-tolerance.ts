// Canonical-equivalence context tolerance diagnostic (spec 062, US2).
//
// For every rule the codec modelled, determines whether it fires identically
// regardless of which canonical form (NFC or NFD) the preceding text context
// holds. This is a *behavioural* comparison — it runs the compiled keyboard
// through the simulator with each form seeded as the starting buffer and
// diffs the outputs — never a textual guess at whether a rule "looks"
// composed, per FR-002's explicit requirement.
//
// Rules the codec could not model (`RawKmnFragment`) are never inspected;
// they are counted in `notAnalysedCount` (FR-010). A rule whose preceding
// context this module cannot statically resolve into concrete candidate
// characters (a `notany()` reference, a multi-element context, a deadkey
// state check, etc.) is reported `"not-analysed"` with a reason, never
// guessed at.

import type {
  CompileResult,
  ContextElement,
  IRRule,
  IRStore,
  KeyboardIR,
  RuleToleranceFinding,
  SimKeyInput,
  ToleranceReport,
} from '@keyboard-studio/contracts';
import { createVirtualFS, isPlusSeparator } from '@keyboard-studio/contracts';

import { compile } from '../compiler/index.js';
import { emit } from '../codec/emit.js';
import { analyzeStores } from '../pattern-apply/applyStoreSlotRemovals.js';
import { simulate } from '../simulator/index.js';
import { reverseUsLayoutKey } from '../simulator/reverseUsLayout.js';

type KeyResolution = { key: SimKeyInput } | { reason: string };

const VKEY_MODIFIER_MAP: Record<string, SimKeyInput['modifiers'][number] | undefined> = {
  SHIFT: 'shift',
  CTRL: 'ctrl',
  ALT: 'alt',
  LCTRL: 'lctrl',
  RCTRL: 'rctrl',
  LALT: 'lalt',
  RALT: 'ralt',
};

/** Convert an IR `{kind:"vkey"}` element's modifier strings to `SimKeyInput`'s shape. */
function resolveVkeyModifiers(modifiers: string[]): { modifiers: SimKeyInput['modifiers']; caps?: boolean } | null {
  const out: SimKeyInput['modifiers'] = [];
  let caps: boolean | undefined;
  for (const raw of modifiers) {
    const upper = raw.toUpperCase();
    if (upper === 'CAPS') {
      caps = true;
      continue;
    }
    if (upper === 'NCAPS') {
      caps = false;
      continue;
    }
    const mapped = VKEY_MODIFIER_MAP[upper];
    if (mapped === undefined) return null; // e.g. RSHIFT — not representable by SimKeyInput
    out.push(mapped);
  }
  return caps === undefined ? { modifiers: out } : { modifiers: out, caps };
}

/** Resolve the single element after a rule's `+` separator into a pressable key. */
function resolveKeyPart(keyPart: ContextElement[], stores: Map<string, IRStore>): KeyResolution {
  if (keyPart.length !== 1) {
    return { reason: 'compound key part (more than one element after "+") not analysed' };
  }
  const el = keyPart[0]!;
  if (el.kind === 'vkey') {
    const mods = resolveVkeyModifiers(el.modifiers);
    if (mods === null) return { reason: `modifier on key ${el.name} not representable by the simulator` };
    return { key: { vkey: el.name, ...mods } };
  }
  if (el.kind === 'char') {
    const key = reverseUsLayoutKey(el.value);
    if (!key) return { reason: `no US-layout key produces character "${el.value}"` };
    return { key };
  }
  if (el.kind === 'any') {
    const store = stores.get(el.storeRef);
    const first = store?.items.find((i) => i.kind === 'char');
    if (!first || first.kind !== 'char') return { reason: `key store "${el.storeRef}" has no character items` };
    const key = reverseUsLayoutKey(first.value);
    if (!key) return { reason: `no US-layout key produces character "${first.value}"` };
    return { key };
  }
  return { reason: `key element kind "${el.kind}" not analysed` };
}

type CandidatesResolution = { chars: string[] } | { reason: string };

/** Resolve the single preceding-context element (before `+`) into candidate literal characters. */
function resolveContextCandidates(el: ContextElement, stores: Map<string, IRStore>): CandidatesResolution {
  if (el.kind === 'char') return { chars: [el.value] };
  if (el.kind === 'any') {
    const store = stores.get(el.storeRef);
    if (!store) return { reason: `store "${el.storeRef}" not found` };
    const chars = store.items.filter((i) => i.kind === 'char').map((i) => i.value);
    if (chars.length === 0) return { reason: `store "${el.storeRef}" has no character items` };
    return { chars };
  }
  return { reason: `preceding-context element kind "${el.kind}" not analysed` };
}

function locationFor(ir: KeyboardIR, rule: IRRule) {
  return { file: ir.header.keyboardId, line: rule.sourceLine ?? 0 };
}

/** A rule that needs the behavioural simulate() comparison to reach a verdict. */
interface PendingSimulation {
  base: { ruleId: string; location: { file: string; line: number } };
  key: SimKeyInput;
  candidates: string[];
}

type StaticResolution = { finding: RuleToleranceFinding } | { pending: PendingSimulation };

/**
 * Statically resolve one rule — everything that does not require a compiled
 * build: match/nomatch shortcuts, the `+` split, store-pairing safety, and
 * candidate/key resolution. Returns either a finished finding (nothing to
 * simulate) or a `PendingSimulation` bundle for the caller to run through
 * simulate() once a compiled build is available.
 */
function resolveRuleStatically(
  ir: KeyboardIR,
  rule: IRRule,
  stores: Map<string, IRStore>,
  storeAnalysis: ReturnType<typeof analyzeStores>,
): StaticResolution {
  const base = { ruleId: rule.nodeId, location: locationFor(ir, rule) };

  // match/nomatch group-transition rules have no textual context at all.
  if (rule.matchKind !== undefined) {
    return { finding: { ...base, status: 'tolerant' } };
  }

  const plusIdx = rule.context.findIndex(isPlusSeparator);
  if (plusIdx === -1) {
    return { finding: { ...base, status: 'tolerant' } };
  }

  const before = rule.context.slice(0, plusIdx);
  const keyPart = rule.context.slice(plusIdx + 1);

  if (before.length === 0) {
    // No preceding context — nothing for normalization to disagree about.
    return { finding: { ...base, status: 'tolerant' } };
  }
  if (before.length > 1) {
    return {
      finding: {
        ...base,
        status: 'not-analysed',
        notAnalysedReason: 'compound preceding context (more than one element before "+") not analysed',
      },
    };
  }

  const beforeEl = before[0]!;

  // Store-pairing safety (spec's "stores used with paired index()" edge case).
  // A clean 1:1 pairing (e.g. `any(base) + any(key) > index(acute,1)`) is the
  // ordinary, safe shape of a diacritic table — base and acute are *meant* to
  // stay parallel, and that pairing is exactly what tells a later fix which
  // second store to extend in lockstep. It is not itself a hazard, so it does
  // not block the simulate-based check below. What genuinely cannot be
  // resolved safely is an index() output whose source position could not be
  // traced to an any() at all (`unresolvedIndexOutputNames`), or a pairing
  // that spans more than two stores (ambiguous which one a fix should
  // extend) — those are reported not-analysed without ever attempting the
  // simulate comparison.
  if (beforeEl.kind === 'any' || beforeEl.kind === 'notany') {
    if (storeAnalysis.unresolvedIndexOutputNames.has(beforeEl.storeRef)) {
      return {
        finding: {
          ...base,
          status: 'not-analysed',
          notAnalysedReason: `store "${beforeEl.storeRef}" has an unresolved index() output pairing`,
        },
      };
    }
    const pairSet = storeAnalysis.pairSets.get(beforeEl.storeRef);
    if (pairSet !== undefined && pairSet.size > 2) {
      return {
        finding: {
          ...base,
          status: 'not-analysed',
          notAnalysedReason: `store "${beforeEl.storeRef}" is paired via index() with more than one other store`,
        },
      };
    }
  }

  const candidateResolution = resolveContextCandidates(beforeEl, stores);
  if ('reason' in candidateResolution) {
    return { finding: { ...base, status: 'not-analysed', notAnalysedReason: candidateResolution.reason } };
  }

  const keyResolution = resolveKeyPart(keyPart, stores);
  if ('reason' in keyResolution) {
    return { finding: { ...base, status: 'not-analysed', notAnalysedReason: keyResolution.reason } };
  }

  const decomposable = candidateResolution.chars.filter(
    (c) => [...c].length === 1 && c.normalize('NFD') !== c,
  );
  if (decomposable.length === 0) {
    // Nothing in this rule's context has an alternate canonical form to test.
    return { finding: { ...base, status: 'tolerant' } };
  }

  return { pending: { base, key: keyResolution.key, candidates: decomposable } };
}

/** Run the behavioural both-forms comparison for one rule against a successfully compiled build. */
function simulatePending(compiled: CompileResult, pending: PendingSimulation): RuleToleranceFinding {
  for (const candidate of pending.candidates) {
    const decomposed = candidate.normalize('NFD');
    const precomposedOutput = simulate(compiled, [pending.key], { text: candidate }).finalOutput;
    const decomposedOutput = simulate(compiled, [pending.key], { text: decomposed }).finalOutput;

    if (precomposedOutput !== decomposedOutput) {
      return {
        ...pending.base,
        status: 'not-analysed',
        failingKeystrokes: [pending.key],
        precomposedOutput,
        decomposedOutput,
      };
    }
  }
  return { ...pending.base, status: 'tolerant' };
}

/**
 * Run the both-forms simulator comparison over every rule in `ir` and
 * produce a `ToleranceReport`. Rules the codec could not model
 * (`RawKmnFragment`) are counted in `notAnalysedCount` only — never
 * inspected. The keyboard is compiled at most once, and only if at least one
 * rule actually needs the behavioural comparison — a rule fully resolved
 * statically (trivial, opaque, or pairing-unsafe) never depends on compile
 * success. Asserts the SC-006 invariant itself before returning.
 */
export async function computeContextTolerance(ir: KeyboardIR): Promise<ToleranceReport> {
  const stores = new Map(ir.stores.map((s) => [s.name, s]));
  const storeAnalysis = analyzeStores(ir);
  const totalRuleCount = ir.groups.reduce((n, g) => n + g.rules.length, 0) + ir.raw.length;

  const resolutions = ir.groups.flatMap((group) =>
    group.rules.map((rule) => resolveRuleStatically(ir, rule, stores, storeAnalysis)),
  );
  const anyPending = resolutions.some((r) => 'pending' in r);

  let compiled: CompileResult | undefined;
  if (anyPending) {
    const vfs = createVirtualFS([
      { path: `source/${ir.header.keyboardId}.kmn`, content: emit(ir), isBinary: false },
    ]);
    compiled = await compile(vfs, ir.header.keyboardId);
  }

  const findings: RuleToleranceFinding[] = resolutions.map((resolution) => {
    if ('finding' in resolution) return resolution.finding;
    const pending = resolution.pending;
    if (compiled?.success) return simulatePending(compiled, pending);
    return {
      ...pending.base,
      status: 'not-analysed',
      notAnalysedReason: 'keyboard failed to compile; behavioural comparison could not run',
    };
  });

  const report: ToleranceReport = { findings, notAnalysedCount: ir.raw.length };

  if (report.findings.length + report.notAnalysedCount !== totalRuleCount) {
    throw new Error(
      `computeContextTolerance: invariant violated — findings (${report.findings.length}) + ` +
        `notAnalysedCount (${report.notAnalysedCount}) !== total rule count (${totalRuleCount})`,
    );
  }

  return report;
}
