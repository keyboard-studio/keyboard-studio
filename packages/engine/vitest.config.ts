import { defineConfig } from "vitest/config";
import { resolve } from "path";

const vendorRoot = resolve(__dirname, "src/simulator/vendor/keyman");

export default defineConfig({
  resolve: {
    alias: {
      "@keymanapp/common-types": resolve(vendorRoot, "common/types/main.ts"),
      "keyman/engine/keyboard": resolve(vendorRoot, "engine/keyboard/index.ts"),
      "keyman/engine/js-processor": resolve(vendorRoot, "engine/js-processor/index.ts"),
      "keyman/common/web-utils": resolve(vendorRoot, "common/web-utils/index.ts"),
      "@keymanapp/keyman-version": resolve(__dirname, "src/simulator/vendor/stubs/keyman-version.ts"),
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
    passWithNoTests: true,
  },
});
