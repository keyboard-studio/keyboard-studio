// facet-transform — the shared commit gate + applyFacetTransform (spec 039).
//
// `applyFacetTransform(ir, proposal)` runs the migration on the accepted-site
// subset → a transient candidate IR → the common gate (verify-by-class +
// opaque-integrity + one-shot undebounced compile/oracle) → committed | commit-
// failed. It RETURNS the next IR; it never writes the store (the studio does, via
// setWorkingIR — Article VI), and it never mutates `workingCopyIr` (copy-return,
// research D2).
//
// The pre-commit gate is a ONE-SHOT, undebounced call to the EXISTING
// validateWithOracle implementation (research D8/D9) — no second timer, no new
// validator-layer check. The candidate IR is transient and never serialized, so
// it is not a second persistent working copy (Article III intact).

import type { KeyboardIR, KeyChord, SimKeyInput } from "@keyboard-studio/contracts";
import {
  buildProducedSet,
  assertSemanticEquivalence,
  createVirtualFS,
} from "@keyboard-studio/contracts";
import { emit as emitKmn } from "../codec/emit.js";
import { compile } from "../compiler/index.js";
import { generateCorpus } from "../validator/corpus.js";
import { validateWithOracle } from "../validator/oracle.js";
import { MIGRATION_RULES } from "./migrations/index.js";
import type {
  CommitFailure,
  CommitResult,
  ProducedSetDelta,
  TransformProposal,
} from "./types.js";

// ---------------------------------------------------------------------------
// Corpus → simulator input conversion
// ---------------------------------------------------------------------------

const MODIFIER_MAP: Readonly<Record<string, SimKeyInput["modifiers"][number]>> = {
  SHIFT: "shift",
  CTRL: "ctrl",
  ALT: "alt",
  LCTRL: "lctrl",
  RCTRL: "rctrl",
  LALT: "lalt",
  RALT: "ralt",
};

function chordToSim(chord: KeyChord): SimKeyInput {
  const modifiers: SimKeyInput["modifiers"] = [];
  for (const m of chord.modifiers) {
    const mapped = MODIFIER_MAP[m.toUpperCase()];
    if (mapped !== undefined) modifiers.push(mapped);
  }
  return { vkey: chord.vkey, modifiers };
}

// ---------------------------------------------------------------------------
// Compile helper
// ---------------------------------------------------------------------------

/** Emit `ir` to a `.kmn` and compile it in a minimal VirtualFS. */
async function compileIr(ir: KeyboardIR) {
  const keyboardId = ir.header.keyboardId || "keyboard";
  const kmn = emitKmn(ir);
  const vfs = createVirtualFS([
    { path: `source/${keyboardId}.kmn`, content: kmn, isBinary: false },
  ]);
  return compile(vfs, keyboardId);
}

// ---------------------------------------------------------------------------
// Produced-set delta + opaque integrity/inventory (shared with propose.ts)
// ---------------------------------------------------------------------------

/** Compute the produced-character-set delta between two IRs (FR-011). */
export function producedSetDelta(before: KeyboardIR, after: KeyboardIR): ProducedSetDelta {
  const b = buildProducedSet(before);
  const a = buildProducedSet(after);
  const added = [...a].filter((c) => !b.has(c));
  const removed = [...b].filter((c) => !a.has(c));
  return { added, removed };
}

/** True when the transition changes the produced-character set. */
export function producedSetChangedBetween(before: KeyboardIR, after: KeyboardIR): boolean {
  const delta = producedSetDelta(before, after);
  return delta.added.length > 0 || delta.removed.length > 0;
}

/**
 * Group opaque `RawKmnFragment`s by reason — the I4 `{feature, count}` inventory
 * shape (research D12). This is "what the transform could not model": migrations
 * never touch `ir.raw`, so it is reported, never rewritten (FR-009).
 */
export function opaqueInventory(ir: KeyboardIR): Array<{ feature: string; count: number }> {
  const counts = new Map<string, number>();
  for (const frag of ir.raw) {
    counts.set(frag.reason, (counts.get(frag.reason) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([feature, count]) => ({ feature, count }))
    .sort((x, y) => x.feature.localeCompare(y.feature));
}

/**
 * FR-009 opaque integrity: every `RawKmnFragment` present before MUST be present
 * after with an unchanged `sourceText`. A disappeared/altered fragment that was
 * not explicitly confirmed is a violation — report and do not commit (D12).
 */
function checkOpaqueIntegrity(
  before: KeyboardIR,
  after: KeyboardIR,
): { ok: true } | { ok: false; detail: string[] } {
  const afterById = new Map(after.raw.map((f) => [f.nodeId, f]));
  const detail: string[] = [];
  for (const frag of before.raw) {
    const post = afterById.get(frag.nodeId);
    if (post === undefined) {
      detail.push(`Opaque fragment ${frag.nodeId} (${frag.reason}) was dropped.`);
    } else if (post.sourceText !== frag.sourceText) {
      detail.push(`Opaque fragment ${frag.nodeId} (${frag.reason}) was altered.`);
    }
  }
  return detail.length === 0 ? { ok: true } : { ok: false, detail };
}

// ---------------------------------------------------------------------------
// Behavior-preserving parity + invertibility (research D6/D7)
// ---------------------------------------------------------------------------

async function verifyBehaviorPreserving(
  before: KeyboardIR,
  candidate: KeyboardIR,
  inverse: ((ir: KeyboardIR) => KeyboardIR) | undefined,
): Promise<{ ok: true } | { ok: false; failure: CommitFailure }> {
  // (1) Fast necessary-condition pre-check: produced-set equality.
  if (producedSetChangedBetween(before, candidate)) {
    return {
      ok: false,
      failure: {
        cause: "parity-violation",
        reason: "Behavior-preserving transform changed the produced-character set.",
        detail: [JSON.stringify(producedSetDelta(before, candidate))],
      },
    };
  }

  // (2) Compile both and compare simulate output over the bounded corpus (D6).
  const [compiledBefore, compiledAfter] = await Promise.all([
    compileIr(before),
    compileIr(candidate),
  ]);
  if (!compiledBefore.success || !compiledAfter.success) {
    return {
      ok: false,
      failure: {
        cause: "compile-regression",
        reason: "Behavior-preserving transform failed to compile before/after.",
        detail: [
          ...compiledBefore.diagnostics.map((d) => `before: ${d.message}`),
          ...compiledAfter.diagnostics.map((d) => `after: ${d.message}`),
        ],
      },
    };
  }

  // Dynamic import keeps the Node-only simulator vendor (which uses bare import
  // specifiers Vite cannot resolve) OFF the studio's static bundle graph — the
  // same reason the package barrel omits `simulate` from its main entry. The
  // behavior-preserving branch is the only place simulate is needed.
  const { simulate } = await import("../simulator/index.js");
  const { corpus } = generateCorpus(before);
  for (const sequence of corpus) {
    const keys = sequence.map(chordToSim);
    const outBefore = simulate(compiledBefore, keys).finalOutput;
    const outAfter = simulate(compiledAfter, keys).finalOutput;
    if (outBefore !== outAfter) {
      return {
        ok: false,
        failure: {
          cause: "parity-violation",
          reason: "Behavior-preserving transform changed typing behaviour.",
          detail: [
            `input ${JSON.stringify(keys)}: before=${JSON.stringify(outBefore)} after=${JSON.stringify(outAfter)}`,
          ],
        },
      };
    }
  }

  // (3) Invertibility: assertSemanticEquivalence(before, inverse(candidate)) (D7).
  if (inverse !== undefined) {
    const roundTripped = inverse(candidate);
    const eq = assertSemanticEquivalence(before, roundTripped);
    if (!eq.equivalent) {
      return {
        ok: false,
        failure: {
          cause: "invertibility-violation",
          reason: "Behavior-preserving transform is not invertible to an equivalent prior state.",
          detail: eq.differences.map((d) => `${d.path}: ${d.reason}`),
        },
      };
    }
  }

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Compile-regression gate — one-shot, undebounced (research D8/D9)
// ---------------------------------------------------------------------------

async function compileRegressionGate(
  candidate: KeyboardIR,
): Promise<{ ok: true } | { ok: false; failure: CommitFailure }> {
  // One-shot, undebounced (research D8/D9): compile the transient candidate and
  // also collect blocking oracle findings. A failed compile (`success: false`)
  // OR an error/fatal finding blocks the commit (FR-010/SC-006).
  const [compiled, findings] = await Promise.all([
    compileIr(candidate),
    validateWithOracle(emitKmn(candidate)),
  ]);
  const blocking = findings.filter((f) => f.severity === "error" || f.severity === "fatal");
  if (!compiled.success || blocking.length > 0) {
    return {
      ok: false,
      failure: {
        cause: "compile-regression",
        reason: "Applying this transform would produce a keyboard that fails to compile.",
        detail: [
          ...compiled.diagnostics.map((d) => `${d.code ?? "compile"}: ${d.message}`),
          ...blocking.map((f) => `${f.code}: ${f.message}`),
        ],
      },
    };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// applyFacetTransform — the propose-then-confirm commit gate
// ---------------------------------------------------------------------------

/**
 * Run the confirmed transform through the common gate and return the next IR.
 *
 * Copy-return: `workingCopyIr` is never mutated. On any gate failure the result
 * is `{ status: 'commit-failed', failure }` and the working copy is unchanged
 * (FR-010). The studio writes the returned `nextIr` via `setWorkingIR` and
 * re-seeds axes when `producedSetChanged` (FR-013/D11).
 */
export async function applyFacetTransform(
  workingCopyIr: KeyboardIR,
  proposal: TransformProposal,
): Promise<CommitResult> {
  const rule = MIGRATION_RULES[proposal.migrationRuleId];
  if (rule === undefined) {
    return {
      status: "commit-failed",
      failure: {
        cause: "compile-regression",
        reason: `No migration rule "${proposal.migrationRuleId}" is registered.`,
      },
    };
  }

  // The applied set (FR-012 partial acceptance): accepted exception sites plus
  // every dominant-pattern site (causeTag === undefined, applied unconditionally).
  const acceptedSiteIds = proposal.affectedSites
    .filter((s) => s.userDisposition === "accepted" || s.causeTag === undefined)
    .map((s) => s.siteId);

  const rewrite = rule.apply(workingCopyIr, acceptedSiteIds, proposal.measurement);
  const candidate = rewrite.candidateIr;

  // (Gate 2) Opaque integrity — all classes (FR-009).
  const opaque = checkOpaqueIntegrity(workingCopyIr, candidate);
  if (!opaque.ok) {
    return {
      status: "commit-failed",
      failure: {
        cause: "opaque-integrity-violation",
        reason: "The transform would drop or alter an opaque source region that was not explicitly confirmed.",
        detail: opaque.detail,
      },
    };
  }

  // (Gate 1) Impact-class verify.
  if (proposal.transformImpactClass === "behavior-preserving") {
    const parity = await verifyBehaviorPreserving(workingCopyIr, candidate, rule.inverse);
    if (!parity.ok) {
      return { status: "commit-failed", failure: parity.failure };
    }
  }

  // (Gate 3) Compile-regression gate — one-shot, undebounced (FR-010/SC-006).
  const compileGate = await compileRegressionGate(candidate);
  if (!compileGate.ok) {
    return { status: "commit-failed", failure: compileGate.failure };
  }

  // (Gate 4) Commit — compute the produced-set delta for FR-011/FR-013.
  const delta = producedSetDelta(workingCopyIr, candidate);
  const producedSetChanged = delta.added.length > 0 || delta.removed.length > 0;
  return {
    status: "committed",
    nextIr: candidate,
    producedSetChanged,
    ...(producedSetChanged ? { producedSetDelta: delta } : {}),
    ledger: rewrite.ledger,
  };
}
