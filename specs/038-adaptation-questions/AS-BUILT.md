# Spec 038 En-masse adaptation preference questions: as built

**Status:** Retired 2026-09-29. Shipped in PR #1184 (squash `eb2c9de`, 2026-07-18). Tasks: 38/38 complete.
**Full docs:** [specs/_archive/038-adaptation-questions/](../_archive/038-adaptation-questions/) (spec, plan, tasks, research, contracts, checklists). Not read by default.
**Pinned here:** [data-model.md](data-model.md) (Entity 1, the question-record schema; linked as the schema reference from [content/adaptation-questions/README.md](../../content/adaptation-questions/README.md)).

## What shipped
- A 9-record question catalog, `content/adaptation-questions/*.yaml`, in three families: script-alignment (Q-SA1..3), inheritance-posture (Q-IP1..3), trust-policy (Q-TP1..3).
- `adaptation-catalog-lint` (`utilities/adaptation-catalog-lint/index.js`, checks C1-C8) wired into `pnpm lint` after `facet-lint`. `firingCondition: always` is rejected (C3).
- Engine surfaces in `packages/studio/src/adaptation/`: catalog loader, firing-condition evaluator, inheritance-posture builder + `InheritancePostureStep`, trust policy, confirmation/override event log.
- Per-question survey modules `packages/studio/src/survey/questions/b/q_{sa,ip,tp}*.ts`; session-facet `consumers` in `content/facets/**` updated so facet-lint coverage stays honest (FR-008).

## Public contracts (as the code has them)
- `QuestionRecord`, `QuestionFamily`, `loadAdaptationCatalog(rawByPath)`, `adaptationCatalog` in `adaptation/catalog.ts`. Record fields: id, family, elicits, firingCondition, prefill.facets, prefill.sessionFacet?, provenanceLabel, consumers, noEvidenceDegradation (ask-plainly | record-no-default), scope (session | workflow), renders, status. Full table in the pinned data-model.md.
- `evaluateFiringConditions(evidence, policy, catalog = adaptationCatalog): FiredQuestion[]` (`firing.ts`); `AdaptationEvidence` / `AdaptationEvidenceProvider` in `evidence.ts` (the mockable seam onto the facet index); `classifyBaseScript` in `firing.ts`.
- `TrustPolicy { singleScriptThreshold, allowFallbackTierPrefill, orthographyJoins[], scope }`, `TRUST_POLICY_DEFAULTS` (0.8, true, [], "workflow"), `resolveTrustPolicy`, `persistTrustPolicy`, `loadTrustPolicy`, `recordPolicyResolution` in `trustPolicy.ts`.
- `buildPosture`, `postureFor`, `reconcilePostureOnBaseSwitch`; `PostureFacet` = script | input-strategies | device-targets | script-conventions (`posture.ts`).
- `ConfirmationEvent { questionId, facetIds, prefilledValue, finalValue, action confirmed|overridden, provenanceTier, at }`, `recordConfirmation`, `readConfirmationEvents`, `resetConfirmationEvents` (`confirmationEvents.ts`).
- Barrel: `packages/studio/src/adaptation/index.ts`. No `packages/contracts` types were touched.

## Key decisions
- Catalog is content-owned YAML mirroring `content/facets/`; ids double as survey-module ids so facet-lint resolves them (research D1).
- Firing conditions read the index through an injectable evidence seam, so tests use a mocked index (D3).
- "always" is banned: a question must fire on an evidence state (D4). Confident agreement fires nothing but yields a pre-confirmed chip.
- Every question has a defined no-evidence degradation; none silently vanish (FR-004).
- Named orthographies (Ajami) arise only through an author-confirmed `orthographyJoins` opt-in (FR-009, D7).
- Confirmation/override events are recorded for the facet evaluation harness (FR-007, D5).

## Gotchas and limits
- The confirmation-event log is an in-memory, session-scoped append-only array; nothing persists or exports it yet.
- Scope persistence is per workflow via `persistTrustPolicy(policy, workflowId)`.
- Fallback-tier base with prefill disallowed yields `prefilledValue: null`, never a dropped question.

## Divergences from the spec
- None in signatures. Outside `adaptation/` and tests, no production code calls `evaluateFiringConditions`, `InheritancePostureStep`, `loadTrustPolicy` or `readConfirmationEvents` (grep of packages/studio/src at origin/main); the q_ip1..3 modules only reference the step in comments. The surfaces are built and tested but not mounted in the live survey flow.

## Follow-ups and open issues
- Mount the firing evaluator and posture step in the survey/base-confirmation flow, and feed `readConfirmationEvents()` to the facet evaluation harness.
- Stale links to `specs/038-adaptation-questions/spec.md` in [content/adaptation-questions/README.md](../../content/adaptation-questions/README.md) line 3 and [content/facets/README.md](../../content/facets/README.md) line 207 now hit the stub; retarget to AS-BUILT (km-doc).
