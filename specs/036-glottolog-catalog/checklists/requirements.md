# Specification Quality Checklist: Glottolog classification catalog + related-keyboard-base bridge

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-07-13
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

- Items marked incomplete require spec updates before `/speckit-clarify` or `/speckit-plan`.
- Validation run 1 (2026-07-13): all items pass. Two illustrative-API references from the source
  request (function names) were intentionally kept OUT of the spec body and pushed to planning/contracts,
  to keep the spec implementation-agnostic per the Content Quality gate.
- Resolved 2026-07-13 by user decisions (see the spec's `## Clarifications` section):
  1. ISO→glottocode resolution is **permissive** — a code maps to all matching glottocodes, deduplicated;
     unioned downstream and deduplicated at the end (FR-008, FR-011a, FR-014).
  2. **Glottocode is internal; ISO/BCP47 is the currency** — keyboards are matched by ISO/BCP47, never by
     glottocode (FR-017a).
  3. Relatedness is **genealogical + a script fallback that must coincide** — every base candidate matches
     the target's script; Tier 1 = same-family same-script, Tier 2 = existing script-based fallback
     (FR-017b, FR-017c, FR-015).
  4. Closeness metric = **deepest-shared-subgroup depth, tie-break shorter path, then glottocode** (FR-011).
  5. Duplicate handling = **one candidate per keyboard**, ranked by closest supported relative, others as
     secondary metadata (FR-016a); a related language with several keyboards still yields several candidates.
  6. Default output bound = **no cap**, ranked closest-first, consumer truncates (FR-013).
  7. Pseudo-family recognition = **curated set of stable glottocodes**, pinned with the dataset (FR-012).
- Remaining low-impact soft spot (documented default; safe to settle at plan/contract time, does not block
  planning): ancestry ordering (root-first vs leaf-first).
