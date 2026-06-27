// Per-question module: pb_routing_branch (Phase B)
// Ported verbatim from content/flows/phase_b_characters.yaml.
//
// This is an engine-resolved node (never rendered to the user).
// The engine evaluates ctx.routing_group and jumps to the correct branch.

import type { QuestionModule } from "../../types.ts";

export const definition = {
  id: "pb_routing_branch",
  // type is required by FlowQuestion; "notice" is used here as a stub since
  // engine_resolved nodes are never rendered — the type field is irrelevant.
  type: "notice" as const,
  engine_resolved: true,
  next: [
    { condition: "ctx.routing_group == 'non-roman'", goto: "pb_non_roman_branch" },
    { default: true, goto: "pb_standard_letters" },
  ],
} satisfies import("../../types.ts").FlowQuestion;

// No validate: engine-resolved nodes are never shown to the user.

export const fixtures: QuestionModule["fixtures"] = {
  valid: [],
  invalid: [],
};


const mod: QuestionModule = { definition, fixtures, inputs: [], writes: [] };
export default mod;
