# Contract — the coordinated-drop collateral guard (FR-003)

**Surface**: `coordinatedDropHitsNeededChar` in
[packages/studio/src/lib/irToCarveNodes.ts](../../../packages/studio/src/lib/irToCarveNodes.ts) (module-private),
consumed by the two carve signals. Plus the two engine facts it now reads:
`StoreUsageFlags.asIndexOutputTarget` and `buildProducerIndex`.

This is the one predicate the ɨ defect lives in. NFR-001 (banner and tile signals agree) holds **structurally**,
because both signals call this one function — fix the predicate, never its call sites.

---

## Before / after

```ts
// BEFORE — shields whenever any partner slot holds a needed character
return partners.some(({ item }) =>
  isCharCoveredForLocale(item.value, needed, bcp47 ?? '', form),
);

// AFTER — FR-003's conjunction
return partners.some(({ partnerStore, item }) => {
  const ch = item.value.normalize(form);
  if (!isCharCoveredForLocale(ch, needed, bcp47 ?? '', form)) return false;   // not needed -> never shields
  if (!isOutputStore(partnerStore, analysis)) return false;                    // (a) input partner -> never shields
  return (producerIndex.get(ch) ?? 0) <= 1;                                    // (b) sole producer -> shields
});
```

`isOutputStore(store, analysis)` = `analysis.usageByName.get(store.name)?.asIndexOutputTarget === true`.

The predicate gains two parameters (`analysis` is already passed as `storesByName`; widen it to the full
`StoreAnalysis`, plus the hoisted `ProducerIndex`). Both callers already hoist `analyzeStores` per IR and hoist the
`mode` per store; the producer index hoists the same way (data-model D4).

---

## Truth table

`ch` = the partner slot's character. Rows 3 and 4 are the behaviour change.

| # | `ch` needed? | partner role | other producer of `ch`? | Shields? | Scenario |
|---|--------------|--------------|--------------------------|----------|----------|
| 1 | no | any | — | **no** | ordinary surplus trim |
| 2 | — | no partner (`coordinatedWith: []`) | — | **no** | self-paired `word` store (Edge Cases, unchanged) |
| 3 | yes | **input** (`any()`-consumed) | — | **no** ← *was yes* | **US1-AS1 / US2-AS2 — the ɨ fix** |
| 4 | yes | **output** | yes | **no** ← *was yes* | US2-AS3 |
| 5 | yes | **output** | no | **yes** | US2-AS1 — the guard's real purpose |

Row 3 is the Cameroon case: trimming `ɨ` resolves partner `dkf0060#i` holding `i`. `dkf0060` is `any()`-consumed,
so `asIndexOutputTarget` is false and the shield lifts. `i` remains produced by its own `+ [K_I] > 'i'` rule,
untouched (FR-004) — the pair splice removes only the `i → ɨ` mapping.

---

## Downstream consumers

### `recommendedRemovalChars` (banner signal)

Unchanged except for threading `analysis` and the producer index into the predicate. Its other three shields stay
exactly as they are, and are evaluated **before** this one:

1. surplus (`!isCharCoveredForLocale`) and not `isAlwaysKeepCategory` — spec Edge Cases: punctuation/numbers/symbols
   stay shielded regardless of CLDR gaps;
2. any `contributors.blocked` entry, or no contributors at all → shield (default-safe). This is why opaque
   fragments never reach the producer-count test;
3. every rule contributor passes `isSimpleRemovableRule`, every store contributor classifies `drop` not `blocked`.

FR-009 also unchanged: `needed.size === 0` returns `[]` before anything else runs.

### `annotateRemovalRecommendations` (tile signal)

Same predicate, same thread-through. No independent logic.

### `coordinatedCollateralForSlots` (display list, FR-005)

Gains two fields per collateral entry so the UI can split severity by role instead of by `isNeeded` alone:

```ts
export interface CoordinatedCollateralChar {
  ch: string;
  storeName: string;
  isNeeded: boolean;          // unchanged
  slotId: string;             // unchanged
  role: "input" | "output";   // NEW — drives informational vs. warning
  isLost: boolean;            // NEW — isNeeded && role === "output" && producerCount <= 1
}
```

`isLost` is exactly the guard's conjunction, surfaced for display. The UI contract (FR-005/FR-006):

| Entry | Presentation |
|-------|--------------|
| `isLost === true` | **Warning**, `role="alert"`, must be confirmed — "This will also remove a character you need: `Y`" |
| `role === "input"` | **Informational**, `role="status"` — "The `i` → `ɨ` deadkey combination will no longer fire." |
| otherwise | Informational, existing neutral copy |

Both drop the leading `⚠` emoji (Article VIII). Final input-drop wording is content-team owned
([research.md](../research.md) §R8, OQ-2).

---

## Engine facts consumed

### `StoreUsageFlags.asIndexOutputTarget` (additive)

Set inside `analyzeStores`' existing single rule scan — the output loop already visits `outs()` (line 294) and
`index()` (line 297). No new pass, no signature change.

```
dkf0060 -> { asAnySource: true,  asIndexOutputTarget: false }   // input
dkt0060 -> { asAnySource: false, asIndexOutputTarget: true  }   // output
word    -> { asAnySource: true,  asIndexOutputTarget: true  }   // both; coordinatedWith: [] so never reaches here
```

### `buildProducerIndex(ir): ReadonlyMap<string, number>` (new)

Producer semantics and exclusions: see [data-model.md](../data-model.md) §2. One pass per IR.

---

## Test surface

| # | Fixture | Assert |
|---|---------|--------|
| G1 | Cameroon QWERTY, orthography without `ɨ` | `ɨ` **is** in `recommendedRemovalChars`; its tile is flagged surplus |
| G2 | same, accept the trim | `dkf#i` **and** `dkt#i` both spliced; the `+ [K_I] > 'i'` rule untouched; `i` still produced |
| G3 | needed `Y` produced **only** as an output partner | trim of `X` shields / warns (row 5) |
| G4 | same, plus a second rule producing `Y` | no shield (row 4) |
| G5 | self-paired `word` store | unchanged from today (row 2) |
| G6 | needed set empty | `recommendedRemovalChars` returns `[]` (FR-009) |
| G7 | digit / punctuation / symbol surplus char | still shielded by `isAlwaysKeepCategory` |
| G8 | opaque fragment producer | still shielded by the `blocked` check, before the producer test |
| G9 | any character | banner and tile signals agree (NFR-001) |
| G10 | input-partner collateral | rendered `role="status"`, no `⚠`, no "you need" wording (FR-005) |
