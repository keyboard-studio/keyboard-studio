# Quickstart: verify spec 102 by hand

Run the studio (`pnpm dev` from the repo root) and check each story in the browser.

## US1: a copy ships at 1.0

1. Pick a keyboard whose version is not 1.0 (for example `basic_kbdfr`, version 1.1) and choose **Copy**.
2. On the Output step, download the source zip. The file name ends in `-1.0.zip`.
3. In the zip, the `.kmn` `&KEYBOARDVERSION`, the `.kps` `<Version>` and the top `HISTORY.md` heading all say 1.0. HISTORY opens with "Created from basic_kbdfr v1.1 via keyboard-studio.".
4. The "Make a test build" control names version 0.1.
5. Start again with **Adapt** on the same keyboard: the version is 1.2, as before.

## US2: the docs explain the keyboard with no answers

1. Copy a keyboard that uses a deadkey and the right Alt key. Answer no documentation questions.
2. Open the documentation preview. The welcome and help pages show a Typing Guide, a "How This Keyboard Works" paragraph each for deadkeys and the right-Alt layer and none for repeat-to-cycle, the layout pictures (welcome only) and "Characters on This Keyboard".
3. Combining marks sit on a dotted circle and each character carries its Unicode name.
4. Remove a key in the editor. The preview's typing guide updates with the next preview update.
5. Download twice: the documentation files are identical.

## US3: a form edit round trip

1. In `packages/contracts/data/doc-forms.json`, change `<h2>Typing Guide</h2>` in the `body` form to `<h2>How to Type</h2>`.
2. Rebuild contracts (`pnpm --filter @keyboard-studio/contracts build`) and reload. The new heading shows on the welcome and help pages and nowhere else. No engine code changed.
3. Add `{{noSuchSlot}}` to any form and run `pnpm -r test`: the forms check fails naming the form and the slot. Revert both edits.

## US4: an adaptation keeps its prose

1. **Adapt** a keyboard whose help page has its own typing table.
2. Download twice. The original prose comes first, the generated sections follow once between `<!-- ks:generated:start -->` and `<!-- ks:generated:end -->`, and there is no generated typing guide.
3. The Output step's documentation checklist says "Typing guide not generated: the original docs already include one."
