import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [react()],
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
