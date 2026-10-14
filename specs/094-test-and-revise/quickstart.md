# Quickstart: validating the test-and-revise loop

## Prerequisites

- Node ≥ 22.19.0, pnpm 9, and `pnpm install && pnpm build` (runs `prebuild`).
- `../keyboards` checked out at the keyboard-studio fork's `master`, for the corpus-backed
  fixtures.

## Automated checks

```bash
pnpm --filter @keyboard-studio/engine test -- output-version     # R1 table + 1000-build monotonicity
pnpm --filter @keyboard-studio/studio test -- outputBlockers testingStore           # blockers, store, merge, collisions
pnpm --filter @keyboard-studio/studio test -- serializeWorkingCopy                  # default projection unchanged; testBuild overrides
pnpm --filter @keyboard-studio/studio test -- stepHost.goldenWalk                   # revise-from-Output loop, copy + adapt (SC-002)
pnpm --filter @keyboard-studio/studio test -- draftPersistence                      # testing record round-trips, start-over clears it
pnpm lint                                                          # includes both i18n catalog tiers
```

Expected results: everything green. The default projection test proves that with no test
builds, the zip, PR and kmp outputs are byte-identical to `main` (FR-010, SC-004).

## Manual walk (`pnpm --filter @keyboard-studio/studio dev`)

1. **Copy track.** Copy any codec-clean two-part keyboard (e.g. version 2.3) and walk to Output.
   - Choose **Make a test build**. You get `<id>-test-build-1.kmp`, and the build list shows
     build 1 with version `0.1`.
   - Install it in Keyman. Keyman shows version 0.1, and the package name and welcome page say
     "Test build 1".
2. **Revise a full-page section.** Open **Section list → Rules**, change a rule, and choose
   **Back to testing** in the footer. You land on Output with no other step visited.
3. **Make test build 2.** The list shows build 2, version `0.2`, with "Rules" changed.
4. **Discard a revision.** Open **Touch layout** from the list, move a key, and choose
   **Discard changes and go back**. Output shows no change and nothing is added to the decision
   trail.
5. **Record reports.** Add two reports against build 2, one naming "Rules". The report's section
   link opens Rules and returns. Mark one fixed, then make build 3. The fixed report shows
   "fixed in build 3"; the other stays open.
6. **Persistence.** Reload the tab. The builds and reports are still there.
7. **Hand over to publishing.** Choose **Testing done, publish**. It shows "No changes since test
   build 3" and lists the open report. Confirm, and the existing submit panel appears. Check that
   the submitted files contain no test-build label or version.
8. **Adapt track.** Adapt a keyboard at version 2.3. Test builds are 2.3.1 and 2.3.2, and the
   publish version is 2.4. Repeat with a three-part base (1.2.3): test builds are 1.2.4 and
   1.2.5, and the publish version is 1.3.0. With no test builds, it publishes at 1.2.4 as today.
9. **Blocked.** Edit a mechanism after the touch layout is complete. Output names "Touch layout"
   with an **Open** button. Make a test build is disabled, and its accessible name gives the
   reason.
10. **Start over.** The confirmation says that test builds and reports are deleted too.
