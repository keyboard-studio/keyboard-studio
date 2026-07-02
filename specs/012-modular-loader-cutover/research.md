# Phase 0 Research: Modular-loader cutover + legacy YAML retirement

All unknowns from Technical Context were resolved against the live tree on branch base. No `NEEDS CLARIFICATION` remain.

## R1 — How A/F cut over: loader + import swap

**Decision**: For Phase A and Phase F, replace `parseFlow(<fullYaml>?raw)` with `loadModularFlow(<modularYaml>?raw)` and swap the `?raw` import to the existing `.modular.yaml`. Drop the `TODO(#410)` comment line.

**Rationale**: Both loaders return the same `FlowDef` shape ([loadModularFlow.ts:113](../../packages/studio/src/survey/loadModularFlow.ts#L113); `parseFlow` at [loadFlow.ts:14](../../packages/studio/src/survey/loadFlow.ts#L14)), and `SurveyRunner` consumes either without modification — this is exactly the Phase B precedent ([PhaseB.tsx:659](../../packages/studio/src/survey/PhaseB.tsx#L659)). Verified the A manifest's ids (`desktop_first_notice` … 15 `provenance_questions`) and the F manifest's 8 ids (`pf_welcome_paragraph` … `pf_contact_info`) all correspond to registered Phase A/F modules, so resolution will not throw.

**Alternatives considered**: Rewriting the components to drive the registry directly (rejected — out of scope, that is P4's manifest-driven ordering; the loader swap is the minimal P3 change).

## R2 — identity-lite needs 5 NEW question modules (the real work)

**Decision**: Author and register 5 new Phase-A question modules ported verbatim from `identity_lite.yaml`, then create `content/flows/identity_lite.modular.yaml` referencing them in legacy order:

| id | type | routing / notes |
|---|---|---|
| `il_language_autonym` | text, required | `next: il_language_english` |
| `il_language_english` | text, required | `next: il_language_code`; autonym→English **seed** stays in `IdentityLite.tsx` `getSeedValue` (not in the module) |
| `il_language_code` | text, optional | `next: il_target_script` |
| `il_target_script` | select, required | conditional `next`: `value in {Ethi,Hani,Hang} → il_script_not_supported`, else `default: null` |
| `il_script_not_supported` | notice, optional | `next: null` — preserves the Article VII honest "not yet supported" stub |

**Rationale**: `loadModularFlow.resolveIds` throws on any id absent from `questionRegistry` ([loadModularFlow.ts:96](../../packages/studio/src/survey/loadModularFlow.ts#L96)). The `il_*` ids exist **only** in the legacy YAML — there are no `il_*` modules (verified: `find … -name "il_*"` returns nothing). They are distinct from the full Phase A modules (`language_name_autonym` etc.), so they cannot be aliased. Routing must move into each module's `definition.next` because the thin manifest carries membership only, not routing (loader design decision B). The new modules declare empty `inputs`/`writes` (consistent with the 85 existing empty-declaration modules; `mutate` stays the documented stub until #5b/#232).

**Alternatives considered**:
- *Reuse the full Phase A modules for identity-lite* — rejected: different ids, different prompts/help-text, different routing (identity-lite is the short hybrid head, spec §8); reusing them would change author-visible content (fails the parity gate).
- *Extend the loader to accept inline question definitions for identity-lite* — rejected: re-introduces the full-YAML form the feature is retiring, and forks loader behavior.

## R3 — Registry count gates move 93 → 98

**Decision**: Update the module-count floor in [inputs-writes-coverage.test.ts:20](../../packages/studio/tests/survey/inputs-writes-coverage.test.ts#L20) from `93` to `98` in the same change that adds the 5 modules. Add 5 mirrored tests under `packages/studio/tests/survey/questions/a/` so [mirror-coverage.test.ts](../../packages/studio/tests/survey/mirror-coverage.test.ts) stays green. Ensure each new module declares `inputs`/`writes` so the coverage gate passes and the (now identity-lite-manifest-scoped) [orphan-input-lint.test.ts](../../packages/studio/tests/survey/orphan-input-lint.test.ts) passes.

**Rationale**: P2 shipped three CI gates that count/scan the registry. Adding modules without updating the `93` floor fails CI; missing mirrors fail mirror-coverage; undeclared `inputs`/`writes` fail the coverage gate. Empty `inputs` arrays keep the orphan-input lint trivially satisfied for identity-lite (no input requires an upstream producer). The autonym→English dependency is a UI seed, not a declared IR `input`, so it does not register as an orphan.

**Alternatives considered**: Leaving the gates and "fixing later" — rejected: CI would be red on the cutover commit.

## R4 — Parity verification: golden compare before any deletion

**Decision**: Add a per-phase **golden-compare** unit test that loads the legacy full-YAML flow via `parseFlow` and the modular flow via `loadModularFlow`, then asserts the resolved `FlowDef` question sets are equivalent on the author-visible fields (id, prompt, help_text, type, options, required, next) for A, F, and identity-lite. This test must pass **before** part (b) deletes any YAML — it is the deletion's safety baseline. Once a phase's YAML is deleted, its golden test is removed in the same (b) change (the baseline no longer exists), and the modular `FlowDef` is pinned by a snapshot instead.

**Rationale**: FR-005/FR-006 require identical output and ordering of operations (compare-then-delete). Doing the comparison at the `FlowDef` level is structure-agnostic and does not require rendering. This is the contract captured in `contracts/flow-output-parity.md`.

**Alternatives considered**: Relying solely on E2E lanes for parity — rejected: E2E lane 2 is blocked (R5), and per-phase golden compare is finer-grained and fully in our control.

## R5 — E2E lanes: install Playwright; lane 2 has an external blocker (RISK)

**Decision**: Use the **globally-installed Playwright CLI** (v1.61.1, on PATH; resolved by `npx playwright`) rather than adding `@playwright/test` as a package devDependency. The e2e spec headers' "Playwright is not yet installed in this package" refers only to the missing *devDependency / config / script* — the CLI itself is available and is how E2E has been driven. So unblocking is: (1) add a `packages/studio/playwright.config.ts` (testDir `e2e/`, `baseURL: http://localhost:5273`, a `webServer` that runs `pnpm dev`), drive it with `npx playwright test` (optionally a `test:e2e` script that shells to the CLI — no devDependency add), and remove `.skip` from **lane 1 (copy-edit / Track 1)**. (2) **Lane 2 (import-improve / Track 2)** carries a documented *additional* blocker — "Track 2 import … not yet confirmed fully live; survey flow + re-import path stubbed or partial" ([import-improve.spec.ts](../../packages/studio/e2e/import-improve.spec.ts) header) — independent of install; its inner `.skip` may only be removed after km-frontend confirms Track 2 import is live.

> **Install note (corrected 2026-06-27):** Playwright is NOT absent from the system — it is a global install (`/d/Apps/anaconda3/Scripts/playwright`, v1.61.1). The plan uses the CLI directly. A pinned local devDependency is the more reproducible option for CI, but per user direction this feature uses the existing CLI; if CI runs on a machine without the global install, fall back to `npx playwright` (downloads on demand) or pin it then. The browser binaries may still need `npx playwright install` on first run.

**Rationale / RISK**: FR-007 / SC-004a+SC-004b ("both lanes pass") and #410 AC#3 may **not be fully closable inside this feature** if Track 2 import is not live. Lane 1 (copy-edit) exercises the identity-lite → Phase A/B path this cutover touches and is the directly relevant gate. **Recommendation**: gate the identity-lite/A/F cutover correctness on (a) the R4 golden-compare unit tests plus (b) E2E lane 1; treat lane 2 as a **conditional** AC — unblock and pass it if Track 2 import is confirmed live, otherwise document it as remaining-blocked-on-Track-2 and keep #410 AC#3 partially checked (`refs #410`, not `closes`, until lane 2 is green). This needs a user/km-frontend decision; flagged in `/speckit-clarify` territory but does not block planning.

**Alternatives considered**: Authoring brand-new lanes (rejected — they already exist as skipped specs with unblock recipes); forcing lane 2 green by stubbing Track 2 (rejected — would make the gate a no-op, violating FR-007 scenario 2).

## R6 — Commit/PR split and revertability

**Decision**: Two changes. **(a) Cutover** — new modules + tests + `identity_lite.modular.yaml` + the three component edits + gate-count bump + E2E unblock; this is what `closes`/`refs` #410. **(b) Deletion** — remove `loadFlow.ts` (+ test) and the four legacy full-flow YAMLs, and remove the now-baseline-less golden tests; this is the out-of-#410 follow-up and must revert independently (restoring the YAML re-enables `parseFlow` without touching the cut-over components).

**Rationale**: FR-013 + the spec's rollback strategy. Keeping (a) and (b) separate lets #410 close on (a) and isolates the irreversible-feeling deletion.

## R7 — No-delete / question-library invariant (§3.8)

**Decision**: Part (b) deletes only `loadFlow.ts` and the four legacy *full-flow* YAMLs. It deletes **no question module**. Phase B's legacy `phase_b_characters.yaml` is deleted (its modular form is already runtime truth), but every Phase B/A/F module file stays. Any module a surviving manifest does not reference remains a compiled, test-covered **library/reserve** module.

**Rationale**: FR-011/FR-012, §3.8. In this feature no module becomes orphaned by the cutover (A/F/B manifests already reference their modules; the 5 new `il_*` are referenced by the new identity-lite manifest), so the no-delete invariant is satisfied trivially — but the principle is recorded so the deletion step is scoped to delivery forms only and never sweeps modules.
