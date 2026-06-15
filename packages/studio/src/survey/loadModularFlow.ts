// Modular flow loader.
//
// ROUTING DECISION (B): Routing lives in each question module's definition.next
// field rather than in the thin YAML list. This keeps all per-question behaviour
// (definition, validate, mutate stub, fixtures) colocated in one module file,
// so contributors adding or editing a question only touch a single file. The
// thin YAML becomes a pure declaration of membership (which questions belong to
// this flow, in order), not a routing table.
//
// The thin YAML shape:
//   flow_id:  <string>
//   phase:    <"A" | "B" | ... | "G">
//   questions:            [id1, id2, ...]
//   provenance_questions: [id1, id2, ...]   # optional
//
// loadModularFlow() is additive — it does NOT replace loadFlow.ts (which handles
// the existing full-YAML phases during the fan-out period). Both loaders return
// a FlowDef and can be consumed by SurveyRunner without modification.

import { parse } from "yaml";
import type { FlowDef } from "./types.ts";
import { questionRegistry } from "./questions/registry.ts";
import { VALID_PHASES } from "./constants.ts";

// ---------------------------------------------------------------------------
// Thin YAML shape
// ---------------------------------------------------------------------------

interface ThinFlowYaml {
  flow_id: string;
  phase: string;
  questions: string[];
  provenance_questions?: string[] | undefined;
}

/**
 * Parse a thin-YAML string into a ThinFlowYaml.
 * Throws descriptively on any structural violation.
 */
function parseThinYaml(raw: string): ThinFlowYaml {
  const parsed = parse(raw) as unknown;
  if (parsed === null || typeof parsed !== "object") {
    throw new Error("loadModularFlow: YAML root must be an object");
  }
  const p = parsed as Record<string, unknown>;

  if (typeof p["flow_id"] !== "string" || p["flow_id"].length === 0) {
    throw new Error("loadModularFlow: missing or empty flow_id");
  }
  if (typeof p["phase"] !== "string" || !VALID_PHASES.has(p["phase"])) {
    throw new Error(`loadModularFlow: missing or unknown phase (got ${String(p["phase"])})`);
  }
  if (!Array.isArray(p["questions"])) {
    throw new Error("loadModularFlow: questions must be an array");
  }
  for (const entry of p["questions"] as unknown[]) {
    if (typeof entry !== "string") {
      throw new Error("loadModularFlow: each entry in questions must be a string ID");
    }
  }
  if (p["provenance_questions"] !== undefined) {
    if (!Array.isArray(p["provenance_questions"])) {
      throw new Error("loadModularFlow: provenance_questions must be an array if present");
    }
    for (const entry of p["provenance_questions"] as unknown[]) {
      if (typeof entry !== "string") {
        throw new Error(
          "loadModularFlow: each entry in provenance_questions must be a string ID",
        );
      }
    }
  }

  return {
    flow_id: p["flow_id"] as string,
    phase: p["phase"] as string,
    questions: p["questions"] as string[],
    provenance_questions: p["provenance_questions"] as string[] | undefined,
  };
}

/**
 * Resolve a list of question IDs against the registry.
 * Throws if the list is empty (an empty flow is structurally meaningless and
 * SurveyRunner's behaviour on it is undefined) or if any ID is unregistered —
 * fail fast beats silent gaps.
 */
function resolveIds(ids: string[]): FlowDef["questions"] {
  if (ids.length === 0) {
    throw new Error("loadModularFlow: questions list must not be empty");
  }
  return ids.map((id) => {
    const mod = questionRegistry[id];
    if (mod === undefined) {
      throw new Error(
        `loadModularFlow: question ID "${id}" not found in registry. ` +
          `Add it to packages/studio/src/survey/questions/registry.ts.`,
      );
    }
    return mod.definition;
  });
}

/**
 * Load a thin-YAML string (from a Vite ?raw import or inline test string) into
 * a FlowDef that SurveyRunner can consume without modification.
 *
 * The returned FlowDef is structurally identical to what parseFlow() returns for
 * full-YAML phases — SurveyRunner sees no difference.
 */
export function loadModularFlow(raw: string): FlowDef {
  const thin = parseThinYaml(raw);
  const questions = resolveIds(thin.questions);
  const provenanceQuestions =
    thin.provenance_questions !== undefined
      ? resolveIds(thin.provenance_questions)
      : undefined;

  const result: FlowDef = {
    flow_id: thin.flow_id,
    phase: thin.phase,
    questions,
    ...(provenanceQuestions !== undefined
      ? { provenance_questions: provenanceQuestions }
      : {}),
  };
  return result;
}
