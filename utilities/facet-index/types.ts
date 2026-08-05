/**
 * Shared types for the per-keyboard facet index (spec 036).
 *
 * These mirror data-model.md Entities 1–3 and contracts/facet-index.schema.md.
 * Per the spec Assumption the facet schema is content-owned DATA, not a locked
 * `packages/contracts` type — so these live in the tool, not in contracts. The
 * one thing we DO reuse from contracts is `ImportStatus`: the analysis-outcome
 * model maps from it rather than forking a parallel enum (research D5).
 */

import type { ImportStatus } from "@keyboard-studio/contracts";

// ---------------------------------------------------------------------------
// Small enums (data-model Entity 2)
// ---------------------------------------------------------------------------

/** Which tier produced a categorization (FR-004). */
export type ProvenanceTier = "content-derived" | "declared-metadata" | "default-fallback";

/**
 * How much of the keyboard the analysis actually saw (FR-010). Maps 1:1 from
 * `ImportStatus`: Clean → fully, CleanWithOpaque → partially, ParseFailure →
 * fallback-only. `mapImportStatus` in outcome.ts (Phase 3) is the single
 * conversion point; do not fork it.
 */
export type AnalysisOutcome = "fully" | "partially" | "fallback-only";

/** 037's tri-state confidence; never forces a single value (FR-003). */
export type ConfidenceClass = "confident" | "mixed" | "undetermined";

/** The `valueType` kinds a facet definition may declare (FR-002). */
export type FacetValueType = "enum" | "set" | "scalar" | "histogram";

/** The evidence archetype a classifier reads (037 owns the algorithm). */
export type DerivationArchetype = "character-content" | "rule-structure" | "declared-metadata";

// ---------------------------------------------------------------------------
// Construction-facet measurement model (spec 041, data-model Entities 2–4)
// ---------------------------------------------------------------------------

/**
 * Why an exception site deviates from a facet's dominant value (spec 041 §4).
 * `principled-split` / `capacity-forced` are assigned by a fitting cause
 * predicate (cause-predicates.ts); `gap-omission` is the residue when no
 * predicate fits (FR-002). Content-team-extensible via the predicate library.
 */
export type CauseTag = "principled-split" | "capacity-forced" | "gap-omission";

/**
 * One analyzed site whose value deviates from the dominant (build-time only,
 * never serialized — only the aggregated `causeTagCounts` reaches the index,
 * FR-005). `location` is a deterministic, human-auditable rule/store/layout
 * locator.
 */
export interface ExceptionSite {
  location: string;
  observedValue: string;
  causeTag: CauseTag;
}

/**
 * Inputs the shared measurement assembly (measurement.ts) and the cause
 * predicates read, so guards/fits and the not-applicable rules see the same
 * script identity + coverage (data-model Entity 4). `scriptFamily` is the
 * dominant ISO-15924 script code reused from the `script` classifier (not
 * re-derived); `casing` gates `caps-handling` not-applicability (FR-013).
 */
export interface ClassifierContext {
  /** Dominant ISO-15924 script code (e.g. "Latn"), or null when undetermined. */
  scriptFamily: string | null;
  casing: "cased" | "caseless" | "mixed";
  /** Opaque-share-aware: exception enumeration excludes opaque regions (Edge Case). */
  analyzedCoverage: number;
}

// ---------------------------------------------------------------------------
// Entity 1 — Facet definition (content/keyboard-facets/<id>.yaml)
// ---------------------------------------------------------------------------

/** The closed value list (enum/set/histogram) or numeric domain (scalar). */
export interface FacetLimits {
  /** Closed value list, e.g. ISO-15924 codes. Present for enum/set/histogram. */
  values?: string[];
  /** Inclusive numeric domain [min, max]. Present for scalar. */
  domain?: [number, number];
  /** `true` = open set (documented exception; still shape-validated). Default false. */
  open?: boolean;
}

/** Ordered fallback-tier ids the derivation walks (FR-004). */
export interface FacetDerivation {
  archetype: DerivationArchetype;
  /** Names the 037 classifier; its version participates in freshness. */
  classifierId: string;
  /** e.g. [content-derived, declared-metadata, default-fallback, undetermined]. */
  fallbackChain: string[];
}

/** One keyboard-level facet declaration (data-model Entity 1). */
export interface FacetDefinition {
  id: string;
  title: string;
  description: string;
  valueType: FacetValueType;
  limits: FacetLimits;
  likelihoodSemantics: string;
  derivation: FacetDerivation;
  /** `content/facets/` ids whose `corpus:` derivation this feeds (FR-009). */
  feedsSessionFacets: string[];
  /** Facet-specific extra dimensions (opaque to the index shell). (037) reserved — no classifier populates `Categorization.subProfile` from this yet. */
  subProfiles?: Record<string, unknown>;
  /** Bump forces recompute of this facet's records. */
  schemaVersion: number;
}

// ---------------------------------------------------------------------------
// Entity 2 — Keyboard categorization (one keyboard × one facet)
// ---------------------------------------------------------------------------

/** One keyboard's value for one facet (data-model Entity 2). */
export interface Categorization {
  /** Dominant value (enum/histogram), member set (set), or number (scalar). */
  value: unknown;
  /** Likelihood distribution over facet values; sums to ~1 (FR-003). Sorted keys. */
  distribution?: Record<string, number>;
  /** Confidence for a single value, or null when the distribution carries it. */
  confidence: number | null;
  confidenceClass: ConfidenceClass;
  provenanceTier: ProvenanceTier;
  /** e.g. count of concretely-scripted characters — lets consumers weight. */
  evidenceSize: number;
  /** Fraction of rule output analyzable (1 − opaque share). */
  analyzedCoverage: number;
  analysisOutcome: AnalysisOutcome;
  /** e.g. declaration/artifact mismatch flag. */
  notes?: string;
  /** (037) share of analyzable content matching no recognized value. */
  residue?: number;
  /** (037) per-record facet-specific sub-classification hint (opaque here). */
  subProfile?: Record<string, unknown>;
  /**
   * (041) Share of analyzed sites matching the dominant `value` ∈ [0,1]. 1 =
   * fully consistent (no exceptions). Distinct from `confidence`/`residue`
   * (data-model Entity 1). Absent for facets that don't measure consistency.
   */
  consistency?: number;
  /**
   * (041) Summary of exception causes — count per `CauseTag` (FR-005). Omitted
   * when `consistency === 1` (no exceptions to explain). Values sum to the
   * exception-site count; the per-site enumeration is recomputed at build, never
   * stored.
   */
  causeTagCounts?: Partial<Record<CauseTag, number>>;
  /**
   * (041) Set when the facet does not apply to this keyboard (caseless →
   * caps-handling, abugida/abjad → normalization, no touch layout → touch
   * facets). Emitted with `value: undefined`, `provenanceTier:
   * "content-derived"`, and an explanatory `notes` — never a forced value or a
   * `default-fallback` tier (data-model Entity 1, FR-013/014/022).
   */
  notApplicable?: true;
}

// ---------------------------------------------------------------------------
// Per-keyboard freshness (shared across a keyboard's facets)
// ---------------------------------------------------------------------------

/** Gates incremental rescan (FR-005). Stored once per keyboard, not per facet. */
export interface Freshness {
  /** The `.kmn` + sibling files the record set was derived from → sha256. */
  sourceHashes: Record<string, string>;
  /** The `scannerVersion` this record set was produced under. */
  analyzedAtScannerVersion: string;
}

/** One keyboard's slot in the index. */
export interface KeyboardRecord {
  freshness: Freshness;
  /** One categorization per defined facet (sorted by facetId). */
  facets: Record<string, Categorization>;
}

// ---------------------------------------------------------------------------
// Entity 3 — Index manifest
// ---------------------------------------------------------------------------

/** Per-facet tier counts (SC-002 measured, not assumed). */
export interface FacetTierCounts {
  content: number;
  declared: number;
  fallback: number;
  undetermined: number;
}

/** A pinned reference-data file recorded in the manifest. */
export interface ReferencePin {
  file: string;
  sha256: string;
}

/** Build-level metadata sufficient to decide rescan and audit (data-model Entity 3). */
export interface IndexManifest {
  /** The index-shell schema version (distinct from per-facet schemaVersion). */
  schemaVersion: number;
  /** Combined tool+schema+classifier version; bump ⇒ full content-derived recompute. */
  scannerVersion: string;
  /** The `../keyboards` commit the scan ran against. */
  corpusCommit: string;
  /** `release/**` (v1). */
  corpusScope: string;
  /** Pinned UCD release, e.g. `17.0.0`. */
  unicodeVersion: string;
  /** The 4 pinned UCD files + langtags pin ref. Mirrors data/SOURCES.json. */
  referencePins: ReferencePin[];
  keyboardCount: number;
  facetCoverage: Record<string, FacetTierCounts>;
  /** Facets present in this build (sorted). */
  facetIds: string[];
}

// ---------------------------------------------------------------------------
// Top-level artifact (docs/keyboard-facet-index.json)
// ---------------------------------------------------------------------------

/** The whole committed index (data-model "Top-level artifact shape"). */
export interface FacetIndex {
  manifest: IndexManifest;
  /** Keyed by keyboard id (sorted). */
  keyboards: Record<string, KeyboardRecord>;
}

// Re-export ImportStatus so downstream tool modules import their whole outcome
// vocabulary from one place without also reaching into contracts directly.
export type { ImportStatus };
