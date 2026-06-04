# Keyman Rule Lint — What the Compiler Already Checks

A pre-compile lint that can look at a single rule, know what it will do, and decide whether it's valid. Anchored against the example:

```
platform('hardware') dk(003b) dk(003b) > U+003b
```

## What the lint would say about the example rule

| Check | Result | Notes |
|---|---|---|
| `platform()` arg | OK valid | `'hardware'` is a recognized `&PLATFORM` value (distinct from `'touch'`). |
| `dk(003b)` identifier | OK valid | `003b` parses as an identifier (per `validation.cpp:79-127`, names are 1–255 chars, no spaces/parens/brackets). |
| Both `dk(003b)` references | OK consistent | Same name = same deadkey. Compiler auto-registers on first use (`Compiler.cpp:2188-2205`). |
| `U+003b` codepoint | OK valid | `0x003B` = `;`, outside surrogate / non-character / reserved ranges (`Compiler.cpp:3746-3770`). |
| No `+` separator | WARN context-only rule | This rule has no keystroke part. It only fires when reached via `use(group)` from a keystroke rule and the surrounding group must be declared *without* `using keys`. Lint should verify the group context. |
| Deadkey name `003b` | WARN style | The name visually matches its output codepoint. Almost certainly an artifact of `kmdecomp` — the decompiler emits deadkey IDs as hex by default. Recommend a descriptive name. |
| Two consecutive `dk(003b)` | WARN semantic | Legal but unusual — typing the same deadkey twice in context is meaningful only when the keyboard explicitly distinguishes "one acute pending" from "two acutes pending." Worth flagging for human confirmation. |
| Reachability | DEFERRED | Can't tell from one rule — depends on the rest of the group. The compiler's `UnreachableRules.cpp` handles this whole-keyboard. |

Five of those eight findings are catchable client-side without invoking the compiler at all.

## The catalog of what the compiler already validates

Extracted from `keyman/developer/src/kmcmplib/src/`. 14 named checks, grouped by feasibility:

### Port to TypeScript (small, self-contained, <100 LOC each)

1. **Identifier validation** — `validation.cpp:79-127`. Names: 1–255 chars, no spaces/commas/parens/brackets/controls/non-chars.
2. **Duplicate group names** — `CheckForDuplicates.cpp:13-29`. Case-insensitive.
3. **Duplicate store names** — `CheckForDuplicates.cpp:31-52`. Case-insensitive; system stores exempt.
6. **Deprecated store IDs** — `DeprecationChecks.cpp:16-50`. `TSS_LANGUAGE`, `TSS_LAYOUT`, `TSS_LANGUAGENAME`, `TSS_ETHNOLOGUECODE`, `TSS_WINDOWSLANGUAGES` — illegal since v10.
7. **Deadkey resolution** — `Compiler.cpp:2188-2205`. Valid identifier; auto-register or lookup.
9. **`if()` store resolution** — `Compiler.cpp:2833-2906`. Referenced store exists (user store or system store `&platform`/`&layer`/etc.).
10. **Codepoint validation (`U+XXXX`)** — `Compiler.cpp:3746-3770`. Range 0–0x10FFFF, excluding surrogates 0xD800–0xDFFF, non-chars 0xFDD0–0xFDEF, 0xFFFF, 0xFFFE.
11. **Context statement ordering** — `Compiler.cpp:1509-1520`. `nul` first; `if()`/`platform()`/`baselayout()` before other content; no virtual keys in context.
13. **`index(store, N)`** — offset valid, store exists, store length >= any() length (warn-only on mismatch).

### Defer to the WASM compiler (deep, stateful, large)

4. **CAPS/NCAPS consistency** — `CheckNCapsConsistency.cpp`. Cross-rule state — tracks per-key modifier flags across the *entire* keyboard.
5. **Unreachable rules** — `UnreachableRules.cpp`. Detects rule A shadowing rule B by identical key+shift+context. Whole-group analysis.
8. **`platform()` argument parsing** — `Compiler.cpp:2793-2831`. Uses the deep `GetXString` parser.
12. **`context(N)` offset validity** — `Compiler.cpp:1437-1501`. Depends on parsed context length and index-store sizes.
14. **Named code constants** — `NamedCodeConstants.cpp`. 4000+ entries (Hangul syllables, named codepoints).

All 14 have corresponding TS-side message entries in `developer/src/kmc-kmn/src/compiler/kmn-compiler-messages.ts` — so once you have the check, the message text and severity are already typed and importable.

## The architectural finding

**There is no `validate(rule) -> diagnostics` function inside the compiler.** Validation is entangled with code emission — `ProcessKeyLine()` parses, validates, and emits bytecode in one pass, mutating the global deadkey registry and store array as it goes. You can't extract a "rule validator" by exporting one symbol.

That settles the architecture:

- **Per-rule, while-typing lint** -> port the 9 small checks to TS. You can lint a single rule in microseconds, no compiler invocation. Covers ~70% of the catalog by check count, probably ~50% of real-world authoring errors.
- **Whole-keyboard lint** -> call the WASM compiler in compile mode and capture its diagnostic stream. Catches the 5 deep checks plus everything else. Happens on the same debounce cycle as the preview recompile, so no extra latency.
- **Style layer** (the "deadkey name `003b` looks weird" finding) -> custom TS rules on top of the AST, no compiler involvement.

## Concrete next step

The cheapest path to "show me what this rule does and whether it compiles" is:

1. **Wrap WASM kmcmplib once** with `validate(source) -> diagnostics` (one-shot compile, ignore artifacts, surface message stream). Maybe 200 LOC of TS plumbing. Unlocks every whole-keyboard check today.
2. **Build a minimal TS rule parser** (just enough to produce an AST for ONE rule line, not a whole .kmn) — perhaps 400 LOC. Lets you run the 9 small checks per-keystroke without invoking the compiler.
3. **Cross-validate**: for each `baseline/*.kmn`, run both the TS parser and the WASM compiler and compare diagnostics. The parser is correct when both agree across the corpus.

The 9 small checks plus the WASM oracle gives you full coverage of every error and warning the compiler can emit, plus instant per-keystroke feedback for the common ones. Style/canonical-form rules layer on top of the AST cheaply.
