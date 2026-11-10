# Contract: vendored Keyman parser (FR-002 to FR-004, FR-014)

## Snapshot

- **Source:** keymanapp/keyman, branch `feat/developer/13349-kmc-kmn-next-generation-smbuilder`,
  folder `developer/src/kmc-kmn/src/ng-compiler`.
- **Pinned commit:** `fb7afff889c26161c8233edb46192dfdb0dec8e6` (2026-10-31).
- **Files:** `lexer.ts`, `scan-recognizer.ts`, `token-type.ts`, `token-buffer.ts`,
  `recursive-descent.ts`, `tree-construction.ts`, `ast-rebuild.ts`, `node-type.ts`,
  `token-to-node.ts`, `kmn-analyzer.ts`, `kmn-file.bnf`.
- **Excluded:** `kmx-builder.ts`, `kmx-constants.ts`, `statement-analyzer.ts`, `store-analyzer.ts`.
- **Destination:** `packages/engine/src/codec/ng/`.

## Rules

- Each file keeps Keyman's MIT header. A line is added naming the upstream path and commit. Upstream
  issue numbers are not added (Art VIII).
- `PROVENANCE.md` lists the commit, the file list, and every **local patch**: file, hunk purpose, and
  whether it has been offered upstream.
- Permitted adaptations, each listed in `PROVENANCE.md`:
  - import-specifier changes (`.js` suffixes, path);
  - type-only fixes our stricter `tsconfig` demands;
  - removal of imports from excluded files.

  Any behavioural patch is a local patch and needs the FR-014 upstream offer.
- **Boundary.** A depcruise rule forbids importing `packages/engine/src/codec/ng/**` from anywhere
  except `packages/engine/src/codec/*.ts`. The codec barrel exports nothing from `ng/`.
- **Lint.** `ng/` is excluded from the repo's style lint rules. It is still type-checked, and still
  under depcruise and the test-antipattern lint for any tests we add.

## Re-sync

1. Re-extract the files at the new commit with a script (`scripts/vendor-ng-parser.mjs`), which
   records the commit.
2. Re-apply the local patches listed in `PROVENANCE.md`.
3. Run the comparison suite and the corpus suites. Any new allow-list entry needs a reason.
4. Commit as `chore(engine): re-sync vendored Keyman KMN parser to <sha>`.

## Switch to the published package

When Keyman ships the parser in a release, with the front end exported from `@keymanapp/kmc-kmn` or
a successor, `ng/` is replaced by that dependency at a pinned exact version. This follows the same
re-sync steps. The switch also removes any local patch that upstream has accepted. Owner: engine team.
Trigger: a Keyman release note naming the parser.
