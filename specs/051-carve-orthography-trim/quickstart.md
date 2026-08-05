# Quickstart — validating 051 Carve orthography trim

Runnable scenarios, one section per user story. What is asserted lives in [data-model.md](data-model.md) and
[contracts/](contracts/); this is the run guide.

## Prerequisites

```bash
# Node >= 22.19.0, pnpm 9, from the repo root
pnpm install
pnpm build          # runs prebuild (langtags / SLDR / exemplars / recognizer codegen)
```

The US1 fixture is a **corpus keyboard**, not a synthetic one. It comes from the sibling `../keyboards` checkout,
which must track the [`keyboard-studio/keyboards`](https://github.com/keyboard-studio/keyboards) fork's `master` —
pointing it at upstream drifts corpus-calibrated tests. See [docs/keyboard-index.md](../../docs/keyboard-index.md),
and add the Cameroon QWERTY row there if it is not already indexed (the phonebook is mandatory, not optional).

## Gate commands

```bash
pnpm typecheck
pnpm --filter @keyboard-studio/engine test
pnpm --filter @keyboard-studio/studio test
pnpm lint          # includes i18n-catalog-lint and crew-lint
pnpm --filter @keyboard-studio/studio messages:extract   # before lint, if strings changed
```

---

## 0. Characterization first — pin what already works

Before changing anything. [research.md](research.md) §R1 found the produced-vs-input **domain** is already
correct (`buildProducedSet` walks `rule.output` only), so FR-001/FR-002 need guarding, not fixing.

```bash
pnpm --filter @keyboard-studio/contracts test src/ir/producedSet.test.ts
pnpm --filter @keyboard-studio/studio test src/lib/irToCarveNodes.test.ts
```

**Assert** (invariant D2): a character appearing *only* in an `any()`-consumed store is absent from
`buildProducedSet(ir)` and never appears in `recommendedRemovalChars`.

If either already fails, the diagnosis in §R1 is wrong — stop and re-derive before touching the guard.

---

## 1. US1 — the ɨ fix (P1)

Engine facts first:

```bash
pnpm --filter @keyboard-studio/engine test src/pattern-apply/applyStoreSlotRemovals.test.ts
pnpm --filter @keyboard-studio/engine test src/pattern-apply/producerIndex.test.ts
pnpm --filter @keyboard-studio/engine test src/pattern-apply/collectCharContributors.test.ts
```

**Expected**
- `analyzeStores` on the Cameroon grave-accent pair: `dkf0060` → `asIndexOutputTarget: false`;
  `dkt0060` → `asIndexOutputTarget: true`.
- `buildProducerIndex(ir).get("i") >= 1` from the base rule alone; an `any()`-only character is **absent**.
- Invariant D1: `storeSlots.map(s => s.slotId)` ≡ `storeSlotIds`, element-for-element. Every **existing**
  `collectCharContributors` assertion passes **unedited** — the field is additive.

Then the guard, per [contracts/collateral-guard.md](contracts/collateral-guard.md)'s truth table:

```bash
pnpm --filter @keyboard-studio/studio test src/lib/irToCarveNodes.test.ts -t "collateral"
```

**Manual walk** (`pnpm dev`):

1. Load Cameroon QWERTY; confirm an orthography **without** `ɨ`; open the carve gallery.
2. *Expect*: `ɨ` appears as a trim proposal (banner row and/or a surplus-flagged tile) — **the current build
   hides it**; this is the observable fix.
3. Accept it. *Expect*: `dkf#i` and `dkt#i` both spliced; `i` still round-trips (its `+ [K_I] > 'i'` rule is
   untouched); the message about `i` is **informational**, not a "character you need" warning (FR-005).

Covers US1-AS1/2/3, FR-003, FR-004, FR-005.

---

## 2. US2 — the real guard still protects (P1)

```bash
pnpm --filter @keyboard-studio/studio test src/lib/irToCarveNodes.test.ts -t "needed"
```

Three fixtures, matching truth-table rows 3–5:

| Fixture | Expect |
|---------|--------|
| needed `Y` produced **only** as a paired **output** partner of surplus `X` | trim of `X` warns / shields (row 5) |
| the paired partner holding `Y` is an **input** store | **no** shield (row 3 — the ɨ case) |
| `Y` is also produced by a separate rule | **no** shield (row 4) |

Plus the unchanged guards: self-paired `word` store (row 2), empty needed set → no proposals (FR-009),
digit/punctuation/symbol still shielded, opaque-fragment producer still shielded before the producer test.

Covers US2-AS1/2/3, FR-006, FR-009.

---

## 3. US3 — every acted-on trim is visible (P1)

**This section starts with a reproduction, not a patch** ([research.md](research.md) §R5). The obvious diagnosis
is largely ruled out: fan-out glyph gids already use the locked `<storeNodeId>#<itemsIndex>` contract,
`cascadeDelete` unions rule and slot ids into one channel, and confirmed collateral slot ids are already folded in.

**Step 1 — reproduce.** With the *current* build, trim a character and record which tiles fail to flip. Two live
candidates:
- the symptom is US1 (the char was shielded, so the proposal layer never updates) → it disappears once §1 lands;
- the plain-toggle fast path in `buildPendingCascade` flips only the clicked gid when a second producer was
  filtered out as not-removable → that is FR-008's gap.

Record which one it is. If it is the first, §3 reduces to the two tests below — say so rather than inventing a fix.

**Step 2 — pin the invariants**, regardless of outcome:

```bash
pnpm --filter @keyboard-studio/studio test src/editors/carve/CarveGallery.test.tsx -t "visible"
```

- **FR-007**: after an applied trim, `{tiles rendered removed} ⊇ {ids in the trimmed contributor set}`, within the
  same render, and `kept`/`total` update. Asserted over **rendered state**, not the store.
- **FR-008**: every trim request ends in exactly one of three outcomes — applied; applied-with-explicitly-retained
  producers (each with a reason); refused-with-reason. "Dialog closes, nothing visibly happens" must not be
  reachable.

Covers US3-AS1/2/3.

---

## 4. US4 — cased letters trim as a pair (P2)

Only meaningful once §1 is correct.

```bash
pnpm --filter @keyboard-studio/studio test src/lib/carveCasePairs.test.ts
pnpm --filter @keyboard-studio/studio test src/editors/carve/CarveGallery.test.tsx -t "case"
```

Fixtures are **grounded folds**, not synthetic ([research.md](research.md) §R7):

| Produced set | `bcp47` | Expect |
|--------------|---------|--------|
| `{ ǝ, Ǝ }` | — | trimming either trims both, one undo entry |
| `{ s, ſ, S }` | — | trim `ſ` → `S` **kept**; then trim `s` → `S` **trimmed** |
| `{ i, ı, I }` | *(none)* | one group, `lowers = [i, ı]`, shared `I` |
| `{ i, ı, İ, I }` | `tr` | two 1:1 groups: `i`↔`İ`, `ı`↔`I` |
| `ß`, `ĸ`, `ǲ`, a combining mark, `ك` | — | single-character trim, no phantom counterpart |

Do **not** use the spec's Latin-`a`/Greek-`α` example — `α` uppercases to `Α` U+0391, so it is not a shared
uppercase and the test would assert the wrong thing.

**Manual walk**: with both members of a case pair surplus, confirm **one** proposal row (FR-014), and that
declining it still leaves the per-chip cascade available to trim one case alone (the OQ-5 escape hatch).

Covers US4-AS1…6, FR-011…FR-015.

---

## Done when

- [X] All gate commands green.
- [X] §0 characterization tests pass **before** any change (D2 holds today).
- [X] Existing `collectCharContributors` and `analyzeStores` assertions pass **unedited** — both changes are additive.
- [X] Cameroon QWERTY proposes `ɨ`, and `i` still round-trips after accepting (§1).
- [X] All five truth-table rows covered (§2).
- [X] US3 reproduction recorded, and both FR-007/FR-008 invariants asserted over rendered state (§3).
- [X] Shared-uppercase retain/retire verified on `{ s, ſ, S }` (§4).
- [X] The `⚠` emoji is gone from the collateral copy (Article VIII); new strings extracted; `pnpm lint` clean.
      *(The `editor.carve.cascade.markedNotRemovable` string still carries a `⚠`. That is the blocked-producer
      warning, not collateral copy, and FR-005 does not rewrite it — left as a pre-existing, out-of-scope violation.)*
- [X] Cameroon QWERTY has a row in [docs/keyboard-index.md](../../docs/keyboard-index.md).
