# Data model: spec 116

The IR contract ([keyboard-ir.ts](../../packages/contracts/src/keyboard-ir.ts)) is the data model.
This file records:

1. what the new reader keeps beside the syntax tree;
2. how the syntax tree maps onto today's IR (Phases 2–3, no contract change);
3. the additive members (Phase 4);
4. the rule-shape view (Phase 1).

The breaking restructure is in spec FR-040, for the follow-on spec, and is not modelled here.

## 1. Front-end output (internal to the codec)

| Entity | Fields | Notes |
|---|---|---|
| `Token` (vendored) | `tokenType`, `text`, `lineNum`, `charNum`, `line`, `filename` | Upstream type, unchanged. `text` keeps the source spelling, so names keep their case. |
| `ASTNode` (vendored) | `nodeType`, `token`, children | Never exported from the codec (Art II). |
| `CommentRecord` | `text` (verbatim after the `c` keyword and its one separating space), `line`, `column`, `kind: "line" \| "trailing"` | A `line` comment is the only token on its physical line. A `trailing` comment follows other tokens on the line. See [contracts/comment-channel.md](contracts/comment-channel.md). |
| `ContinuationRecord` | `line` (physical line ending in `\`), `logicalLine` (first physical line of the statement) | Lets lowering map every physical line to its logical statement, and keep comments on continued lines. |
| `BlankLineRecord` | `line` | Blank lines end a run of pending leading comments, as today (`flushCommentsFreestanding`). |

## 2. Syntax tree → IR mapping (Phases 2–3; the IR is unchanged)

One logical `line` from the grammar lowers to at most one IR node. The full table, with a node type
per row, is [contracts/lowering.md](contracts/lowering.md). In summary:

| Grammar production | IR result |
|---|---|
| `systemStoreAssign` | `IRStore{isSystem:true}` and/or `IRHeader` fields, as today (`&NAME` → `header.name`, `&TARGETS` → `header.targets`, others → `header.storeDirectives`) |
| `normalStoreAssign` | `IRStore{isSystem:false, items}`. `textRange` expands into char items. A descending or undecodable range → fragment `descending-range`/`malformed-range` |
| `headerAssign`, `capsLockHeader` (old-style) | Same treatment the current reader gives them (research R6) |
| `beginStatement` | `header.encoding`, `header.entryPoints.main` (first directive wins) |
| `groupStatement` | `IRGroup{name, usingKeys, readonly, sourceLine}`. `NewContext`/`PostKeystroke` set `entryPoints` flags |
| `productionBlock` | `IRRule` (`context` keeps the synthetic `+` separator exactly as today; `matchKind` for `match`/`nomatch`; head `if(store='v')` as an `if` element) or a fragment with a specific reason |
| `compileTarget` `$keyman`/`$keymanweb`/`$keymanonly` | `targetSelector` on the store or rule |
| `compileTarget` `$kmfl`/`$weaver` | Fragment, reason `foreign-compile-target` (new) |
| A line the grammar rejects | Fragment with the reason for its rejection class (lowering.md §3). Parsing resumes at the next logical line |
| Comment and blank-line records | `IRComment` and `trailingComment`, by the anchoring rules in comment-channel.md |

Fields the current reader sets, all of which lowering MUST set identically: `nodeId` (same minting
order and prefixes), `sourceLine`, `groupNodeId` on fragments, `storeSketch` on opaque store
fragments, `producedOutput` on rule fragments, `trailingComment`, `targetSelector`, `ownedBy*`
(never set by the codec), and `origin: "imported"`.

**Validation rules**
- The comparison suite compares `normaliseForComparison(old)` with `normaliseForComparison(new)`, and
  then compares emitted text.
- `nodeId` values are compared raw too. Downstream persisted references (carve layers, decision
  records) key on them, so the minting order must match.

## 3. Additive IR members (Phase 4)

All are optional union members. Field names follow existing siblings (`storeRef`, `value`). Each also
gets a zod schema in `schemas.ts` under the drift guards.

| Union | New member | Source form | Replaces today |
|---|---|---|---|
| `OutputElement` | `{ kind: "layer"; value: string }` | `layer('shift')` | `raw` element |
| `OutputElement` | `{ kind: "set"; storeRef: string; value: OutputElement[] }` | `set(&layer = 'x')`, `set(opt = 'v')` | whole-rule fragment `option-store-directive` |
| `OutputElement` | `{ kind: "save"; storeRef: string }` | `save(opt)` | `option-store-directive` |
| `OutputElement` | `{ kind: "reset"; storeRef: string }` | `reset(opt)` | `option-store-directive` |
| `OutputElement` | `{ kind: "call"; storeRef: string }` | `call(store)` | `call-return` |
| `OutputElement` | `{ kind: "return" }` | `return` | `call-return` |
| `ContextElement` | `{ kind: "platform"; value: string }` | `platform('touch')` (head position) | `raw` element |
| `StoreItem` | `{ kind: "outs"; storeRef: string }` | `outs(other)` in a store body | `outs-expansion` |

Rules for the new members:
- `set.value` holds the grammar's `text+`, so it can carry chars, deadkeys and `outs`. It is
  restricted to the `OutputElement` kinds the grammar's `text` production allows.
- `storeRef` keeps the name as written, including the `&` of a system store (as `if.store` does).
- A `platform()` that is not in head position stays a `raw` element. This mirrors spec 103 FR-003 for
  `if`.
- `if(… <> …)` stays opaque. This spec does not change spec 103 (FR-025).
- `StoreItem.outs` is a **reference**. Analyses that need the expansion resolve it through a
  contracts helper (`resolveStoreItems(ir, store)`), with a guard against cycles.

## 4. Rule-shape view (Phase 1; read-only view, no contract change)

The [rule-shape API](contracts/rule-shape.md) is a function of `(rule, group)`. It is computed, never
stored:

| View | Derived from today's IR |
|---|---|
| `lhsKind: "match" \| "nomatch" \| "input"` | `rule.matchKind` |
| `nulContext: boolean` | leading `nul` context element |
| `conditions` | the head run of `if` (and, after Phase 4, `platform`/`baselayout`) context elements |
| `preContext` | context elements between the head conditions and the keystroke, separator excluded |
| `keystroke` | in a `using keys` group: the elements after the `+` separator, or the whole remaining context if there is no separator. Otherwise `undefined` |
| `elementAtOffset(N)` | 1-based over `[nul?, ...conditions, ...preContext, keystroke?]`, which equals Keyman's `CheckStatementOffsets` walk. The separator is never counted |

The follow-on spec's B1/B2 make `keystroke` and `lhs` stored fields. The view's results do not change,
which is what makes that follow-on a contained change.
