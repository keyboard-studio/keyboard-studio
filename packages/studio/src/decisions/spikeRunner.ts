// Decision-spike runner (km/decisions-spike).
//
// Pure harness (no React): walks modules in derived order, resolving each
// decision by EXTRACTING it from a base keyboard's IR when a probe exists, or
// ASKING (stub answers in tests; the real runner later) otherwise. Proves the
// ask → extract → adapt loop without touching SurveyRunner or loadModularFlow.

import type { KeyboardIR } from "@keyboard-studio/contracts";
import type { QuestionModule } from "../survey/types.ts";
import type { Decision, DecisionSet } from "./decisionTypes.ts";
import { orderDecisions } from "./orderDecisions.ts";

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
    if (m.gatedBy && !m.gatedBy(decisions)) continue;
    if (m.provides === undefined) continue;

    let decision: Decision<unknown>;
    const extracted = baseIR !== undefined && m.extract !== undefined
      ? m.extract(baseIR)
      : undefined;
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
