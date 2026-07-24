import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { lingui } from "@lingui/vite-plugin";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  // Mirror vite.config.ts's Lingui wiring so the <Trans> macro is transformed
  // and `?lingui` catalog imports resolve under vitest, not just in the app.
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
    // Polyfills the Web Crypto API on Node 18 (it's a default global only on
    // Node >= 20, and jsdom does not provide it). See src/test-setup.ts (#510).
    setupFiles: ["./src/test-setup.ts"],
    // Playwright specs under e2e/ use the @playwright/test runner — exclude
    // them from vitest discovery so the default *.spec.ts glob doesn't pull
    // them in and fail with "describe is not defined".
    exclude: ["**/node_modules/**", "**/dist/**", "e2e/**"],
    // Include both colocated src tests and the mirror tests/ tree (FR-009).
    include: ["src/**/*.test.{ts,tsx}", "tests/**/*.test.{ts,tsx}"],
    // The first dynamic import of a test module that vi.mock()s
    // @keyboard-studio/engine loads the whole engine dist (including the
    // >500 KB generated langtags index) through importOriginal(), which can
    // exceed the 5 s default on slower Windows checkouts. A timed-out first
    // test then aborts mid-import and poisons sibling tests' one-shot mocks.
    // Fake-timer tests are unaffected (the timeout counts real time).
    testTimeout: 30_000,
  },
});
