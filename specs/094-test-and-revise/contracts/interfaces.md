# Contracts: Test-and-revise loop

These are internal module interfaces. Nothing is added to the public `@keyboard-studio/contracts`
surface, no `/api` route changes, and the server's draft payload stays opaque. Signatures are
illustrative TypeScript; the code is authoritative once it lands.

## C1. `engine/src/output/output-version.ts` (new, exported from `engine/src/index.ts`)

```ts
type OutputMode = "new-from-base" | "adapt-existing";

resolvePublishVersion(i: { mode: OutputMode; rawVersion: string; hasTestBuilds: boolean }): string;

resolveTestBuildVersion(i: { mode: OutputMode; rawVersion: string; buildNumber: number }):
  | { ok: true; version: string }
  | { ok: false; reason: "versionUnsupported" };
```

- With `hasTestBuilds: false`, the result is identical to today's `bumpKeyboardVersion` /
  pass-through behaviour for every input, so the existing tests stay green.
- It is the only place the publish version is decided. All three current call sites delegate
  to it (research R1).

## C2. `projectWorkingCopyForOutput(opts?)` (`studio/lib/serializeWorkingCopy.ts`)

```ts
interface ProjectForOutputOptions {
  identityOverride?: IdentityOverlay;             // existing
  testBuild?: { number: number; version: string }; // new
  stableForFingerprint?: true;                     // new, research R7
}
```

- **With `stableForFingerprint`:** the publish version is resolved with `hasTestBuilds: true`
  whatever the store holds, and the HISTORY.md fallback date is a fixed constant. Used only by
  `workingCopyFingerprint`; never combined with `testBuild`, never downloaded or submitted.

- **Without `testBuild`:** the output is byte-identical to today's, except for the version
  change in R1 for a three-part adapt base with test builds. Golden test: SC-004.
- **With `testBuild`:**
  - `testBuild.version` replaces the publish version in the `.kmn` `&KEYBOARDVERSION`, the
    `.kps` `<Version>` (both the adapt patch and a generated descriptor), and the top HISTORY
    heading;
  - the `.kps` `<Info><Name>` gets the suffix " (Test build N)" and `<Description>` is prefixed;
  - `welcome.htm` gets a test-build notice block.
  - Every one of these labels is a localized message from the catalog.

## C3. `studio/lib/buildOutputBundle.ts`

```ts
buildTestBuildKmp(testBuild: { number: number; version: string }):
  Promise<{ ok: true; blob: Blob; filename: string /* `${id}-test-build-${N}.kmp` */ } | { ok: false; error: … }>;
```

- The existing `buildKmpForDownload`, `buildSourceZipForDownload` and the managed PR path never
  pass `testBuild` (FR-010, FR-017).

## C4. `studio/stores/testingStore.ts` (new)

```ts
recordBuild(input: { version; fingerprint; decisionCursor; changedSections }): TestBuild; // only after the build succeeds
addReport(input: { text; foundInBuild; sectionId? }): TesterReport;
setReportStatus(reportId, status): void;
mergeRemote(remote: TestingRecord | undefined): void; // union by id; flags number collisions
reset(): void;
snapshot(): TestingRecord | undefined;  // used by saveDraft
hydrate(r: TestingRecord | undefined): void; // used by loadDraft / resumeProject / applyRemoteDraft
```

- Every mutator is a no-op while the active project is frozen.

## C5. Return-to-Output (`studio/lib/jumpToLocation.ts`, `StepHost.tsx`)

- **Callers.** The Output section list, blocker buttons and report section links call
  `jumpToLocation(loc, { returnTo: { route: "output" } })`.
- **StepHost** behaviour while a `returnTo` arrival is active:
  - **pane steps:** confirm returns, as today. The banner copy depends on the origin, and the
    banner adds a "Discard changes and go back" action;
  - **full-layout steps:** the footer `StepNavCluster` shows "Back to testing" (complete, then
    return) and "Discard changes and go back" (restore the arrival snapshot, record nothing,
    then return).
- **Decision-trail origin** (`returnTo.route === "trail"`): unchanged.

## C6. `studio/lib/outputBlockers.ts` (new)

```ts
outputBlockers(input: { touchStale; coverageGate; licenseUnparseable; attributionMissing; stageReady; testVersion? }):
  { blocked: boolean; blockers: OutputBlocker[] };
```

- Pure function.
- It is the single source for the Output banners, the download/test-build/submit aria-labels,
  and `ManagedPRSubmitPanel`'s `outputBlockedReason`.

## C7. i18n message ids (spec 046 rules, en + fr)

New areas:

- `output.sections.*`: the section list
- `output.testing.*`: the test-build button, the list, the reports and the package labels
- `output.publishHandover.*`
- `step.revision.*`: Back to testing / Discard
- `nav.reset.*`: the start-over confirmation, moved into the catalog

Existing ids are reused wherever the meaning is unchanged. The `deadkeys` and `rules` stage
labels are added to the existing stage-label ids.
