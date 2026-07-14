import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

// Standalone config for the co-located Vercel functions. Like utilities/*,
// /api is intentionally outside the pnpm workspace (packages/*), so it does not
// run under `pnpm -r test`. Run explicitly (from anywhere in the repo):
//   npx vitest run --config api/vitest.config.ts
//
// `root` is pinned to this directory so the include globs resolve against /api
// regardless of the caller's cwd. Without it, running from the repo root makes
// the globs resolve against the root and silently match nothing.
export default defineConfig({
  test: {
    root: dirname(fileURLToPath(import.meta.url)),
    include: ["oauth/**/*.test.ts", "submit/**/*.test.ts"],
    environment: "node",
  },
});
