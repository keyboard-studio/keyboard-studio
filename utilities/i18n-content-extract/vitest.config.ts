import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

// utilities/i18n-content-extract is a standalone tsx tool, deliberately kept
// out of the pnpm workspace (CLAUDE.md "Standalone utilities") — so there is
// no node_modules/@keyboard-studio/contracts symlink for Vite's resolver to
// find. `tsx` resolves the tsconfig.json `paths` mapping at runtime on its
// own, but Vite/Vitest does not read tsconfig `paths` without a plugin, so it
// is mirrored here explicitly (same pattern as utilities/facet-index).
export default defineConfig({
  resolve: {
    alias: {
      "@keyboard-studio/contracts": resolve(__dirname, "../../packages/contracts/src/index.ts"),
    },
  },
  test: {
    include: ["**/*.test.ts"],
    passWithNoTests: true,
  },
});
