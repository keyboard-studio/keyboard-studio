// Draft migration (spec 087 T041, Q5).
//
// A draft saved under the old flow (answers keyed by question id) and
// opened after the migration maps its answers onto decisions at load.
// The mapping is derived from the modules' own `provides` declarations —
// the same single source as ordering — so it cannot drift from the
// registry. Answers with no mapping surface visibly for re-answer;
// nothing is silently dropped.

import type { QuestionModule } from "../survey/types.ts";
import type { Decision, DecisionSet, DecisionId } from "./decisionTypes.ts";

/**
 * Migration table version. Bump when the questionId → DecisionId mapping
 * changes shape; the version rides along on the result so a stale mapping
 * is detectable, never silent.
 */
export const DRAFT_MIGRATION_VERSION = 1;

/** An answer with no decision mapping — surfaced visibly, never dropped. */
export interface DraftOrphan {
  questionId: string;
  value: unknown;
}

export interface MigratedDraft {
  /** Mapped answers, each carrying asked provenance. */
  decisions: DecisionSet;
  /** Answers with no mapping — the author re-answers these. */
  orphans: DraftOrphan[];
  /** The DRAFT_MIGRATION_VERSION this mapping was built with. */
  version: number;
}

/**
 * Map a saved draft's answers onto decisions.
 *
 * @param answers questionId → answer value, as persisted by the old flow.
 * @param modules the current question modules (their `provides` is the mapping).
 * @returns decisions with asked provenance, plus orphans for visible re-answer.
 */
export function migrateDraft(
  answers: Readonly<Record<string, unknown>>,
  modules: readonly QuestionModule[],
): MigratedDraft {
  const byQuestionId = new Map<string, QuestionModule>();
  for (const m of modules) {
    // First wins: duplicate question ids are a registry bug, not a
    // migration decision — the duplicate-provider rule covers decisions.
    if (!byQuestionId.has(m.definition.id)) {
      byQuestionId.set(m.definition.id, m);
    }
  }

  const decisions: Record<string, Decision<unknown>> = {};
  const orphans: DraftOrphan[] = [];

  for (const [questionId, value] of Object.entries(answers)) {
    const mod = byQuestionId.get(questionId);
    const provided: readonly DecisionId[] = mod?.provides ?? [];
    if (provided.length === 0) {
      // Unknown question, or a module that provides no decision
      // (e.g. the terminal stub): surface for re-answer, never drop.
      orphans.push({ questionId, value });
      continue;
    }
    for (const id of provided) {
      decisions[id] = { id, value, provenance: "asked" };
    }
  }

  return { decisions, orphans, version: DRAFT_MIGRATION_VERSION };
}
