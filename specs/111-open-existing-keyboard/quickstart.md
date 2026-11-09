# Quickstart: validating spec 111

Run from the repo root after `pnpm install && pnpm build`. Corpus checks need `../keyboards` on the keyboard-studio/keyboards fork (see [CLAUDE.md](../../CLAUDE.md)).

## 1. Projection (engine): untouched bytes survive

```
pnpm --filter ./packages/engine exec vitest run src/pattern-apply/spliceKmn
```

Expect: the cases in [contracts/kmn-projection.md](contracts/kmn-projection.md#tests-must-exist-before-the-studio-uses-it) pass, and the existing `carveViaSplice` tests still pass.

## 2. No-edit round trip (SC-001, SC-002)

A vitest integration test opens each keyboard in the sample set, serializes it with no edits, and compares the output with the source file by file. The sample set has at least 20 keyboards, including `sil_cameroon_qwerty`, `basic_kbdus` and touch-enabled and deadkey-heavy keyboards.

Expect: identical files except `&KEYBOARDVERSION`, the `.kps` `<Version>`, and one new HISTORY entry. The `.kps` of `sil_cameroon_qwerty` lists 278 languages in source order.

## 3. One-rule edit (SC-003)

The same harness replaces one rule through a decision and diffs the `.kmn`. Expect: the diff touches only that rule's lines, plus the version.

## 4. Ratchet gate (SC-005, SC-006)

The unit matrix covers:
- compile error;
- unconfirmed red item;
- new failure without a note;
- new failure with a note;
- pre-existing failure only;
- each pair of the above.

Expect: submit is blocked exactly when one of the first three is present.

## 5. Manual walk (Playwright CLI, `pnpm dev`)

1. Welcome → **Open an existing keyboard** → search "Cameroon" → open. Expect the Languages step within 3 interactions (SC-009). Review later lists every finding as pre-existing.
2. Open the `.kmn` code view. Expect the original comments in place. Edit a comment and apply; the output diff shows that line only.
3. Add a character to touch only, then apply. Expect suggestions for the physical keys and the docs; skip both.
4. Open upstream `basic_kbdus` (choose keymanapp/keyboards). Expect the cased-keys finding with a fix (needs criterion 7.28 merged). Accept it; expect the criterion to pass.
5. Make a passing criterion fail and try to submit. Expect a block; write a note; expect the note in the PR body preview.

## 6. Copy unchanged (SC-004)

```
pnpm --filter ./packages/studio exec playwright test e2e/golden-walk
```

Expect: the golden-walk baselines pass unchanged.
