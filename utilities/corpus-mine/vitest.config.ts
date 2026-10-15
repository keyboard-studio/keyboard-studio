import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

// utilities/corpus-mine is a standalone tool, deliberately kept out of the
// pnpm workspace (CLAUDE.md "Standalone utilities") — so there is no
// node_modules/@keyboard-studio/contracts symlink for Vite's resolver to
// find. `tsc` resolves the tsconfig.json `paths` mapping on its own, but
// Vite/Vitest does not read tsconfig `paths` without a plugin, so it is
// mirrored here explicitly (same pattern as utilities/facet-index).
export default defineConfig({
  resolve: {
    alias: {
      "@keyboard-studio/contracts": resolve(
        __dirname,
        "../../packages/contracts/src/index.ts",
      ),
      // studio's lib/langtagsDefaults dynamically imports this subpath;
      // map it at the engine source like the contracts root above.
      "@keyboard-studio/engine/langtags": resolve(
        __dirname,
        "../../packages/engine/src/langtags/index.ts",
      ),
    },
  },
  test: {
    include: ["**/*.test.ts"],
    passWithNoTests: true,
  },
});
