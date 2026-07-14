// Public types for @keyboard-studio/glottolog (spec 036, data-model.md).
// This package imports ONLY @keyboard-studio/contracts (research.md D8) — no
// engine/studio edge, so it stays a clean dependency leaf.

import type { BaseKeyboard } from "@keyboard-studio/contracts";

// --- scalar aliases ---------------------------------------------------------

/** Stable Glottolog id, e.g. "stan1293". Internal traversal key (D5). */
export type Glottocode = string;
/** ISO 639-3, lowercased, e.g. "eng". The currency the keyboard layer sees. */
export type Iso639P3 = string;
/** ISO 15924 script subtag, e.g. "Latn". */
export type Script = string;

/** Glottolog classification level of a languoid (FR-010). */
export type LanguoidLevel = "family" | "language" | "dialect";

// --- generated index shape (codegen output, D11) ----------------------------

/**
 * Compact record as stored in the checked-in generated index
 * (`src/generated/index.ts`). The resolved {@link Languoid} (with `familyId`
 * defaulted to self and `isPseudoFamily` computed) is derived at load.
 */
export interface LanguoidRecord {
  name: string;
  level: LanguoidLevel;
  /** Present mainly at language level; absent for most families/dialects. */
  iso639p3?: Iso639P3;
  /** Undefined ⇒ this languoid is a family root. */
  parentId?: Glottocode;
  /** Undefined ⇒ this languoid is itself the family root (resolves to self). */
  familyId?: Glottocode;
}

// --- resolved public shape --------------------------------------------------

/**
 * A node in the Glottolog classification tree — the public, resolved shape
 * returned by the catalog API. Forms a tree via {@link Languoid.parentId}.
 */
export interface Languoid {
  glottocode: Glottocode;
  name: string;
  level: LanguoidLevel;
  iso639p3?: Iso639P3;
  parentId?: Glottocode;
  /** Root of its family; self for a top-level family/isolate. */
  familyId: Glottocode;
  /**
   * True when `familyId` ∈ the curated pseudo-family set (FR-012, D6); such
   * languoids never register genealogical relatedness.
   */
  isPseudoFamily: boolean;
}

// --- relatedness ------------------------------------------------------------

/** Options for {@link relatedLanguages} / {@link relatedIsoCodes}. */
export interface RelatednessOptions {
  /** Opt-in cap on the number of results; default: no cap (D9). */
  maxResults?: number;
  /** Opt-in cutoff on `sharedSubgroupDepth` (keep results ≥ this depth). */
  minSharedDepth?: number;
  /** Restrict candidate levels, e.g. `["language"]` to exclude dialects/families. */
  levels?: ReadonlyArray<LanguoidLevel>;
}

/**
 * One related languoid plus its closeness to the target. Ordered by
 * `sharedSubgroupDepth` desc, then `pathLength` asc, then glottocode asc (D3).
 */
export interface RelatednessResult {
  languoid: Languoid;
  /** Depth of the deepest shared subgroup (larger = closer). */
  sharedSubgroupDepth: number;
  /** Total edges between target and this languoid; tie-breaker. */
  pathLength: number;
}

// --- keyboard-base bridge (US2, defined here so the surface is stable) -------

/**
 * The actionable suggestion produced by the bridge (US2,
 * `findKeyboardBaseCandidates`). One entry per keyboard (D10).
 */
export interface KeyboardBaseCandidate {
  keyboardId: string;
  /**
   * `direct` = the target has its own keyboard (distance 0, FR-017);
   * `genealogical` = same-family + same-script (Tier 1);
   * `script-fallback` = same-script regardless of family (Tier 2).
   */
  tier: "genealogical" | "script-fallback" | "direct";
  /** Always equal to the target's script (FR-017b). */
  script: Script;
  /** The related language that ranked this keyboard; `null` for pure fallback. */
  closestRelative: {
    iso639p3: Iso639P3;
    glottocode: Glottocode;
    distance: number;
  } | null;
  /** Other target-relatives this keyboard supports (secondary metadata, D10). */
  alsoSupports: readonly Iso639P3[];
  /** The resolved base record when the caller supplied one. */
  base?: BaseKeyboard;
}
