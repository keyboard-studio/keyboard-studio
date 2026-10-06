// Decision flow runner (spec 087).
//
// Pure harness (no React): walks modules in derived order, resolving each
// provided decision by EXTRACTING it from the import bundle when a probe
// exists, or ASKING (stub answers in tests; the real runner later)
// otherwise. Replaces the fixture-based spike runner: the bundle (parsed IR
// + catalog metadata) is the only extraction input.

import type { QuestionModule } from "../survey/types.ts";
import type { Decision, DecisionSet } from "./decisionTypes.ts";
import type { ExtractContext } from "./extractContext.ts";
import { effectiveGatedBy, orderDecisions } from "./orderDecisions.ts";

export interface DecisionFlowInput {
  modules: readonly QuestionModule[];
  /** The import bundle: parsed IR + catalog metadata; absent = pure ask mode. */
  context?: ExtractContext | undefined;
  /** Stub answers keyed by module definition id (the "ask" view in tests). */
  answers?: Readonly<Record<string, unknown>> | undefined;
}

/**
 * Resolve every provided decision. For each module in derived order (skipping
 * gated-out branches): a defined `extract(ctx)` result becomes
 * `{ provenance: "extracted", source: <base keyboard identity> }`; otherwise
 * the stub answer becomes `{ provenance: "asked" }`; neither becomes
 * `{ provenance: "default", value: undefined }`.
 *
 * The source identity prefers the catalog id (stable across re-imports),
 * falling back to the IR header for non-catalog imports.
 */
export function runDecisionFlow(input: DecisionFlowInput): DecisionSet {
  const { modules, context, answers = {} } = input;
  const source =
    context?.catalog?.id ??
    context?.ir?.header.keyboardId ??
    context?.ir?.header.name;
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
    const provided = m.provides;
    if (provided === undefined || provided.length === 0) continue;

    // Extract, then validate: an extracted value the question itself would
    // reject is treated as absent — fall through to asked/default rather
    // than injecting an invalid decision (km/decisions-spike fix 4).
    // A throwing extract/validate aborts the run, wrapped with the module
    // id so the failure names its source.
    let extracted: unknown;
    if (context !== undefined && m.extract !== undefined) {
      try {
        extracted = m.extract(context);
      } catch (err) {
        throw new Error(
          `extract() for module "${m.definition.id}" threw: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      // A null extract carries no value — normalize to absent (the contract
      // is "return undefined when the bundle carries no evidence").
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

    let value: unknown;
    let provenance: Decision<unknown>["provenance"];
    if (extracted !== undefined) {
      value = extracted;
      provenance = "extracted";
    } else if (m.definition.id in answers) {
      value = answers[m.definition.id];
      provenance = "asked";
    } else {
      value = undefined;
      provenance = "default";
    }
    // One Decision per provided id: the module's single answer/extract fills
    // each decision it provides (spec 087 Q4).
    for (const p of provided) {
      decisions[p] = {
        id: p,
        value,
        provenance,
        // exactOptionalPropertyTypes: only set source when we have one.
        ...(provenance === "extracted" && source !== undefined ? { source } : {}),
      };
    }
  }

  return decisions;
}
