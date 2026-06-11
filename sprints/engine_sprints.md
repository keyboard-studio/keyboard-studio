# Engine Team Sprint Plan

**Team:** @gboltono (Grace Bolton), @MattGyverLee (Matthew Lee)
**Cadence:** Biweekly sprints
**Milestone IDs:** KS-S1 through KS-S6 (v1.1 import-pipeline era)

**Status key:** *todo* · *in progress by @username* · *in PR #NNN by @username* · *done*

> **Plan revision: 2026-06-09.** Supersedes the v1.0 plan. The v1.1.0 KeyboardIR amendment (epic #231) reshapes the engine spine — text-based scaffolder #19 is being absorbed into scaffold-over-IR #238. Sprint 1 is built around a deliberately narrow working slice: import a keyboard, render Phase A's first 2-3 identity questions, mutate the imported `.kmn` in place. This proves the end-to-end pipeline with a throw-away regex stub for the mutation; the real IR codec lands in S2.

---

## Sprint 1 — KS-S1: First survey question mutates an imported keyboard (working slice)

The deliberately scoped MVP. Three header-only mutations (`&NAME`, `&COPYRIGHT`, optional `&KEYBOARDVERSION`), round-trip-safe by construction, demonstrably wired end-to-end. After this sprint, a user can: open the studio, pick a base keyboard from the browser, answer "what is your keyboard called?" and "who holds the copyright?", and see the `.kmn` file in the VirtualFS change to match.

**#232** `feat(contracts): KeyboardIR schema + IR node types + ImportStatus / ImportReport (#5b)` — *done*
Joint engine+content contracts session. The Day-1-style lock for the v1.1 IR types. Gates every other v1.1 import-epic issue (#233 codec, #234 recognizer, #235 carve gallery, #236 Layer A', #238 scaffold-over-IR, #239 sidecar). Schedule this within the first three days of the sprint; everything else in the sprint can proceed in parallel because the stub-mutation path does not require the codec. Five open questions to close in-session (recognizer rule format, sidecar v1.1 disposition, depth-3 enumeration justification, RawKmnFragment boundary completeness, provenance attribution) — see epic #231 body for the full list.

**#248** `feat(engine): identity-stub mutation applyIdentityStubMutation()` — *todo*
A deliberately throw-away regex shim that mutates `store(&NAME)` and `store(&COPYRIGHT)` lines directly in the VFS `.kmn` text. Per the spec §14 D9 boundary, this is a temporary stand-in for the IR-layer mutation that lands in KS-S2. Must be clearly labelled in code as superseded by #238 and must NOT accumulate further mutation logic (no rule edits, no BCP47 changes). At sprint close, the follow-on issue `feat(engine): replace identity stub with IR-layer mutation` is filed as a KS-S2 deliverable.

**#249** `feat(studio): Phase A first-3-question identity renderer (subset of #48)` — *todo*
Render only the first 2-3 identity questions from the already-shipped Phase A YAML (#49 PR #185): keyboard display name, copyright holder, and optionally targets. No Phase B, no Phase F yet. Wire each answer to `applyIdentityStubMutation()` (#248). Drop into the resizable-divider layout already shipped from #22 (PR #227).

**#61** `feat(studio): Phase A surfaces v1 desktop-first scope (Decision 6)` — *todo*
Needed alongside the survey renderer — Phase A must surface the desktop-only scope constraint when the user's base keyboard implies a script in the §16 stub list (CJK / Ethiopic). Small UI gate.

**#192** `bug(flows): Phase A script_family divergence (flow 5 vs ScriptFamily type 7) + missing §16 stub gate` — *todo*
ScriptFamily enum mismatch and missing CJK/Ethiopic stub gate. Tightly related to #61 — fix together.

---

## Sprint 2 — KS-S2: KeyboardIR codec begins + replace identity stub

**#233** `feat(engine): KeyboardIR codec — .kmn/.kvks/.keyman-touch-layout parser and emitter` — *todo*
The first real codec pass. Scope for S2: parse + emit US-English fallback (`basic_kbdus`) and every `release/basic/*` keyboard with round-trip I2 fidelity. Other release/* keyboards can fall back to `RawKmnFragment` for opaque sections. Full coverage continues in S3.

**`feat(engine): replace identity stub with IR-layer mutation`** — *new issue from KS-S1 close* — *todo*
Reimplements #248's stub on top of `IRHeader.name` / `IRHeader.copyright`. Deletes the regex shim entirely. The Phase A renderer (#249) continues to call `applyIdentityMutation()` (renamed, same signature) — the change is internal.

**#21** `feat(patterns): Pattern-library loader — parse content/patterns/*.yaml at startup` — *todo*
The pattern YAML loader. Needed before the gallery (KS-S3) and the recognizer (KS-S3) can do anything useful.

**#85** `chore(flows): SurveyAnswer.value is opaque string — boolean/select encoding unclear` — *todo*
Design session to settle before the survey renderer is extended beyond identity questions. Short.

---

## Sprint 3 — KS-S3: Recognizer + carve gallery + sidecar

**#234** `feat(engine): Pattern recognizer — lift IR node clusters into Patterns with origin='recognized'` — *todo*
Consumes content's #240 rule curation (S-01..S-09). Walk the IR after codec parse, run the curated rules, attach a `Pattern[]` with `origin: "recognized"` to `KeyboardIR.recognizedPatterns`.

**#235** `feat(studio): Carve gallery — keep/edit/delete card view over the working IR` — *in PR*
Scrollable card UI over `KeyboardIR.recognizedPatterns + originBlocks`. The user keeps/edits/deletes patterns from the imported keyboard.

**#38** `feat(studio): gallery rendering shell with mini-keyboard demo cards` — *todo*
Original gallery shell (for the surveyed-pattern gallery, not the carve gallery). Lands here once the pattern loader (#21, S2) is ready.

**#236** `feat(engine): Layer A' import-fidelity checks I1-I5 in @keymanapp/kmn-validator` — *todo*
I1 parse completeness, I2 round-trip, I3 header preservation, I4 opaque count budget, I5 sidecar hash. Pairs with #233 codec.

**#239** `feat(output): .kmn.imported sidecar — include in .zip and OAuth working tree, exclude from PR commit` — *todo*
Sidecar storage in VirtualFS; zip serializer includes, OAuth PR-commit serializer excludes. Pairs with content's #241 criteria rows.

**#106** `chore(scaffolder): scaffold() promises 'Layer-C-clean' but returns VirtualFS only` — *todo*
Design Q to settle before the carve-gallery commit step writes back to IR. Short session.

---

## Sprint 4 — KS-S4: Lint engine + lint UI + preview pane

**#44** `feat(validator): Lint engine — criteria.md hygiene rules and htm/php parity` — *todo*
Layer C hygiene rule implementation; runs against the scaffolded VirtualFS.

**#45** `feat(validator): lint chip UI rendering Diagnostic[] inline` — *todo*
Close out remaining ACs (PR #217 landed the rendering but the issue body still tracks unfinished items). Pair with #44 going live.

**#39** `feat(compiler): preview pane with KeymanWeb OSK and modifier toggles` — *todo*
Live interactive preview. Needs the codec (#233) emitting a clean `.kmn` for the compiler to compile.

**#183** `feat(compiler): Deterministic simulate() API for tests, fixtures, and docs` — *todo*
Successor to the closed #18. Powers reproducible preview output for test fixtures and the §7.5 self-check table.

**#156** `feat(engine): Section-18 DISCUS design-heuristic lint checks + TouchLayout type` — *todo*
12 DISCUS heuristic checks from criteria.json §18. Layers on top of #44.

---

## Sprint 5 — KS-S5: Output + integration day

**#138** `feat(studio): Wire spec'd UI to GitHub-API BaseBrowserService` — *todo*
Swap the offline KBDus stub for the live GitHub Trees API in the base-keyboard picker.

**#237** `feat(tools): Supportability scanner CLI — codec + Layer A' over release/` — *todo*
CLI tool emitting `import-corpus.md` / `.json` for all `release/` keyboards. Validates the codec against the full corpus, not just `release/basic/`.

**#147** `feat(studio): Wire Download ZIP button to OutputService.toZip` — *todo*
Small. OutputService is done; UI wire-up only.

**#148** `feat(studio): GitHub OAuth flow + Submit PR button` — *todo*
OAuth App registration + PKCE flow + UI wire-up.

**#226** `feat(flows): Phase C RTL direction-marks key placement` — *todo*
Phase C answer (`pb_rtl_direction_marks`) feeds the scaffolder placement for U+200F/U+200E.

**#32** `feat(studio): Integration Day — swap mocks for real validator, compiler, scaffolder` — *todo*
Original "Day 4 milestone" gate. End-to-end run with no mocks anywhere.

**#53, #54** `Day-7 E2E smoke test — real Keyman Developer build` — *todo*
After #32 passes.

---

## Sprint 6 — KS-S6: kbgen track (after #131 joint session)

**#131** `process(kbgen): Joint engine+content session to settle placement contract + scope` — *todo* — **blocker for this entire track**

After #131:

**#132** `chore(tools): Port kbgen to ESM TypeScript and wire into workspace` — *todo*
**#133** `feat(contracts): Add placement-map type from joint session` — *todo*
**#134** `feat(engine): Consume kbgen output as Phase B placement defaults` — *todo*
**#135** `feat(tools): Expand kbgen strategy coverage beyond S-01/S-08` — *todo*
**#141** `feat(engine): CharacterDiscoveryService — text harvest + CLDR-exemplar picker` — *todo*
**#142** `feat(engine): Linguist agent — synthesizeInventory` — *todo*

---

## Deferred / polish

**#19** `feat(scaffolder): implement template-cleanup per Making a Template.md` — superseded by #238 scaffold-over-IR; close as obsolete or fold acceptance criteria into #238
**#100** `chore(base-browser): publishPR no progress callback; listAll no pagination` — post-integration UX
**#89** `chore(validator): SourceLocation file/line-only vs structured Keyman events` — design Q
**#62** `feat(tools): LLM provider abstraction (packages/llm)` — needed before #142, not before #32
**#63** `feat(output): OAuth token-exchange backend for Option B` — v1.1, no backend required for v1
**#65** `bug(tools): Hygiene backlog P2 follow-ups from Day-1 contract lock` — opportunistic
**#188** `chore(process): Recurring simplification sweep` — ongoing background sweep, not sprint-bounded

**Process / triage-bot issues — separate process backlog, not feature work:**
**#199, #206, #215, #216, #230** `bug/feat(process): km-triage scheduler, workflow, severity enums, escalation, lockfile regen`

---

## Dependency map

```
KS-S1: #232 (contracts session) ─┐
       #248 identity-stub        │
       #249 Phase A renderer     │
       #61, #192 (D6 + script_family) ─┐
                                       │
KS-S2: #233 codec ─────────────────────┼─→ replaces #248 stub
       #21 pattern loader              │
       #85 SurveyAnswer encoding Q     │
                                       ↓
KS-S3: #234 recognizer (← content #240)
       #235 carve gallery
       #38 gallery shell
       #236 Layer A' I1-I5
       #239 sidecar (← content #241)
       #106 Layer-C-clean design Q

KS-S4: #44 lint engine ─→ #45 lint chip UI
       #39 preview ─→ #183 simulate()
       #156 DISCUS heuristics (← #44)

KS-S5: #138 base-browser wiring
       #237 supportability scanner (← #233, #236)
       #147 ZIP, #148 OAuth+PR
       #226 Phase C RTL
       #32 Integration Day ─→ #53 / #54 E2E

KS-S6: #131 (kbgen joint session) ─→ #132 → #133 → #134/#135 → #141 → #142
```

**Critical path: #232 → #248 + #249 (KS-S1) → #233 → #234 → #235 → #32**
KS-S1 parallel split: one person on the contracts session + IR types ratification (#232) and the identity stub (#248); the other on the Phase A renderer (#249) + #61 + #192. The contracts session is a one-day calendar event, not 80 hours of work.
