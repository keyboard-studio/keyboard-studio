import { defineConfig } from "vitest/config";

import { CORPUS_TEST_PATTERNS } from "./vitest.config";

// Corpus-sweep suites only (km/ci-fast-gates): the mirror of
// vitest.config.ts, which excludes these files from the default suite.
// Run by the build job's path-gated "corpus sweeps" step, and by the
// spec 086 generation-time budget step (which names a corpus file).
export default defineConfig({
  test: {
    include: CORPUS_TEST_PATTERNS,
    setupFiles: ["./vitest.setup.ts"],
    // A corpus run that discovers nothing must fail, never pass vacuously.
    passWithNoTests: false,
  },
});
