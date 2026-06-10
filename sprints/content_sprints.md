# Content Team Sprint Plan

**Team:** @dhigby (Doug Higby), @coopabla (Cooper Abla), @myczka (Jordan Myczka)
**Cadence:** Biweekly sprints
**Milestone IDs:** KS-S1 through KS-S4 (v1.1 import-pipeline era)

**Status key:** *todo* · *in progress by @username* · *in PR #NNN by @username* · *done*

> **Plan revision: 2026-06-09.** Supersedes the v1.0 plan. The v1.1.0 KeyboardIR amendment (epic #231, contracts session #232) introduces a pattern recognizer that the content team curates rules for — #240 is the new spine of content's contribution. Phase A YAML (#49), Inventory atlas (#50), and Phase B characters (#51) all shipped in the v1.0 plan; this revision picks up from there.

---

## Sprint 1 — KS-S1: Recognizer rules first-pass + scan_report polish

Paired with engine KS-S1 (identity-mutation working slice). The engine slice does not need new YAML — Phase A is already authored. Content's S1 starts the recognizer curation that engine consumes in their S3.

**#240** `feat(content): Pattern recognizer rule curation — first-pass S-01..S-09` — *todo*
First-pass rules covering S-01 (NFD canonical reorder, Latin) and S-02 (deadkey-based diacritic) — these are the recognizer rules that lift IR node clusters into typed `Pattern[]` with `origin: "recognized"`. Engine cannot start #234 (the recognizer engine itself) until the first two rules exist as concrete YAML/predicates to feed it. Land S-01 minimum; S-02 if time permits.

**#56** `docs(keyboards): Finalize content/scan_report.md durable corpus writeup` — *done*
Carries over from v1.0 S4. Two ACs still open: complete pattern-YAML links and human Content-team review. Close out in this sprint now that the pattern catalog is stable enough.

**#212** `docs(keyboards): Add pattern-YAML links to scan_report.md` — *todo*
Mechanical link-up of every scan_report.md row to its corresponding pattern YAML file. Pairs naturally with #56 final close.

---

## Sprint 2 — KS-S2: Recognizer expansion + import-attribution criteria + indic resolution

**#240** `feat(content): Pattern recognizer rule curation — S-03..S-09 completion` — *continuation*
Finish the first-pass rules so the engine recognizer (KS-S3) has full S-01..S-09 coverage. Test each rule against the `release/basic/` corpus.

**#241** `chore(criteria): Add criteria.md rows for import-attribution PR body and sidecar exclusion` — *todo*
Two new criteria.json entries for D9 import requirements (provenance attribution + `.kmn.imported` sidecar exclusion from PR commit). Blocks engine KS-S3 sidecar work (#239).

**#204** `bug(patterns): indic-pre-base-vowel test-vector contract violation + appliesTo overreach` — *todo*
Existing indic pattern has test vectors that violate the contract and an `appliesTo` field that overreaches into scripts it doesn't apply to. Fix before #41 can re-land cleanly.

**#41** `feat(patterns): Reorder pattern: indic-pre-base-vowel` — *todo*
Re-land the indic reorder pattern with the #204 corrections applied. Devanagari, Bengali, Tamil need this.

---

## Sprint 3 — KS-S3: Phase B coverage gaps + Phase F docs + validation safety net

**#191** `feat(flows): Phase B character-inventory coverage gaps` — *todo*
The shipped Phase B YAML (#51 PR #190) misses digraphs, nukta, independent vowels, direction marks, and syllabic finals. Fill the gaps so Phase B inventory is comprehensive before engine renders Phase B in KS-S4.

**#52** `feat(flows): Phase F help docs (welcome, tips, credits)` — *todo*
Phase F survey YAML: prose-collection questions for welcome HTML, usage tips, credits, license note.

**#55** `feat(patterns): Validation safety net — kmc CLI green-light for every filled_kmn` — *todo*
`content/tools/validate_demos.sh` walks every pattern YAML and runs `kmc build` against each `demo.filled_kmn`. Treat as the regression gate for all pattern issues from here on.

---

## Sprint 4 — KS-S4: Criteria automation hooks + re-review

Lands after engine #44 (lint engine) and #238 (scaffold-over-IR) so the automation-hook fields point at real machinery.

**#70** `chore(criteria): populate optional automation-hook fields (lintRuleId, scaffolderRule, etc.)` — *todo*
All 133 `criteria.json` entries currently omit `lintRuleId`, `scaffolderRule`, `surveyQuestionId`, `preSubmitChecklistText`. Populate once the engine lint rules (#44) and scaffold-over-IR (#238) exist so the references are real.

**#120** `chore(criteria): 13 criteria flagged for re-review — file individual decisions` — *todo*
13 band-assignment decisions pending from Day-1 review. File individual decisions or a tracking checklist before they drift further.

---

## Deferred / polish

**#84** `chore(flows): No merged running axis-vector across phases` — design Q; settle before Phase C strategy work
**#85** `chore(flows): SurveyAnswer.value is opaque string — boolean/select encoding unclear` — design Q; settle before engine widens survey UI past identity questions
**#65** `bug(tools): Hygiene backlog P2 follow-ups from Day-1 contract lock` — address opportunistically
**#58, #59, #60** `feat(process): spec.md Risk / Performance / Accessibility sections` — v1.2 spec work

---

## Dependency map

```
KS-S1: #240 (S-01..S-02) ───→ engine #234 (recognizer) needs this before KS-S3
       #56, #212

KS-S2: #240 (S-03..S-09) ───→ engine #234 completion
       #241                  ───→ engine #239 sidecar (KS-S3)
       #204 → #41

KS-S3: #191                  ───→ engine Phase B render (KS-S4)
       #52                   ───→ engine Phase F render (KS-S5)
       #55  (regression gate, ongoing)

KS-S4: #70   (needs engine #44 + #238 to point at)
       #120  (independent)
```

---

## Cross-team dependencies

| Content delivers | Engine consumes | Sprint gate |
|---|---|---|
| #240 S-01..S-02 rules | #234 pattern recognizer engine | content KS-S1 → engine KS-S3 |
| #240 S-03..S-09 rules | #234 full recognizer coverage | content KS-S2 → engine KS-S3 |
| #241 attribution criteria | #239 .kmn.imported sidecar | content KS-S2 → engine KS-S3 |
| #191 Phase B gap-fill | Phase B survey UI extension | content KS-S3 → engine KS-S4 |
| #52 Phase F YAML | Phase F survey UI | content KS-S3 → engine KS-S5 |
