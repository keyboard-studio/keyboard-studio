# Contract: Constitution Core Principle IX (verbatim)

Copy this text exactly into `.specify/memory/constitution.md` as a new `### IX.` section under
`## Core Principles`, immediately after Article VIII ("House conventions") and before the
`## Authoring workflow` section. Do not reword, retitle, or renumber — this is the FR-001 text,
quoted from [spec.md](../spec.md) FR-001.

## Heading

```
### IX. No user-facing survey surface outside the manifest
```

(Title chosen to match the sentence-case, short-noun-phrase style of Articles I–VIII; the body
below is FR-001's required text.)

## Body (verbatim from spec.md FR-001)

```
No user-facing survey surface may exist outside the step manifest. Every step declares typed
IRPath inputs and writes via Step.inputs and Step.writes (steps/types.ts). Every IR write routes
through the mutate() seam (specs/014-mutate-seam-touch-propagation). The manifest
(steps/manifest.ts) is the single source of survey ordering (specs/012-step-model-manifest). A
plan proposing new survey content MUST include the manifest entry as a functional requirement.
```

## Companion edits in the same change (Decision 5, [research.md](../research.md))

1. In `## Authoring workflow (spec-kit ↔ KM crew)`, step 2 currently reads:
   `` `/speckit-plan` → plan + Constitution Check against Articles I–VIII. ``
   Change `I–VIII` to `I–IX`.
2. In `## Governance`, the version footer currently reads:
   `**Version**: 1.1.0 | **Ratified**: 2026-06-15 | **Last Amended**: 2026-07-17`
   Bump `Last Amended` to the date this amendment actually lands (a prose-only Article addition is
   a minor amendment — bump the date, not the `Version` major/minor number, consistent with how
   the 2026-07-17 date was last updated without a version bump).
