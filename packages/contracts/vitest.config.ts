import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: [
      {
        // SPEC 104 INTEGRATION STUB — remove when the real resolver lands.
        // `src/touchProduction.ts` (T003) is being built on a parallel branch;
        // the T006/T025 consumers on this branch import `./touchProduction`
        // against the contracts §1 API, and this alias points that specifier
        // at the test-only stub so the suites can run pre-integration. The
        // stub lives OUTSIDE src (test-stubs/) so no production build can
        // pick it up. See test-stubs/touchProduction.ts for its fidelity
        // limits.
        find: /^\.\/touchProduction(\.js)?$/,
        replacement: fileURLToPath(
          new URL("./test-stubs/touchProduction.ts", import.meta.url),
        ),
      },
    ],
  },
  test: {
    include: ["src/**/*.test.ts"],
  },
});
