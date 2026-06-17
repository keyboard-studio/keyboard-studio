import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import { localKeyboardsPlugin } from "./vite-plugins/localKeyboards.ts";

// Sibling clone of keymanapp/keyboards (see CLAUDE.md). KEYBOARDS_REPO env
// overrides for non-standard layouts. Resolves to <repoRoot>/../keyboards.
const KEYBOARDS_REPO_ROOT =
  process.env["KEYBOARDS_REPO"] ??
  fileURLToPath(new URL("../../../keyboards", import.meta.url));

export default defineConfig({
  plugins: [
    react(),
    localKeyboardsPlugin({ keyboardsRepoRoot: KEYBOARDS_REPO_ROOT }),
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
      "@docs": fileURLToPath(new URL("../../docs", import.meta.url)),
    },
  },
  optimizeDeps: {
    // Exclude kmc-kmn from pre-bundling so wasm-host.js resolves at
    // runtime and its .wasm sibling-fetch doesn't 404.
    exclude: ["@keymanapp/kmc-kmn"],
  },
  server: {
    port: 5273,
    strictPort: true,
    proxy: {
      // Proxy for keyboard source files — rewrites /kbd-proxy/<path> to
      // https://raw.githubusercontent.com/keymanapp/keyboards/master/<path>.
      // fetchKeyboardSourceToVfs defaults to /kbd-proxy, so no override needed.
      "/kbd-proxy": {
        target: "https://raw.githubusercontent.com",
        changeOrigin: true,
        rewrite: (path) =>
          path.replace(/^\/kbd-proxy/, "/keymanapp/keyboards/master"),
      },
    },
  },
});
