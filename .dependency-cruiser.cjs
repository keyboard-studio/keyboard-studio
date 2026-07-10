// Architecture fitness functions (dependency-cruiser).
//
// These promote the cross-package boundary invariants from prose in CLAUDE.md
// (spec §10 validator layering, §12/§13 team boundaries, the contracts
// dependency-root rule) into CI gates. A
// teammate who crosses a boundary gets a red check naming the rule — the
// "team knows when it's off track" signal (see docs/architecture.md ->
// Conformance gates). Run: `pnpm depcruise`.
//
// Cross-package imports resolve to `packages/<pkg>/dist/...` (pnpm workspace
// symlinks + exports), so `to.path` rules match `^packages/<pkg>/`.

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      comment:
        'No runtime circular dependencies — they defeat the layered design. ' +
        'Type-only cycles are allowed: TypeScript erases them (e.g. the ' +
        'Pattern <-> KeyboardIR type cross-reference in contracts).',
      severity: 'error',
      from: {},
      to: { circular: true, dependencyTypesNot: ['type-only'] },
    },
    {
      name: 'lint-not-to-engine',
      comment:
        'Layer C (@keymanapp/keyboard-lint) must not import the engine ' +
        '(CLAUDE.md / spec §10). Lint is a standalone hygiene layer.',
      severity: 'error',
      from: { path: '^packages/keyboard-lint/src' },
      to: { path: '^packages/engine/' },
    },
    {
      name: 'engine-not-to-studio',
      comment:
        'Engine must not import the studio SPA — the engine is upstream of the ' +
        'UI (spec §12/§13 team boundaries). Dependencies flow studio -> engine.',
      severity: 'error',
      from: { path: '^packages/engine/src' },
      to: { path: '^packages/studio/' },
    },
    {
      name: 'contracts-is-the-dependency-root',
      comment:
        'contracts is the dependency root — everything builds to it, so it must ' +
        'not import any other workspace package (CLAUDE.md).',
      severity: 'error',
      from: { path: '^packages/contracts/src' },
      to: { path: '^packages/(engine|studio|keyboard-lint|llm)/' },
    },
    {
      name: 'ui-is-a-leaf',
      comment:
        'studio ui/ primitives are a dependency leaf: no imports from survey/, steps/, or stores/ (feature 011).',
      severity: 'error',
      from: { path: '^packages/studio/src/ui/' },
      to:   { path: '^packages/studio/src/(survey|steps|stores)/' },
    },
    {
      name: 'editors-no-dashboard',
      comment:
        'editors/ may import stores/ and lib/ (galleries bind workingCopyStore, ' +
        'irToCarveNodes, buildTouchLayoutJson — FR-007 / P4a boundaries.contract.md). ' +
        'Forbidden: editors/ -> dashboard/ (editors are steps, not orchestrators).',
      severity: 'error',
      from: { path: '^packages/studio/src/editors/' },
      to:   { path: '^packages/studio/src/dashboard/' },
    },
    {
      name: 'steps-layer',
      comment:
        'steps/ orchestrates editor steps and question modules. It may depend on ' +
        'survey/ (registry), editors/, contracts, and ui/. ' +
        'Forbidden: steps/ -> dashboard/, stores/, lib/, components/ ' +
        '(steps is a descriptor layer, not a UI consumer — P4a boundaries.contract.md).',
      severity: 'error',
      from: { path: '^packages/studio/src/steps/' },
      to:   { path: '^packages/studio/src/(dashboard|stores|lib|components)/' },
    },
    {
      name: 'dashboard-layer',
      comment:
        'dashboard/ reads the step manifest and survey/IR types. It may depend on ' +
        'steps/, contracts, and ui/. ' +
        'Forbidden: dashboard/ -> editors/ or stores/ directly ' +
        '(dashboard orchestrates via steps, not by touching editor internals — ' +
        'P4a boundaries.contract.md).',
      severity: 'error',
      from: { path: '^packages/studio/src/dashboard/' },
      to:   { path: '^packages/studio/src/(editors|stores)/' },
    },
    {
      name: 'question-modules-no-bypass-mutate-seam',
      comment:
        'survey/questions/ modules must be PURE descriptors: they declare ' +
        'inputs/writes and a pure mutate(value, ctx) that returns a ' +
        'Partial<KeyboardIR> patch (spec-014 mutate-seam, FR-002/-005). They MUST ' +
        'NOT write the working copy directly — no imports of stores/, editors/, or ' +
        'lib/. The single executed IR write path is mutate() applied by the ' +
        'reducer (steps/reducer.ts -> steps/mutateApply.ts). Importing the store ' +
        'or an editor from a question module would re-open the answer-store-vs-IR ' +
        'state fork P5 closes (SC-001).',
      severity: 'error',
      from: { path: '^packages/studio/src/survey/questions/' },
      to:   { path: '^packages/studio/src/(stores|editors|lib)/' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    // Analyse hand-written source only; vendored, generated, and test code are
    // not subject to the boundary rules.
    exclude: {
      path:
        '(\\.test\\.[tj]sx?$|/__fixtures__/|/__tests__/|/simulator/vendor/|/recognizer/rules/generated/|/e2e/)',
    },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      exportsFields: ['exports'],
    },
  },
};
