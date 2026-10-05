// Decision-spike types (km/decisions-spike).
//
// A Decision is the single unit everything else views: a question module ASKS
// for it, an `extract()` probe reads it from a base keyboard's IR, and a
// renderer EDITS it. One id space, three views — this is what lets questions
// be added, removed, and reordered without touching any flow glue.

import type { IRPath } from "@keyboard-studio/contracts";

/** The typed facts the spike tracks, by stable id. */
export type DecisionId =
  | "language-name"
  | "language-region"
  | "language-autonym"
  | "language-code"
  | "target-script"
  | "author-name"
  | "author-email"
  | "copyright-holder"
  | "character-inventory";

/** Where a decision's value came from. */
export type DecisionProvenance = "asked" | "extracted" | "default";

/**
 * One resolved fact about the keyboard.
 *
 * `source` names the origin for extracted values (e.g. the base keyboard id),
 * so a future UI can render "from sil_cameroon_qwerty — tap to change".
 */
export interface Decision<T = unknown> {
  id: DecisionId;
  value: T;
  provenance: DecisionProvenance;
  source?: string;
}

/**
 * The resolved decisions so far. Partial by design: gated-out or never-asked
 * decisions simply have no entry (an exact Record would force placeholder
 * entries for questions the author was never asked).
 */
export type DecisionSet = Readonly<Partial<Record<DecisionId, Decision<unknown>>>>;

/**
 * The one prop contract every decision renderer satisfies (km/decisions-spike
 * fix 3). The runner owns the value; the renderer only renders and reports.
 * `T` is the module's answer type (e.g. `string[]` for a character
 * inventory); the registry field uses `DecisionRendererProps<any>` because
 * modules in one registry carry different `T`s — the same heterogeneous-
 * registry pattern as `EditorStepProps` in steps/types.ts.
 */
export interface DecisionRendererProps<T = unknown> {
  value: T | undefined;
  onChange: (value: T) => void;
  decisionId: DecisionId;
}

/**
 * Declared relation between each decision and the KeyboardIR locations it
 * populates (km/decisions-spike fix 1).
 *
 * This is what keeps the two dependency graphs — ordering (`provides` /
 * `requires`) and data flow (`inputs` / `writes`) — from diverging silently:
 * `decisionIRConsistency.test.ts` asserts every provider's declared `writes`
 * covers its mapped paths (each mapped path must be a prefix of, or equal to,
 * a declared write). The `Record` type makes the map exhaustive at compile
 * time: a new DecisionId cannot be added without declaring its IR relation.
 *
 * Today every spike decision reaches its artifact through `outputs`
 * (package-descriptor), not IR writes, so all entries are `[]` — the map is
 * the declared relation, and the lint enforces coverage as later phases give
 * decisions real IR writes.
 */
export const decisionIRPaths: Record<DecisionId, readonly IRPath[]> = {
  "language-name": [],
  "language-region": [],
  "language-autonym": [],
  "language-code": [],
  "target-script": [],
  "author-name": [],
  "author-email": [],
  "copyright-holder": [],
  "character-inventory": [],
};
