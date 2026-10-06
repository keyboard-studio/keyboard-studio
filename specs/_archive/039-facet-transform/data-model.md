# Phase 1 Data Model: Facet Transform Engine

039 owns the **value-transition matrix + migration rules** (split-C, design brief §6). This file models the
engine's own entities and the **injected measurement input contract** it shares with spec 037. Per the design
brief these are content-adjacent/engine data, **not** a locked `packages/contracts` type until an evaluation
round; field names are the contract 039 ships.

> **Framework independence (D5).** This transition matrix and its `houseTargetPolicy` decision-table are
> *modeled on* the spec §7.2 ordered/first-match-wins **pattern** only. They do **not** import, extend, or
> modify `StrategyId` / `PrimaryRuleNumber` / the locked §7.2 tree (`packages/contracts/src/strategy.ts`).
> Any resemblance between `source.desktop-combo-mechanism` values (`deadkey`, `context-match`) and §7 strategy
> cards is a documentation cross-link, never a type dependency. Do not wire `source.*` values into `StrategyId`.

The load-bearing rule: **a Transform is one supported (facetId, fromValue, toValue) triple**, carrying its
`transformImpactClass`, its transition entry (loss profile + migration rule), and its implications; it operates
on the single working copy's `KeyboardIR` (copy-return) and commits only through the propose-then-confirm gate.

---

## Entity 0 (input) — `SourceFacetMeasurement` (injected; produced by 037/036)

039 does **not** derive this — it is injected (research D4). Pinned here so 037 and 039 agree on the shape.

| Field | Type | Notes |
|---|---|---|
| `facetId` | string | e.g. `source.touch-combo-mechanism`. Matches a 036/037 keyboard-facet definition. |
| `dominantValue` | string | dominant value over the base (037 Entity 2 `value`). |
| `confidenceClass` | `confident \| mixed \| undetermined` | 037's outcome triad. `undetermined`/below evidence floor ⇒ transform **declines or re-measures**, never guesses (spec Edge Case). |
| `consistency` | number | share following the dominant value (037 distribution). |
| `exceptionSites[]` | `ExceptionSite[]` | enumerated deviations; deterministically recomputable per 037 (not bloating the index). |
| `evidenceSize` | number | population the measurement was computed over. |

**`ExceptionSite`** (037-produced; 039 consumes verbatim and layers disposition on top):

| Field | Type | Notes |
|---|---|---|
| `siteId` | string | stable id for the deviating rule/key/layer location. |
| `siteValue` | string | the value at this site (differs from `dominantValue`). |
| `causeTag` | `principled-split \| capacity-forced \| gap-omission` | predicate-fit cause (design brief §4). `gap-omission` = residue when no predicate fits. |
| `predicateId?` | string | the predicate that fired (auditable; absent for gap-omission). |

---

## Entity 1 — `FacetTransition` (a row of the value-transition matrix — the central owned artifact)

| Field | Type | Notes |
|---|---|---|
| `facetId` | string | facet **or sub-profile** key — e.g. `source.encoding.output-spelling`, `source.encoding.input-match-kind` (see the sub-profile rule below). |
| `fromValue` | string | one of the facet's `limits.values`; `mixed` is a legal `fromValue` (US1's "mixed encoding → house style" is the common real request). |
| `toValue` | string | one of the facet's `limits.values`; `fromValue !== toValue`. |
| `supported` | boolean | FR-004. `false` ⇒ declined; still present so the decline is explainable, never silently absent. |
| `lossProfile` | `lossless \| lossy-with-named-loss \| one-way` | `lossless` is legal **only** when `transformImpactClass = behavior-preserving`. `one-way` ⇒ reverse direction unsupported/asymmetric. |
| `namedLosses[]` | string[] | present when `lossy-with-named-loss`. Concrete, enumerable "what is lost" statements — authored per-transition so the preview is deterministic (feeds FR-006 / SC-003). |
| `transformImpactClass` | `behavior-preserving \| ux-changing \| output-changing` | denormalized onto the row; a build-time check asserts it matches the facet/sub-profile's declared class (drift guard). Gate facets never produce a row (they are refused upstream). |
| `migrationRuleId` | string (FK → Entity 2) | the rule that rewrites the working copy for this pair. Null when `supported: false`. |
| `declineReason` | string | present when `supported: false`; shown verbatim when the user requests the pair (FR-004). Distinguishes **permanent** refusal (match-kind, os-compose, gate) from **deferred** (v2). |

**Natural key**: `(facetId, fromValue, toValue)`.

**Sub-profile rule (do not lose — falsifies US1 otherwise).** `source.encoding` is **not** a single impact
class. Its sub-profiles split: output base/combining spelling and within-kind input spelling are
**behavior-preserving**; the input **match-kind** axis (key-ref ↔ char-ref) is **ux-changing / semantic**
(design brief §5 — char-ref may be unreachable). The matrix therefore keys `source.encoding` at the
**sub-profile** level (`source.encoding.output-spelling`, `source.encoding.input-within-kind`,
`source.encoding.input-match-kind`), never at the whole-facet level — otherwise pointing a "safe" transform
at the facet would silently sweep in the match-kind axis and falsify FR-007's byte-identical claim.

## Entity 2 — `MigrationRule`

| Field | Type | Notes |
|---|---|---|
| `id` | string | referenced by `FacetTransition.migrationRuleId`. |
| `facetId` | string | facet/sub-profile this rule rewrites. |
| `apply(workingCopyIr, acceptedSiteIds[]) → RewriteResult` | function | operates on `KeyboardIR`, **copy-return** (research D2), parameterized by the accepted-site subset (partial acceptance, FR-012). Returns the candidate IR + a per-site applied/skipped ledger. |
| `companionRewrites[]` | rule-ref list | FR-008 — coordinated companion edits. Empty for local behavior-preserving rewrites; **non-empty for NFD→NFC** (the backspace-rule rewrite). |
| `derivesParameters` | boolean | true for rules that compute values the user must review before commit (e.g. flick-direction assignment) — surfaces a "review derived values" sub-step. The derivation is **not authoritative** (spec Assumption). |
| `verify(irBefore, irAfter) → ParityResult \| OutputDiff \| UxDescription` | function | dispatched by impact class: behavior-preserving ⇒ parity (D6) + invertibility (D7); output-changing ⇒ output-level diff (FR-008/AC2); ux-changing ⇒ UX description. |

**Migration mechanics for the v1 rules** (from km-keyman findings; full contract in
[contracts/transition-matrix.contract.md](contracts/transition-matrix.contract.md)):

- **`encoding-spelling`** (US1, behavior-preserving): `'a' ↔ U+0061` is spelling-only to the compiler —
  unconditionally lossless/invertible for base/combining and char-ref. Modifier folding
  (`named-modifier ↔ split-modifier`) is lossless **only with a per-site precondition** (SHIFT matches
  either shift key; folding to a single `LSHIFT` rule drops the `RSHIFT` case unless outputs already match)
  — checked per-site, never assumed.
- **`longpress-to-flick`** (US2, ux-changing): rewrites `TouchKeyIR.sk` → `TouchKeyIR.flick`; derives a
  compass-direction per subkey (position-order → nearest available direction) for user review. **Bounded**:
  keys whose subkey count exceeds the platform's flick-direction budget are **refused per-site with a
  reason**, never truncated silently. Named loss: discoverability (longpress is a browsable menu; flick is a
  memorized blind gesture).
- **`nfd-to-nfc`** (US3, output-changing): composes base+combining RHS to precomposed codepoints; the
  companion rewrite **removes the now-unreachable two-codepoint backspace override** (`'a' U+0301 + [K_BKSP] > nul`
  can never match once output composes) so single-backspace correctly deletes the composed codepoint — a
  Check #11-adjacent unreachable-rule removal, not a synthesis. (`nfc → nfd`, the generative direction, is
  declined in v1 — needs decomposition data + new backspace rules + a keyboard-wide offset re-audit.)

## Entity 3 — `TransformProposal` (pre-commit object shown to the user)

| Field | Type | Notes |
|---|---|---|
| `transitionId` | FK → Entity 1 | the requested pair. |
| `affectedSites[]` | `AffectedSite[]` | see below — dominant-pattern sites + measured exception sites with disposition. |
| `implications` | string[] | FR-006 — the facet's own `implications` prose (content-authored) composed with the transition's `namedLosses`. |
| `previewKind` | `source-diff \| ux-description \| output-diff` | FR-002/FR-003 dispatch by `transformImpactClass`. |
| `derivedParameterReview?` | object | present when `migrationRule.derivesParameters` (e.g. the flick-direction table to confirm). |
| `houseTargetProvenance?` | `HouseTargetResolution` | present for `source.encoding` "normalize to house style" — the resolved target + why (Entity 4). |
| `fallThroughImpact?` | `{ producedCharacterSetDelta }` | FR-011 — populated when the transition (un)blocks base-layout fall-through; drives FR-013 re-derivation. |
| `opaqueUntouched?` | `{ feature, count }[]` | FR-009 — what the transform could not model (reuses I4's inventory shape, research D12). |
| `status` | `proposed \| partially-accepted \| accepted \| declined \| commit-failed` | FR-010/FR-013 outcomes. `commit-failed` ⇒ working copy unchanged, failure attributed here. |

**`AffectedSite`** (partial acceptance is the same mechanism as cause-tag disposition — no second concept):

| Field | Type | Notes |
|---|---|---|
| `siteId` | string | from the measurement (or a dominant-pattern site). |
| `causeTag?` | `principled-split \| capacity-forced \| gap-omission` | **absent** for dominant-pattern (non-exception) sites, which are applied unconditionally. |
| `defaultDisposition` | `preserve \| consolidate-offered \| fix-offered \| apply` | derived from cause tag (FR-005): principled-split ⇒ `preserve` (opt-in to convert, named per US2 AC1); capacity-forced ⇒ `consolidate-offered` (defaults to **not** consolidate — a UX judgment); gap-omission ⇒ `fix-offered`; no tag ⇒ `apply`. |
| `userDisposition` | `pending \| accepted \| declined` | starts `pending`; set by the user. |

**Commit rule (FR-012).** The applied set is
`affectedSites.filter(s => s.userDisposition === 'accepted' || s.causeTag === undefined)`.
Sites left `pending`/`declined` are excluded from the rewrite; the working copy stays consistent. The
migration rule is therefore **site-list-parameterized** (`apply(ir, acceptedSiteIds[])`), never
"transform the whole facet."

## Entity 4 — `HouseTargetPolicyRow` + `HouseTargetResolution`

`source.encoding`'s house target is **conditional** (a decision-table, not a constant — design brief §6):
a poorly-displaying script keeps `U+`-predominant spelling. Ordered, first-match-wins (the §7.2 *pattern*, D5).

**`HouseTargetPolicyRow`** (content-authored):

| Field | Type | Notes |
|---|---|---|
| `policyId` | string | which facet/sub-profile policy this belongs to. |
| `order` | number | evaluation order; first match wins. |
| `conditions` | `{ script?, displayDifficulty? }` | starter inputs — `script` (037 script classifier) and `orth.display-difficulty` (037's new input facet). |
| `target` | string | the `toValue` this row resolves to. |
| `explanation` | string | authored, deterministic chip text (e.g. "kept `U+` because this script renders poorly in system fonts"). Not synthesized at display time. |
| `isDefault` | boolean | the unconditional fallback row. |

**`HouseTargetResolution`** (captured on the proposal, US1 AC1):
`{ policyId, matchedRowOrder, matchedInputs: { script, displayDifficulty }, target, explanation, isDefault }`.
The **provenance chip renders only when `isDefault === false`** — the obvious default target needs no chip;
showing one on every proposal is noise.

---

## Relationships

- **`SourceFacetMeasurement` → `TransformProposal`**: injected input; supplies `affectedSites` (dominant +
  exceptions with cause tags). 039 consumes, never re-derives (D4).
- **`FacetTransition` → `MigrationRule`**: many transitions may share one rule family; the row names the rule.
- **`MigrationRule` refines the facet-level §6 hints**: facet-level `invertibility` (coarse) → per-pair
  `lossProfile` + `namedLosses`; facet-level `implications` prose → composed with `namedLosses` at proposal
  time; facet-level `houseTargetPolicy` → resolved into a `HouseTargetResolution` per proposal. One-to-many
  refinement, not duplication.
- **`TransformProposal` → working copy**: on `accepted`, `MigrationRule.apply` produces a candidate IR; the
  pre-commit gate (`verify` + `validateWithOracle`/`compile`, D8) admits or rejects it; on admit, the studio
  writes it via `setWorkingIR` and re-seeds axes if the produced set changed (D11, FR-013).

## State transitions (a proposal's lifecycle)

```text
proposed
  ├─ user sets dispositions ─→ partially-accepted (some exception sites accepted)
  ├─ user confirms ──────────→ accepted ──→ [gate: verify + compile]
  │                                            ├─ pass ─→ committed (working copy mutated, axes re-seeded if produced-set changed)
  │                                            └─ fail ─→ commit-failed (working copy UNCHANGED; failure attributed to proposal)
  └─ user cancels ───────────→ declined (no change)
```

Gate/undetermined refusals (spec Edge Cases): a gate facet, or an `undetermined`/below-floor measurement,
never reaches `proposed` — the request is refused with an explanation upstream.
