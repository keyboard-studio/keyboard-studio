/**
 * The author's per-carved-combination allow/block choice.
 *
 * Lives in the studio working-copy store, never in the IR or the emitted
 * keyboard. One record per carved combination, keyed by `comboId` (the
 * carve-node id: rule `nodeId`, or `<storeNodeId>#<index>` for slot carves).
 *
 * State transitions: created on carve (pre-filled per `provenance`) →
 * optionally flipped by the author (provenance becomes `"author-override"`,
 * value toggles) → read (never modified) on every recompile → deleted on
 * un-carve. Recompile never writes a disposition except for genuinely new
 * combos; stale entries (whose `comboId` no longer resolves to a live carve
 * node) are dropped at read time, never resurrected.
 *
 * @see specs/076-rule-behaviours/data-model.md — "## CarveDisposition (new, @keyboard-studio/contracts)"
 * @see specs/076-rule-behaviours/contracts/carve-disposition.md
 * @see spec.md FR-022
 */

/** The author's choice for one carved combination: suppress it, or let the typist's host layout decide. */
export type CarveDispositionValue = "block" | "allow-host";

/**
 * Where the disposition value came from. Pre-fill writes one of the first
 * three; the author flipping the gallery row writes `"author-override"`.
 * Informational — it does not affect compilation.
 */
export type CarveDispositionProvenance =
  /** The closed-keyboard card was accepted → pre-fill `block`. */
  | "closed-keyboard-card"
  /** The closed-keyboard card was declined (sparse Latin overlay) → pre-fill `allow-host`. */
  | "closed-keyboard-card-declined"
  /** The card is not yet answered; pre-fill follows the FR-005 proposal rule. */
  | "bulk-default"
  /** The author flipped this row in the carve gallery; the value is theirs. */
  | "author-override"
  /**
   * The row is a deadkey-context carve — the ruling forbids host fallback for
   * deadkey carves ("deadkey carves never fall through"), so pre-fill is
   * `block` regardless of the bulk default. The gallery offers no Allow
   * option for these rows.
   */
  | "deadkey-requirement";

/** Per carved combination, the author's allow/block choice. */
export interface CarveDisposition {
  /** The carve-node id: rule nodeId, or <storeNodeId>#<index> for slot carves. */
  comboId: string;
  /** The author's choice for this combination. */
  disposition: CarveDispositionValue;
  /** Where the value came from; informational, does not affect compilation. */
  provenance: CarveDispositionProvenance;
}
