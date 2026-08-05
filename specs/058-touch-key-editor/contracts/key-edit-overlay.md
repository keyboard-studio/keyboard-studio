# Contract: the key edit overlay, its address parser, and the two appliers

Normative for FR-031…FR-034 and FR-036a…FR-036g of [spec.md](../spec.md). Rationale in [research.md](../research.md) R8/R9 and **R10.1/R10.2/R10.3/R10.5**, which correct what the surrounding code actually provides.

Sibling contracts: [touch-key-rule-join.md](touch-key-rule-join.md) (the join and the two producibility views; §6.1 owns rule synthesis, §6.2 owns the applier-twin rule), [key-id-policy.md](key-id-policy.md) (minting and edit-time rejection), [layer-families.md](layer-families.md) (family scope).

---

## 1. Why this contract exists

The spec names the overlay in three places and pins one load-bearing property of it (FR-033a: it is an ordered log, not a keyed snapshot), but nothing states its shape, how an address resolves, or which of the two appliers owns which file. Those are exactly the decisions that, left implicit, produce a second writer — the failure mode FR-033 exists to prevent, and one this codebase has already fallen into once (R10.1: the touch preview's own transform bypasses the projection chain entirely).

---

## 2. The overlay

```ts
/** An ordered log of committed key-level operations. Order is semantic. */
export interface KeyEditOverlay {
  readonly ops: readonly KeyEditOperation[];
}
```

**Ordered, not keyed** (FR-033a). Operations apply in commit order, and an operation's address resolves against the layout state produced by the operations before it. A keyed snapshot (`Map<address, edit>`) cannot express rename-then-edit: after a rename the later operation's address names a key the original layout does not contain. Replay order is therefore part of the contract, not an implementation detail.

**Replay is total and pure.** Applying the same `ops` to the same input layout yields the same output, and the overlay never holds a reference to the layout it was authored against.

---

## 3. Operations

```ts
export type KeyEditOperation = {
  /** Monotonic commit order. Also the undo/redo key. */
  readonly seq: number;
  /** Address in the existing touchKeyAddress scheme (§4). */
  readonly address: string;
  /** Default "key". "family" fans out per layer-families.md (FR-065). */
  readonly scope?: "key" | "family";
} & (
  | { kind: "set";          fields: Partial<EditableKeyFields> }
  | { kind: "rename";       toId: string }
  | { kind: "add";          position: "before" | "after"; key: NewKeySpec }
  | { kind: "remove";       outcome: "reflow" | "redistribute" }
  | { kind: "suppress";     spClass: 9 | 10; sentinelId: string }
  | { kind: "setSubKey";    sub: SubKeyRef; fields: Partial<EditableKeyFields> }
  | { kind: "removeSubKey"; sub: SubKeyRef }
);

/** The fields Increment 1 authors. Deliberately narrower than TouchKeyIR. */
export interface EditableKeyFields {
  id: string;
  text: string;
  output?: string;
  sp: number;             // the full legal set {0,1,2,8,9,10} — FR-029a
  nextlayer?: string;
}
```

Three boundaries worth stating because each is a place someone will reasonably guess wrong:

- **`suppress` is one operation, not two.** It sets a non-interactive `sp` **and** neutralizes the id to a ruleless sentinel. `sp` governs rendering and interactivity; the id governs output; a half-done suppression is a live key that looks dead (FR-029c). Making it one operation is what makes the halves impossible to desynchronize.
- **`remove` carries its outcome.** Suppress-in-place is not a `remove` variant — it is the `suppress` operation, because it preserves geometry. The two `remove` outcomes differ only in what happens to the freed width, and the studio *proposes* from layer kind (FR-029g) rather than hard-coding one.
- **`width` and `pad` are not in `EditableKeyFields`.** Geometry is read-only in Increment 1; `redistribute` writes widths as a *consequence* of a remove, not as an authored field.

**Not in this increment:** row and layer operations. They need the declared-writes extension and row-id stability (research R8 Increment 3), and admitting them to the union now would invite an applier that half-supports them.

---

## 4. The address parser

The three builders exist in [touchKeyAddress.ts](../../../packages/engine/src/pattern-apply/touchKeyAddress.ts); **no parser does** (R10.5). It lands beside them so format and parser cannot drift, and it is the only place the format is decoded.

```ts
export interface TouchKeyAddressParts {
  readonly platform: string;
  readonly layerId: string;
  readonly keyId: string;
  readonly sub?:
    | { readonly kind: "sk" | "multitap"; readonly subId: string }
    | { readonly kind: "flick"; readonly direction: string };
}

/** Undefined — never a throw — for a string that is not a valid address. */
export function parseTouchKeyAddress(address: string): TouchKeyAddressParts | undefined;
```

**Round-trip is a test obligation, not a comment:** for every builder, `parse(build(...))` deep-equals the inputs, over a table including ids containing `:` if the format admits them (decide and pin that case — the `T_*` regex accepts any non-whitespace, so a colon-bearing id is legal upstream).

**`nodeIds` is not an alternative.** `TouchLayoutIR.nodeIds` is minted for main keys and `sk` sub-keys only — never `multitap`, never `flick` ([parseTouchLayout.ts](../../../packages/contracts/src/parseTouchLayout.ts)) — so an operation on those nodes resolves only through this parser and the shared resolver.

---

## 5. One resolver, two thin appliers

Per [touch-key-rule-join.md](touch-key-rule-join.md) §6.2, the layout operations need an IR applier *and* a raw-JSON applier, because spec 035's R9 forbids the import-adapt path from round-tripping through the IR. The duplication is deliberate and bounded:

| Shared, exactly once | Duplicated |
|---|---|
| The address **parser** (§4) | Traversal (IR node walk vs. platform→layer→key index build) |
| The **resolver** — address parts → the addressed key, against current state | Write mechanics (structural sharing + node-id minting vs. in-place JSON mutation + placeholder promotion) |
| The **field-semantics** function — what a `set` means, e.g. that changing an id clears a stale `output` | |

**The defence is a test, not discipline.** Apply the *same* operation list through both appliers, parse the raw-JSON result with the canonical parser, and structurally compare against the IR result — modulo node ids and the fields Case A is documented to drop. Any operation whose twins diverge fails immediately. Node ids must be excluded because `NodeIdMinter` restarts its counter on every call (R10.5), so they are deterministic per invocation but not comparable across appliers.

**Rule synthesis needs no twin.** R9 protects `.keyman-touch-layout` bytes only; the `.kmn` has its own emit path.

---

## 6. Projection — two passes, one chain

Both halves of a key edit reach the artifact through the existing single-writer chain in [projectWorkingCopyVfs.ts](../../../packages/studio/src/lib/projectWorkingCopyVfs.ts). Neither may be applied anywhere else.

### 6.1 The layout pass — new step 1.7

Immediately **after** step 1.6 (`applyTouchKeycapRemovalsToVfs`). Step 1.5 is the text-matched carve pass — a different analog, not this slot. Follow step 1.6's shape exactly: gate on a non-empty overlay, wrap in `try`/`catch` pushing a `[project-working-copy] … skipped: <msg>` warning, and `vfs.set` only when the serialized string actually changed.

**Rename remaps happen at edit-commit time**, through the store's existing delete/restore actions, so undo entries stay consistent and step ordering can never observe a stale address in `deletedTouchKeyIds`.

### 6.2 The rule pass — required, not inherited

**The spec's stated precedent is false** (R10.2). The working IR (`store.ir`, written by `setWorkingIR`) is **never emitted into the artifact**: the projection takes `baseIr` and mutates the VFS's `.kmn` through passes. `applyMarkGuards` writes only to `store.ir`, so mark-guard synthesis does not currently reach the artifact and cannot be leaned on as the path synthesized rules already travel.

So synthesized rules need their own pass in the chain — parse the VFS `.kmn`, apply `ensure` / `remove` / `rename` from the join contract §6.1, re-emit — ordered so that a rename's layout half and rule half land in the same projection. Without it, US2's rule-bearing assignment is a silent no-op in both the preview and the zip.

### 6.3 Preview/artifact identity (FR-038)

`useWorkingCopyTransform` gains an **optional live-layout override** — the in-progress `touchLayoutJson` plus the overlay — and `TouchGallery` consumes the hook with it, replacing its local bypass transform. Rationale and the two rejected alternatives are in R10.1. Two mechanical requirements:

- the override **must** be folded into the hook's primitive memo key, whose dep array is primitive-stable by design; an overlay outside that key does not refresh the preview;
- the hook's existing gates stay: `null` when `baseIr` is null, and `null` when `previewedBaseId` disagrees with the store's base id (the F4 guard against showing one base's overlay on another's preview).

---

## 7. Persistence

The overlay and the mode-selector state join `WorkingCopySnapshot` ([persistWorkingCopy.ts](../../../packages/studio/src/lib/persistWorkingCopy.ts)) — **not** a type called `PersistedFields`, which does not exist.

**`DRAFT_VERSION` is NOT bumped.** VR-1 discards a version-mismatched draft rather than migrating it, so a bump would throw away every author's in-progress keyboard to add an overlay field. Both prior additive fields set the precedent: optional field, tolerant fallback read in `prepareWorkingCopySnapshot`, no bump. Full reasoning in R10.3.

Because `WorkingCopySnapshot` is derived as `Omit<WorkingCopyData, …>`, a new field is compiler-forced through all three snapshot functions in lockstep. Two easy misses: a new **action** name must join that `Omit` list, and any new `Set`/`Map` must be re-created in all four reset paths (`INITIAL_STATE`, `reset`, `instantiateFromBase`, `instantiateFromExisting`).

---

## 8. Re-derivation resilience (FR-033b)

When the Case A seed is re-derived — the author navigates back, changes physical assignments, and returns — some overlay addresses may no longer resolve.

**They MUST be reported, never silently dropped.** `touchKeyAddress`'s silent-miss behaviour was designed for the deletion overlay, where a stale address is harmless idempotence; here it is data loss. On re-derivation, replay classifies each operation as resolvable or orphaned, and the studio names the affected keys plus any characters whose placement is lost, offering either discarding the orphaned operations or re-placing those characters through the FR-062 worklist.

A resolution failure is a **first-class outcome** of replay, not an exception: replay returns `{ layout, orphaned: KeyEditOperation[], warnings }` so the surface exists whether or not the UI chooses to show it in a given moment.

---

## 9. Mode selector state (FR-036a…FR-036g)

The selector is a **view toggle, not a fork**. The contract is what must NOT happen on a toggle:

- **Nothing is cleared.** Neither the by-character draft (`touchDraft`) nor the overlay may be reset as a side effect of a mode change. Both already persist; the requirement is mostly *not* wiring a reset — worth stating because that is precisely the tidy-up someone adds later.
- **Context carries both ways** (FR-036c). Character → by-key selects and reveals the producing key(s), using the existing `enumerateTouchMethodsForChar` lookup; key → by-character lands on a character that key produces. On several producing keys, select the first in layout order, badge the rest, and offer next/previous cycling.
- **One set of numbers** (FR-036d). "Characters still unplaced" and "keys with no letter" are two projections of one state, derived — never independently maintained counters that can disagree.
- **Either mode completes the step** (FR-036e). Continue gates on coverage, never on the active view.
- **Undo is one chronological stack** across both modes (FR-036g), and the affordance states what it will undo, since after a toggle the next undo may target the other view's work.

Two mechanical notes: the selector is an APG **tabs** pattern (FR-035), so `[role="tablist"]` joins `[role="grid"]` in `useCharCycleKeys`'s enumerated skip list or the pane handler eats both widgets' arrows (R10.7); and the state lives in the working-copy store beside the `galleryIntrosSeen` per-step UI precedent.

---

## 10. Test obligations

- **Overlay replay**: ordering is semantic (rename-then-edit resolves; the same ops in reverse order do not silently succeed against the wrong key); replay is pure and idempotent for a fixed op list.
- **Address parser**: `parse(build(...))` round-trips for all three builders, including sub-key and flick forms; an invalid string returns `undefined` rather than throwing.
- **Applier twins**: the §5 equivalence comparison over an operation list covering every `kind`, modulo node ids and Case-A-dropped fields.
- **Projection**: step 1.7 runs after 1.6 and before 2; an empty overlay leaves the file byte-identical; a failure pushes a warning and does not abort the chain. **Case B**: one key edited leaves every untouched key and platform-level field (including fields the IR does not model, e.g. `font`) structurally identical to the shipped file.
- **Rule pass**: a synthesized rule is present in the emitted `.kmn` **and** in the preview's VFS — one assertion per surface, since R10.2 is exactly the class of gap where one passes and the other does not.
- **Preview identity**: the override refreshes the preview on an overlay change (guards against the primitive-memo-key miss), and the two existing gates still return `null` when they should.
- **Persistence**: a snapshot written before these fields existed loads without clobbering store defaults; `DRAFT_VERSION` is asserted to still be `1`.
- **Re-derivation**: an overlay authored against seed A, replayed against a re-derived seed B that removed the addressed key, reports the operation as orphaned and names the lost character — never silently drops it.
- **Mode toggle**: N toggles in any order lose no state in either direction and the shared progress figures never disagree (SC-011).
- **No new timer**: SC-010's fake-timer behavioral spec, in the `useKeyboardArtifact.test.ts` mold.
