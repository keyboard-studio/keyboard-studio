// Architecture fitness functions (dependency-cruiser).
//
// These promote the cross-package boundary invariants from prose in CLAUDE.md
// (spec §10 validator layering, §12/§13 team boundaries, the contracts
// dependency-root rule, the studio-poc throwaway rule) into CI gates. A
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
      to: { path: '^packages/(engine|studio|studio-poc|keyboard-lint|llm)/' },
    },
    {
      name: 'no-deps-on-studio-poc',
      comment:
        'studio-poc is a throwaway prototype — do not build on it (CLAUDE.md). ' +
        'Nothing outside studio-poc may import it.',
      severity: 'error',
      from: { pathNot: '^packages/studio-poc/' },
      to: { path: '^packages/studio-poc/' },
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
