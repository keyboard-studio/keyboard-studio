# Data Model: CLDR/SLDR exemplars

**Feature**: 044-cldr-sldr-exemplars · Companion to
[contracts/exemplar-sourcing.md](contracts/exemplar-sourcing.md)

No locked contract type changes. `Pattern`, `Criterion`, and `ConfirmedAlphabet` are
untouched (Article I). New types are engine-internal plus additive studio store state.

## ExemplarTier (engine, new)

```ts
type ExemplarTier = "main" | "auxiliary" | "punctuation" | "numbers";
```

The four tiers in scope. `index` (collation headers) is deliberately excluded — it is
titlecased and would duplicate the alphabet in uppercase (spec Assumption; research R6).

Per R0, only `main` is read correctly today; the other three are the tier-key fix.

## ExemplarSource / ExemplarConfidence (engine, new)

```ts
type ExemplarSource = "cldr" | "sldr";

/** SLDR LDML draft status, ranked. CLDR sets are release-gated and carry none. */
type ExemplarConfidence =
  | "approved"      // (CLDR sets and un-drafted SLDR sets resolve here)
  | "contributed"
  | "tentative"
  | "unconfirmed"
  | "provisional"
  | "generated"     // machine-derived; ~30% of sampled SLDR files
  | "suspect";
```

**Rank order** is the declaration order above (highest first). Used to pick deterministically
when one SLDR file carries two sets of the same `type`; ties break by document order (R6).

Confidence is **surfaced, never filtered on** — dropping `generated` would discard much of
the coverage this feature exists to deliver.

## SourcedCharacter (engine, new)

```ts
interface SourcedCharacter {
  /** NFC-normalized character or digraph cluster (FR-009). */
  char: string;
  tier: ExemplarTier;
  source: ExemplarSource;        // FR-004: per-character attribution
  confidence: ExemplarConfidence;
}
```

**Invariants**
- `char` is NFC (FR-009), consistent with today's `parseUnicodeSet` behaviour.
- Exactly one `(source, confidence)` per character — the resolved winner after precedence
  (R5), never a merge of both sources.
- A character appearing in more than one tier of the *same* winning source is recorded at
  its **highest** tier (`main` > `auxiliary` > `punctuation` > `numbers`), so the alphabet
  never double-counts.

## SourcedInventory (engine, new — the sourcing path's return type)

```ts
interface SourcedInventory {
  /** The locale-directory id actually resolved, e.g. "ewo" for a request of "ewo-Latn". */
  resolvedTag: string;
  /** The winning source for this tag (CLDR wins on the 313 overlapping tags — R5). */
  source: ExemplarSource;
  confidence: ExemplarConfidence;
  characters: SourcedCharacter[];
  /** Multi-codepoint clusters CLDR/SLDR wrote as {..}, e.g. "dz", "kp", "ng". */
  digraphs: string[];
}
```

`null` return means "no confident seed" — either no coverage in either source, or the
confidence gate fired (FR-008/FR-010). Callers fall through to the whole-script behaviour
exactly as today; **nothing errors and nothing blocks the survey**.

## Committed index shape (`exemplars.generated.json`)

Format is specified in [contracts/exemplar-sourcing.md](contracts/exemplar-sourcing.md#index-format);
the entity view:

| Field | Type | Meaning |
|---|---|---|
| `version` | `{ cldr: string; sldrCommit: string; generated: string }` | Provenance of the build inputs. `generated` is a build-input-derived stamp, **not** a wall clock (would break SC-005 byte-identity). |
| `locales` | `Record<string, LocaleEntry>` | Keyed by locale-directory id (`ewo`, `sr-Latn`, `pt-BR`). |
| `LocaleEntry.c` / `.s` | `TierSets \| undefined` | CLDR / SLDR raw exemplar strings, kept **unparsed**. |
| `TierSets` | `{ m?: string; a?: string; p?: string; n?: string; d?: string }` | The four tiers plus SLDR `draft` status. |

**Why raw strings, not pre-parsed arrays**: parsing is cheap, the raw string is ~5× smaller
than an exploded character array, and keeping the source text preserves digraph `{..}`
grouping and makes the index diffable in review when a pin is bumped.

**Invariants**
- Key set is deterministic (sorted); no wall-clock or `Math.random` input anywhere (SC-005).
- Both `c` and `s` may be present — precedence is applied at **lookup** time, not bake
  time, so the rule can change without regenerating, and a future union action stays
  possible (R5).
- A locale with no usable `main` set in either source is **omitted** entirely rather than
  stored empty.

## PhaseBDraftState additions (studio store, additive)

Extends the 047 store ([`phaseBDraftStore.ts`](../../packages/studio/src/stores/phaseBDraftStore.ts)).
The existing `chars` / `bases` / `marks` / `attestedStacks` / `numbers` / `punctuation` /
`symbols` / `separators` / `controls` / `declaredRoles` fields are unchanged.

| Field | Type | Meaning |
|---|---|---|
| `provenance` | `Record<string, ExemplarSource \| "author">` | Per-character origin. Drives the proposed-vs-authored affordance (FR-017) and satisfies FR-004 at the UI layer. |
| `rejected` | `string[]` | Proposed characters the author removed. **Sticky**: re-derivation must not re-propose these (FR-017). |
| `seedFromProposal` | `(inv: SourcedInventory) => void` | Seeds picks from the sourced `main` tier (+ 047's derived uppercase), tagging provenance; skips anything in `rejected`; **never** clobbers an author-added pick. |

**Invariants**
- Idempotent: calling `seedFromProposal` twice with the same inventory yields the same
  store state.
- A character both proposed and author-entered is `"author"` — the stronger claim wins, so
  it survives a re-seed.
- `remove()` on a proposed character adds it to `rejected`; `remove()` on an authored one
  does not (re-proposal was never at issue for it).
- Every existing 047 invariant still holds: `chars` stays the complete inventory, and each
  captured non-mark/non-PUA character lands in exactly one category array.

## Entity relationships

```text
scripts/cldr-version.json ──┐
node_modules/cldr-misc-full ─┼─> codegen-exemplars.ts ─> exemplars.generated.json
scripts/sldr-version.json ──┤        (deterministic)            │
packages/engine/data/sldr/ ─┘                                   │  O(1), offline
                                                                v
                    exemplarLocaleCandidates(bcp47)  ──>  exemplarIndex.lookup()
                                (R10, from PR #1366)            │
                                                                v
                                        precedence + gate ─> SourcedInventory | null
                                                                │
                        ┌───────────────────────┬───────────────┴────────────┐
                        v                       v                            v
                buildCharacterMap()      suggestMissing.ts          phaseBDraftStore
                (picker tiers)           (cross-check, missing)     .seedFromProposal()
                                                                            │
                                                                            v
                                                              Phase B "Add your whole
                                                              alphabet" (047 sections)
```

One sourcing path feeds all three consumers (FR-015) — no divergent copies of exemplar
logic, which is why `characterMap.ts` and `suggestMissing.ts` are both edited to consume it
rather than keeping their own loader wiring.
