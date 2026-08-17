/**
 * rowMetrics — re-export shim over the canonical row-geometry and keys-per-row
 * threshold module, which lives in
 * [contracts](../../../contracts/src/row-metrics.ts) (spec 065 T019).
 *
 * tasks.md T019 names this path as the module's home and T022 asks Layer C's
 * check 18.3 to read the threshold table from it. Both cannot hold with the
 * table defined here: `.dependency-cruiser.cjs`'s `lint-not-to-engine` rule
 * forbids `@keymanapp/keyboard-lint` importing engine, so the import T022 asks
 * for would fail `pnpm lint`. The definitions therefore sit in contracts — the
 * one package Layer C, engine and the studio can all reach — and this shim keeps
 * T019's stated path and its "export it from the engine index, the studio's only
 * sanctioned door" both true.
 *
 * Exactly the arrangement `touchKeyAddress.ts` and `touchKeyDiagnostics.ts`
 * already have, for the same reason. There is deliberately no behaviour here.
 */

export {
  DEFAULT_KEY_WIDTH_PCT,
  DEFAULT_KEY_PAD_PCT,
  PLATFORM_MAX_KEYS_PER_ROW,
  platformMaxKeysPerRow,
  countInteractiveRowKeys,
  computeRowMetrics,
} from "@keyboard-studio/contracts";
export type { RowMetricKey, RowMetrics } from "@keyboard-studio/contracts";
