# Handoff: 013-retire-legacy-flow-loader (Phase 3b)

**Branch**: `km/retire-legacy-flow-loader` (off `main` @ `e4d3665`)
**Status**: Implementation COMPLETE (all 3 user-story commits landed + planning-artifacts commit). **Verification (Cycle 2) + PR (close-out) NOT yet done.**
**Date**: 2026-06-27

This doc is the single source of truth for the next agent to finish the cycle. Read it, then run Cycle 2 (verification + synthesis) and close with a PR.

---

## What is the feature

Phase 3b of [docs/survey-modularity-cyoa-plan.md](../../docs/survey-modularity-cyoa-plan.md): retire the legacy full-YAML survey flow loader now that Phase 3a (commit `e4d3665`, #739) cut Phase A/F/identity-lite over to `loadModularFlow`. Three sequential, independently-revertible commits: repoint → delete loader → delete data. Question research content (`survey/questions/**`) is preserved untouched.

Full design: [spec.md](./spec.md), [plan.md](./plan.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/flow-graph-parity.md](./contracts/flow-graph-parity.md), [quickstart.md](./quickstart.md), [tasks.md](./tasks.md) (T001–T029). GitHub issues **#748–#776** map 1:1 to the tasks. This feature is the "beyond #410" follow-up — it `refs #410`, it does **not** `closes #410`.

---

## Commits on the branch (newest first)

| SHA | Subject | Story |
|-----|---------|-------|
| `bf73b83` | `docs(spec): add 013-retire-legacy-flow-loader spec-kit planning artifacts` | (planning) |
| `1918d49` | `maint(studio): delete legacy full-flow YAMLs` | US3 |
| `b4452b5` | `maint(studio): delete legacy parseFlow loader` | US2 |
| `9c395cc` | `refactor(studio): repoint flow map to modular loader` | US1 |

Revert order if ever needed: **3 → 2 → 1** (`1918d49` → `b4452b5` → `9c395cc`). The docs commit `bf73b83` is independent.

---

## What landed (verified by the lead)

- **US1 (`9c395cc`)** — flow-map repoint:
  - `buildFlowGraph.ts`: `buildModularFlowGraph(raw, title, registry)` now takes the registry param (was hardwired to `phaseBRegistry`); legacy `buildFlowGraph()` + `parseFlow` import removed.
  - `buildScriptRouting.ts`: `parseFlow` → `loadModularFlow`.
  - `FlowMapView.tsx`: three legacy `*.yaml?raw` imports → `*.modular.yaml?raw`; `FlowSourceEntry` union collapsed to one shape carrying its registry (Identity-lite→`phaseARegistry`, Phase A→`phaseARegistry`, Phase B→`phaseBRegistry`, Phase F→`phaseFRegistry`); `safeBuild` simplified; `ScriptRoutingView` fed the identity-lite modular raw.
  - `buildFlowGraph.test.ts` retargeted to modular fixtures; `.snap` regenerated; INV-1 (live nodes == manifest) and INV-2 (script routing: Ethi/Hani/Hang `gated:true`) assertions added.
- **US2 (`b4452b5`)** — `survey/loadFlow.ts` + `loadFlow.test.ts` deleted.
- **US3 (`1918d49`)** — four legacy YAMLs (`identity_lite`, `phase_a_identity`, `phase_b_characters`, `phase_f_helpdocs` `.yaml`) deleted. Four `*.modular.yaml` manifests + `content/flows/_examples/*` kept.

**Lead-verified invariants:**
- `grep -rnE "parseFlow|phase_a_identity\.yaml|phase_f_helpdocs\.yaml|identity_lite\.yaml|phase_b_characters\.yaml" packages/studio/src/flowmap` → no matches.
- `loadFlow.ts` / `loadFlow.test.ts` → gone.
- Legacy YAMLs → gone; modular manifests → present.
- Question-module count `find packages/studio/src/survey/questions -name '*.ts' ! -name '*.test.ts' | wc -l` → **102** (unchanged from baseline; INV-4 holds).

---

## ⚠️ TWO DEVIATIONS THAT NEED A REVIEWER'S SIGN-OFF

The implementer (`km-frontend`) made two judgment calls outside the literal brief. Both look reasonable but were **not independently verified** — this is the main thing Cycle 2 must scrutinize.

### Deviation 1 — `computeReserveNodes` now counts `provenance_questions` as live
In `buildFlowGraph.ts`, `computeReserveNodes` originally built `liveIds` from `flow.questions` only. Phase A carries a supplemental `provenance_questions` list (the graph core already merges these — see `buildGraphFromQuestions`). Without the fix, Phase A's ~15 provenance questions rendered as spurious `library-not-in-flow` reserve nodes. The fix adds `provenance_questions` to `liveIds`.
- **Verify**: that no *genuinely-reserve* module is now being hidden, and that the live-node assertion in the test still equals the manifest's intended live set. Cross-check against decision **D3** in [research.md](./research.md).

### Deviation 2 — `tests/survey/flow-parity.test.ts` was REWRITTEN
This was the Phase 3a safety net: a `parseFlow`-vs-`loadModularFlow` *cross-loader* comparison. Deleting `loadFlow.ts` (US2) makes that comparison impossible — so it was converted to standalone modular structural-integrity assertions (id/type/prompt/label/body/options/next + snapshot + ID-order).
- **This is expected** (you cannot compare against a loader you just deleted), **but it weakens the original guarantee** and the tasks.md said this harness should "stay green," implying *unchanged*. A reviewer must explicitly accept that the cross-loader check is necessarily retired with the legacy loader, and confirm the replacement assertions are strong enough. The golden values it now asserts came from the modular loader's current output — confirm they match the pre-3b runtime (e.g. against `e4d3665`).

---

## Known pre-existing test noise (confirm, don't fix here)

`km-frontend` reported **3–4 failing `BaseKeyboardPicker` badge tests** that are unrelated to this feature and present before the branch.
- **Action for next agent**: confirm they fail identically on `main` (`git stash && git checkout main && pnpm --filter @keyboard-studio/studio test src/...BaseKeyboardPicker... `). If they are pre-existing, note it in the PR body so they are not attributed to this change. If they are NOT pre-existing, that is a regression and a blocker.

---

## REMAINING WORK (Cycle 2 + close-out)

Run as KM crew (`/km-lead` continuation) or directly:

1. **Cycle 2 — verification + synthesis (parallel):**
   - `km-verification`: run the full [quickstart.md](./quickstart.md) end-to-end — US1/US2/US3 sections, whole-feature gates (`pnpm typecheck`, `pnpm lint` incl. `pnpm depcruise`, `pnpm --filter @keyboard-studio/studio test`, and `pnpm build` for the Vite `?raw` dangling-import catch), and the research-preservation count. Produce pre/post evidence. Resolve the pre-existing-failure question above.
   - `km-synthesis`: review the diff for integration fit — especially the two deviations above, and that the `FlowSourceEntry` collapse + registry threading match existing patterns in `flowmap/`.
2. **Fix any blockers** the above surface (`km-programmer`/`km-frontend`), then re-verify.
3. **Close-out — `km-archivist`:**
   - Open PR against `main` from `km/retire-legacy-flow-loader`.
   - Reconcile spec acceptance criteria **SC-001…SC-006** against the diff in the PR body.
   - Walk issues **#748–#776**: check the AC boxes that actually shipped; use `closes #748` … per-task as verified, but for the umbrella **`refs #410`** (NOT `closes` — this is the follow-up, #410 has broader scope).
   - `KM-Reviewed:` trailer = the specialists that returned APPROVE this cycle.

---

## Guardrails (from CLAUDE.md — do not violate)

- Do **not** touch `packages/studio/src/survey/questions/**` (research content; INV-4/FR-007).
- Do **not** cite GitHub issue numbers in shipped code/comments (cross-link via commit/PR only).
- Preserve explicit `.ts`/`.tsx` import extensions (strict Bundler resolution).
- No emoji in console output; `[OK]`/`[ERROR]`/`[WARN]`.
- Three commits stay separate (revert independence) — do not squash US1/US2/US3.
- If you run `pnpm build`, it regenerates `packages/engine/src/recognizer/rules/generated/*` — that is codegen noise, **do not commit it** to this branch (the lead already `git restore`d it once).
