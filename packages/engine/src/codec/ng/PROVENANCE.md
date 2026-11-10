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
| 1 | `lexer.ts` | Performance: dispatch on the first character (per-character candidate list, built lazily from the recognizer table, in table order); the line buffer is a slice of the source from the line start instead of per-token concatenation; `matchToken` becomes `matchTokenWith` taking its three flags positionally (no options object per token); a sticky `regExp.test()` plus `buffer.slice(offset, lastIndex)` replaces `exec()[0]` (no match array per token). Throws at load if a recognizer has no first-character rule. Token stream proven identical by `lexer-equivalence.corpus.test.ts` against `lexer-reference.testkit.ts` (the unpatched lexer) | not yet |
| 2 | `lexer.ts` | `onTrivia` callback (optional third constructor argument) for every `emit:false` token, in source order with line and column; emitted tokens unchanged. An optional fourth argument, a set of trivia token types, limits the callback to those types, so a caller that wants comments alone does not build a Token per whitespace run | not yet |
| 3 | `recursive-descent.ts`, `tree-construction.ts`, `token-buffer.ts` | Performance: FIRST-set prediction. Each combinator computes once which token types it can start with and whether it can succeed without consuming; `AlternateRule` tries only the alternatives that can start with the current token (cached per token type, in table order), and `SequenceRule`/`OptionalRule`/`ManyRule`/`OneOrManyRule` skip an attempt that certainly fails. A rule class whose `parse()` is not a known combinator (`UsingKeysRule`, `ProductionBlockRule`) counts as "may start with anything", so nothing that could succeed is skipped. `ASTNode.addChildrenOf()` replaces `addChildren(tmp.getChildren())` (no defensive copy). With prediction on, the combinators build straight into the parent node and roll back a failed attempt with `ASTNode.truncateChildren()` instead of allocating a temporary node per attempt (a failing combinator adds nothing, so the children are the same). `ASTNode`'s sole-child, has-children and count queries loop instead of filtering or copying, and `removeChildren()` hands over its array. `Rule.prediction = false` restores upstream behaviour; `parser-equivalence.corpus.test.ts` proves identical acceptance and AST over every corpus line and 5,000 seeded random lines. `SingleChildRuleWithASTRebuild` reuses one scratch node per rule instance (the rule graph is a tree, so an instance is never active twice, and every `ASTRebuild` returns the node it is given). `ASTNode.childAt()` reads a child without a copy. `TokenBuffer` takes an optional window `[start, end)` so a per-line caller needs no copy of its tokens. The grammar rule files are untouched | not yet |

## Re-sync

1. Run `node scripts/vendor-ng-parser.mjs <keyman-checkout> <new-commit>`; it records the commit.
2. Re-apply the type-only adaptations and local patches listed above.
3. Run the comparison suite and the corpus suites. Any new allow-list entry needs a reason.
4. Commit as `chore(engine): re-sync vendored Keyman KMN parser to <sha>`.
