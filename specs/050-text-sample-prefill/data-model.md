# Phase 1 Data Model: Text-sample prefill (paste or upload)

This feature adds no new persisted types — every entity it needs already exists. This file pins the exact shapes the implementation wires together.

## Entity: `InventoryChar` (existing, from `harvestFromText`)

**Source**: `packages/engine/src/character-discovery/CharacterDiscoveryServiceImpl.ts` (return type of `harvestFromText`)

```ts
interface InventoryChar {
  char: string;       // NFC-normalized grapheme cluster
  count: number;       // occurrence count in the sample
  method: "text-sample";
  inBaseOutput: boolean; // ASCII proxy today (TODO(#141-followup) upstream, not this feature's concern)
}
```

## Entity: `DraftProvenance` (existing — already has the member this feature needs)

**Source**: `packages/studio/src/stores/phaseBDraftStore.ts:63`

```ts
type DraftProvenance = SourcedInventory["source"] | "author" | "text";
//                       ^ "cldr" | "sldr"                  ^ this feature's tag, already present
```

No change needed. Every harvested character is written via `addProposed(char, "text")`.

## Entity: `addProposed` (existing store action — the integration seam)

**Source**: `packages/studio/src/stores/phaseBDraftStore.ts:178`

```ts
addProposed: (c: string, source: DraftProvenance, opts?: { role?: DeclaredRole }) => void;
```

Contract (already documented, mirrors `seedFromProposal`'s): idempotent, never clobbers an `"author"` pick, respects sticky `rejected`, unions with other proposal sources rather than overriding. This feature calls it once per `InventoryChar` from `harvestFromText`'s result, passing `source: "text"`.

## Entity: the new UI component (replaces `TextSamplePlaceholder`'s body)

**File**: `packages/studio/src/survey/PhaseB.tsx` (same file, same location as today's placeholder)

Local (non-store) state:
```ts
interface TextSampleAffordanceLocalState {
  rawInput: string;          // the textarea's current value (transient, not persisted)
  uploadError: string | null; // set when an uploaded file fails to decode as UTF-8 text
  isExtracting: boolean;      // true while harvestFromText's promise is in flight (async, non-blocking per research R6)
}
```

Reads via `usePhaseBDraftStore` selectors: `provenance` (to detect already-applied text-sample characters, mirroring `ExemplarApplyAffordance`'s `alreadyApplied` pattern, though repeat application should stay allowed here — a second paste is a legitimate re-run, unlike the one-shot exemplar offer) and calls `addProposed` on submit.

## Entity: the file-upload path

No new type — `File.text(): Promise<string>` (native browser API) feeds the same `harvestFromText(sample, base)` call the paste path uses. A decode-validity check (e.g. detecting U+FFFD replacement characters in the decoded string) gates FR-008/the Edge-Cases "unreadable file" contract before extraction proceeds.

## No entities diverge from the spec's proposed model — data-model.md exists here to pin the exact existing shapes the implementation wires together, confirming (per research) that no new persisted type is needed.
