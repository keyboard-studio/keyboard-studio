// answerFilledIds — the decisions a question's answer (or its extraction) fills.
//
// A module's `provides` lists every decision it is responsible for. By default
// its single answer fills each one (spec 087 Q4: broadcast). A module that
// records some of them itself through its renderer (`rendererWrites`, spec 115)
// must not have those overwritten with the answer value, so every writer that
// fans an answer out over `provides` goes through this one function.

import type { DecisionId } from "../../decisions/decisionTypes.ts";
import type { QuestionModule } from "../types.ts";

export function answerFilledIds(mod: Pick<QuestionModule, "provides" | "rendererWrites">): readonly DecisionId[] {
  const own = new Set<DecisionId>(mod.rendererWrites ?? []);
  return (mod.provides ?? []).filter((id) => !own.has(id));
}
