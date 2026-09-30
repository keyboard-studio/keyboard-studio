# kmcmplib wasm crash: store range re-collapse (carve.spec.ts rule#93 failure)

Status: **root-caused and fixed in-repo** (commit `031c1e7d`); upstream report
to keymanapp/keyman still to be filed (draft below).

## Symptom

`carve.spec.ts` "deleting rule#93 …" stuck at the Output screen with
`emit-download` disabled and aria-label "Download unavailable until compile
completes" for the full 30 s timeout — while the control test (same walk, no
carve) downloads fine. Newly exposed on 2026-08-04: the test previously
failed earlier at its axe scan (Class A), which masked this.

## Root cause chain

1. The un-carved control compiles the **original** fetched `.kmn` untouched —
   `projectWorkingCopyVfs` only re-emits the IR when carve has an edit.
2. Any carve triggers a full IR re-emit (`carveFilterIr` → `emit`).
3. Since #1197 (spec 042 FR-008, landed 2026-07-19 — after the walk specs
   were last green on 07-16), `emit` re-collapses ascending non-ASCII
   codepoint runs in store bodies to `U+XXXX .. U+XXXX` range notation.
   bj_cree_woods' Eastern-Finals store `C_ef` (86 items) re-collapses to
   **12 ranges on one line**.
4. kmcmplib 19.0.240-alpha crashes compiling that store: wasm
   `RuntimeError: memory access out of bounds` in `u16icmp` under
   `GetXStringImpl` / `ProcessKeyLineImpl`.
5. The crash **poisons the cached wasm compiler instance** — every subsequent
   compile in the same session reports the same crash (this also made naive
   in-process bisection useless; all minimization below used a fresh process
   per probe).

## Empirical envelope (fresh process per probe, kmc-kmn 19.0.240-alpha)

| Case | Result |
|---|---|
| original source (no ranges) | OK |
| emitted with 12 ranges in one store | CRASH |
| same file, only `C_ef` de-ranged | OK |
| same file, only `C_efc` (1 range) de-ranged | CRASH |
| minimal: `group` + 12-range store + `reset(option_key)` rule | CRASH |
| 7 ranges in one store + reset rule | OK |
| **8** ranges in one store + reset rule | **CRASH** |
| 4+4 ranges in two stores + reset rule | OK (per-store, not per-file) |
| 8 ranges + `any()` rule but no `reset()` | OK |
| trailing `c` comment / item-less `store(option_key)` variants | irrelevant |

Threshold: **8+ `X .. Y` ranges in a single store declaration**, and the file
must also use option-store statements (`reset(...)`) for the corruption to
surface. Heap-layout dependent — prefix-bisects pointed at innocent lines.

## In-repo fix

`packages/engine/src/codec/emit.ts`: `KMCMPLIB_STORE_RANGE_BUDGET = 7` —
re-collapse is suppressed for any store where it would produce more than 7
ranges; that store emits fully explicit (the pre-#1197 form, which always
compiles). Follows the precedent of #1408's dk() suppression. Regression
tests in `emit.test.ts` (8-range store emits explicit; 7-range store keeps
ranges). Verified: engine suite 2487 green; `carve.spec.ts` both tests green
at --workers=1 against the rebuilt engine.

## Upstream report draft (keymanapp/keyman)

Title: `bug(developer/compilers): kmcmp wasm memory-access-out-of-bounds
compiling a store with 8+ "X .. Y" ranges when the keyboard uses option
stores`

Body sketch: minimal repro (the varN8 file below), version 19.0.240-alpha,
stack (u16icmp ← GetXStringImpl ← ProcessKeyLineImpl ← ParseLine ←
CompileKeyboardBuffer), note that 7 ranges compile and the crash also
corrupts the wasm instance for subsequent compiles.

```kmn
group(Main) using keys
store(A) U+1401 .. U+1404 U+1409 .. U+140C U+1411 .. U+1414 U+1419 .. U+141C U+1421 .. U+1424 U+1429 .. U+142C U+1431 .. U+1434 U+1439 .. U+143C
+ [RALT K_EQUAL] > reset(option_key) c
```

(Compiled standalone with kmcmp_wasm_compile via @keymanapp/kmc-kmn's
KmnCompiler.run; no .kvks or package needed to reproduce.)

## Side finding (not fixed here)

The current emit hoists ALL comments to the top of the file rather than
interleaving them at their source positions, and emits
`store(option_key) ''` without the `''` (an item-less store declaration).
Neither crashes the compiler (tested directly), but both degrade round-trip
fidelity; worth its own look under the codec's position-faithful emit goals.
