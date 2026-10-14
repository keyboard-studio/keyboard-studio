# Specs index

The live corpus, ordered by subsystem (the order of
[docs/architecture.md](../docs/architecture.md)), not by number. Numbers are
stable IDs — code comments, spec-trace, and cross-references cite them, and
gaps are normal (001, 003, 004, 006, 054 never existed).

## Governing / live (8)

| Spec | Governs |
|---|---|
| [002-defaults-engine](002-defaults-engine/) | Propose-then-confirm proposers (the §3c defaults engine) |
| [005-pattern-schema](005-pattern-schema/) | The Pattern contract (locked; constitution Art I) |
| [007-strategy-selection](007-strategy-selection/) | Strategy selection: axes, decision tree, strategy catalog |
| [011-ui-primitives](011-ui-primitives/) | The shared `ui/` primitive library |
| [076-rule-behaviours](076-rule-behaviours/) | Rule behaviour kinds, carve dispositions (active domain work) |
| [079-survey-answer-persistence](079-survey-answer-persistence/) | Answer capture and persistence at give-time |
| [081-footer-step-nav](081-footer-step-nav/) | Step library and footer navigation components |
| [082-rule-access-tracks](082-rule-access-tracks/) | Rule access tracks (in flight) |

## Live, held by ruling (3)

- **024** (GitHub delivery consolidation, unbuilt) — kept as the vehicle for
  the OAuth-vs-GitHub-App decision; retire or build when that is decided.
- **056** (ADA / WCAG accessibility baseline) — a program spec, not a feature
  spec: its in-folder tracker is the compliance record of truth, and the
  program is mid-flight by design.
- **083** (deadkey lifecycle) — kept until 082 lands, then retired as covered
  by 076/082.

## Retired (78)

A retired spec's folder holds `AS-BUILT.md` — the summary of record,
including what did *not* ship as specified — plus occasionally a pinned file
the AS-BUILT references. Full text lives in [`_archive/`](_archive/) under
the same folder name. Most recently retired (2026-10-14): 008, 009, 023, 025,
031, 032, 048, 050, 077, 078, 084, 085, 086, 087, 088, 089, 090, 091, 092,
093, 094, 046 (its `contracts/catalog-format.md` is pinned and still binds).
