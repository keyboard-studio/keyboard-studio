import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

// utilities/facet-index is a standalone tsx tool, deliberately kept out of the
// pnpm workspace (CLAUDE.md "Standalone utilities") — so there is no
// node_modules/@keyboard-studio/contracts symlink for Vite's resolver to find.
// `tsx` resolves the tsconfig.json `paths` mapping at runtime on its own, but
// Vite/Vitest does not read tsconfig `paths` without a plugin, so it is
// mirrored here explicitly (same pattern as packages/engine/vitest.config.ts's
// non-workspace vendor aliases).
//
// The index builders reach contracts *subpaths* too (the engine validator
// modules import `@keyboard-studio/contracts/dev-log` and `/unicode`), so a
// bare object alias is not enough: Vite treats an object key as a prefix and
// rewrites `.../dev-log` to `src/index.ts/dev-log` (ENOTDIR — every suite in
// this root failed that way once #2101 pulled the Layer A′ validator into
// the import graph). Exact-match regexes, one per export, mirror
// utilities/tsconfig.contracts-paths.json — keep them in step with the
// `exports` map in packages/contracts/package.json.
const contractsSrc = resolve(__dirname, "../../packages/contracts/src");
export default defineConfig({
  resolve: {
    alias: [
      { find: /^@keyboard-studio\/contracts$/, replacement: resolve(contractsSrc, "index.ts") },
      { find: /^@keyboard-studio\/contracts\/mocks$/, replacement: resolve(contractsSrc, "mocks/index.ts") },
      { find: /^@keyboard-studio\/contracts\/fixtures$/, replacement: resolve(contractsSrc, "fixtures/index.ts") },
      { find: /^@keyboard-studio\/contracts\/criteria$/, replacement: resolve(contractsSrc, "criteriaData.ts") },
      { find: /^@keyboard-studio\/contracts\/dev-log$/, replacement: resolve(contractsSrc, "utils/devLog.ts") },
      { find: /^@keyboard-studio\/contracts\/unicode$/, replacement: resolve(contractsSrc, "unicode/index.ts") },
    ],
  },
  test: {
    include: ["**/*.test.ts"],
    passWithNoTests: true,
  },
});
