import { defineConfig } from "vitest/config";

// Standalone config for the co-located Vercel functions. Like utilities/*,
// /api is intentionally outside the pnpm workspace (packages/*), so it does not
// run under `pnpm -r test`. Run explicitly:
//   npx vitest run --config api/vitest.config.ts
export default defineConfig({
  test: {
    include: ["oauth/**/*.test.ts"],
    environment: "node",
  },
});
