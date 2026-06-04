import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import { localKeyboardsPlugin } from "./vite-plugins/localKeyboards.ts";

// keymanapp/keyboards sibling-clone path (matches fetch-kmcmplib dev mode's
// expectation of ../keyman). Override with KEYBOARDS_REPO env var if needed.
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
      // kmc-kmn's wasm-host.js has Node-only `require('path')` that Vite
      // rewrites into an ESM default import. Without an alias this hits
      // path-browserify (CJS, no default) and crashes. Alias BOTH names
      // to a self-contained POSIX-style shim that exports a real default.
      path: fileURLToPath(new URL("./src/lib/pathShim.ts", import.meta.url)),
      "path-browserify": fileURLToPath(
        new URL("./src/lib/pathShim.ts", import.meta.url),
      ),
    },
  },
  optimizeDeps: {
    // Exclude kmc-kmn from pre-bundling so its internal wasm-host.js
    // resolves at runtime in node_modules and `import.meta.url` points
    // at the real file location (where wasm-host.wasm sits as a sibling).
    // Pre-bundling moves wasm-host.js into a chunk where the .wasm
    // sibling-fetch 404s.
    exclude: ["@keymanapp/kmc-kmn"],
  },
  server: {
    port: 5173,
    proxy: {
      // Fallback path for the source-file fetch when the localKeyboards
      // plugin can't be used (e.g. CI without a sibling clone). The
      // canonical POC path is /local-kbd-proxy via the plugin above.
      // Production needs a CSP-safe alternative (cached artifact server,
      // signed CDN URLs, or compile-on-demand backend) — tracked separately.
      "/kbd-proxy": {
        target: "https://raw.githubusercontent.com",
        changeOrigin: true,
        rewrite: (path) =>
          path.replace(/^\/kbd-proxy/, "/keymanapp/keyboards/master"),
      },
    },
  },
});
