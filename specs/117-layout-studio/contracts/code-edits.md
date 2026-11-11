# Contract: Code-tab edits in the `kmn-edits` decision

User Story 8, rulings 6 and 7 (2026-11-05), [research.md](../research.md) R13. A Code-tab Apply
becomes one `CodeEdit` entry in `kmn-edits`, beside the Layout tab's `LayoutOperation`s
([layout-ops.md](layout-ops.md)). Types live in `packages/contracts/src/kmnEdits.ts`, with zod
schemas and a drift guard; additive to the `KmnEdit` union.

## Types

```ts
/** Where a change lands, found by content, never by node id (FR-065). */
interface ContentAnchor {
  container: { kind: "group"; name: string } | { kind: "stores" } | { kind: "raw" } | { kind: "headers" };
  text: string;            // the node's canonical emitted text ("" for an insert at the start)
  prev?: string;           // previous sibling's canonical text, when there is one
  next?: string;           // next sibling's canonical text, when there is one
  /** Ruling 10: set only at Apply when the target rule's key is assigned in the Assign tab and
   *  the rule's context is exactly one key. Replay then targets the rule on this keystroke in
   *  the group, whatever its text (the assignment's rule in the built keyboard). */
  keystroke?: { vkey: string; modifiers: string[] };
}

type IRChange =
  | { change: "insert";  at: ContentAnchor; node: IRNode }       // insert after `at`
  | { change: "remove";  at: ContentAnchor; old: IRNode }         // `old` makes the change invertible
  | { change: "replace"; at: ContentAnchor; old: IRNode; node: IRNode }
  | { change: "set-store"; name: string; value: StoreValue; previous?: StoreValue }   // no previous = added
  | { change: "remove-store"; name: string; previous: StoreValue }
  | { change: "add-group"; group: IRGroup; after?: string }      // by group name
  | { change: "remove-group"; previous: IRGroup; after?: string }
  | { change: "set-begin"; begin: IRBegin; previous: IRBegin }
  | { change: "set-header"; header: IRHeader; previous?: IRHeader };

/** FR-062: who produced a node the change overrides. */
interface OwnerRef {
  change: number;          // index into `changes`
  owner: "deadkeys" | "rules-step" | "layout-tab" | "code-tab" | "identity" | "assign-tab" | "another-step";
}

interface CodeEdit   { seq: number; at: number; op: "code-apply"; changes: IRChange[]; overrides: OwnerRef[] }
interface ReviewKept { seq: number; at: number; op: "review-kept"; target: number }
```

`IRNode`, `IRGroup`, `IRBegin`, `IRHeader`, and `StoreValue` are the existing IR types in
`contracts/src/keyboard-ir.ts`; the exact names are confirmed when the type is written. Node ids
inside a stored `node` are not relied on: apply mints fresh ids.

## Engine: `packages/engine/src/kmn-diff/` (pure)

```ts
function diffIR(before: KeyboardIR, after: KeyboardIR): IRChange[];
function applyIRChanges(ir: KeyboardIR, changes: readonly IRChange[]):
  { ir: KeyboardIR; effect: KmnEditEffect; misses: number[] };      // indexes not applied
function findOwners(ir: KeyboardIR, startIr: KeyboardIR, changes: readonly IRChange[]): OwnerRef[];
```

- `diffIR`: groups and stores by name; begin and headers by kind; rules, comments, and opaque
  fragments within a container by a longest-common-subsequence over canonical emitted text.
  `diffIR(a, parse(emit(a)))` is empty (formatting-only, FR-066).
- `applyIRChanges(before, diffIR(before, after))` yields an IR whose emitted text equals
  `emit(after)`. Inserted and replaced nodes are stamped `authorEdit: "code-tab"` and get fresh
  ids above the IR's highest; untouched nodes keep their ids.
- A change whose anchor is not found is skipped and listed in `misses` (FR-063 b) — never thrown,
  never dropped silently.
- `findOwners`: a target identical to a `startIr` node has no owner (starting point, not
  flagged). Otherwise the owner comes from markers (`@deadkey`, `dk_*` stores → `deadkeys`;
  `rulesStepAdded` → `rules-step`; `authorEdit`; identity's header stores → `identity`), else
  `another-step`.

## Studio: Apply (`editors/assignLoop/KmnCodePane.tsx`)

1. Parse and lint (existing). Then Layer A validator errors on the parsed IR, then one compile of
   the candidate text through the compile service the download path uses. Any error: record
   nothing, change nothing, show the errors at their lines (FR-061). No timer (FR-067).
2. `changes = diffIR(workingIr, parsed)`; empty → record nothing (FR-066).
3. `overrides = findOwners(workingIr, startIr, changes)`; non-empty → confirm dialog naming the
   owners (FR-062).
4. `commitKmnEdit({ op: "code-apply", changes, overrides, … })`: `applyIRChanges` on the live IR
   through `applyMutatePatch` (`CODE_WRITES`: groups, stores, raw, headers) → `setWorkingIR`;
   record `kmn-edits`; push undo entry `c`.

## Review (FR-063, FR-064)

`reviewFlags(value, replayResult, ir)` (studio, pure): flag (a) per `CodeEdit` with `overrides`
and no `ReviewKept` targeting it; (b) per replay miss; (c) per `findShadowedRules` hit on a rule a
code entry inserted, run on the working IR **and** on the projected (built) keyboard the misses
come from, since only the projection holds Assign-tab rules (ruling 9).

**Assigned keys (ruling 10).** At Apply, a `replace` or `remove` whose `old` rule's keystroke is
claimed by a current Assign-tab assignment (`claimedInputRuleIds`) and whose context is exactly
one key gets `at.keystroke`, and `overrides` gains `{ change, owner: "assign-tab" }` (so the
confirm names the Assign tab, and flag (a) applies); the T098 gate's projection check then finds
no miss for it. `applyIRChanges` resolves a keystroke anchor by key and modifiers in the named
group, falling back to it only when the text anchor is not found. A code edit recorded before
the key was assigned has no keystroke anchor, so a later assignment still wins and the edit is a
replay miss (b). The inventory coverage (`useInventoryDiff` / `inventoryCoverageGate`) counts
`kmn-edits` so a displaced inventory character returns to the letters to place. Shown as a list in the Code tab (count on the tab) and on the `kmn-edits`
trail entry. **Keep** → `commitKmnEdit({ op: "review-kept", target })`. **Revert** → for the
latest entry, `undoKmnEdit`; for an older one, `invertChanges(entry.changes)` (engine, pure:
insert ↔ remove, replace swaps `old` and `node`, store and header changes carry their previous
value) committed as a new `CodeEdit`, so the list stays append-only and no rebuild is needed.
