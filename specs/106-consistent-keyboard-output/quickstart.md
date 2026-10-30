# Quickstart: validating spec 106

Prereqs: `pnpm install`, `pnpm build` (studio tests import engine `dist`), `../keyboards` on the
keyboard-studio fork's master.

1. Decision-point fixtures (primary check):
   ```
   cd packages/studio
   npx vitest run --config vitest.corpus.config.ts src/test/decisionPoint
   ```
   Expected: every gate either passes or is an `it.fails` expected failure that belongs to a story
   not yet landed. After all stories: zero `it.fails` left.
2. Regenerate fixture decision sets after a walk-record change:
   `pnpm --filter @keyboard-studio/studio run fixtures:decision-points`
3. Targeted engine tests: `pnpm --filter @keyboard-studio/engine exec vitest run src/pattern-apply src/marks`
4. Lint: `pnpm lint` (0 errors; warning count must not rise above baseline 389).
5. End-to-end gate (walk branch `km/2302-walk-zips`, dev server on 5273 serving this branch):
   `bash harness/run-lane-zip.sh harness/lane-zip-{a,b,c}.txt {A,B,C}` and then inspect `zips/INDEX.md`.
   Expected: 32/32 cases pass G1-G7.
6. Manual spot-check (Bafut on basic_kbdus): type `a` `5` with `à` unchecked: no mark appears. Type
   `;` `a` under base-plus-mark: the output is `a` U+030C. Then open the Rules pane: it shows no raw codes.
