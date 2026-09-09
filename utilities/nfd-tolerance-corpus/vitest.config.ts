import { defineConfig, mergeConfig } from "vitest/config";

import viteConfig from "./vite.config.js";

// The aliases live in vite.config.ts, shared with run.mjs, so the CLI and the
// test suite resolve the engine's vendored KeymanWeb sources identically.
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      include: ["**/*.test.ts"],
      passWithNoTests: true,
      // Four WASM compiles per fixture keyboard; the default 5s is not enough
      // on a cold kmc-kmn instantiation.
      testTimeout: 120_000,
    },
  }),
);
