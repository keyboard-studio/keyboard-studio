import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
// [SCAFFOLD] localKeyboardsPlugin is a dev-only plugin; remove when the
// engine's BaseBrowserService no longer needs a local-clone proxy.
import { localKeyboardsPlugin } from "./vite-plugins/localKeyboards.ts";

// keymanapp/keyboards sibling-clone path. Override with KEYBOARDS_REPO env var.
const KEYBOARDS_REPO_ROOT = fileURLToPath(
  new URL("../../../keyboards", import.meta.url),
);

export default defineConfig({
  plugins: [
    react(),
    localKeyboardsPlugin({
      keyboardsRepoRoot:
        process.env["KEYBOARDS_REPO"] !== undefined
          ? process.env["KEYBOARDS_REPO"]
          : KEYBOARDS_REPO_ROOT,
    }),
  ],
  resolve: {
    alias: {
      // [SCAFFOLD] path shim required while @keymanapp/kmc-kmn is used
      // directly; Vite rewrites kmc-kmn's `require('path')` into an ESM
      // import that needs a browser-safe default export.
      path: fileURLToPath(new URL("./src/lib/pathShim.ts", import.meta.url)),
      "path-browserify": fileURLToPath(
        new URL("./src/lib/pathShim.ts", import.meta.url),
      ),
    },
  },
  optimizeDeps: {
    // Exclude kmc-kmn from pre-bundling so wasm-host.js resolves at
    // runtime and its .wasm sibling-fetch doesn't 404.
    exclude: ["@keymanapp/kmc-kmn"],
  },
  server: {
    port: 5273,
    proxy: {
      // [SCAFFOLD] Fallback GitHub proxy for when the local-keyboards
      // plugin can't be used (no sibling clone). Production needs a
      // CSP-safe alternative (cached artifact server or compile-on-demand
      // backend) — tracked separately.
      "/kbd-proxy": {
        target: "https://raw.githubusercontent.com",
        changeOrigin: true,
        rewrite: (path) =>
          path.replace(/^\/kbd-proxy/, "/keymanapp/keyboards/master"),
      },
    },
  },
});
