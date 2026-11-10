# Vendored Keyman KMN parser front end

Snapshot of the next-generation `.kmn` lexer and recursive-descent parser from
keymanapp/keyman (MIT License), used by `packages/engine/src/codec/lower.ts` to read `.kmn`.

- **Source:** `developer/src/kmc-kmn/src/ng-compiler` on branch
  `feat/developer/13349-kmc-kmn-next-generation-smbuilder`.
- **Commit:** `fb7afff889c26161c8233edb46192dfdb0dec8e6` (2026-10-31).
- **Extracted by:** `scripts/vendor-ng-parser.mjs` (`git show <commit>:<path>`; never the working tree).

## Files

`lexer.ts`, `scan-recognizer.ts`, `token-type.ts`, `token-buffer.ts`, `recursive-descent.ts`,
`tree-construction.ts`, `ast-rebuild.ts`, `node-type.ts`, `token-to-node.ts`, `kmn-analyzer.ts`,
`statement-analyzer.ts`, `store-analyzer.ts`, `kmn-file.bnf`.

`statement-analyzer.ts` and `store-analyzer.ts` define rule classes that `kmn-analyzer.ts` imports
(`AnyStatementRule`, `NormalStoreAssignRule`, and others), so the grammar cannot load without them.
They are vendored although the original contract listed them as excluded.

## Excluded

`kmx-builder.ts`, `kmx-constants.ts`: binary `.kmx` emission, which this project does not use.

## Adaptations (no behaviour change)

Each vendored `.ts` file has a provenance line added under its MIT header, and relative import
specifiers carry the `.js` suffix (already so upstream). Type-only fixes our stricter `tsconfig`
(`strictNullChecks`, `noUncheckedIndexedAccess`, `noImplicitOverride`) demands:

| File | Change |
|---|---|
| `ast-rebuild.ts` | `children[0]!.token`; `bounds.firstLine/firstChar as number` |
| `kmn-analyzer.ts` | `override` modifier on two `parse` methods |
| `recursive-descent.ts` | `override` modifier on four `parse` methods; `rule: Rule=null as never` (two defaults); `getNodeType` returns `get(...) as NodeType` |
| `lexer.ts` | `null` defaults for `line` / `filename` typed `null as never`; the three `new Token(..., null, filename)` calls pass `undefined` (same default applies); `.at(-1)!` / `.at(-2)!` |
| `token-buffer.ts` | `list[pos] as Token` |
| `tree-construction.ts` | `null as never` for the `token` default, `addNewChildWithToken` default and `parent` local; `as ASTNode` on indexed/shift results of the five sole-child getters (their `null` branch is `null as never`); `[number, number]` tuple types for `start`/`end`; `as number` on two `lineStarts` reads |

## Local patches

| # | File | Purpose | Offered upstream |
|---|---|---|---|
| 1 | `lexer.ts` | Performance: dispatch on the first character (per-character candidate list, built lazily from the recognizer table, in table order); the line buffer is a slice of the source from the line start instead of per-token concatenation. Throws at load if a recognizer has no first-character rule. Token stream proven identical by `lexer-equivalence.corpus.test.ts` against `lexer-reference.testkit.ts` (the unpatched lexer) | not yet |
| 2 | `lexer.ts` | `onTrivia` callback (optional third constructor argument) for every `emit:false` token, in source order with line and column; emitted tokens unchanged | not yet |

## Re-sync

1. Run `node scripts/vendor-ng-parser.mjs <keyman-checkout> <new-commit>`; it records the commit.
2. Re-apply the type-only adaptations and local patches listed above.
3. Run the comparison suite and the corpus suites. Any new allow-list entry needs a reason.
4. Commit as `chore(engine): re-sync vendored Keyman KMN parser to <sha>`.
