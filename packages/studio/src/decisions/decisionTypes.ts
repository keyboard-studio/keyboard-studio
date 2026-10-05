// Decision-spike types (km/decisions-spike).
//
// A Decision is the single unit everything else views: a question module ASKS
// for it, an `extract()` probe reads it from a base keyboard's IR, and a
// renderer EDITS it. One id space, three views — this is what lets questions
// be added, removed, and reordered without touching any flow glue.

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
