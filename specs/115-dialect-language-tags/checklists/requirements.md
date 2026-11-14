# Specification Quality Checklist: Language tags that describe dialects and variants

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-11-09
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

- The spec names domain data and formats (BCP 47, SIL langtags, Glottolog, the IANA variant registry, `.kps`, LDML) and Keyman's compiler messages. These are the domain the feature is about and the parity target, as in sibling specs 111 and 114, not implementation choices. It names no framework, library or code structure; "a runtime locale library" in FR-015 is deliberately generic.
- The one [NEEDS CLARIFICATION] (list the bare parent language too?) was resolved on 2026-11-09: dialect tag only. Recorded in the spec's Clarifications section and FR-018.
- Later owner rulings on 2026-11-09 are in the Clarifications section and re-checked against these items:
  - User Story 6 ("nothing matches", FR-028 to FR-033);
  - adopting SIL's EthnoLib chooser (FR-034 to FR-038).
- `/speckit-analyze` findings applied the same day:
  - Article VI content review for new survey text;
  - the dialect merge rule (FR-003 reworded), and langtags dialect matches;
  - wording fixes.
- All items pass.
