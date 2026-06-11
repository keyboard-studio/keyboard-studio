# Keyboard Studio Spec — Review Sign-Off

**Spec version:** 1.1.1 (original sign-off: 1.0, 2026-06-02)
**Date:** 2026-06-09
**Spec file:** keyboard-studio-spec-draft.md (1044 lines, 19 sections)
**Reviewer crew:** lex-doc (drafting + revision), lex-qc, lex-domain, lex-synthesis
(lex-verification was not used — this was a doc-authoring cycle; no code or tests to verify.)

---

## Review Cycles

| Cycle | Focus | Reviewers | Outcome |
|-------|-------|-----------|---------|
| 1 | Discovery + initial drafting | Explore agent (digest), lex-doc (draft) | 519-line draft; 5 inline OPEN items |
| 2 | Full parallel review | lex-domain, lex-qc, lex-doc (second-pass structural critique) | 5 P0, 12+ P1, ~10 P2 issues identified |
| 3 | Revision pass | lex-doc | 393 lines; all P0+P1 closed; ToC restructured 14->18 sections; OPEN items resolved as DECISIONS; Glossary and Revision policy added |
| 4 | Targeted spot-check on revision deltas | lex-qc, lex-domain (parallel) | 9 PASS + 1 cosmetic PARTIAL (qc); 8/8 PASS (domain); one P2 footnote opportunity noted |
| 5 | P2 micro-edit + sign-off | lex-doc (footnote), lex-synthesis (this document) | P2 closed; sign-off issued |

---

## Decisions Baked In (Sec 14)

- **D1 — Partial slot-fill:** Block on required slots; allow optional empty only if substituted fragment passes Layer A validation.
- **D2 — CasedKeys for non-Roman:** Default omit; survey-prompt shown for case-distinct script subtags: Armn, Geor, Adlm, Osge, Wara, Cher.
- **D3 — Lint vs. compile:** One debounce cycle (300 ms), two concurrent microtasks; TS error suppresses WASM call; WASM diagnostic supersedes conflicting TS diagnostic.
- **D4 — Quality bands:** Four bands: scaffolder-bake / Layer-C-enforce / yellow-survey / red-checklist.
- **D5 — CJK/Ethiopic:** Confirmed out of v1; routing renders "not yet supported" stub.
- **D6 — Desktop-first authoring scope:** v1 is desktop-first only; touch layout produced in Phase E from desktop OSK; mobile-primary authors notified at Phase A before survey investment; touch-first authoring is a v1.1 candidate.

---

## Residual Items

**NONE.** All P0, P1, and P2 items flagged across cycles 1-4 were closed in-cycle.

Three items noted in the spec's Revision policy (Sec 18) — Risk/dependencies section, Performance targets table, Accessibility section — are scope expansions tracked for v1.1, not residual review findings from this cycle.

---

## Post-Sign-Off Amendments

- **2026-06-02 (v1.0.1):** Added Decision 6 (desktop-first authoring scope) after pre-implementation review identified the mobile-first phase-order gap as a v1 BLOCKER (lex-domain Cycle 1). Also added §7.1 sub-axis A7a (full-remap detection) and §7.2 rule 8 (alphabetic full-remap → S-06 + S-04 + S-08) to close the Armenian/Cyrillic mis-routing BLOCKER from the same review.
- **2026-06-02 (v1.0.2, Cycle 3 close-out — Day-1 contract lock APPROVED):** LEX crew 3-cycle review (lex-domain, lex-doc, lex-qc, lex-verification) closed APPROVED. Locked contract surface in `packages/contracts`: Pattern (with `strategyId: StrategyId` / `combinesWith: StrategyId[]`), PatternMatch (optional strategyId), DiscoveryAxisVector (camelCase fields per §7.1; A2a + A7a sub-axes), VirtualFS (`serializeZip(): Promise<Uint8Array>` — Node + browser portable), `makePattern()` factory + `PatternInit`, `ALL_STRATEGY_IDS`, `StrategyId` union. Spec §5 amended in v1.0.2 to use StrategyId in the Pattern interface (was `string`). §7.5 Armenian and Russian rows corrected to S-06 + S-04 + S-08 with new S-04 building-block legend note. §7.2 prose updated with rule-11 description. Build status: typecheck/test/build all exit 0; 7/7 tests pass. Two micro-cleanups (this commit's predecessor): spec.md S-08 card "rules 9" → "rule 10" typo; pattern.test.ts non-null assertions on bare ALL_STRATEGY_IDS index access. Parallel engine + content team phase cleared to start per spec §13.
- **2026-06-08 (v1.1.0, KeyboardIR import + functional round-trip):** Added §5a KeyboardIR schema (typed IR for parsed `.kmn` + `.kvks` + `.keyman-touch-layout` files), decisions D7-D9 (functional-equivalence round-trip, opaque imports for unrecognized features, IR-is-canonical), Layer A' import-fidelity checks I1-I5 in §10, and the source-selection-then-carve-gallery flow in §8. Removed the v1 exclusion on editing existing keyboards from §16. Added two optional `Pattern` fields (`origin`, `ownedNodes`) linking lifted patterns back to their owning IR nodes. The full amendment proposal lives at [docs/spec-amendment-2026-06-08-keyboardir.md](spec-amendment-2026-06-08-keyboardir.md). Held: the formal #5b joint engine+content session that ratifies the KeyboardIR schema and Pattern field additions has not yet run — this commit captures the spec language for that session to review. Five open questions are tracked at the bottom of the amendment proposal file.
- **2026-06-11 (v1.1.1, corpus-derived placement priors):** Prose-only amendment from the KM crew placement-intelligence review ([docs/placement-intelligence-review.md](placement-intelligence-review.md)). Added §7.6 (placement priors mined from `release/`: codec post-pass extraction, independence-weighted aggregation, blending order, precedent-vs-first-principles precedence rule), §7.5.1 (corpus-scale evaluation of the decision tree emitting `StrategyDivergence` records), per-strategy **Placement semantics** notes on the S-02/S-05/S-06/S-07/S-09 cards in §7.3, and the Phase B placement-proposal protocol in §8. No `Pattern` schema change; `priorSource`/`priorCount` land on the not-yet-locked placement-map type via the kbgen joint session. Amendment record: [docs/spec-amendment-2026-06-11-placement-priors.md](spec-amendment-2026-06-11-placement-priors.md).

- **2026-06-09 (v1.1.1, #232 KeyboardIR contract lock closed):** KM crew cycle 1 — six parallel ratification audits (km-keyman, km-domain, km-strategy, km-author, km-validator, km-output) all returned APPROVE-WITH-CORRECTIONS. Cycle 2 group 1 — km-programmer applied Tier 1 schema corrections; group 2 — km-domain, km-keyman, km-validator, km-verification all ratified; group 3 — km-doc (this pass). Spec bumped to v1.1.1; `@keyboard-studio/contracts` bumped to 0.3.0 (additive minor, pre-1.0 conventions per §18). Build: `pnpm -C packages/contracts typecheck` exit 0, `pnpm -C packages/contracts test` 163/163 pass, `pnpm -r typecheck` exit 0 across contracts/engine/studio/studio-poc.

  **Tier 1 schema corrections** (km-programmer, ratified by km-domain/km-keyman/km-validator/km-verification): (1) `IRHeader.storeDirectives` typed as `string[]` not `StoreItem[]` (km-keyman); (2) `TouchLayoutIR` restructured to `platforms: Array<{id,font?,layers}>` per real file shape (km-output); (3) `KvksIR` keys typed as `{vkey,label,chars?}` not `{vkey,output}` — label/chars split matches real `.kvks` schema (km-keyman); (4) `TouchLayoutIR.nodeIds` and `KvksIR.nodeIds` changed from `Map<string,IRNodeRef>` to `Array<[string,IRNodeRef]>` for JSON round-trip (km-output); (5) `RoundTripDiff.corpusSpec` added — pins corpus parameters for reproducible divergence reports (km-keyman); (6) `KvksIR.kvksVersion?` and `kbdname?` header fields added (km-keyman); (7) `IRHeader.storeDirectives` JSDoc updated (km-keyman).

  **Tier 2 spec corrections**: (T2-#8) §5a sketch `TouchLayoutIR`/`KvksIR` `nodeIds` corrected to `Array<[string,IRNodeRef]>` with JSON-round-trip note (km-output); (T2-#8b) `storeDirectives` sketch type corrected to `string[]`; (T2-#9) D7 amended with two paragraphs: d=3 runtime justification and I2 concurrency model (km-keyman/km-validator); (T2-#10) §5a gallery ranking rule added for recognizer/tree disagreement case (km-strategy); (T2-#11) Layer A' check I6 (ownership consistency) added to §10 table (km-validator); (T2-#12) §12 VFS tree and prose updated with HISTORY.md "Adapted from" scaffolder behaviour (km-output); (T2-#13) JSDoc on `ContextElement.baselayout.value` added to `keyboard-ir.ts` (km-keyman); (T2-#14) spec version bumped to 1.1.1; (T2-#15) D10-D14 registered in §14.

  **Resolved open questions** (from v1.1.0 amendment proposal):
  - Q1 (-> D10): Recognizer rule format — TypeScript predicates; YAML DSL deferred to v1.2 (#273). (km-strategy)
  - Q2 (-> D11): `.kmn.imported` sidecar removed unconditionally; HISTORY.md bullet + PR body supersede it. (km-output)
  - Q3 (-> D12): I2 depth ratified at 3; runtime ceiling binding, not combinatorics. (km-keyman, km-validator)
  - Q4 (-> D13): RawKmnFragment boundary — five categories ratified for v1.1; scanner-driven additions (#237) land as additive minor bumps. (km-keyman)
  - Q5 (-> D14): Attribution carriers ratified — HISTORY.md mandatory, PR body informational, LICENSE.md only if source licence requires, README.md never. (km-output, km-author)

  **Tier 3 known-gaps** (deferred, not blocking v1.1.1): (a) `RawKmnFragment.sourceFile?` — v1.1.x follow-up (km-output); (b) `OutputElement` JSDoc re `use()` and output-position `context` falling to `raw` per D8 — tracked at #268 (km-keyman); (c) deadkey naming (`dk(N)` vs `dk(acute)`) — pre-existing observation from km-author, Layer B style issue not Layer A correctness, follow-up minor bump; (d) TouchLayoutIR/KvksIR sub-file opaque escape hatch — v1.1.x; v1 codec required to refuse or warn rather than silently drop unmodeled sub-structures (§16 scope).

  **Reviewed by:** km-keyman, km-domain, km-strategy, km-author, km-validator, km-output (cycle 1) + km-programmer (cycle 2 group 1) + km-domain, km-keyman, km-validator, km-verification (cycle 2 group 2) + km-doc (cycle 2 group 3).

---

## Sign-Off

Approved for v1.0 release.

**Reviewed by:** lex-doc, lex-qc, lex-domain, lex-synthesis
**Date:** 2026-06-02
