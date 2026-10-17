# Implementation Plan: Touch key identity criteria (spec 104)

**Input**: [spec.md](spec.md), [research.md](research.md), [contracts/key-id-criteria.md](contracts/key-id-criteria.md)

**Shape**: One foundational module (the production resolver) lands first and
every story consumes it; no story re-derives production. The resolver extends
the spec 063 rule-join in contracts — it does not replace it. Severance,
repair, and Track 2 choices are decision-spine records (spec 093), so their
state survives resume and appears in the decision log without new storage.

## Architecture

| Layer | Change | Spec anchor |
|---|---|---|
| contracts | `touchProduction.ts`: the resolver (contracts §1) over `buildTouchKeyRuleIndex` + U_-decode + the KMW base-key table + key-class predicates; criteria decision table as data + a pure `decideKeyIdForm()` implementing contracts §2 | FR-001…FR-006, FR-010 |
| contracts | Key identity decision + guard specification + repair proposal record types on the decision spine; provenance fields per spec 093 conventions | FR-016, Key Entities |
| engine | Severance transplant + refusal (`severTouchKey.ts`), reusing codec rule cloning; carve/enumeration/removal rewired to the resolver (audit gaps 1); placement replay + combo propagation resolver-addressed (gap 2, 3); scaffolder reuses ruled T_ ids (gap 4) | FR-008, FR-019…FR-022 |
| engine | Proposer: `proposeTouchKeyId` inherit gate via resolver (gap 5); `proposeKeyId` minting = contracts §2 table; marks path gated on the guard specification | FR-010, FR-013 |
| studio | Marks-step guard question (one per keyboard, en/fr descriptors); Track 2 identity-choice list at owning steps; Copy repair list; property panel production table + decision provenance; severance line at the edit surfaces | FR-013, FR-015…FR-018, FR-024…FR-026 |
| lint | TOUCH_KEY_NO_RULE stays the canonical dead-key finding; its consumers re-pointed at the resolver (no new lint codes) | FR-023 |
| verification | Idiom fixtures (FR-028), tap-simulation parity harness over the corpus (FR-027), caps-fallback probe, e2e walks (SC-006) | FR-027, FR-028, SC-* |

## Phasing

1. **Foundational** — resolver + decision table + record types, with the
   table-driven tests (SC-005). Byte-identical behaviour everywhere: each
   migrated consumer lands behind its existing tests plus a resolver-parity
   test proving the consumer's verdicts did not change except where an
   audit gap says they must.
2. **Carve + creation** (US4, US1) — the originally reported defect and the
   creation path. Severance transplant lands here, with refusal fixtures
   from the fv_/gff_ store patterns.
3. **Track flows** (US2, US3) — Copy parity + repair list; Track 2 choice
   surfaces + decision records. The choice UI is a per-key list at the
   owning step, reusing the decision-spine presentation patterns (no new
   modal machinery).
4. **Derivation surfaces** (US5) — placement replay, combo propagation,
   scaffolder/reseed.
5. **Inspectability + gates** (US6) — property panel, corpus gate, e2e
   walks, caps-fallback probe (the probe may land any time after Phase 1;
   its result either removes the contracts §5 proviso or promotes the
   caps-state production to a first-class resolver value).

## Testing

- Table-driven unit tests for the decision table: every contracts §2 arm,
  every spec edge case, from the proposer suites' existing fixtures.
- Resolver parity tests per migrated consumer (verdict-diff over the corpus
  fixture set, confined to the audit gaps).
- Tap-simulation fixtures (FR-028) run through the vendored KeymanWeb
  harness used by the cycle-2 verification (compile with kmc, drive
  ActiveLayout → processor) — the same method that produced research.md §1,
  so semantics regressions in either direction are caught.
- Corpus gate (FR-027) as a nightly-class check, not a per-PR gate
  (consistent with the dev-first flow: per-PR fast lane stays under its
  budget; the gate runs in the overnight soak on dev).
- Playwright walks (SC-006) in the existing e2e harness; full CI including
  the e2e lane is the resolution bar.

## Risks

- **Resolver as single point of failure** (proposal §6): mitigated by the
  parity tests in Phase 1 and by building on the shipped rule-join rather
  than a new traversal.
- **Transplant refusal rate**: if real keyboards refuse often, Track 2
  fills with manual-definition flags. A refusal-rate-only corpus probe
  (tasks.md T026, Phase 2) reports the rate per keyboard before the
  Phase 4 choice UX is built, so the UX is sized on evidence; the full
  corpus gate (T021) stays in Phase 6.
- **Track 2 choice fatigue**: bounded by FR-018 (batched, only where the
  criteria bite) and by the warnings-placement model (owning step only).
- **Toolchain drift**: research.md §1's verdicts are pinned to
  kmc-kmn 19.0.240 / vendored KMW 18d10993; the FR-028 fixtures are the
  tripwire when either upgrades.
