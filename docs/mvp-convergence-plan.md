# Keyboard Studio — MVP convergence plan (2026-07-21)

The project owner wants to stop "raking leaf-features" and mold the project onto a cohesive skeleton, converging on a shippable MVP. This plan names that skeleton, defines what "MVP done" means, lists the gaps that keep it from standing, gives an ordered critical path, and dispositions all 50 open `feat()` issues into do-now / defer / freeze.

---

## The skeleton

The skeleton is **one thing, and it already physically exists in the code**: a single persistent working-copy `KeyboardIR` threaded through a manifest-driven CYOA survey spine, where every node is analyzed through the same five-verb lens. Name it decisively and stop treating features as free-standing leaves.

**Bone 1 — the working-copy IR spine.** One typed `KeyboardIR` is instantiated at base selection (Track 1 `instantiateFromBase` / Track 2 `instantiateFromExisting`), every step mutates that one copy as re-projected layers, and it is serialized only at output (constitution Art. II/III; [spec.md §5a](../spec.md), [spec.md §12](../spec.md); codec is scaffold = parse → scaffoldIR → emit). This is the accumulator. It is non-negotiable and settled — do not re-litigate it.

**Bone 2 — the CYOA survey spine as monotonic specialization.** The ONE ordered node chain lives in [manifest.ts:91-148](../packages/studio/src/steps/manifest.ts) (`identity → choose_base → track → characters → carve → mechanisms → sequences → touch → help → package`), guarded by `validateManifestShape()` ([manifest.ts:161](../packages/studio/src/steps/manifest.ts)) and sequenced by the single pure policy [steps/advance.ts](../packages/studio/src/steps/advance.ts). Both the runtime and the dashboard read that one array (bijection enforced by [dashboard/driftGuardrail.test.ts](../packages/studio/src/dashboard/driftGuardrail.test.ts); spec 016), one `StepHost` renders every node (spec 028), and no `SurveyStage` union survives. Per [docs/lens-model.md:155-175](lens-model.md): the base is simply the spine's origin, the survey is monotonic specialization (every prefix is a complete shippable keyboard), and the locks (`lock:"physical"` at mechanisms, `lock:"touch"` at touch) are the spine's segment boundaries that already carry provenance — so "inherited vs authored" is just how far down the spine you have walked. No separate provenance system is needed.

**Bone 3 — the five-verb per-node lens.** Every decision node runs the same flow ([docs/lens-model.md:40-95](lens-model.md)): **MEASURE** (keyboard-facets read what the base decided) → **FRAME** (§7.1 axes A1–A7 diff base against target) → **DECIDE** (§7.2 tree → §7.7 gallery, base strategy KEPT or OVERRIDDEN as an editable propose-then-confirm default) → **JUDGE** (DISCUS ranks/warns, never gates) → **VERIFY** (§18 criteria gate the finished artifact). This unifies the four "competing frameworks" into one flow: the galleries, survey, and criteria are the five faces of one keep-or-change question at each node.

**The molding rule:** a feature is either a node on Bone 2, a mutation of Bone 1, or one of the five verbs at a node — **nothing else is in the MVP**. The four remaining forks (opaque characters sub-router, `mutate()` seam OFF by default, track fork in TS not YAML, bespoke gallery internals) live strictly INSIDE nodes, are Phase-2 / loop-primitive-gated by Matt's 2026-06-29 decision, and must NOT be pulled into the MVP — the skeleton stands without touching them.

---

## What "MVP done" means

One author walks the **full contiguous spine** and ships one real, valid keyboard with **zero manual file editing**: `identity → choose_base → track → characters → carve → mechanisms → sequences → touch → help → #output → downloaded .zip`, proven end-to-end for **both a Latin and at least one non-Latin proven alphabetic script** (the five proven scripts being Latin, Cyrillic, Greek, Georgian, Armenian).

"Stands" concretely means spec 034's Success Criteria ([spec.md:169-173](../spec.md)) all pass:

- **SC-001** — the PRODUCED keyboard is valid and compilable (not just the base).
- **SC-002** — the output screen offers both ZIP and PR, with ZIP at 100% even when the PR backend is down, and the PR path degrading honestly (error, not fake success).
- **SC-003** — hard-reload restores the draft and start-over clears it.
- **SC-004** — the contiguous walk completes for the proven scripts.
- **SC-005** — gated scripts (Ethiopic/Han/Hangul) hit the unsupported stub before base resolution.

The single-source, serialize-only-at-output, VirtualFS-only invariants hold throughout. That is the whole MVP; everything below the node level stays deferred.

---

## Gaps to a standing MVP

Blockers first, then major, then minor.

| Gap | Severity | Related issues / refs |
|---|---|---|
| No single e2e test walks the ENTIRE contiguous spine for a non-Latin script. The five-script matrix (T011) reaches ZIP by hash-jumping to `#output` after Phase B (`navigateToOutput`), bypassing carve → mechanisms → sequences → touch → help. The full physical+touch tail is only walked contiguously on Latin-family fixtures. Helpers (`driveTouchGallery`, `driveHelpPhase`) exist; they are just not wired into the non-Latin matrix. | **blocker** | spec 034 SC-004; [copy-edit.spec.ts](../packages/studio/e2e/copy-edit.spec.ts) T011; [helpers/surveyFlow.ts](../packages/studio/e2e/helpers/surveyFlow.ts) |
| The e2e "compilable" signal asserts the BASE compiled (`canDownload` reflects the base's kmcmplib open-base compile), not that the emitted/scaffolded keyboard compiles. [copy-edit.spec.ts:222-228](../packages/studio/e2e/copy-edit.spec.ts) flags this as a tracked follow-up. The load-bearing half of SC-001 is unasserted at the e2e layer. | **blocker** | spec 034 SC-001 / FR; [copy-edit.spec.ts:222-228](../packages/studio/e2e/copy-edit.spec.ts) |
| GitHub PR publication (spec 024, managed-PR) is not on main and is deploy-gated on `VITE_OAUTH_BACKEND_URL`. Code is split across three unmerged branches. Only the honest-degradation half of SC-002/FR-008 is proven; the happy-path PR submit does not work until 024 is consolidated to main and the OAuth proxy is deployed. ZIP works, so the walk still ships. (see [docs/github_flow.md § Status → Option A](github_flow.md) for current per-service detail) | major | spec 024; branches km/448 ([#448](https://github.com/keyboard-studio/keyboard-studio/issues/448)), [#148](https://github.com/keyboard-studio/keyboard-studio/issues/148); SC-002/FR-008 |
| The full Track 2 external-file import lane (file-picker `.kmn` → parse → mutate → emit round-trip) is unproven e2e — [import-improve.spec.ts](../packages/studio/e2e/import-improve.spec.ts) stays `.skip`. FR-004 is satisfied at the reducer level (T005), but the SPA import UI lane has no passing walk. | major | spec 034 FR-004; [import-improve.spec.ts](../packages/studio/e2e/import-improve.spec.ts) (`.skip`); [reducer.test.ts](../packages/studio/src/steps/reducer.test.ts) T005 |
| Spec/runtime drift: spec 034 FR-001 ([spec.md:142](../spec.md)) and epic [#1102](https://github.com/keyboard-studio/keyboard-studio/issues/1102) state the spine as `…carve → mechanisms → touch → help → done`, omitting the `sequences` step and `touch_seed_source` fork that [manifest.ts:123-134](../packages/studio/src/steps/manifest.ts) actually runs. Not a functional blocker, but the umbrella spec no longer describes the spine it claims to pin. | minor | spec 034 FR-001; epic [#1102](https://github.com/keyboard-studio/keyboard-studio/issues/1102); [manifest.ts:123-134](../packages/studio/src/steps/manifest.ts) |
| Stale spec status headers under-count what has landed: 027/028/029 are clearly in the working tree yet their headers still read Draft; 021/023 self-report "LANDED (PR pending)". A reader trusting the headers mis-reads the skeleton as far less converged than it is. Cheapest honesty fix in the corpus. | minor | specs 027/028/029 (Draft headers); specs 021/023 |
| Two decisions cap MVP scope by design (not bugs): FR-006 explicit desktop-lock affordance is deferred (MVP ships the silent auto-lock + post-lock banner, T030); and FR-013 Arabic/Hebrew/Devanagari are selectable but have no RTL/stacking/reorder logic and no acceptance target pending the script-scope Open Question. The walk provably stands only for the five proven alphabetic scripts. | minor | spec 034 FR-006, FR-013; Open Question [spec.md:201](../spec.md); T030 |
| The "all green" gate is environment-sensitive: Node 26 shadows jsdom `localStorage` so studio storage suites fail locally while passing on CI Node 22; the recognizer integration test reads a divergent local `../keyboards` fork; a few flagParity CRLF issues on Windows checkouts. Pin the CI environment as the source of truth so the MVP gate is not read against a red-but-orthogonal local run. | minor | tasks.md T031 |

---

## Critical path

The anti-leaf-raking "do this next" list. Nothing off the three bones gets built until MVP ships.

1. **Freeze the skeleton and the scope fence in writing.** Declare Bones 1–3 as the MVP surface, and explicitly park the four intra-node forks (opaque characters sub-router / promotion of prefill+build-list to first-class nodes; `mutate()` seam behind `VITE_KM_MUTATE_SEAM`; track fork in TS vs YAML; bespoke gallery internals) plus the loop primitive (plan spec #9) as post-MVP.
   *Why:* The problem is not missing features, it is the absence of a named target. Every subsequent step must reject work that is not on a bone; without the fence the team keeps raking leaves (specs 019/020/033 and the mutate-carve/mechanisms/touch chain are all Phase-2, gated by Matt's 2026-06-29 decision).

2. **Wire one contiguous non-Latin full-spine e2e walk (Gap A).** Take a proven non-Latin fixture (e.g. Cyrillic `russian_mnemonic_r`) and drive `identity → … → touch → help → #output → ZIP` without the `navigateToOutput` hash-jump, reusing the existing `driveTouchGallery`/`driveHelpPhase` helpers.
   *Why:* The single cheapest, highest-value move to make the skeleton physically stand: it proves the whole spine holds for the hard case, closing SC-004, and it is pure test wiring against helpers that already exist.

3. **Strengthen the e2e compile assertion from the base artifact to the EMITTED keyboard (Gap B).** Assert the scaffolded/produced `.kmn` compiles clean under kmcmplib, not just that `basic_kbdfr` compiled.
   *Why:* SC-001's load-bearing half ("the produced keyboard is valid and compilable") is currently unasserted; a walk that downloads a ZIP that does not compile does not ship a real keyboard, so the MVP definition is unmet until this flips.

4. **Consolidate spec 024 onto main and deploy the OAuth backend proxy (Gap C),** then prove the PR happy-path e2e alongside the already-proven honest-degradation path.
   *Why:* SC-002 requires both publish paths reachable; today only ZIP + honest PR failure are proven. This is the one item with a hard external dependency (deployed proxy + three-branch merge), so it must start early even though ZIP already ships a keyboard without it.

5. **Un-skip and land the Track 2 external-file import lane e2e (Gap D):** file-picker `.kmn` → parse → carve/mutate → emit round-trip through the SPA.
   *Why:* FR-004 mandates both tracks work against the real engine; the reducer is hardened but the SPA import UI is the one authoring entry with no passing walk, leaving a whole IR source (user-uploaded `.kmn`) unexercised end-to-end.

6. **Reconcile the definitional drift (Gap F + stale headers):** update spec 034 FR-001 / epic [#1102](https://github.com/keyboard-studio/keyboard-studio/issues/1102) spine string to match [manifest.ts](../packages/studio/src/steps/manifest.ts) (add `sequences` + `touch_seed_source`), and flip the Draft status headers on the landed specs (027/028/029/021/023).
   *Why:* Cheap, no-code, and load-bearing for convergence: the umbrella spec must describe the spine it pins, and the status corpus must stop under-counting the unified skeleton, or the next contributor re-derives forks that are already resolved.

---

## Issue disposition

### Tally (attachment × mvpCritical)

No issue is flagged `mvpCritical: true` — the MVP's remaining work lives in the critical-path gaps (test wiring, merges, deploys), not in the open `feat()` backlog. On-skeleton issues are therefore "do now" by attachment.

| Attachment | mvpCritical: true | mvpCritical: false | Total |
|---|---|---|---|
| on-skeleton | 0 | 3 | **3** |
| improves-one-joint | 0 | 32 | **32** |
| orthogonal-leaf | 0 | 15 | **15** |
| **Total** | **0** | **50** | **50** |

Disposition buckets: **Do now — 3**, **Defer — 32**, **Freeze — 15**.

### (A) On-skeleton / MVP-critical — do now

- [#313](https://github.com/keyboard-studio/keyboard-studio/issues/313) feat(engine): IR-native touch-layout codec — sp+lossless passthrough, emitTouchLayout, TouchLayoutIR mutation — Attaches to Bone1's single-IR invariant; converts the touch cleanup step's interim JSON/VFS op into a proper TouchLayoutIR mutation; architecturally on the spine but the interim JSON op already lets the touch node function today — keep on backlog, not required for MVP.
- [#391](https://github.com/keyboard-studio/keyboard-studio/issues/391) feat(engine): carve projection via text-splice (preserve non-deleted .kmn verbatim) — Attaches to the carve node (Bone2) and Bone1 IR-mutation fidelity; replaces applyCarveToVfs's full re-emit with a lossless text-splice; the interim safe-IR gate already prevents corruption, so the proven-script walk isn't blocked — the "proper fix" on backlog, not MVP-critical.
- [#1001](https://github.com/keyboard-studio/keyboard-studio/issues/1001) feat(studio): survey resume across navigation — replace mount-fresh session reset with explicit resume/start-over — Targets StudioShell.tsx's unconditional reset() on SurveyView mount, i.e. Bone 1/2's session-persistence contract; but the linear one-sitting MVP walk (and SC-003's hard-reload path) doesn't require mid-survey tab-switch resume — a spine-adjacent bug, not urgent for convergence.

### (B) Improves one joint — defer

- [#269](https://github.com/keyboard-studio/keyboard-studio/issues/269) feat(engine): codec — opaque reason for bracketed menu-store syntax (refs #233) — Bone1 codec parse; narrow import-fidelity fix for a long-tail construct, not needed by the proven-script bases — freeze until skeleton stands.
- [#308](https://github.com/keyboard-studio/keyboard-studio/issues/308) feat(engine): gallery ranking — recognizer/tree tie-break in three-group routing (§9) — DECIDE/JUDGE gallery tie-break for imported keyboards; makes one node's gallery smarter, walk stands without it.
- [#325](https://github.com/keyboard-studio/keyboard-studio/issues/325) feat(engine): I2 functional round-trip via Keyman Core keystroke runtime — VERIFY verb import fidelity, currently a non-blocking deferred stub; doesn't gate SC-001/SC-002 ZIP output.
- [#342](https://github.com/keyboard-studio/keyboard-studio/issues/342) feat(engine): extend YAML DSL predicate schema to cover S-03..S-13 recognizer rules (refs #273) — Widens recognizer DSL pattern coverage beyond the v1.2 gate; corpus-coverage improvement to one joint, not needed for the proven-script walk.
- [#882](https://github.com/keyboard-studio/keyboard-studio/issues/882) feat(engine): functional I2 round-trip via simulate() at the import/emit gate — Interim functional alternative to the structural round-trip proxy; improves import validation precision, not required for ZIP-based SC-001/SC-002.
- [#1013](https://github.com/keyboard-studio/keyboard-studio/issues/1013) feat(engine): detect if()-guarded postfix mark-order rules on the import path (rule 3a reachability) — Import-mark-order detector recognition fix for a non-proven-script exemplar; one-joint classifier accuracy.
- [#1014](https://github.com/keyboard-studio/keyboard-studio/issues/1014) feat(engine): narrow A3a postfix detection to diacritic/parallel-remap rules to cut false positives — Tightens the same import-mark-order detector's predicate; precision fix to one joint's facet classifier.
- [#331](https://github.com/keyboard-studio/keyboard-studio/issues/331) feat(engine): wire Q1/Q2 placement-habit answers into placement-proposal provenance — Adds a "communities like yours chose" advisory chip to the characters node; propose-then-confirm default works without it, and it's blocked on the not-yet-existing kbgen priors pipeline.
- [#373](https://github.com/keyboard-studio/keyboard-studio/issues/373) feat(survey): alpha-nonlatin A7a (remap-posture) probe in Phase B — Adds a FRAME-verb axis probe so §7.2 rule 8 can fire for Cyrillic/Greek/Armenian; walk still completes via another firing strategy — not load-bearing for SC-004.
- [#543](https://github.com/keyboard-studio/keyboard-studio/issues/543) feat(studio): Phase B — character inventory step — UX polish on the existing charactersStep node, part of UI-only epic #533; node already works per passing e2e; defer as polish.
- [#544](https://github.com/keyboard-studio/keyboard-studio/issues/544) feat(studio): Rule carver UX (resolves the carve checklist) — UX polish on the existing carveStep node; carve.spec.ts already walks it — cosmetic, defer under #533.
- [#545](https://github.com/keyboard-studio/keyboard-studio/issues/545) feat(studio): Mechanism gallery — Design-system styling/status polish on the existing mechanismsStep node; the DECIDE-verb gallery already functions; visual-only, defer under #533.
- [#546](https://github.com/keyboard-studio/keyboard-studio/issues/546) feat(studio): Touch-layout gallery — Design-system styling/status polish on the existing touchStep node; touch-derivation e2e specs already walk it; cosmetic, defer under #533.
- [#547](https://github.com/keyboard-studio/keyboard-studio/issues/547) feat(studio): Help & metadata step — Shared-control/Enter-advance polish on the existing helpStep node; final spine node already works; cosmetic, defer under #533.
- [#526](https://github.com/keyboard-studio/keyboard-studio/issues/526) feat(studio): refactor CarveGallery to use design system CSS variables, fix phase color inconsistencies — CSS-variable/color polish plus a store-chip nav affordance on the carve node; carve already functions.
- [#539](https://github.com/keyboard-studio/keyboard-studio/issues/539) feat(studio): Identity & target-script step — Styling/shared-controls polish of the already-implemented identity node; gated-script routing already functions (SC-005) — this only prettifies its surfacing.
- [#542](https://github.com/keyboard-studio/keyboard-studio/issues/542) feat(studio): Prefill confirmation step — Prefill.tsx is a sub-view inside the characters spine node, not a separate node; pure inline-edit/design-system polish.
- [#61](https://github.com/keyboard-studio/keyboard-studio/issues/61) feat(studio): Phase A surfaces v1 desktop-first scope (Decision 6) — Informational-only banner at the identity node; AC states "no opt-in/branching" so it changes no decision/verb on the spine.
- [#370](https://github.com/keyboard-studio/keyboard-studio/issues/370) feat(studio): physical gallery (Phase C) + scoped assignment map + desktop lock — Mechanisms node already emits MechanismAssignment[] and renders .kmn; remaining work (demos, rota, DISCUS ranking) is node-smartening gated on spec-043 facets per its own re-scope note.
- [#427](https://github.com/keyboard-studio/keyboard-studio/issues/427) feat(studio): CarveGallery UX design — rule view, prioritization, and author decision flow — Carve node decision-flow/flagging UX; carve already functions by showing the full rule list without this inference pass.
- [#497](https://github.com/keyboard-studio/keyboard-studio/issues/497) feat(studio): Track-2 .kmn/source upload entry (adapt a keyboard not in release/) — Alternate upload entry into the existing Track-2 path; Track 2 already works via the release/ catalog picker, and no proven-script MVP walk requires an uploaded .kmn.
- [#525](https://github.com/keyboard-studio/keyboard-studio/issues/525) feat(studio): add removal recommendations to CarveGallery based on survey selections — Recommendation-annotation pass on an already-functioning carve step; remaining scope is explicitly still-open/deferred per its own notes.
- [#551](https://github.com/keyboard-studio/keyboard-studio/issues/551) feat(studio): add CarveGallery entry screen between Phase B and the full carver — New sub-screen inside the existing carve node; walk already completes through carve without it, and it depends on unlanded #525.
- [#619](https://github.com/keyboard-studio/keyboard-studio/issues/619) feat(studio): audit all Carve Gallery information & explanatory copy for accuracy and clarity — Pure copy/accuracy audit at the carve node only; no functional change; skeleton stands without it.
- [#464](https://github.com/keyboard-studio/keyboard-studio/issues/464) feat(ui): let author pick physical keyboard form factor (ANSI vs ISO) for the on-screen keyboard — Display/affordance fix for the mechanisms node's OSK preview ("not a change to emitted .kmn semantics"); walk completes with the current ISO-only OSK.
- [#998](https://github.com/keyboard-studio/keyboard-studio/issues/998) feat(studio): gate the raw .kmn editor on Preview/Output behind an advanced toggle — UX/jargon-exposure fix; walk and ZIP output already work with the editor visible, this only hides it.
- [#999](https://github.com/keyboard-studio/keyboard-studio/issues/999) feat(studio): plain-language translation layer for compiler and preview errors — Copy layer over the VERIFY-verb failure messaging; the happy-path walk to ZIP is unaffected.
- [#1000](https://github.com/keyboard-studio/keyboard-studio/issues/1000) feat(studio): explain import-readiness badges in the base picker in plain language — Copy/legend fix for the choose_base node badges; the badges and gating already exist, this makes them legible.
- [#1081](https://github.com/keyboard-studio/keyboard-studio/issues/1081) canonicalize the assembled BCP47 language subtag (emit registered 2-letter form) — Tag-assembly correctness inside the identity node; the walk completes regardless of 2- vs 3-letter subtag.
- [#372](https://github.com/keyboard-studio/keyboard-studio/issues/372) #5b joint engine+content session — breaking assignment-map redesign — The "bespoke gallery internals" fork explicitly named Phase-2/loop-primitive-gated in the skeleton; AC is a decision doc, not code — freeze until skeleton stands.
- [#506](https://github.com/keyboard-studio/keyboard-studio/issues/506) auto-generate green/yellow/red lint-checklist PR body for GitHub submit — Enhances the output node's PR-submit sub-path; SC-002 only needs ZIP at 100% and honest PR degradation, both already true with the editable stub body.
- [#353](https://github.com/keyboard-studio/keyboard-studio/issues/353) DISCUS check 18.7 (KM_LINT_MANDATED_CHAR_MISSING) + CLDR currency resolver — Adds one more JUDGE-verb DISCUS check; DISCUS only ranks/warns and never gates completion per the five-verb lens.

### (C) Orthogonal leaf — freeze

- [#489](https://github.com/keyboard-studio/keyboard-studio/issues/489) feat(engine): emitPlacementMap Tier 2 — per-tuple BCP47/base-layout + store/any/index expansion — Offline corpus/facet scanner, not any live survey node; classic corpus-scanner leaf — freeze/orthogonal.
- [#135](https://github.com/keyboard-studio/keyboard-studio/issues/135) feat(tools): expand kbgen strategy coverage beyond S-01/S-08 — Standalone CLI kept out of packages/*; issue body records the #131 gate as closed "NOT for v1" — no walk dependency.
- [#297](https://github.com/keyboard-studio/keyboard-studio/issues/297) feat(tools): automated §7.5 corpus evaluation — axis extractor + tree runner over release/, StrategyDivergence report — Corpus-scale offline strategy-selection audit, blocked on #234/#237; never runs inside the author's survey walk.
- [#548](https://github.com/keyboard-studio/keyboard-studio/issues/548) feat(studio): Preview screen — PreviewScreen is a sibling top-level view, not one of the ten manifest spine nodes the walk traverses to #output; styling-only per #533 non-goals — not on the walk at all.
- [#535](https://github.com/keyboard-studio/keyboard-studio/issues/535) feat(studio): Adopt the design-system type system (Source Sans 3 + Noto Sans) — Global font/branding adoption spanning every node under UI/UX epic #533; not a spine node, IR mutation, or verb.
- [#538](https://github.com/keyboard-studio/keyboard-studio/issues/538) feat(studio): Pervasive status & progress surface — Cross-cutting wizard-progress/status chrome generalized across all nodes; adds no node/mutation/verb — UI-epic chrome.
- [#937](https://github.com/keyboard-studio/keyboard-studio/issues/937) feat(studio): add data-testids to mechanism intro-splash and remaining survey advance controls — Test-infra hardening for carve.spec.ts helpers; reduces E2E brittleness, not part of the author-facing walk.
- [#504](https://github.com/keyboard-studio/keyboard-studio/issues/504) feat(validator): decide whether lint chips need machine-actionable "Apply fix" — A scope/roadmap decision issue explicitly deferred to v1.1 per spec §16; JUDGE-verb enhancement at best, outside the MVP walk.
- [#552](https://github.com/keyboard-studio/keyboard-studio/issues/552) feat(studio): first-time user tutorial / onboarding flow — Explicitly a placeholder pending Matthew's approval; onboarding/tutorial chrome around the walk, not a node or bone — not actionable until approved.
- [#58](https://github.com/keyboard-studio/keyboard-studio/issues/58) Add Risk and dependencies section to spec.md — Pure spec-prose/process deferred item, explicitly "not blocking v1.0"; no node/bone touched.
- [#59](https://github.com/keyboard-studio/keyboard-studio/issues/59) Add Performance targets table to spec.md — Spec-doc prose section, empirical numbers explicitly deferred to post-integration; not on the walk.
- [#60](https://github.com/keyboard-studio/keyboard-studio/issues/60) Add Accessibility section to spec.md — Spec-doc prose section (WCAG/RTL/localization roadmap for the studio UI); self-declared not blocking v1.0.
- [#1006](https://github.com/keyboard-studio/keyboard-studio/issues/1006) upstream delivery governance — PR shepherding + submission repo retarget — Post-submit human/process governance entirely after the walk's #output screen; ZIP path unaffected — delivery-ops leaf.
- [#550](https://github.com/keyboard-studio/keyboard-studio/issues/550) prod deploy — dual-app (GitHub App + OAuth App) for Option A/B delivery — Ops/deploy gates blocked on humans not code; enables the PR path but ZIP alone satisfies SC-002, and PR degrading honestly already works — delivery-ops leaf.
- [#1007](https://github.com/keyboard-studio/keyboard-studio/issues/1007) hosted LLM backend strategy — key custody and provider pluggability before character discovery lands — Infra/ADR decision gating the not-yet-implemented CharacterDiscoveryService (the "opaque characters sub-router" fork the skeleton marks Phase-2-gated and must NOT be pulled into MVP).

---

## The test going forward

**Gate every change by one question: "Does this help the MVP walk stand end-to-end?"** If it is not a node on Bone 2, a mutation of Bone 1, or one of the five verbs at a node — it waits.
