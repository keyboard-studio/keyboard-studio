# Contract — cased-letter pairing in carve (FR-011…FR-015)

**Surface**: `packages/studio/src/lib/carveCasePairs.ts` (new, studio-local), consumed by
`recommendedRemovalChars` (paired proposal rows) and the `CarveGallery` cascade handlers (paired trims).

Built entirely on the engine's `caseCounterpart` — the same primitive the mechanism galleries' case-pair companion
uses, which is what makes "the two surfaces never disagree about what a case pair is" (spec Definitions) true by
construction rather than by convention. **No second casing path is introduced** (FR-012).

---

## API

```ts
export interface CaseGroup {
  /** The uppercase produced character, or null when there is none in the produced set. */
  upper: string | null;
  /** Produced lowercase characters that case-map to `upper` — the reference set (FR-013). */
  lowers: string[];
}

/** Resolve the case group `ch` belongs to, within `produced`. Total — never throws, never null. */
export function caseGroupFor(
  ch: string,
  produced: ReadonlySet<string>,
  bcp47: string | undefined,
): CaseGroup;

/** Characters that must trim together when `ch` is trimmed, given the full trim set `alsoTrimming`. */
export function caseTrimSet(
  ch: string,
  produced: ReadonlySet<string>,
  bcp47: string | undefined,
  alsoTrimming?: ReadonlySet<string>,
): Set<string>;
```

Construction rules and the retain/retire condition: [data-model.md](../data-model.md) §4.

---

## The three behaviours this pins

### 1. Pair together (FR-011, US4 §1–2)

A surplus lowercase with a produced counterpart trims with it, as **one action / one undo entry**. Both directions:
trimming either member trims the other, when the reference set has exactly one member.

### 2. Null means single (FR-012, US4 §5)

`caseCounterpart` returning null ⇒ `caseTrimSet` is `{ch}`. Covers, all by the primitive's own guards:

| Input | Why null | Result |
|-------|----------|--------|
| combining mark | guard 1 (`\p{M}` rejected) | single |
| `ك` Arabic, Devanagari | guard 2 (not `\p{Ll}`/`\p{Lu}`) | single |
| `ĸ` U+0138 | self-mapping (candidate === char) | single |
| `ß` U+00DF | multi-char expansion (`SS`) | single |
| `ǲ` U+01F2 | `\p{Lt}` titlecase, fails guard 2 | single |

No phantom counterpart is ever trimmed.

### 3. Shared uppercase retires last (FR-013, US4 §3–4)

```
retireUpper(upper)  ⟺  lowers(upper) \ trimSet  =  ∅
```

Grounded fixtures — verified many-to-one folds, all reachable through `caseCounterpart`
([research.md](../research.md) §R7):

| Reference set | Shared uppercase | Role |
|---------------|------------------|------|
| `{ s, ſ }` | `S` | primary — script-neutral, no locale interaction |
| `{ i, ı }` | `I` (locale-insensitive fold) | locale-sensitive; splits into two 1:1 groups under `bcp47 = "tr"` |
| `{ μ, µ }` | `Μ` | cross-block confirmation |

Trim `ſ` → `S` **kept** (`s` still references it). Then trim `s` → `S` **trimmed** (reference set now empty).

The spec's Latin-`a`/Greek-`α` example is not usable — `α` uppercases to `Α` U+0391, not `A` U+0041. Recorded so a
reader does not reintroduce it as a test.

---

## Composition with store pairing (FR-015)

Two orthogonal axes (spec Edge Cases):

```
case pairing  → WHICH characters trim together
store pairing → WHICH slots/rules each of those characters lives in
```

Resolution, as one action:

1. `caseTrimSet(ch, produced, bcp47)` → character set `T`, with the §3 retire rule applied to `upper`.
2. For each `c` in `T`: `collectCharContributors(ir, c)` → its own `ruleNodeIds` + role-tagged `storeSlots`.
3. Union every resolved trim unit; hand the union to the **existing** single `cascadeDelete` call.

Step 3 changes nothing about how a drop is applied (NFR-003). A character in `T` whose contributors are blocked
does not silently drop out — it surfaces through the existing `blocked` path in the same dialog (FR-008).

---

## Proposal-row granularity (FR-014)

When both members of a case group are surplus, they surface as **one** proposal row, confirm/decline over the whole
pair — matching the mechanism galleries' companion, which is likewise all-or-nothing.

Deliberately **not** offering per-case opt-out inside the row: FR-014 exists to stop the author reconciling two
rows, and a per-case checkbox rebuilds exactly that. The escape hatch already exists and is unchanged — an author
who wants to keep `É` while dropping `é` declines the paired row and trims `é` through the per-chip cascade. One
line of row copy should make that discoverable ([research.md](../research.md) §R8, OQ-5).

---

## Test surface

| # | Given | Assert |
|---|-------|--------|
| P1 | surplus `ǝ` with produced `Ǝ` | both trimmed, one undo entry (US4 §1) |
| P2 | trim `Ǝ` instead | `ǝ` trimmed with it (US4 §2, bidirectional) |
| P3 | produced `{ s, ſ, S }`, trim `ſ` | `S` **kept** (US4 §3) |
| P4 | then trim `s` | `S` **trimmed** (US4 §4) |
| P5 | `ß`, `ĸ`, `ǲ`, a combining mark, `ك` | single-character trim, no phantom (US4 §5) |
| P6 | both members surplus | **one** proposal row, not two (US4 §6) |
| P7 | `bcp47 = "tr"`, produced `{ i, ı, İ, I }` | two 1:1 groups: `i`↔`İ`, `ı`↔`I` |
| P8 | no `bcp47`, produced `{ i, ı, I }` | one group, `lowers = [i, ı]`, shared `I` |
| P9 | case pair whose members live in different store pairs | all resolved trim units apply together (FR-015) |
| P10 | uppercase counterpart **not** in the produced set | `upper: null`; trim acts on the lowercase alone |
| P11 | any casing decision in carve | resolves through `caseCounterpart`, no local `toUpperCase()` (FR-012) |
