# Contract: exact gate identifiers

These are the exact names/strings a future PR, a test, or a documentation cross-link may need to
reference. Copy verbatim — do not recase, rename, or paraphrase.

## 1. Registry exact-count assertion (FR-002)

File: `packages/studio/src/survey/questions/registry.test.ts`

Replace:
```ts
it("has at least one entry", () => {
  expect(Object.keys(questionRegistry).length).toBeGreaterThan(0);
});
```
with:
```ts
// 9 Phase A + 49 Phase B + 22 Phase F + 3 Phase G + 31 Reserve = 114 total
// (re-verified 2026-08-17; spec 069 FR-002 — update this count in the same
// change that adds or removes a questionRegistry entry).
it("has exactly the verified inventory of 114 entries", () => {
  expect(Object.keys(questionRegistry).length).toBe(114);
});
```

## 2. Manifest-resolution test (FR-003 / SC-003)

File: `packages/studio/src/steps/manifest.test.ts` — new `describe` block, suggested title:

```
describe("FR-003 — every manifest step id resolves to a registered component", () => { ... })
```

Per-step assertion shape (see [data-model.md](../data-model.md) §3 for the full rule):
- `kind === "editor-step"` → `expect(typeof step.component).toBe("function")`
- `kind === "question-step"` → `expect(questionRegistry[step.questionId]).toBeDefined()`

## 3. Renderer source-guard test (FR-004, extends existing SC-004 block)

File: `packages/studio/src/steps/manifest.test.ts` — add to the existing
`describe("SC-004 — StudioShell.tsx has no per-step render branches or completion handlers", ...)`
block (or a sibling block reusing its `readFileSync` helper for `StepHost.tsx` too), suggested
assertion text:

```
it('StudioShell.tsx has no import from an editors/ path', () => {
  expect(src).not.toMatch(/from ["'][^"']*\/editors\//);
});
```

with the equivalent assertion added for `components/StepHost.tsx` source.

## 4. Depcruiser rule (FR-004 / SC-005)

File: `.dependency-cruiser.cjs` — new entry in the `forbidden` array, exact `name`:

```
renderer-no-direct-editor-import
```

Shape (fields only — see [research.md](../research.md) Decision 2 for the `from` scope rationale):
```js
{
  name: 'renderer-no-direct-editor-import',
  severity: 'error',
  from: { path: '^packages/studio/src/(StudioShell\\.tsx|components/StepHost\\.tsx)$' },
  to:   { path: '^packages/studio/src/editors/' },
}
```
