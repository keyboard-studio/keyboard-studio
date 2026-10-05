// Decision-spike runner (km/decisions-spike).
//
// Thin adapter over runDecisionFlow: the spike's fixture-style input
// (baseIR only, no catalog metadata) becomes an ExtractContext with a null
// catalog. The demo page uses this until T060 moves it onto decisionFlow.

import type { KeyboardIR } from "@keyboard-studio/contracts";
import type { QuestionModule } from "../survey/types.ts";
import type { DecisionSet } from "./decisionTypes.ts";
import { runDecisionFlow } from "./decisionFlow.ts";

export interface SpikeRunInput {
  modules: readonly QuestionModule[];
  /** Base keyboard IR for `extract()` probes; absent = pure ask mode. */
  baseIR?: KeyboardIR;
  /** Stub answers keyed by module definition id (the "ask" view in tests). */
  answers?: Readonly<Record<string, unknown>>;
}

/**
 * Resolve every provided decision (see runDecisionFlow). Kept so the
 * `?demo=decisions` page keeps working on the old input shape.
 */
export function runSpikeDecisionFlow(input: SpikeRunInput): DecisionSet {
  return runDecisionFlow({
    modules: input.modules,
    context:
      input.baseIR !== undefined ? { ir: input.baseIR, catalog: null } : undefined,
    answers: input.answers,
  });
}
