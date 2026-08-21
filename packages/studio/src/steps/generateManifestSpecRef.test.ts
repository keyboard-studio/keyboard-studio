// generateManifestSpecRef.test.ts — the vitest-run hook that regenerates
// manifest.specref.json on every `pnpm test` (spec 031 FR-006/FR-007,
// research R6). Runs inside vitest's own Vite transform pipeline (the
// `lingui()` plugin included), which is why this is a test file rather than
// a bare `tsx` script — see generateManifestSpecRef.ts's header for why.
//
// utilities/spec-trace (a standalone CJS Node tool) reads the artifact this
// test writes; it never imports packages/studio TS (FR-007).

import { describe, it, expect } from "vitest";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { manifest } from "./manifest.ts";
import { questionRegistry } from "../survey/questions/registry.ts";
import { buildManifestSpecRef } from "./generateManifestSpecRef.ts";
import type { Step } from "./types.ts";
import type { QuestionModule } from "../survey/types.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = resolve(__dirname, "manifest.specref.json");

describe("generateManifestSpecRef — manifest.specref.json artifact (spec 031 FR-006/FR-007)", () => {
  it("regenerates the artifact from the live manifest + question registry", () => {
    const out = buildManifestSpecRef(manifest, questionRegistry);

    // Every manifest step MUST have an entry (FR-003 requires >=1 specRef;
    // checkSpecRef in dashboard/completeness.ts is the enforcement — this
    // test only asserts the artifact reflects the manifest 1:1).
    for (const step of manifest) {
      expect(out).toHaveProperty(step.id);
    }

    writeFileSync(OUTPUT_PATH, JSON.stringify(out, null, 2) + "\n", "utf-8");

    expect(Object.keys(out).length).toBeGreaterThanOrEqual(manifest.length);
  });

  it("throws on a question-module id colliding with a manifest step id, rather than silently overwriting", () => {
    // Step ids and question ids are two separate, uncoordinated namespaces —
    // nothing else in this codebase enforces they stay disjoint. Only the
    // fields buildManifestSpecRef actually reads (id/specRef) need to be real.
    const collidingManifest = [
      { id: "carve", specRef: "§9" },
    ] as unknown as readonly Step[];
    const collidingRegistry = {
      carve: { specRef: "§7" },
    } as unknown as Readonly<Record<string, QuestionModule>>;

    expect(() => buildManifestSpecRef(collidingManifest, collidingRegistry)).toThrow(
      /collides with a manifest step id/,
    );
  });
});
