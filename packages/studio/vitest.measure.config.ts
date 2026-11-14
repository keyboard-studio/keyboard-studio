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

const merged = mergeConfig(baseConfig, defineConfig({ test: { testTimeout: 900_000 } }));

// mergeConfig concatenates arrays, so an `include` passed through it would ADD the measure files
// to the base suite's and run all of them, timing the harness under the suite's load. Assign it.
export default { ...merged, test: { ...merged.test, include: ["src/**/*.measure.{ts,tsx}"] } };
