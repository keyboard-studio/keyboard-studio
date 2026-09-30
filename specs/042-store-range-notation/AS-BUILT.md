# Spec 042 Store range notation (X .. Y): as built

**Status:** Retired 2026-09-29. Shipped in PR #1197 (squash `0588c8d`, 2026-07-19). Tasks: 15/15 complete.
**Full docs:** [specs/_archive/042-store-range-notation/](../_archive/042-store-range-notation/) (spec, plan, tasks, research, data-model, contract codec-range.md, checklists, quickstart). Not read by default.
**Pinned here:** none

## What shipped
- The codec expands store-body range notation `X .. Y` to the inclusive ascending set of single-codepoint `char` items in `IRStore.items`, so every `buildProducedSet` consumer inherits the interior with no change of its own.
- Endpoints may be `U+XXXX` or single-character quoted literals, mixed freely; whitespace around `..` is tolerated; multiple ranges and singletons interleave in source order.
- Astral (SMP) ranges expand to astral char items and no longer trip the `smp-literal` opaque bail (range case only).
- Emit re-collapses contiguous ascending runs back to `X .. Y`, so authored `.kmn` stays compact; semantic round-trip is the bar, not byte-identical.
- Descending or malformed ranges preserve the whole store as an opaque `RawKmnFragment`.

## Public contracts (as the code has them)
- Parse: `parseStoreItems` and `decodeRangeEndpoint` in [parse.ts](../../packages/engine/src/codec/parse.ts) (section "Store-body range notation").
- Opaque reasons `DESCENDING_RANGE: "descending-range"` and `MALFORMED_RANGE: "malformed-range"` in [opaque-reasons.ts](../../packages/engine/src/codec/opaque-reasons.ts).
- Emit: `emitStoreItems`, `ascendingRunLength`, `isAllPrintableAscii`, `KMCMPLIB_STORE_RANGE_BUDGET = 7` in [emit.ts](../../packages/engine/src/codec/emit.ts).
- Consumer contract fixed by test: [producedSet.test.ts](../../packages/contracts/src/ir/producedSet.test.ts) ("range-store interior"); `buildProducedSet` source is unchanged.
- No new IR variant and no `packages/contracts` type change; scope is store bodies only (rule-position ranges are not handled).

## Key decisions
- Expand eagerly into char items in the IR (not a range IR node), then re-collapse on emit (research D1, D6).
- Fail safe: opaque store with a named reason, never a wrong-direction or empty interior (D5).
- No cardinality cap; the Unicode codepoint range is the ceiling (D7; corpus max ~800 cp).
- Lenient parse of `U+0905..U+0910`: kmcmplib rejects it after a numeric endpoint, so it cannot occur in valid compiled source (contract C3).
- Standalone astral singleton store items keep their existing opaque handling (FR-010).

## Gotchas and limits
- Emit re-collapse is suppressed when the store also holds a `dk()` item: kmcmplib fails with KM_ERROR_KMCMP_5251093 on a store with both a range and `dk()`.
- Re-collapse is capped at 7 ranges per store. kmcmplib 19.0.240-alpha crashes (wasm out-of-bounds in `u16icmp`, poisoning later compiles) at 8+ ranges when the file uses `reset(...)`; over-budget stores emit fully explicit.
- All-printable-ASCII runs are left as quoted strings, not collapsed (legibility for dictionary/`&word` stores).
- Both suppressions are code-only findings added after the spec; the spec says nothing about them.

## Divergences from the spec
- FR-008 says emit MUST re-collapse; code re-collapses except in the three cases above (dk() stores, over 7 ranges, all-ASCII runs). Deliberate, compile-safety driven, in `emit.ts`.

## Follow-ups and open issues
- Remove the 7-range budget and dk() suppression when the upstream kmcmplib fix lands.
- Rule-context/output range operators are unhandled (deferred by FR-009).
