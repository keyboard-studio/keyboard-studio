/**
 * Types for the single exemplar-sourcing path (spec 044).
 *
 * Kept in their own module so the studio store and the engine consumers can
 * import them without pulling in the generated index chunk that
 * `exemplarSource.ts` lazily loads.
 *
 * None of these are locked-contract types — `Pattern`, `Criterion`, and
 * `ConfirmedAlphabet` are untouched by this feature.
 */

/**
 * The four exemplar tiers in scope.
 *
 * LDML's `index` tier (collation headers) is deliberately excluded: it is
 * titlecased, so folding it in would duplicate the whole alphabet in uppercase.
 */
export type ExemplarTier = "main" | "auxiliary" | "punctuation" | "numbers";

/** Which of the two pinned sources attested a character. */
export type ExemplarSource = "cldr" | "sldr";

/**
 * SLDR LDML draft status, ranked. CLDR sets are release-gated and carry no
 * draft attribute, so they resolve to "approved".
 *
 * Confidence is **surfaced, never filtered on** — roughly a third of sampled
 * SLDR files are `generated`, and dropping those would discard most of the
 * coverage this feature exists to deliver.
 */
export type ExemplarConfidence =
  | "approved"
  | "contributed"
  | "tentative"
  | "unconfirmed"
  | "provisional"
  | "generated"
  | "suspect";

/**
 * Confidence ranks, highest first. Used to pick deterministically when one
 * SLDR file carries two sets of the same `type`; ties break by document order.
 */
export const EXEMPLAR_CONFIDENCE_RANK: readonly ExemplarConfidence[] = [
  "approved",
  "contributed",
  "tentative",
  "unconfirmed",
  "provisional",
  "generated",
  "suspect",
];

/**
 * Rank index of a draft status — lower is more confident. An unrecognized or
 * absent status resolves to "approved" (rank 0), matching LDML's default of
 * "no draft attribute means the value is final".
 */
export function confidenceRank(confidence: string | undefined): number {
  if (confidence === undefined) return 0;
  const i = EXEMPLAR_CONFIDENCE_RANK.indexOf(confidence as ExemplarConfidence);
  return i === -1 ? 0 : i;
}

/** Narrows an arbitrary LDML draft string to a known confidence, or "approved". */
export function toExemplarConfidence(draft: string | undefined): ExemplarConfidence {
  if (draft === undefined) return "approved";
  return EXEMPLAR_CONFIDENCE_RANK.includes(draft as ExemplarConfidence)
    ? (draft as ExemplarConfidence)
    : "approved";
}

/** Tier precedence, highest first — a character is recorded at its highest tier. */
export const EXEMPLAR_TIER_ORDER: readonly ExemplarTier[] = [
  "main",
  "auxiliary",
  "punctuation",
  "numbers",
];

export interface SourcedCharacter {
  /** NFC-normalized character or digraph cluster (FR-009). */
  char: string;
  tier: ExemplarTier;
  /** Per-character attribution (FR-004). */
  source: ExemplarSource;
  confidence: ExemplarConfidence;
}

/**
 * What the sourcing path returns for a covered tag.
 *
 * A `null` return instead means "no confident seed" — either neither source
 * covers the tag or the confidence gate fired. Callers fall through to the
 * whole-script behaviour exactly as before; nothing errors and nothing blocks
 * the survey.
 */
export interface SourcedInventory {
  /** The locale id actually resolved, e.g. "ewo" for a request of "ewo-Latn". */
  resolvedTag: string;
  /** The winning source — CLDR wins wherever both cover the tag. */
  source: ExemplarSource;
  confidence: ExemplarConfidence;
  characters: SourcedCharacter[];
  /** Multi-codepoint clusters the source wrote as `{..}`, e.g. "dz", "kp", "ng". */
  digraphs: string[];
}
