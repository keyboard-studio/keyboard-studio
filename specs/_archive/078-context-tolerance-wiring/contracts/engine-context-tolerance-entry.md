# Contract: `@keyboard-studio/engine/context-tolerance`

This is a new subpath in `packages/engine/package.json` `exports`. It is
**browser-safe**: its module graph contains no `node:` import and no bare
specifier that resolves only through a tsconfig or vitest alias. The root entry
`@keyboard-studio/engine` must **not** re-export any of it (research D2).

## Exports

```ts
export function computeContextTolerance(ir: KeyboardIR): Promise<ToleranceReport>;
export function classifyToleranceFinding(
  f: RuleToleranceFinding,
): "tolerant" | "made-tolerant" | "gap" | "not-analysed";
export function proposeContextVariants(
  ir: KeyboardIR, report: ToleranceReport,
): Promise<ContextVariantsResult>;        // + per-variant disclosures (research D9)
export function createContextToleranceMigrationRule(
  result: ContextVariantsResult, writeBackPolicy?: "echo",   // studio passes "echo" only
): MigrationRule;
export function buildContextToleranceOutputDiffPreview(/* unchanged */): unknown;
export function toleranceFingerprint(ir: KeyboardIR, ruleIds: readonly string[]): string;
export function loadCharNames(): Promise<ReadonlyMap<number, string>>;  // lazy 1.4 MB JSON
export type { ContextVariantsResult, ContextVariant, VariantDisclosure };
```

`VariantDisclosure` is `{ shadows: { ruleId: string; relation: "shadows" | "shadowed-by"; fallback: boolean }[]; unobservable?: "mnemonic-backspace"; markOrderNote?: string }`.

## Simulator loader seam

```ts
// simulator/keyboardLoader.ts
export interface KeyboardLoader {
  load(compiledJs: string, harness: SandboxGlobals): LoadedKeyboard;
}
export function setKeyboardLoader(loader: KeyboardLoader): void;  // default chosen by condition
```

- Under Node (tests, harness), `nodeKeyboardLoader` stays the default. There is
  no behaviour change there.
- The browser gets `browserKeyboardLoader`, selected by the `"browser"`
  condition on the subpath export. It evaluates the keyboard through
  `new Function(...)` with the same injected globals.
- **Equivalence test:** both loaders produce identical `simulate()` output on
  the `sil_yoruba8` canary and on the `basic_kbdfr` recognizer fixture.

## Guarantees

- `computeContextTolerance` never throws for a compile failure. It returns a
  report whose `compileDiagnostics` is set, and the studio renders that as
  could-not-check. It still throws on an SC-006 invariant breach, which is a
  programmer error.
- `proposeContextVariants` produces no site for any FR-010 hazard shape.
- Idempotent: `proposeContextVariants(apply(proposal))` yields zero new variants.

## Bundle-safety enforcement

- A studio build test asserts that the production bundle contains neither
  `node:vm` nor an unresolved `keyman/engine/` specifier. It follows the
  `api/bundle-safety.test.ts` pattern.
- A depcruise rule forbids importing `simulator/nodeKeyboardLoader` from
  `context-tolerance/**`.
