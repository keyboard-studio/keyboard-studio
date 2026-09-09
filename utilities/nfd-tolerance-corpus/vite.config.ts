import { defineConfig } from "vite";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const contracts = resolve(HERE, "../../packages/contracts/src");
const vendor = resolve(HERE, "../../packages/engine/src/simulator/vendor");

// Module resolution for a tool that lives outside the pnpm workspace and
// imports engine SOURCE by relative path. Two sets of aliases, both mirrors:
//
//  - @keyboard-studio/contracts and its subpath exports -> contracts src,
//    mirroring utilities/tsconfig.contracts-paths.json. Every entry point
//    the engine can reach must be here; a missing one resolves to a dist/
//    file no build produced. The `find` values are exact strings so
//    `.../dev-log` cannot be swallowed by a prefix match on the bare name.
//  - the vendored KeymanWeb specifiers, mirroring
//    packages/engine/tsconfig.json and packages/engine/vitest.config.ts.
//
// Shared by run.mjs (the CLI) and vitest.config.ts (the suite), so the two
// can never resolve differently.
export default defineConfig({
  resolve: {
    alias: [
      { find: "@keyboard-studio/contracts/dev-log", replacement: resolve(contracts, "utils/devLog.ts") },
      { find: "@keyboard-studio/contracts/criteria", replacement: resolve(contracts, "criteriaData.ts") },
      { find: "@keyboard-studio/contracts/fixtures", replacement: resolve(contracts, "fixtures/index.ts") },
      { find: "@keyboard-studio/contracts/mocks", replacement: resolve(contracts, "mocks/index.ts") },
      { find: "@keyboard-studio/contracts", replacement: resolve(contracts, "index.ts") },
      { find: "@keymanapp/common-types", replacement: resolve(vendor, "keyman/common/types/main.ts") },
      { find: "@keymanapp/keyman-version", replacement: resolve(vendor, "stubs/keyman-version.ts") },
      { find: "keyman/engine/keyboard", replacement: resolve(vendor, "keyman/engine/keyboard/index.ts") },
      { find: "keyman/engine/js-processor", replacement: resolve(vendor, "keyman/engine/js-processor/index.ts") },
      { find: "keyman/common/web-utils", replacement: resolve(vendor, "keyman/common/web-utils/index.ts") },
    ],
  },
});
