// Live extraction pass (spec 092, contracts/live-extraction.md).
//
// Runs ONCE, synchronously inside the setup commit, immediately after the
// setup decision's apply has instantiated the working copy: every
// applicable module's `extract` (and, failing that, its `lookupDefault`)
// runs over the starting-point bundle and merges into 088's decisionStore —
// seeding unanswered decisions with their source named, and placing the
// value beside (`offered`) an answer the author already gave, never over
// it. Extracted values are never applied silently (088 HANDOFF: "Values
// from the starting point become defaults the author knowingly confirms,
// changes or overturns").
//
// The per-module semantics are runDecisionFlow's (spec 087), shared by
// construction: derived order (orderDecisions), gates from conditional
// `next` routing (filterGated, evaluated once over the pre-pass set),
// extract → validate with a rejection
// treated as absent, a null extract normalised to absent, source identity
// preferring the catalog id and falling back to the IR header, and a
// throwing extract/validate aborting with the module id named. What is new
// here is only the MERGE into a live, partially-answered store — the demo
// runner resolves a whole flow in one pure pass and has no `offered`
// concept, so it cannot be reused wholesale (research R1).

import type { QuestionModule } from "../survey/types.ts";
import { useDecisionStore } from "../stores/decisionStore.ts";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { questionRegistry } from "../survey/questions/registry.ts";
import type { Decision, DecisionId, DecisionSet } from "./decisionTypes.ts";
import { deepEqual } from "./deepEqual.ts";
import type { ExtractContext } from "./extractContext.ts";
import { buildExtractContext } from "./extractContext.ts";
import { filterGated, orderDecisions } from "./orderDecisions.ts";
import { deriveSurveyContext } from "./identitySelectors.ts";
import { prefill as prefillWelcomeParagraph } from "../lib/adaptiveDescription.ts";
import {
  proposeProjectUrl,
  proposeProvenanceBasis,
} from "../lib/phaseFSeeds.ts";
import type { PhaseFSeedContext } from "../lib/phaseFSeeds.ts";

/** The slice of the decision store the pass writes through. */
export interface LiveExtractionStore {
  readonly decisions: DecisionSet;
  recordAll: (rs: readonly Decision[]) => void;
}

export interface LiveExtractionDeps {
  /** The live registry, any order — the pass walks it in derived order. */
  modules: readonly QuestionModule[];
  /** The starting-point bundle, built post-setup (buildExtractContext). */
  ctx: ExtractContext;
  store: LiveExtractionStore;
}

export interface LiveExtractionResult {
  /** Decision ids the pass seeded (records it wrote as extracted/default). */
  seeded: DecisionId[];
  /** Decision ids whose existing answer gained an `offered` value. */
  offered: DecisionId[];
}

/**
 * Snapshot a module's declared input values from the set as it stands
 * now: its `requires` (ordering dependencies) ∪ its `snapshotInputs`
 * (spec 092 G-14 / ruling A2 — data dependencies that are not order
 * facts, e.g. il_copyright_holder's authoring-track). `requires` first,
 * so a record's snapshot key order matches the pre-A2 shape for modules
 * whose dependencies all live in `requires`.
 */
function snapshotInputs(
  m: QuestionModule,
  decisions: DecisionSet,
): Partial<Record<DecisionId, unknown>> | undefined {
  const declared: DecisionId[] = [];
  for (const id of m.requires ?? []) {
    if (!declared.includes(id)) declared.push(id);
  }
  for (const id of m.snapshotInputs ?? []) {
    if (!declared.includes(id)) declared.push(id);
  }
  if (declared.length === 0) return undefined;
  const snapshot: Partial<Record<DecisionId, unknown>> = {};
  for (const required of declared) {
    const record = decisions[required];
    if (record !== undefined) snapshot[required] = record.value;
  }
  return snapshot;
}

function namedThrow(moduleId: string, what: string, err: unknown): Error {
  return new Error(
    `${what} for module "${moduleId}" threw: ${err instanceof Error ? err.message : String(err)}`,
  );
}

/**
 * Run the extraction pass. All writes are computed against a working copy
 * of the store and flushed with one `recordAll` at the end, so a throwing
 * module aborts the pass with NOTHING written — a broken extractor is a
 * loud defect, never a partial seed. Idempotent over an unchanged store +
 * bundle: pass-written records are re-seeded with identical values, and
 * author answers only gain/update `offered`. Idempotence is at the STORE
 * level, not just the value level: a re-seed (or an offer) that would
 * store exactly what is already held writes NOTHING. `recordAll` replaces
 * record objects wholesale, so an identical re-seed would still churn the
 * decisions map's identity and re-render every subscriber — and the
 * runner's question-push re-run (G-9) invokes this pass from inside a
 * render, where that churn closes an infinite render loop (pass →
 * recordAll → re-render → pass → …; the flow-driver integration tests
 * hung on exactly this until the no-op was enforced here).
 */
export function runLiveExtraction(deps: LiveExtractionDeps): LiveExtractionResult {
  const { modules, ctx, store } = deps;
  const source =
    ctx.catalog?.id ?? ctx.ir?.header.keyboardId ?? ctx.ir?.header.name;

  const working: Record<string, Decision<unknown>> = { ...store.decisions };
  const writes: Decision[] = [];
  const seeded: DecisionId[] = [];
  const offered: DecisionId[] = [];

  // Gating: derived from conditional `next` routing and evaluated ONCE,
  // upfront, against the store's pre-pass decisions — exactly as the demo
  // runner evaluates it (filterGated over the initial set). Evaluating
  // against the accumulating set instead would let a value this pass
  // seeds (e.g. pf_more_detail_gate's "false" lookup default) close the
  // gate on the very questions behind it before they are seeded; an
  // unanswered gate leaves its questions potentially visible, so they
  // seed now and simply never render if the author closes the gate.
  const active = filterGated(orderDecisions(modules), store.decisions);
  for (const m of active) {
    const provided = m.provides;
    if (provided === undefined || provided.length === 0) continue;

    // Declared seeding disposition (spec 092): false = this module's value
    // must not seed or be offered at all under the current decisions
    // (e.g. the copyright holder on the copy track).
    if (m.seedWhen !== undefined) {
      let allowed: boolean;
      try {
        allowed = m.seedWhen(working);
      } catch (err) {
        throw namedThrow(m.definition.id, "seedWhen", err);
      }
      if (!allowed) continue;
    }

    // Extract, then validate: an extracted value the question itself would
    // reject is treated as absent (087 fix 4). A null extract is absent.
    let value: unknown;
    let provenance: Decision<unknown>["provenance"] | undefined;
    let valueSource: string | undefined;
    if (m.extract !== undefined) {
      try {
        value = m.extract(ctx);
      } catch (err) {
        throw namedThrow(m.definition.id, "extract()", err);
      }
      if (value === null) value = undefined;
      if (value !== undefined) {
        provenance = "extracted";
        valueSource = source;
      }
    }
    // Lookup default: only when the starting point carried no evidence.
    if (value === undefined && m.lookupDefault !== undefined) {
      let dflt: { value: unknown; source?: string } | undefined;
      try {
        dflt = m.lookupDefault(ctx);
      } catch (err) {
        throw namedThrow(m.definition.id, "lookupDefault()", err);
      }
      if (dflt !== undefined && dflt.value !== undefined && dflt.value !== null) {
        value = dflt.value;
        provenance = "default";
        valueSource = dflt.source;
      }
    }
    if (value === undefined || provenance === undefined) continue;

    if (m.validate !== undefined) {
      let result;
      try {
        result = m.validate(value as string | string[] | undefined);
      } catch (err) {
        throw namedThrow(m.definition.id, "validate()", err);
      }
      if (!result.ok) continue;
    }

    const inputs = snapshotInputs(m, working);
    for (const p of provided) {
      const existing = working[p];
      if (
        existing === undefined ||
        existing.provenance === "extracted" ||
        existing.provenance === "default"
      ) {
        // Unanswered, or a record this pass (or a previous one) seeded:
        // (re-)seed. Author-shaped records (asked/derived) never reach
        // this branch — they are answered by definition here.
        const record: Decision = {
          id: p,
          value,
          provenance,
          ...(valueSource !== undefined ? { source: valueSource } : {}),
          ...(inputs !== undefined ? { inputs } : {}),
        };
        // Store-level idempotence (see the pass docstring): the record
        // already held is exactly this record — writing it again would
        // replace the object and churn the decisions map for no change.
        if (existing !== undefined && deepEqual(existing, record)) {
          continue;
        }
        working[p] = record;
        writes.push(record);
        seeded.push(p);
      } else if (!deepEqual(existing.value, value)) {
        // Already answered: the author's record stands untouched except
        // for `offered` — the extracted/defaulted value beside the answer,
        // never over it. An identical value is not an offer, and an offer
        // already standing is not a new write (same idempotence contract).
        if (deepEqual(existing.offered, value)) {
          continue;
        }
        const record: Decision = { ...existing, offered: value };
        working[p] = record;
        writes.push(record);
        offered.push(p);
      }
    }
  }

  store.recordAll(writes);
  return { seeded, offered };
}

/**
 * Build the live extract context from the working-copy store's base
 * slots, including the Phase F augmentation (spec 092 T036). Shared by
 * the extraction pass and by spec 093's rebuild wiring (re-extraction
 * during recalculation must read the same bundle the seeding pass read).
 */
export function buildLiveExtractContext(): ExtractContext {
  const wc = useWorkingCopyStore.getState();
  const ctx = buildExtractContext(wc.baseIr, wc.baseKeyboard);
  // Spec 092 (T036): Phase F's derivations read working-copy slices and
  // two identity-derived values that are not part of the bundle — supply
  // them from the same stores the old PHASE_F_SEEDS readers read, so the
  // pf_* modules' extracts/lookup defaults resolve identically. The
  // derivations are computed HERE, in the wiring (G-17): the pf_*
  // modules import nothing from lib/ (mutate-seam rule) and read the
  // computed proposals off the context, the welcome-prefill pattern.
  const surveyContext = deriveSurveyContext(useDecisionStore.getState().decisions);
  const welcomePrefill = prefillWelcomeParagraph({
    instantiationMode: wc.instantiationMode,
    baseDocProfile: wc.baseDocProfile,
    baseWelcomeHtmText: wc.baseWelcomeHtmText,
    baseHelpPhpText: wc.baseHelpPhpText,
  });
  const seedContext: PhaseFSeedContext = {
    instantiationMode: wc.instantiationMode,
    baseKeyboard: wc.baseKeyboard,
    baseVfs: wc.baseVfs,
  };
  const projectUrlProposal = proposeProjectUrl(seedContext);
  const provenanceBasisProposal = proposeProvenanceBasis(seedContext);
  ctx.phaseF = {
    ...(welcomePrefill !== undefined ? { welcomePrefill } : {}),
    ...(projectUrlProposal !== undefined ? { projectUrlProposal } : {}),
    ...(provenanceBasisProposal !== undefined
      ? { provenanceBasisProposal }
      : {}),
    ...(surveyContext["author_contact"] !== undefined
      ? { authorContact: surveyContext["author_contact"] }
      : {}),
    ...(surveyContext["bcp47_tag"] !== undefined
      ? { bcp47Tag: surveyContext["bcp47_tag"] }
      : {}),
  };
  return ctx;
}

/**
 * The live wiring (T012): build the bundle from the working-copy store's
 * post-setup slots (`baseIr`, `baseKeyboard`) and run the pass over the
 * live registry against the live decision store. Called from the setup
 * commit (StudioShell's `doCommit`, spec 092 T013) — synchronously, once
 * per instantiation, never on a timer or per step.
 */
export function runLiveExtractionFromStores(): LiveExtractionResult {
  return runLiveExtraction({
    modules: Object.values(questionRegistry),
    ctx: buildLiveExtractContext(),
    store: useDecisionStore.getState(),
  });
}
