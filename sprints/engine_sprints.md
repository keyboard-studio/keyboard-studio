# Engine Team Sprint Plan

**Team:** @gboltono (Grace Bolton), @MattGyverLee (Matthew Lee)
**Cadence:** Biweekly sprints

---

## Sprint 1 — Jun 8–19: Fix the build + scaffolder design

**#137** `bug(engine): pnpm -r typecheck fails`
Day-1 fix. Unblocks CI — `contracts/dist` missing output + `oracle.ts` missing return.

**#106** `chore(scaffolder): scaffold() Layer-C-clean promise vs VirtualFS-only return`
Design decision required before writing the scaffolder: does `scaffold()` return `VirtualFS` only or `VirtualFS + LintFindings[]`? Short session, not a full implementation.

**#129** `maint(engine): extract shared validator helpers (_shared.ts)`
Small cleanup while in the validator area. Once #106 is resolved and #137 is fixed, both people can begin their Sprint 2 tracks early.

---

## Sprint 2 — Jun 22–Jul 3: Scaffolder + studio shell (parallel)

Two tracks — one per person.

**Track A (scaffolder)**
**#19** `feat(scaffolder): implement template-cleanup per Making a Template.md`
Biggest remaining engine gap. Strip NCAPS/[CAPS rules, insert `&CasedKeys`, propagate identity, rewrite metadata. All downstream studio work waits on this.

**Track B (studio shell)**
**#22** `feat(studio): Vite app shell with two-pane layout`
First line of the SPA. Everything in the studio is a child of this.

**#38** `feat(studio): gallery rendering shell with mini-keyboard demo cards`
Needs #22. The gallery is the user's entry point.

**#21** `feat(patterns): Pattern-library loader — parse content/patterns/*.yaml at startup`
Needed before gallery cards show pattern info.

---

## Sprint 3 — Jul 6–17: Wire gallery + resolve survey design questions

**#138** `feat(studio): wire spec'd UI to GitHub-API BaseBrowserService`
Needs #22 + #38. Swaps the offline stub for the live GitHub Trees API keyboard list.

**#61** `feat(studio): Phase A surfaces v1 desktop-first scope (Decision 6)`
Needs #22. Surfaces the desktop-only scope constraint in Phase A.

Resolve before writing any survey code:

**#85** `chore(flows): SurveyAnswer.value is opaque string — how are boolean/select answer types encoded?`
**#84** `chore(flows): no merged running axis-vector across phases`
Short design sessions; both answers must be settled before #48 is written.

---

## Sprint 4 — Jul 20–31: Survey UI + lint engine

**#48** `feat(studio): survey UI for Phases A, B, F`
Needs #22, #61, #85/#84 resolved. Unblocked by content team's #49 (Phase A YAML) which should land in content Sprint 2.

**#44** `feat(validator): Lint engine — criteria.md hygiene rules and htm/php parity`
Runs against the scaffolded VirtualFS; can parallel with #48.

**#18** `feat(compiler): simulate(input keys) for live preview`
Compiler service is done; adds the input-simulation layer on top of it.

---

## Sprint 5 — Aug 3–14: Preview pane + lint UI

**#45** `feat(validator): lint chip UI rendering Diagnostic[] inline`
Needs #44 and the studio shell (#22).

**#39** `feat(compiler): preview pane with KeymanWeb OSK and modifier toggles`
Needs #22 (shell) and #18 (simulate). Full interactive preview.

---

## Sprint 6 — Aug 17–28: Integration + output

**#32** `feat(studio): Integration Day — swap mocks for real validator, compiler, scaffolder`
The "Day 4 milestone." Needs #19, #22, #38, #44, #48 all done. Gate for the first real end-to-end run.

**#147** `feat(studio): wire Download ZIP button to OutputService.toZip`
Small. Output engine is done; one-file UI wire-up.

**#148** `feat(studio): GitHub OAuth flow + Submit PR button`
Needs OAuth App registration (infrastructure) plus PKCE flow wired in the UI.

**#53 / #54** E2E smoke tests with real Keyman Developer
After #32 passes.

---

## Sprint 7 — Aug 31+: kbgen track (after joint session clears)

**#131** `process(kbgen): joint engine+content session to settle placement contract + scope` — **blocker for this entire track**

After #131:
**#132** `chore(tools): port kbgen to ESM TypeScript`
**#133** `feat(contracts): add the placement-map type`
**#134** `feat(engine): consume kbgen output as Phase B placement defaults`
**#135** `feat(tools): expand kbgen strategy coverage beyond S-01/S-08`
**#141** `feat(engine): CharacterDiscoveryService`
**#142** `feat(engine): linguist agent — synthesizeInventory`

---

## Deferred / polish

**#89** SourceLocation structure (touch-layout errors) — post-integration
**#100** Progress callbacks + pagination UX gaps — post-integration
**#156** DISCUS design-heuristic lint checks — after core lint (#44) lands
**#62** LLM provider abstraction — needed before #142 but not before #32
**#63** OAuth token-exchange backend (Option B) — v1.1, no backend required for v1

---

## Dependency map

```
#137 → (fix first, unblocks CI)

#106 → #19 ────────────────────────────────────────┐
#129                                                ↓
                                                  #32 → #147 → #148
#22 → #38 → #138 ──────────────────────────────────↑
      #21  ↗

#85/#84 → #48 ────────────────────────────────────→↑
#61     ↗

#44 → #45 ────────────────────────────────────────→↑
#18 → #39 ────────────────────────────────────────→↑

#131 → #132 → #133 → #134/#135 → #141 → #142
```

**Critical path: #137 → #19 → #32**
Sprint 2 parallel split: one person on #19 (scaffolder), other on #22 + #38 (studio shell).
