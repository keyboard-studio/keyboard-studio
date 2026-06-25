import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@docs": fileURLToPath(new URL("../../docs", import.meta.url)),
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
  },
});
