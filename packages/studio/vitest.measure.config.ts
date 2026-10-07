// Dedicated vitest config for measurement harnesses (*.measure.ts).
//
// The package's main vitest.config.ts includes only *.test.{ts,tsx}, so
// measurement files never run in the suite (they are evidence-gathering
// runs, not gates — see specs/093-derived-keyboard, SC-004 / task T002).
// This config reuses the base config verbatim and narrows discovery to the
// measure files, with a timeout sized for repeated full-projection runs:
//
//   pnpm vitest run --config vitest.measure.config.ts
import { defineConfig, mergeConfig } from "vitest/config";
import baseConfig from "./vitest.config.ts";

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      include: ["src/**/*.measure.{ts,tsx}"],
      testTimeout: 900_000,
    },
  }),
);
