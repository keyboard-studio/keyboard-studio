import { configDefaults, defineConfig } from "vitest/config";

// Corpus-sweep suites (*.corpus.test.ts) are excluded
// from the default suite (km/ci-fast-gates, 2026-10-11): they sweep the
// pinned keyboards corpus and accounted for much of this suite's
// 18m41s in CI. They run under vitest.corpus.config.ts in the build
// job's path-gated "corpus sweeps" step instead — same files, same
// assertions, only their trigger changed.
export const CORPUS_TEST_PATTERNS = ["src/**/*.corpus.test.ts"];

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    exclude: [...configDefaults.exclude, ...CORPUS_TEST_PATTERNS],
    setupFiles: ["./vitest.setup.ts"],
    passWithNoTests: true,
  },
});
