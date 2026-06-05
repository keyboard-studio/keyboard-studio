# Content Team Sprint Plan

**Team:** @dhigby (Doug Higby), @coopabla (Cooper Abla), @myczka (Jordan Myczka)
**Cadence:** Biweekly sprints

---

## Sprint 1 — Jun 8–19: Foundation + first patterns

**#56** `docs(keyboards): Finalize content/scan_report.md durable corpus writeup` *(dhigby)*
Turn the Day-1 scan notes and CSV into a polished narrative — common vs rare patterns, exemplary keyboards, lessons learned. Foundational reference for the rest of the catalog. Do first.

**#40** `feat(patterns): Reorder pattern: nfd-latin (auto-applied canonical skeleton)` *(coopabla)*
Priority-1 reorder. Auto-applied to all Latin-script keyboards with diacritics; simplest entry, good warmup.

**#34** `feat(patterns): Touch pattern: layer-switch-touch (numeric / symbol / alt-script)` *(myczka)*
Priority-1 touch pattern. Layer switching is the most universal touch feature; leads the touch gallery.

**#30** `feat(patterns): capslock-variant` *(coopabla — verify + close)*
All checkboxes appear already checked. Confirm and close.

---

## Sprint 2 — Jun 22–Jul 3: Touch patterns + Phase A flow + validation scaffold

**#37** `feat(patterns): Touch pattern: hint-characters (small glyphs on touch keys)` *(myczka)*
Priority-2. High discoverability value; straightforward demo.

**#35** `feat(patterns): Touch pattern: flick-gestures` *(coopabla)*
Priority-3. Swipe-direction variants.

**#36** `feat(patterns): Touch pattern: multitap (tap to cycle)` *(coopabla)*
Priority-3. T9-style cycling; common in syllabic-script touch keyboards.

**#49** `feat(flows): Phase A identity (language, region, base keyboard)` *(dhigby)*
Draft the Phase A survey YAML — language name, ISO 639-3, script, writing direction, layout family. **Engine team needs this by end of Sprint 2** to build the Phase A studio UI in their Sprint 4.

**#55** `feat(patterns): Validation safety net — kmc CLI green-light for every filled_kmn`
Set up `content/tools/validate_demos.sh` to walk every pattern YAML and run `kmc build` against each `demo.filled_kmn`. Run it against Sprint 1 patterns; treat it as a gate for all subsequent pattern issues.

---

## Sprint 3 — Jul 6–17: Reorder patterns (complex)

**#41** `feat(patterns): Reorder pattern: indic-pre-base-vowel` *(dhigby)*
Priority-2. Critical for Devanagari, Bengali, Tamil — vowels visually precede the consonant but are typed after.

**#42** `feat(patterns): Reorder pattern: SEA stack reorder (Khmer Angkor case)` *(myczka)*
Priority-3. Complex stacking/reorder for Burmese/Khmer; use Khmer Angkor as the canonical case.

**#43** `feat(patterns): Reorder pattern: tone-mark-canonicalization (SEA)` *(coopabla)*
Priority-3. Tone marks in canonical position regardless of typed order (Thai, Lao, Vietnamese).

---

## Sprint 4 — Jul 20–31: Inventory atlas + criteria re-review

**#50** `feat(keyboards): Inventory atlas — diacritic sets and add-on letters per group` *(dhigby)*
Build the reference inventories Phase B draws from: per-group diacritic catalogs, special letters, punctuation with Unicode codepoints and example languages. Phase B flow (#51) is blocked on this.

**#120** `chore(criteria): 13 criteria flagged for re-review — file individual decisions` *(coopabla + myczka)*
13 band-assignment decisions pending from Day-1 review. File individual decisions or a tracking checklist before they drift further.

---

## Sprint 5 — Aug 3–14: Phase B + F flows

**#51** `feat(flows): Phase B characters (inventory, diacritics, special letters)` *(dhigby)*
Needs #50. Walk the language expert through their character inventory. Output is YAML the studio renders as a multi-step form feeding the gallery filter.

**#52** `feat(flows): Phase F help docs (welcome, tips, credits)` *(coopabla or myczka)*
Phase F survey YAML: prose-collection questions for welcome HTML, usage tips, credits, license note.

---

## Sprint 6 — Aug 17+: Automation hooks (after engine lint + scaffolder land)

**#70** `feat(criteria): populate optional automation-hook fields (lintRuleId, scaffolderRule, etc.)`
All 133 `criteria.json` entries omit `lintRuleId`, `scaffolderRule`, `surveyQuestionId`, `preSubmitChecklistText`. Populate once the engine lint rules (#44) and scaffolder (#19) exist so there's something real to link to. Waits on engine Sprint 4.

---

## Deferred / polish

**#58** `feat(process): Add Risk and dependencies section to spec.md` — v1.1 spec work
**#59** `feat(process): Add Performance targets table to spec.md` — v1.1 spec work
**#60** `feat(process): Add Accessibility section to spec.md` — v1.1 spec work
**#65** `bug(tools): Hygiene backlog P2 follow-ups from Day-1 contract lock` — address opportunistically

---

## Dependency map

```
#56 → (no blockers)
#30 → (verify + close)

#40, #34 ───────────────────────────────────────────┐
#37, #35, #36 ──────────────────────────────────────┤
#41, #42, #43 ──────────────────────────────────────┘→ #55 (validation gate)

#49 (Phase A YAML — unblocks engine #48 survey UI)

#50 → #51 (inventory atlas must precede Phase B flow)
#52   (Phase F — independent)

#120  (criteria re-review — independent)

engine #44 + engine #19 → #70 (automation hooks)
```

**Key cross-team handoff: #49 must land by end of content Sprint 2 (Jul 3)**
Engine team's survey UI (#48) in Sprint 4 depends on it.

---

## Cross-team dependencies

| Content delivers | Engine consumes | Deadline |
|---|---|---|
| #49 Phase A YAML | #61, #48 (survey UI) | End of content Sprint 2 — Jul 3 |
| #50 Inventory atlas | #51 (content), eventually Phase B UI (engine) | End of content Sprint 4 — Jul 31 |
| #51 Phase B YAML | Phase B survey UI (engine Sprint 5+) | End of content Sprint 5 — Aug 14 |
| #52 Phase F YAML | Phase F survey UI (engine Sprint 5+) | End of content Sprint 5 — Aug 14 |
| Pattern YAMLs (#34–#43) | #21 pattern library loader, gallery cards | Before engine Sprint 3 — Jul 6 |
