# Contract: syntax tree → KeyboardIR lowering (FR-001, FR-005 to FR-008)

Home: `packages/engine/src/codec/lower.ts`. `parse(text, keyboardId)` keeps its signature and
`ParseResult` shape. Internally it runs:

```
captureTrivia(text) ─┐
lex(text) → per-logical-line token slices → parse `line` rule → ASTNode ─┴→ lower() → KeyboardIR
```

## 1. Line loop and recovery

- The token stream is split at `NEWLINE` tokens into logical lines. Continuations are already joined
  by the lexer's `handleContinuation`.
- Each logical line is parsed with the grammar's `line` production on its own. That gives per-line
  recovery without changing the grammar.
- **A line accepted by the grammar** lowers through the table in §2. If lowering finds a construct the
  IR can't model, the line becomes a fragment with that construct's reason (today's reasons are kept
  where the construct is the same).
- **A line rejected by the grammar** becomes a fragment whose reason comes from its rejection class
  (§3). It is never a catch-all reason.
- **The file fails** (it throws, so the import status is `ParseFailure`) only on a lexer failure, such
  as an unterminated string or an unrecognisable character run. That is the same failure class the
  current reader throws on. Research R1 confirms the two classes match on the corpus.

## 2. Production → IR

| Production (kmn-file.bnf) | Lowering |
|---|---|
| `compileTarget` | `$keyman`/`$keymanweb`/`$keymanonly` → `targetSelector`; `$kmfl`/`$weaver` → fragment `foreign-compile-target` |
| `systemStoreAssign` | as data-model.md §2; `&NAME`, `&COPYRIGHT`, `&VERSION`/`&KEYBOARDVERSION`, `&TARGETS`, `&ETHNOLOGUECODE`/`&LANGUAGE`… mapped onto `IRHeader` exactly as `parse.ts` does today (research R6 lists each) |
| `normalStoreAssign` | `IRStore`; `text*` → `StoreItem[]`; a bracketed menu literal → fragment `menu-store-syntax`; `outs()` → fragment `outs-expansion` (Phase 4: `StoreItem.outs`) |
| `headerAssign`, `capsLockHeader` | as today (research R6) |
| `beginStatement` | `header.encoding`, `header.entryPoints.main` |
| `groupStatement` | `IRGroup`; `groupQualifier` → `usingKeys` / `readonly` |
| `productionBlock` → `lhsBlock` | `MATCH`/`NOMATCH` → `matchKind`; `inputBlock` → `context`: `[nul?, …ifLike, …inputContext, "+" separator?, keystroke]`. The separator is inserted exactly when the current parser inserts it (the comparison suite proves this) |
| `ifLikeStatement` | `if(store = 'v')` in head position → `{kind:"if"}`; `<>`, or not in head position → whole-rule fragment `if-option-store` (spec 103 FR-003); `platform()` → `raw` (Phase 4: `{kind:"platform"}`); `baselayout()` → `{kind:"baselayout"}` |
| `keystroke` with more than one `keystrokeElement` | whole-rule fragment `multi-element-keystroke` (new; kmcmplib uses only the first element and warns) |
| `rhsBlock` / `outputStatement` | `OutputElement[]`; `use()` → `useGroup`; `context`/`context(n)`/`index()`/`outs()`/`beep`/`nul` as today; `set`/`save`/`reset` → whole-rule fragment `option-store-directive` (Phase 4: typed); `call` / `return` → `call-return` (Phase 4: typed); `layer()` → `raw` (Phase 4: `{kind:"layer"}`) |
| `text` / `simpleText` | `STRING` → char(s); `U_CHAR` (incl. SMP) → char; `virtualKey` → `vkey` (+ modifiers in context); `DECIMAL`/`HEXADECIMAL`/`OCTAL` → char; `NAMED_CONSTANT` → char via the Keyman named-constant table; `deadkeyStatement` → `deadkey` (all-hex) / `namedDeadkey`; `textRange` → expanded chars, or `descending-range`/`malformed-range` |

## 3. Opaque-reason catalogue changes (FR-007)

| Reason | Status | Meaning |
|---|---|---|
| existing reasons | kept | same constructs as today |
| `smp-literal` | expected to stop being produced | the upstream lexer reads SMP `U+XXXXX` as `U_CHAR`. The reason is kept in the catalogue for persisted drafts |
| `foreign-compile-target` | new | `$kmfl:` / `$weaver:` line (0 lines in the corpus; kept so the class has a name) |
| `removed-statement` | new | `clearcontext`, `fix`, `switch`, `key`: statements Keyman 19 removed. The only grammar-rejection class in the corpus (2 lines, research R1) |
| `multi-element-keystroke` | new | more than one keystroke element (a lowering check, not a grammar rejection) |
| `grammar-reject` | **forbidden** | no catch-all. A future rejection with no class fails the comparison suite until it is named |

Research R1 shows the grammar rejects almost nothing, so **lowering's semantic checks are what keep
today's reasons alive**. `context(0)`, backwards ranges, menu-store syntax, `if(… <> …)` and non-head
`if()` all parse, and lowering must still make them fragments with their current reasons.

Do **not** call upstream's whole-file `Parser.parse()`. It silently truncates at the first failing
line (research R1, finding 3). The per-line loop in §1 is the only entry point.

A reason name never changes meaning. Persisted drafts and the carve gallery key on these strings.

## 4. Invariants checked by the comparison suite

- `normaliseForComparison(newIr)` deep-equals `normaliseForComparison(oldIr)`, except allow-listed
  differences. Each allow-list entry names the file, line, old outcome, new outcome and reason.
- `emit(newIr) === emit(oldIr)` for every file with no allow-listed difference.
- The `nodeId` sequences are equal, because the minting order is the same.
- `ImportStatus` is never worse (`Clean` > `CleanWithOpaque` > `ParseFailure`).
