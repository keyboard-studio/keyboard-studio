import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { lingui } from "@lingui/vite-plugin";
import { fileURLToPath, URL } from "node:url";

// Corpus-sweep suites only (km/ci-fast-gates): mirrors vitest.config.ts
// (same plugins, aliases and setup) with discovery narrowed to the
// corpus files the default config excludes. Run by the build job's
// path-gated "corpus sweeps" step.
export default defineConfig({
  plugins: [
    react({ babel: { plugins: ["@lingui/babel-plugin-lingui-macro"] } }),
    lingui(),
  ],
  resolve: {
    alias: {
      "@docs": fileURLToPath(new URL("../../docs", import.meta.url)),
      "@content-i18n": fileURLToPath(new URL("../../content/i18n", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    globals: false,
    setupFiles: ["./src/test-setup.ts"],
    include: ["src/**/*.corpus.test.{ts,tsx}"],
    // A corpus run that discovers nothing must fail, never pass vacuously.
    passWithNoTests: false,
    testTimeout: 30_000,
  },
});
