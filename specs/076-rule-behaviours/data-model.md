# Data Model: carve suppression (issue #1802)

## CarveDisposition (new, `@keyboard-studio/contracts`)

Per carved combination, the author's allow/block choice. Lives in the studio working-copy store, never in the IR or the emitted keyboard.

```ts
type CarveDispositionValue = "block" | "allow-host";

interface CarveDisposition {
  /** The carve-node id: rule nodeId, or <storeNodeId>#<index> for slot carves. */
  comboId: string;
  disposition: CarveDispositionValue;
  /**
   * Where the value came from. Pre-fill writes one of the first three;
   * the author flipping the row writes "author-override".
   */
  provenance:
    | "closed-keyboard-card"          // card accepted → block
    | "closed-keyboard-card-declined" // card declined (sparse Latin) → allow-host
    | "bulk-default"                  // card not yet answered; FR-005 proposal rule
    | "author-override";              // per-row flip in the gallery
}
```

**State transitions**: created on carve (pre-filled per above) → optionally flipped by the author (provenance becomes `author-override`, value toggles) → read (never modified) on every recompile → deleted on un-carve. Recompile never writes a disposition except for genuinely new combos.

**Validation**: `disposition` is the closed two-value union; `comboId` must resolve to a live carve node at read time (stale entries are dropped, never resurrected). `provenance` is informational — it does not affect compilation.

## IRRule.ownedByBehaviour (additive, FR-002)

```ts
interface IRRule {
  // ... existing fields ...
  ownedByPattern?: string;    // existing
  ownedByBehaviour?: string;  // NEW: e.g. "carve-suppression"
}
```

Mutually exclusive with `ownedByPattern` on one rule. For this feature the value is always the literal `"carve-suppression"`; the field is a string (not a union) so future behaviours reuse the same marker without a contract change.

## Suppression verb table (FR-020)

Determined by the carved rule's left-hand-side shape. `loud` comes from the A6 strategy answer (default soft).

| LHS shape | Soft (default) | Loud (A6 = loud) |
|---|---|---|
| Bare key (`+ [RALT K_E]`, no context) | `> nul` | `> nul beep` |
| Text-bearing context | `> context` | `> context beep` |
| Deadkey-only context (`dk(x) + [K_X]`) | `> nul` | `> nul beep` |
| Mixed text + deadkey context | `> context` | `> context beep` |
| Deadkey-arming rule whose last consumer was carved | `> nul` | `> nul beep` |
| Store-slot carve (guard rule) | `> nul` | `> nul beep` |

Invariants:

- Never `> nul` on a text-bearing context rule — compiler error (extends FR-009/FR-014).
- Never bare `beep` on a matched context — `beep` only rides `nul`/`context`.
- A blocked deadkey carve must never fall through: the deadkey would stay armed while the keystroke leaks to the host layout.

## Guard rule shape (store-slot carves)

For a carved slot in an `any(store)` / `index(store, N)` pair:

- **Context**: the paired rule's context reproduced up to and including the trigger element.
- **Output**: per the verb table (`> nul`, `> context` for text-bearing, plus `beep` when loud).
- **Placement**: immediately ahead of the paired rule, same group.
- **Ownership**: `ownedByBehaviour: "carve-suppression"`.
- Interior `nul` fill of the store is forbidden — the store keeps its shape for surviving slots.

## Relationships

```
Carve node (irToCarveNodes) 1 ── 0..1 CarveDisposition   (keyed by comboId = node id)
Carved rule 1 ── 1 Suppression rule                     (in-place rewrite; original in deleted set)
Carved slot 1 ── 1..n Guard rules                       (ahead of the paired rule)
Suppression rule n ── 1 Behaviour "carve-suppression"  (via ownedByBehaviour)
CarveDisposition * ── 1 closed-keyboard card state      (pre-fill source; override wins)
```

## swallowUndefined skip-set (FR-005 amendment)

On swallow-store recompile, a carved combo is **excluded** from the swallow set when:

1. its disposition is `allow-host`, or
2. a carve-suppression-owned rule already covers the combination.

Otherwise carved combos enter the swallow set like any other undefined key. The predicate is pure over `(comboId, dispositions, ownedRules)` so it can be tested against a stub enumeration before the full FR-005 behaviour lands.
