# Implementation Plan: Caps Lock and `&CasedKeys`

**Branch**: `km/casedkeys-criterion` | **Date**: 2026-11-03 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/112-cased-keys/spec.md`

## Summary

One derivation of the cased key set, in `@keyboard-studio/contracts`, feeds three consumers: the 7.28
criterion (detection and the new incomplete-set finding), Copy's projection step 2.8 (the store,
decided by a new visible `caps-handling` decision instead of the scaffolder's silent insert), and an
engine fixer for Open that spec 111's upgrade-pair registry offers when a compile-and-simulate caps
comparison shows nothing changes except Caps Lock starting to work. A touch caps-sync step and a
new touch criterion make Caps Lock behave the same on touch.

Two corrections to the spec's assumptions came out of research. They change the design, not the
stories:
- `&CasedKeys` works **per key**, on every plane, not per plane (R1). The set excludes keys
  where a non-case pair on another plane would break, and reports them.
- `stripCapsRules` deletes `NCAPS` rules whole. It can't be reused as the fixer, and on Copy it
  already loses letters that a copied keyboard writes as NCAPS/CAPS rules (R6). It is replaced by a
  key-scoped `replaceCapsRules`.

## Technical Context

**Language/Version**: TypeScript 6 (ES modules), Node ≥ 22.19.0

**Primary Dependencies**: existing only: the codec (`KeyboardIR`), kmcmplib WASM compiler, the
vendored KeymanWeb simulator, React (studio). No new dependency.

**Storage**: one new 088 decision (`caps-handling`) in the draft envelope; nothing else stored.

**Testing**: vitest per package (`contracts`, `engine`, `keyboard-lint`, `studio`); spec 106
decision-point fixtures; opt-in corpus sweeps (7.28 classification, SC-004 comparison);
Playwright CLI manual walk.

**Target Platform**: browser SPA (studio) + Node (tests, lint).

**Project Type**: pnpm monorepo, library + web app.

**Performance Goals**: the cased-set derivation is linear in rules and runs on every projection;
the caps comparison (two compiles + 4 × keys × planes simulations) runs on demand only, memoised per
working-copy revision.

**Constraints**: no second diagnostic timer (Art. IV); lint must not import engine (depcruise
`lint-not-to-engine`); Open text placement is spec 111's.

**Scale/Scope**: 921 corpus keyboards for the sweeps; four planes; one decision; two criteria
(one extended, one new).

## Constitution Check

*Gate before Phase 0; re-checked after Phase 1 (below).*

| Article | Verdict | How |
|---|---|---|
| I Pattern schema | PASS | No `Pattern` change. New contracts **functions** only (`casedKeys.ts`); `caseCounterpart` moves with an engine re-export (additive). |
| II IR spine | PASS | Every transform is on `KeyboardIR` / `TouchLayoutIR`. Step 2.8 parses the projected `.kmn` like 2.7. Open placement as a text edit is spec 111's and inherits that spec's Art. II amendment. |
| III State | PASS | One decision, value `{ mode }`; the key set is derived at projection, so replay and apply agree. Both vocabularies mapped ([data-model.md](data-model.md#caps-handling-decision-stored-copy-only)). Caps rule handling moves out of `scaffoldIR` into the projection, so it replays. |
| IV Validator / D3 | PASS | 7.28 and the touch check run in the existing criteria pass. The comparison emits no diagnostics and runs on demand, like spec 078's tolerance fix; no timer. |
| V VirtualFS | PASS | Projection and fixer write only the VFS / IR. |
| VI Teams | PASS | Engine: contracts functions, engine `caps/`, scaffolder, projection, lint checks, studio module. Content: the criteria row wording (18.16, 7.28 text), the decision's prompt and option text. |
| VII Out of scope | PASS | Touch caps sync is generated output, not touch-first authoring. No LDML change (capsExpand only delegates its parser). |
| IX Registry | PASS | `caps-handling` is a gallery module with `provides`/`requires`/`screen` (FR-004); no hand order. |
| X No silent decisions | PASS | Fixes the existing violation: the scaffolder's silent store goes. The default is shown as a default; the companion pre-accept is visible and dismissible; the Open fix applies only on acceptance; R1 conflicts are shown, not silently dropped. |
| XI Done = integrated | PASS, with one follow-up | Story 3 is reachable only through spec 111's registry and suggested-fix UI. **Follow-up**: owner spec 111 (T044/T045); trigger: 111 Phase 8 starts; until then Story 3 is engine-level and 112 must not be retired before 111 T045 passes. |

## Personal Data Check (Constitution Article XII, spec 100)

*Personal data: none — no new store, recipient, category, or telemetry.*

## Project Structure

### Documentation (this feature)

```text
specs/112-cased-keys/
├── spec.md
├── plan.md              # this file
├── research.md          # R1–R10
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── caps-api.md      # contracts / engine / studio signatures
│   └── criteria.md      # 7.28 extension, new 18.16 row
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
packages/contracts/
├── src/ir/casedKeys.ts               # NEW: Plane, keyPlaneOutputs, declaredCasedKeys,
│                                     #      casedKeySet, casedKeysStoreText, caseCounterpart (moved)
└── data/criteria.json                # 7.28 text; NEW 18.16 row (content wording)

packages/engine/src/
├── caps/                             # NEW
│   ├── replaceCapsRules.ts
│   ├── casedKeysStore.ts             # writeCasedKeysStore / removeCasedKeysStore
│   ├── upgradeToCasedKeys.ts
│   ├── compareCaps.ts
│   ├── syncTouchCapsLayer.ts         # IR + raw-JSON forms
│   └── __fixtures__/upstream_basic_kbdus/ ...
├── character-discovery/casePair.ts   # re-exports caseCounterpart from contracts
├── scaffolder/scaffold-ir.ts         # drop caps handling from scaffoldIR; export family floors;
│                                     # delete stripCapsRules / removeCapsContextElements / ensureCasedKeysStore
├── scaffolder/cleanTouchLayout.ts    # unchanged clone; sync happens at step 2.8
└── ldml-export/lower/capsExpand.ts   # casedKeys() delegates to declaredCasedKeys

packages/keyboard-lint/src/
├── checks/criteria/check-cased-keys.ts        # FR-002 incomplete-set finding, bcp47 from .kps
├── checks/criteria/check-touch-caps-layer.ts  # NEW (FR-003)
└── criteriaChecks.ts                          # wire both

packages/studio/src/
├── decisions/decisionTypes.ts                  # DecisionId += "caps-handling"
├── survey/questions/gallery/capsHandling.ts    # NEW module (FR-004/005/006)
├── survey/questions/registry.ts                # register it
├── lib/projectWorkingCopyVfs.ts                # step 2.8: store + rule handling + touch sync
├── editors/assignLoop/casePairCompanion.ts     # pre-accept when key in derived set (FR-007)
├── lib/__fixtures__/decision-points/           # "after caps" fixtures
└── criteria/implementedChecks.ts, test/gateCoverage.ts, review/battery.generated.json  # 18.16
```

**Structure Decision**: existing monorepo packages. The shared derivation goes in `contracts`
because lint can reach nothing else (R2). Caps behaviour gets its own engine folder instead of
growing the scaffolder, because Open uses it and the scaffolder stops touching caps.

## Phasing (for /speckit-tasks)

1. **Story 1 lands as is**: the existing 7.28 commit, with studio counts green once main's engine
   build is fixed (spec assumption). Commit on its own.
2. **Foundational**: `contracts/src/ir/casedKeys.ts` + `caseCounterpart` move; engine `caps/`
   `replaceCapsRules` and the store writers; the upstream fixture. Blocks 2–4.
3. **Story 1 extension**: FR-002 incomplete-set finding; corpus re-baseline.
4. **Story 2 (Copy)**: decision module, step 2.8, scaffoldIR caps removal, companion pre-accept,
   "after caps" decision-point fixtures (absorbs 106 T042–T051).
5. **Story 3 (Open, engine)**: `upgradeToCasedKeys`, `compareCaps`, SC-003 and SC-004 tests.
   Hand-off note to spec 111 T044 (it uses these, not `stripCapsRules` + `ensureCasedKeysStore`).
6. **Story 4 (touch)**: `syncTouchCapsLayer`, the 18.16 criterion row and check, step 2.8 wiring.
7. **Polish**: spec amendment for R1 (key entity wording + FR-006 rule 2), spec 106 tasks pointer,
   spec 111 T044 text, `spec-trace check`.

## Complexity Tracking

No violations to justify.

## Post-design Constitution re-check

Re-run after Phase 1: unchanged, all PASS. The design added one engine folder and one contracts
module; no new store, timer, or schema field. The Art. XI follow-up (spec 111 dependency) is recorded
above with owner and trigger.
