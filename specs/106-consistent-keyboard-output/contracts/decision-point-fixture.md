# Contract: decision-point fixture harness

`packages/studio/src/test/decisionPointFixture.ts`

```ts
buildDecisionPointFixture(spec: {
  base: string;                       // corpus id
  track: "copy" | "adapt";
  decisions: DecisionSet;             // already cut at the point
}): Promise<{
  vfs: VirtualFS; keyboardId: string;
  compiled: CompileResult;            // from buildOutputBundle()
  gates: GateResult[];
  simulate(keys: SimKeyInput[], seed?: SimulatorContextSeed): SimulationResult;
}>

recordToDecisionSet(record: DecisionRecord, upTo: DecisionPoint): DecisionSet
```

Rules:

1. The harness MUST project through `buildOutputBundle()`, using the same projection input as the
   download (FR-001, FR-005). It never calls `projectWorkingCopyVfs` with hand-built options.
2. Store isolation: reset `useWorkingCopyStore`, `useDecisionStore`, `useSurveySessionStore` and the
   rebuild trail before each fixture.
3. Missing corpus: `announceSc004Skip` locally, hard failure in CI (`sc004GatesEnabled`).
4. The committed fixture JSON is the `DecisionSet`, not the raw 400 KB record. Regenerate it with
   `pnpm --filter @keyboard-studio/studio run fixtures:decision-points` (script added in US1),
   never by hand-editing.
