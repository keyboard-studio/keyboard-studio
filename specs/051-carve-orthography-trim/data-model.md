# Phase 1 Data Model — 051 Carve orthography trim

Four entities. Two are additive fields on existing **engine** interfaces, one is a new engine index, one is a new
studio-side derivation. No `packages/contracts` locked type changes.

---

## 1. `StoreRole` — is a store an input or an output?

The distinction FR-003(a) turns on. Today `analyzeStores` records three usage flags; a fourth completes the
picture.

```ts
// packages/engine/src/pattern-apply/applyStoreSlotRemovals.ts — ADDITIVE
export interface StoreUsageFlags {
  asAnySource: boolean;        // existing — any()-consumed context element (INPUT / trigger)
  asNotAny: boolean;           // existing
  asContextIndex: boolean;     // existing
  asIndexOutputTarget: boolean; // NEW — index()/outs() target in some rule's output (OUTPUT / producer)
}

/** Derived view used by the guard; a store can be both. */
export type StoreRole = "input" | "output" | "both" | "unused";
```

| Flag | Set when | Meaning |
|------|----------|---------|
| `asAnySource` | `el.kind === "any"` in a rule **context** | the store's chars are things you *type* |
| `asIndexOutputTarget` | `el.kind === "index"` or `"outs"` in a rule **output** | the store's chars are things the keyboard *emits* |

**Where it is set.** Inside the existing single rule scan in `analyzeStores` — the output loop already visits both
element kinds (`outsReferencedNames.add` for `outs`, `ensureNode(el.storeRef)` for `index`). No new pass.

**Why not derived.** `pairSets` membership is symmetric — union-find joins an output store with its `any()` source,
so both members look alike from the pair set. `unresolvedIndexOutputNames` holds only unresolved targets. There is
no existing way to ask the question.

**Validation.** For the Cameroon grave-accent pair: `dkf0060` → `{ asAnySource: true, asIndexOutputTarget: false }`
(input); `dkt0060` → `{ asAnySource: false, asIndexOutputTarget: true }` (output). Cameroon's self-paired `word`
store is `both`, and has `coordinatedWith: []`, so it never reaches the guard at all (spec Edge Cases — unchanged).

---

## 2. `ProducerIndex` — how many places emit a character?

FR-003(b)'s "no other producer" test.

```ts
// packages/engine/src/pattern-apply/producerIndex.ts — NEW
export type ProducerIndex = ReadonlyMap<string, number>;   // NFC char -> producer count

export function buildProducerIndex(ir: KeyboardIR): ProducerIndex;
```

**Counted as a producer** (one pass over `ir.groups[].rules[]`):

| Producer | Counted |
|----------|---------|
| A rule whose entire NFC output is exactly the character | +1 |
| An **output**-store slot (`index()`/`outs()` target) holding the character | +1 per matching slot |
| An `any()`-consumed **input**-store slot | **no** — a trigger, not a producer (FR-002) |
| An S-02 trigger rule (`isDeadkeyOnlyOutput`) | **no** — emits a deadkey token, not a glyph |
| A `notany()` store slot | **no** — dropping from it widens matching |
| An opaque `RawKmnFragment` | **no** — see below |

**Opaque fragments.** Not counted, and unreachable in practice: any blocked contributor already shields a candidate
outright before the producer-count test runs ([irToCarveNodes.ts:1936](../../packages/studio/src/lib/irToCarveNodes.ts)).
Counting them would be unsound — the codec cannot statically confirm what they emit ([research.md](research.md) §R4).

**Complexity.** O(rules + store items), computed **once per IR** and hoisted by the caller alongside the existing
`analyzeStores` hoist. Per-character computation would make the proposal loop O(chars × rules) — the exact shape
the `#931` perf note in `recommendedRemovalChars` warns against.

**Relationship to `collectCharContributors`.** Deliberately the same producer notion **minus the input side**.
`collectCharContributors` merges input and output slots into one flat `storeSlotIds` array by design (its header,
"OUTPUT + INPUT STORE SLOTS (#525 v2)") because a *removal* must reach every store a char appears in. A
*producer count* must not. Both derive from the same rule-walk semantics; a test asserts they agree on a
keyboard with no input-store occurrences.

---

## 3. `CharContributors.storeSlots` — role-tagged slots

```ts
// packages/engine/src/pattern-apply/collectCharContributors.ts — ADDITIVE
export interface CharContributors {
  targetChar: string;
  ruleNodeIds: string[];
  storeSlotIds: string[];                                   // UNCHANGED — same contents, same order
  storeSlots: { slotId: string; role: "input" | "output" }[]; // NEW — parallel, role-tagged
  locations: { kind: 'group' | 'pattern' | 'store'; label: string; nodeId: string }[];
  blocked: { reason: string; label: string }[];
}
```

**Invariant:** `storeSlots.map(s => s.slotId)` equals `storeSlotIds`, element-for-element. The new field is a
projection, never a different set — asserted by a test so the two cannot drift.

**Why additive.** `storeSlotIds` is passed positionally into `cascadeDelete(ruleNodeIds, storeSlotIds)` and
threaded through `coordinatedCollateralForSlots`, `buildPendingCascade`, and the restore path. Changing its shape
is a breaking edit across ~6 call sites that buys nothing a parallel field doesn't.

**Role assignment** follows the branch that added the slot: the input loop
([collectCharContributors.ts:155-170](../../packages/engine/src/pattern-apply/collectCharContributors.ts)) tags
`"input"`; the output loop (lines 181-195) tags `"output"`. A slot reached by both (a store that is `any()`-consumed
in one rule and an `index()` target in another) is tagged `"output"` — the producing role dominates, since that is
what the guard asks about.

---

## 4. `CaseGroup` — the US4 trim unit

```ts
// packages/studio/src/lib/carveCasePairs.ts — NEW
export interface CaseGroup {
  /** The uppercase produced character, when one exists in the produced set. */
  upper: string | null;
  /** Produced lowercase characters that case-map to `upper` — the reference set (FR-013). */
  lowers: string[];
}

export function caseGroupFor(
  ch: string,
  produced: ReadonlySet<string>,
  bcp47: string | undefined,
): CaseGroup;
```

### 4.1 Construction

Built entirely from `caseCounterpart(ch, bcp47)` — no second casing path (spec Definitions, FR-011/FR-012):

1. `caseCounterpart(ch)` is `null` → `{ upper: null, lowers: [ch] }`. Marks, caseless scripts, self-mapping
   letters (`ĸ`), multi-character expansions (`ß`→`SS`), and titlecase forms (`ǲ`, which is `\p{Lt}` and fails
   guard 2) all land here. The trim acts on the single character only (FR-012).
2. `direction === "toUpper"` → `upper = counterpart` **if** it is in `produced`, else `null`.
3. `direction === "toLower"` → `upper = ch`.
4. `lowers` = every `l` in `produced` with `caseCounterpart(l, bcp47)?.counterpart === upper` — the **reference
   set**, computed by scanning the produced set, *not* by inverting `toLowerCase()` (FR-013).

### 4.2 Why a reference set and not a 1:1 inverse

Many-to-one is real. Verified folds where two produced lowercase letters share one uppercase
([research.md](research.md) §R7):

| Lowercase | Shared uppercase |
|-----------|------------------|
| `s` U+0073 · `ſ` U+017F | `S` U+0053 |
| `i` U+0069 · `ı` U+0131 (locale-insensitive fold) | `I` U+0049 |
| `μ` U+03BC · `µ` U+00B5 | `Μ` U+039C |

`upper.toLowerCase()` returns exactly one of each pair, so an inverse-based model would silently drop the other and
retire a shared uppercase too early. (The spec's own Latin-`a`/Greek-`α` example does *not* hold — `α` uppercases
to `Α` U+0391.)

### 4.3 Retain / retire rule (FR-013, US4 §3–4)

For a trim request over a set `T` of characters:

```
retireUpper(upper)  ⟺  lowers(upper) \ T  =  ∅
```

The uppercase is trimmed only when every produced lowercase that references it is also being trimmed. Trimming one
of `{s, ſ}` keeps `S`; trimming both retires it.

**Locale interaction.** Under `bcp47 = "tr"` the `i`/`ı` group splits into two 1:1 groups (`i`→`İ`, `ı`→`I`), so
the same fixture exercises both the shared-uppercase path and FR-011's locale sensitivity depending on the
identity tag.

### 4.4 Composition with store pairing (FR-015)

Case pairing and store pairing are **orthogonal axes** (spec Edge Cases):

```
case pairing  → WHICH characters trim together      (this entity)
store pairing → WHICH slots/rules each one lives in (collectCharContributors + applyStoreSlotRemovals)
```

Resolution order for a paired trim, as one action / one undo entry (FR-011, FR-015):

1. `caseGroupFor(ch)` → the character set `T` (applying §4.3's retire rule to `upper`).
2. For each character in `T`, `collectCharContributors(ir, c)` → its own rules + role-tagged slots.
3. Union all resolved trim units; apply through the **existing** single `cascadeDelete` call.

Step 3 changes nothing about how a drop is applied (NFR-003) — it only widens the set handed to the unchanged
apply path.

---

## Entity relationships

```
KeyboardIR
  ├─ analyzeStores ──────────▶ StoreUsageFlags{ …, asIndexOutputTarget }  ──┐
  ├─ buildProducerIndex ─────▶ ProducerIndex (char -> count)              ──┤
  └─ collectCharContributors ▶ CharContributors{ …, storeSlots[role] }    ──┤
                                                                            ▼
                                            coordinatedDropHitsNeededChar (FR-003 conjunction)
                                                                            │
                                       ┌────────────────────────────────────┴─────────────────┐
                                       ▼                                                      ▼
                        recommendedRemovalChars (banner)                annotateRemovalRecommendations (tiles)
                                       │                                                      │
                                       └──────────────── NFR-001: one predicate, cannot disagree

buildProducedSet ──▶ caseGroupFor ──▶ CaseGroup ──▶ paired proposal row (FR-014) / paired trim (FR-015)
```

## Invariants

| # | Invariant | Guards |
|---|-----------|--------|
| **D1** | `storeSlots.map(s => s.slotId)` ≡ `storeSlotIds` | the additive field never diverges |
| **D2** | An `any()`-only character is absent from `buildProducedSet` and from `recommendedRemovalChars` | FR-001, FR-002 |
| **D3** | Both carve signals call the one `coordinatedDropHitsNeededChar` | NFR-001 |
| **D4** | `buildProducerIndex` is computed once per IR, never per candidate character | perf (`#931`) |
| **D5** | A store with `coordinatedWith: []` can never trip the guard | spec Edge Cases (self-paired `word`) |
| **D6** | `caseGroupFor` calls only `caseCounterpart` for casing | FR-002-equivalent, spec Definitions |
| **D7** | A shared uppercase is retained while its reference set minus the trim set is non-empty | FR-013 |
