import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

// utilities/i18n-content-extract is a standalone tsx tool, deliberately kept
// out of the pnpm workspace (CLAUDE.md "Standalone utilities") — so there is
// no node_modules/@keyboard-studio/contracts symlink for Vite's resolver to
// find. `tsx` resolves the tsconfig.json `paths` mapping at runtime on its
// own, but Vite/Vitest does not read tsconfig `paths` without a plugin, so it
// is mirrored here explicitly (same pattern as utilities/facet-index).
//
// The extract tool's test graph reaches contracts *subpaths* too (via
// packages/engine's base-browser, which imports
// `@keyboard-studio/contracts/dev-log`), so a bare object alias is not
// enough: Vite treats an object key as a prefix and rewrites `.../dev-log`
// to `src/index.ts/dev-log` (ENOTDIR). Exact-match regexes, one per export,
// mirror utilities/tsconfig.contracts-paths.json — keep them in step with
// the `exports` map in packages/contracts/package.json (same fix as
// utilities/supportability-scanner/vitest.config.ts).
const contractsSrc = resolve(__dirname, "../../packages/contracts/src");
export default defineConfig({
  resolve: {
    alias: [
      { find: /^@keyboard-studio\/contracts$/, replacement: resolve(contractsSrc, "index.ts") },
      { find: /^@keyboard-studio\/contracts\/mocks$/, replacement: resolve(contractsSrc, "mocks/index.ts") },
      { find: /^@keyboard-studio\/contracts\/fixtures$/, replacement: resolve(contractsSrc, "fixtures/index.ts") },
      { find: /^@keyboard-studio\/contracts\/criteria$/, replacement: resolve(contractsSrc, "criteriaData.ts") },
      { find: /^@keyboard-studio\/contracts\/dev-log$/, replacement: resolve(contractsSrc, "utils/devLog.ts") },
    ],
  },
  test: {
    include: ["**/*.test.ts"],
    passWithNoTests: true,
  },
});
