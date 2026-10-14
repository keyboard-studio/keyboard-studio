# Contract: TextSampleAffordance (paste-or-upload)

## Component contract

The new component replacing `TextSamplePlaceholder`'s "Coming soon" body in `PhaseB.tsx` renders on the build-list page, beside `ExemplarApplyAffordance`, per spec 044's FR-016b reservation.

Inputs: none beyond store access (`usePhaseBDraftStore`).

Behavior:
1. Author pastes text OR uploads a `.txt` file.
2. On upload, `File.text()` resolves to a string; on paste, the textarea's value is used directly. Both converge on the same extraction call.
3. `harvestFromText(sample, base)` (existing engine function, via `getCharacterDiscoveryService()`) extracts the distinct-character set as `InventoryChar[]` (NFC-normalized, whitespace/control dropped, each tagged `method: "text-sample"`).
4. Empty/whitespace-only/unreadable input → inline message, no store write, step remains usable (FR-008).
5. Non-empty extraction → for each `InventoryChar`, call `usePhaseBDraftStore().addProposed(char, "text")`.

## Store action contract: `addProposed` (existing, unmodified)

```ts
addProposed(c: string, source: DraftProvenance, opts?: { role?: DeclaredRole }): void
```

Already implemented, already used by other proposal sources. Per-character, not per-batch — the component calls it once per harvested character. Its existing, already-tested contract:

- Idempotent — calling it twice with the same character is a no-op the second time.
- Never clobbers an `"author"` pick — a character the designer typed keeps `"author"` provenance even if a proposal also contains it.
- Respects sticky `rejected` — never re-adds a character the author explicitly removed.
- Unions with any existing proposals (exemplar or prior text-sample calls) rather than overwriting — satisfies FR-007's "no precedence rule" by construction, since both `ExemplarApplyAffordance` and this new component write into the same `provenance`/`chars` state via the same shared `addWithProvenance` path.

`DraftProvenance`'s `"text"` member already exists (`SourcedInventory["source"] | "author" | "text"`) — no type change needed.

## Non-goals (explicit)

- Does not touch `pb_text_sample`/`pb_text_sample_review`/`pb_discovery_intro` (the older, non-default "manual" path's own text-sample mechanism) — left as-is per spec.md's Ground-truth correction.
- Does not modify `SourcedInventory`, `ExemplarSource`, `addProposed`, or any other existing store action or engine type — this feature is a new UI component plus a thin extraction-to-`addProposed` adapter, not a data-model change.
- Does not attempt encoding auto-detection beyond UTF-8 (plain-text-only, per spec Assumptions).
