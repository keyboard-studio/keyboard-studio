# Contract: question output-reach declaration and its repository check

**Declaration**: `packages/studio/src/survey/types.ts` · **Check**:
`packages/studio/src/survey/questions/outputReach.test.ts`

Closes the E-1/E-4 defect class: a value the author is asked for, and told will ship, that no
output writer consumes (FR-016, SC-008).

---

## 1. The declaration

```ts
/** An emitted artifact a question's answer reaches. */
export type OutputTargetId = "package-descriptor";

/** An identity-overlay field the answer feeds. Names match IdentityOverlay's own fields. */
export type IdentityOverlayField = "displayName" | "bcp47" | "languageName";

export interface OutputWrite {
  target: OutputTargetId;
  field: IdentityOverlayField;
}
```

On `QuestionModule`, beside the existing `inputs` and `writes`:

```ts
  /**
   * Output artifacts this question's answer reaches, if any.
   *
   * DIFFERENT ADDRESS SPACE from `writes`. `writes` is IRPath[] over KeyboardIR
   * and governs mutate() containment; `outputs` names emitted artifacts. A
   * question may legitimately declare `writes: []` and a non-empty `outputs`.
   *
   * Absent is permitted (most questions reach no output artifact directly);
   * an explicit `[]` states it deliberately.
   */
  outputs?: readonly OutputWrite[];
```

`writes` semantics are **unchanged**. Nothing in this feature adds an `IRPath` to an identity
question, and `mutate()` stays absent on all five (FR-007 of spec 030's own contract).

---

## 2. Declarations this feature adds

The five identity-lite question ids are pinned by the spec — copy them exactly, no recasing, no
pluralizing:

| Question id | `outputs` |
|---|---|
| `il_language_english` | `[{ target: "package-descriptor", field: "languageName" }]` |
| `il_language_autonym` | `[]` |
| `il_language_code` | `[{ target: "package-descriptor", field: "bcp47" }]` |
| `il_language_region` | `[{ target: "package-descriptor", field: "bcp47" }]` |
| `il_target_script` | `[{ target: "package-descriptor", field: "bcp47" }]` |

---

## 3. The check

Two assertions over `questionRegistry`. Both fail the build.

### 3a. Declaration integrity

> Every `OutputWrite` a question declares must name a `target` in the writer table and a `field`
> that target's writer actually consumes.

The writer table is owned by the writer, not by the test: `package-descriptor` maps to
`DESCRIPTOR_CONSUMED_FIELDS` (see [package-descriptor.md](package-descriptor.md) §1). A question
declaring a field the descriptor writer does not read is a failure — that is the E-1 shape caught
one level earlier.

### 3b. Promise integrity

> A question whose `help_text` or `prompt` contains a shipping promise must declare a non-empty
> `outputs` or a non-empty `writes`.

This is the assertion that closes E-4. `il_language_code`'s help text — "This is the standard code
for the language you picked — **it goes on the finished keyboard**" — is the canonical instance;
after this feature it is true, and the check keeps it true.

Detection is a curated phrase list, matched case-insensitively over the two prose fields:

```
"goes on the finished keyboard"
"on the finished keyboard"
"ships with"
"appears in the package"
"included in the package"
"in the downloaded"
```

The list is a starting set and is expected to grow when a new promise phrasing appears. It is
deliberately small and literal: a broad heuristic that fires on ordinary wording would train
maintainers to reach for the allowlist.

**Allowlist.** A `PROMISE_CHECK_EXEMPT: Record<questionId, string>` map, where the value is a
one-line justification. An entry is how a maintainer says "this phrasing is not a promise" on the
record; an empty justification is itself a failure. The allowlist ships empty.

**Failure message** must name the question id, the matched phrase, and both remedies — declare the
output reach, or change the text (FR-018's two paths, in the spec's stated order of preference:
make it true, not make it quieter).

---

## 4. Why a vitest and not a plain-node linter

The declarations are TypeScript module exports. `content-i18n-lint` is plain JS and cannot
re-derive `flowQuestions.json` from TS-module question definitions, which is exactly why spec 050
added the tsx-run `content-i18n-freshness` check beside it rather than extending it. A plain-node
checker here would need its own TypeScript parser. Vitest imports `questionRegistry` directly, and
`registry.test.ts` is the established home for registry-wide invariants. Research D-07.

The check therefore runs under `pnpm --filter @keyboard-studio/studio test` (and so under
`pnpm test`), not under `pnpm lint`. CLAUDE.md's commands table needs no new row.
