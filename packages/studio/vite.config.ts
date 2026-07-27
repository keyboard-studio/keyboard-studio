import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { lingui } from "@lingui/vite-plugin";
import { fileURLToPath, URL } from "node:url";
import { localKeyboardsPlugin } from "./vite-plugins/localKeyboards.ts";

// Sibling clone of keymanapp/keyboards (see CLAUDE.md). KEYBOARDS_REPO env
// overrides for non-standard layouts. Resolves to <repoRoot>/../keyboards.
const KEYBOARDS_REPO_ROOT =
  process.env["KEYBOARDS_REPO"] ??
  fileURLToPath(new URL("../../../keyboards", import.meta.url));

const PATH_SHIM = fileURLToPath(
  new URL("./src/lib/pathShim.ts", import.meta.url),
);

export default defineConfig({
  plugins: [
    // The Lingui macro transform runs via Babel; @vitejs/plugin-react only
    // spins up Babel when given plugins, so this is the one place dev-server
    // JSX goes through Babel instead of esbuild (acceptable for the spike).
    react({
      babel: { plugins: ["@lingui/babel-plugin-lingui-macro"] },
    }),
    lingui(),
    localKeyboardsPlugin({ keyboardsRepoRoot: KEYBOARDS_REPO_ROOT }),
  ],
  resolve: {
    alias: {
      // [SCAFFOLD] path shim required while @keymanapp/kmc-kmn is used
      // directly; Vite rewrites kmc-kmn's `require('path')` into an ESM
      // import that needs a browser-safe default export.
      path: PATH_SHIM,
      "path-browserify": PATH_SHIM,
      "@docs": fileURLToPath(new URL("../../docs", import.meta.url)),
      "@content-i18n": fileURLToPath(new URL("../../content/i18n", import.meta.url)),
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
    // Mirrors the vercel.json prod framing headers so dev/preview/prod stay
    // consistent. Deliberately no script-src here (site-wide, not scoped to
    // osk-frame.html) — it would break Vite's HMR inline scripts.
    headers: {
      "X-Frame-Options": "SAMEORIGIN",
      "Content-Security-Policy": "frame-ancestors 'self'",
    },
    proxy: {
      // Proxy for keyboard source files — rewrites /kbd-proxy/<path> to
      // https://raw.githubusercontent.com/keymanapp/keyboards/master/<path>.
      // fetchKeyboardSourceToVfs defaults to /kbd-proxy, so no override needed.
      "/kbd-proxy": {
        target: "https://raw.githubusercontent.com",
        changeOrigin: true,
        rewrite: (path) =>
          path.replace(/^\/kbd-proxy/, "/keyboard-studio/keyboards/master"),
      },
    },
  },
});
