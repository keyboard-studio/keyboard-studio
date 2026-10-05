// Decision-spike runner (km/decisions-spike).
//
// Pure harness (no React): walks modules in derived order, resolving each
// decision by EXTRACTING it from a base keyboard's IR when a probe exists, or
// ASKING (stub answers in tests; the real runner later) otherwise. Proves the
// ask → extract → adapt loop without touching SurveyRunner or loadModularFlow.

import type { KeyboardIR } from "@keyboard-studio/contracts";
import type { QuestionModule } from "../survey/types.ts";
import type { Decision, DecisionSet } from "./decisionTypes.ts";
import { effectiveGatedBy, orderDecisions } from "./orderDecisions.ts";

export interface SpikeRunInput {
  modules: readonly QuestionModule[];
  /** Base keyboard IR for `extract()` probes; absent = pure ask mode. */
  baseIR?: KeyboardIR;
  /** Stub answers keyed by module definition id (the "ask" view in tests). */
  answers?: Readonly<Record<string, unknown>>;
}

/**
 * Resolve every provided decision. For each module in derived order (skipping
 * gated-out branches): a defined `extract(baseIR)` result becomes
 * `{ provenance: "extracted", source: <base keyboard id> }`; otherwise the
 * stub answer becomes `{ provenance: "asked" }`; neither becomes
 * `{ provenance: "default", value: undefined }`.
 */
export function runSpikeDecisionFlow(input: SpikeRunInput): DecisionSet {
  const { modules, baseIR, answers = {} } = input;
  const baseId = baseIR?.header.keyboardId ?? baseIR?.header.name;
  const decisions: Record<string, Decision<unknown>> = {};

  for (const m of orderDecisions(modules)) {
    // Gate: hand-written gatedBy wins, otherwise derived from conditional
    // `next` routing. A throwing gate aborts the run — wrapped with the
    // module id so the failure names its source.
    const gate = effectiveGatedBy(m, modules);
    if (gate !== undefined) {
      let pass: boolean;
      try {
        pass = gate(decisions);
      } catch (err) {
        throw new Error(
          `gatedBy for module "${m.definition.id}" threw: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      if (!pass) continue;
    }
    if (m.provides === undefined) continue;

    let decision: Decision<unknown>;
    // Extract, then validate: an extracted value the question itself would
    // reject is treated as absent — fall through to asked/default rather
    // than injecting an invalid decision (km/decisions-spike fix 4).
    // A throwing extract/validate aborts the run, wrapped with the module
    // id so the failure names its source.
    let extracted: unknown;
    if (baseIR !== undefined && m.extract !== undefined) {
      try {
        extracted = m.extract(baseIR);
      } catch (err) {
        throw new Error(
          `extract() for module "${m.definition.id}" threw: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      // A null extract carries no value — normalize to absent (the contract
      // is "return undefined when the base keyboard carries no evidence").
      if (extracted === null) extracted = undefined;
      if (extracted !== undefined && m.validate !== undefined) {
        let result;
        try {
          result = m.validate(extracted as string | string[] | undefined);
        } catch (err) {
          throw new Error(
            `validate() for module "${m.definition.id}" threw on an extracted value: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
        if (!result.ok) extracted = undefined;
      }
    }
    if (extracted !== undefined) {
      decision = {
        id: m.provides,
        value: extracted,
        provenance: "extracted",
        // exactOptionalPropertyTypes: only set source when we have one.
        ...(baseId !== undefined ? { source: baseId } : {}),
      };
    } else if (m.definition.id in answers) {
      decision = { id: m.provides, value: answers[m.definition.id], provenance: "asked" };
    } else {
      decision = { id: m.provides, value: undefined, provenance: "default" };
    }
    decisions[m.provides] = decision;
  }

  return decisions;
}
