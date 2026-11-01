# Specification Quality Checklist: Base-keyboard fallback

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-11-01
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

- **FR-020 resolved 2026-11-01** by product-owner rulings: the policy is decided per class
  (letters, digits, punctuation and symbols) using Unicode General Category and Script. Letters
  follow script divergence; digits and punctuation follow whether the keyboard defines its own.
  FR-021 (no silent change for unconfirmed drafts) follows from Constitution Art X.
- **Contracts change**: the `FallbackPolicy` type becomes one value per class (Key Entities).
  It is not the locked Pattern schema, but its zod schema, drift guard and draft migration move
  in the same change.
- **Deliberate deviation from "no implementation details"**: the spec names `swallowUndefined`,
  `nul`, `nomatch > nul`, the `windows-layout` decision, `isInSwallowSet`, the `mutate()` seam,
  the `basic_kbd*` corpus keyboards and the codegen test. These are the existing contracts and
  data sources this feature must reuse (spec 076 FR-005, amendment A3; spec 108 FR-021/FR-027/
  FR-028), not design choices.
