# Contract: Classifier (the standard all classifiers follow)

The one interface every 037 classifier implements. This is the "standard all later facets follow" the spec
sets out to establish. It is engine-team code inside `utilities/facet-index/` (standalone tool, not a
shipped package — 036 D1), consumed by the index build loop.

## Interface (illustrative TypeScript — not a locked `packages/contracts` type)

```ts
/** Archetype = which evidence the classifier reads (FR-002). */
type Archetype = "character-content" | "rule-structure" | "declared-metadata";

/** The 036 Entity 2 record this classifier produces (shape owned by spec 036). */
interface Categorization {
  value: unknown;                                   // facet-typed; within limits or build fails (FR-008)
  distribution?: Record<string, number>;            // sums to ~1 when present, or to (1 - residue) when
                                                      // `residue` is also present (FR-003; see C3 below)
  confidence: number | null;
  confidenceClass: "confident" | "mixed" | "undetermined";  // FR-003 tri-state, never forced
  provenanceTier: "content-derived" | "declared-metadata" | "default-fallback";  // FR-004
  evidenceSize: number;
  analyzedCoverage: number;
  analysisOutcome: "fully" | "partially" | "fallback-only";  // 3-state subset (research D9)
  notes?: string;
  residue?: number;                                 // facet-specific extension (036 Entity 2 `residue`);
                                                      // closed-recognized-keyspace facets only, e.g. strategy-fingerprint
  subProfile?: Record<string, unknown>;              // facet-specific extension (036 Entity 2 `subProfile`);
                                                      // opaque within-value sub-classification, e.g. script's Latin profile
}

/** Inputs a classifier may read. Assembled once per keyboard by the build loop. */
interface ClassifierInputs {
  keyboardId: string;
  ir: KeyboardIR | null;          // null when parseKmn threw (fallback-only)
  parseError?: string;            // populated when ir === null
  producedSet: Set<string> | null;// buildProducedSet(ir); null on parse failure
  recognizedRatio: number | null; // recognizePatterns(ir).recognizedRatio
  kps: KpsMetadata | null;        // parseKps of the sibling .kps, if present
  siblingStores: KmnHeaderStore[];// parseKmnHeaderStores(kmnText) — for artifact-presence checks
  siblingPresent: Record<string, boolean>; // resolved fs existence per store path (touch layout, etc.)
}

interface Classifier {
  readonly id: string;            // matches definition derivation.classifierId
  readonly version: string;       // participates in freshness (FR-001)
  readonly archetype: Archetype;
  readonly fallbackChain: string[];
  classify(inputs: ClassifierInputs, refs: ReferenceData): Categorization;
}
```

## Contractual obligations (verified against a classifier)

| # | Obligation | Source |
|---|---|---|
| C1 | `classify` is pure and deterministic: identical `inputs` + `refs` + `version` ⇒ byte-identical `Categorization`. No `Date.now()`, no `Math.random()`, no environment-dependent iteration order. | FR-001 |
| C2 | Every emitted `value` is within the facet definition's `limits`, or the build fails loud (never silently recorded). | FR-008 / 036 D7 |
| C3 | `distribution`, when present, sums to `1 ± ε` with keys sorted lexicographically **when `residue` is absent**; when `residue` is present, `distribution` + `residue` sums to `1 ± ε` instead (036 Entity 2 scoped invariant). | FR-003 / determinism / 036 Entity 2 |
| C4 | `confidenceClass` is one of the three states; a genuinely mixed or undetermined outcome is reported as such, never collapsed to a single `value`. | FR-003 |
| C5 | `provenanceTier` records the tier that actually produced the value; a `fallback-only`/`undetermined` outcome never claims `content-derived`. | FR-004 / FR-002 |
| C6 | On `parseKmn` throw, the classifier returns a `fallback-only` record with an explicit `notes` reason — never a fabricated distribution, never a divide-by-zero. | spec Edge Cases |
| C7 | `analysisOutcome` is the 3-state subset `{fully, partially, fallback-only}`; the classifier never runs the WASM oracle, so `RoundTripDivergence` is unobservable by design. | research D9 |
| C8 | The classifier declares its `archetype` and `fallbackChain`; the fallback chain may be shorter than script's (strategy has no metadata tier). | FR-002 / research D7 |

## Self-verification (fixtures — FR-006)

Each classifier ships fixture tests covering, at minimum, one clear-cut case per archetype outcome it can
produce (`confident`, `mixed`, `undetermined`/residue-dominated, `fallback-tier`), drawn from real corpus
keyboards cited in [docs/keyboard-index.md](../../../docs/keyboard-index.md) (research D10). A determinism
test asserts two runs over the same inputs produce byte-identical records (SC-003).
