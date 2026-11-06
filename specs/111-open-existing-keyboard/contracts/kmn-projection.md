# Contract: `.kmn` text projection (engine)

Owner: Engine. Location: `packages/engine/src/pattern-apply/` beside `carveViaSplice.ts`, exported from the engine barrel.

```ts
type KmnEdit =
  | { kind: "delete"; nodeId: string }
  | { kind: "replace"; nodeId: string; text: string }   // single-node emit
  | { kind: "insert"; anchor: InsertAnchor; text: string };

type InsertAnchor =
  | { after: "last-store" }
  | { after: "group-end"; groupNodeId: string };

/** Diff two IRs that share node ids (startIr → working ir) into edits. */
function diffIrToKmnEdits(startIr: KeyboardIR, ir: KeyboardIR): KmnEdit[];

/** Apply edits to the starting text. ok:false names the first ineligible edit. */
function spliceKmn(
  startText: string,
  startIr: KeyboardIR,
  edits: readonly KmnEdit[],
): { ok: true; text: string } | { ok: false; reason: string; nodeId?: string };

/** diff + splice; caller decides what to do on ok:false (Open: ask, then emit). */
function projectKmnText(
  startText: string,
  startIr: KeyboardIR,
  ir: KeyboardIR,
): { ok: true; text: string } | { ok: false; reason: string; nodeId?: string };
```

## Rules

- **Node identity**: a node in both IRs (same `nodeId`) is unchanged if `emitRule` / `emitStore` of each is identical. Otherwise it's `replace`. A node only in `startIr` is `delete`. A node only in `ir` is `insert`.
- **Span**: from `sourceLine` plus `joinContinuations`, exactly as `carveViaSplice` resolves it today. No new position data is required.
- **Ineligible**: a deleted or replaced node without `sourceLine`, or whose line isn't the start of a logical line. Also a changed `RawKmnFragment` (tools never edit opaque nodes) and a reordered node.
- **Insert**: after the last store's span, or after the last rule of the group (after the header if the group is empty). The inserted text ends with the file's newline convention.
- **Untouched bytes**: every line outside edited spans is byte-identical, including the original line endings. This differs from carve's LF normalisation, which stays as it is for Copy.
- **Carve compatibility**: `carveViaSplice` becomes `spliceKmn` with delete edits only. Its existing tests are the regression suite.

## Tests (must exist before the studio uses it)

- No edits returns identical text.
- Delete, replace and insert, each on a corpus keyboard: only those lines differ.
- A continued (`\`) rule replaced as a whole.
- An ineligible edit returns `ok:false` with the node ID.
- CRLF input stays CRLF.
