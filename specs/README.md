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
| [079-survey-answer-persistence](079-survey-answer-persistence/) | Answer capture and persistence at give-time |
| [081-footer-step-nav](081-footer-step-nav/) | Step library and footer navigation components |
| [082-rule-access-tracks](082-rule-access-tracks/) | Rule access tracks (in flight) |
| [103-first-class-if-guards](103-first-class-if-guards/) | First-class `if()` guards in KeyboardIR (ratified in principle 2026-10-15; implementation in flight) |
| [104-touch-key-id-criteria](104-touch-key-id-criteria/) | Touch key identity criteria — when a touch key is K_, U_, or T_ (implemented 2026-10-17/18, PRs #2266/#2267/#2272 + Wave 4 close-out; see its AS-BUILT.md — T021/T022 pending there) |

## Proposed — privacy suite (7, drafted 2026-10-14, unreviewed)

A thematic suite from Matthew's directive to implement a privacy policy and
actually follow it (source plan: keyboard-studio-notes,
`privacy-gdpr-plan-2026-10-14.md`). Planning-only; each spec carries its own
open rulings. Sequencing: 096 first (the record), 100 ratified before 101 is
implemented.

| Spec | Governs |
|---|---|
| [095-privacy-notice](095-privacy-notice/) | The Art. 13 privacy page + disclosure at the collection moments (sign-in, first server save, submit permanence, fonts self-hosting) |
| [096-processing-record-and-retention](096-processing-record-and-retention/) | The Art. 30 processing record as a checked fact (enumeration-diff coverage in CI) + a decided retention rule per store |
| [097-subject-access-requests](097-subject-access-requests/) | DSAR intake (private GitHub route, ruled 2026-10-14), identity by account control, register, one-month clock, self-service export |
| [098-erasure](098-erasure/) | Delete-all self-service + owner purge, crash-report remediation, the public-git-history limit worked as Art. 17(2) reasonable steps |
| [099-breach-response](099-breach-response/) | 72-hour breach runbook, per-store containment cards, private breach log, annual tabletop |
| [100-privacy-governance](100-privacy-governance/) | Constitution Article XII, privacy owner role, plan-template checkpoint, annual review |
| [101-analytics-readiness](101-analytics-readiness/) | Readiness design for stuck-point funnel analytics: closed event schema, rotating pseudonym, consent posture, processor scorecard — implementation gated on 100 |

## Live, held by ruling (3)

- **024** (GitHub delivery consolidation, unbuilt) — kept as the vehicle for
  the OAuth-vs-GitHub-App decision; retire or build when that is decided.
- **056** (ADA / WCAG accessibility baseline) — a program spec, not a feature
  spec: its in-folder tracker is the compliance record of truth, and the
  program is mid-flight by design.
- **083** (deadkey lifecycle) — kept until 082 lands, then retired as covered
  by 076/082.

## Retired (79)

A retired spec's folder holds `AS-BUILT.md` — the summary of record,
including what did *not* ship as specified — plus occasionally a pinned file
the AS-BUILT references. Full text lives in [`_archive/`](_archive/) under
the same folder name. Most recently retired (2026-10-14): 008, 009, 023, 025,
031, 032, 048, 050, 077, 078, 084, 085, 086, 087, 088, 089, 090, 091, 092,
093, 094, 046 (its `contracts/catalog-format.md` is pinned and still binds),
076 (its `data-model.md` and `contracts/carve-disposition.md` are pinned).
