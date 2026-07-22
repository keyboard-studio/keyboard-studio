// T020: manifest-scoped orphan-input lint.
//
// Phases run in flow order A -> B -> F. For each manifest-referenced question,
// every `input` it declares MUST already be in the accumulated producer set
// from steps that PRECEDE it (within its own manifest OR any earlier phase's
// manifest). An input with no preceding producer is an ORPHAN and the test
// FAILS, naming the question and the orphan path string.
//
// Cross-phase is allowed: e.g. pb_standard_letters (phase B) reads
// header.bcp47, which is produced by iso_code / primary_script in phase A —
// that is SATISFIED, not an orphan.
//
// Questions referenced by NO manifest (library/reserve) are EXEMPT (skipped).
//
// Comparison key: formatIRPath(path) — stable dot-bracket display string.

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { formatIRPath, irPath, ARRAY_INDEX } from "@keyboard-studio/contracts";
import { parseThinYaml } from "../../src/survey/loadModularFlow.ts";
import { questionRegistry } from "../../src/survey/questions/registry.ts";

// ---------------------------------------------------------------------------
// Resolve paths
// ---------------------------------------------------------------------------

const thisFile = fileURLToPath(import.meta.url);
const pkgRoot = path.resolve(path.dirname(thisFile), "../..");
const repoRoot = path.resolve(pkgRoot, "../..");
const flowsDir = path.join(repoRoot, "content", "flows");

// ---------------------------------------------------------------------------
// Discover all *.modular.yaml files in content/flows/ via readdirSync.
// Load them using the canonical validated parser from loadModularFlow.ts.
// ---------------------------------------------------------------------------

function loadManifest(filename: string) {
  const raw = readFileSync(path.join(flowsDir, filename), "utf-8");
  return parseThinYaml(raw);
}

// All .modular.yaml filenames found in the flows directory — automatically
// includes any future additions without requiring a manual edit here.
const allModularFilenames = readdirSync(flowsDir).filter((f) =>
  f.endsWith(".modular.yaml"),
);

// All question IDs referenced by any manifest, in phase order.
// provenance_questions are part of phase A flow and run after main questions.
function allIds(manifest: ReturnType<typeof parseThinYaml>): string[] {
  const ids = [...manifest.questions];
  if (manifest.provenance_questions) {
    ids.push(...manifest.provenance_questions);
  }
  return ids;
}

// Known phase-ordered manifests (A before B before F) — ordering matters for
// the orphan analysis because a producer must precede its consumer.
// Any .modular.yaml file not in this list is appended at the end with its
// filename as the phase label, ensuring future additions are never silently
// skipped by this lint.
const KNOWN_PHASE_ORDER: Array<{ phase: string; filename: string }> = [
  // spec 025: phase_a_identity is a PROPOSED flow, relocated to content/flows/proposed/.
  // It is still linted for orphan inputs (path is joined onto flowsDir below); the
  // readdirSync auto-discovery only scans the top level, so proposed flows are listed
  // explicitly here.
  { phase: "A (proposed)", filename: path.join("proposed", "phase_a_identity.modular.yaml") },
  { phase: "B", filename: "phase_b_characters.modular.yaml" },
  { phase: "F", filename: "phase_f_helpdocs.modular.yaml" },
  // identity_lite is the short hybrid head (spec §8); its 5 il_* modules
  // all declare empty inputs/writes so they trivially pass the orphan lint.
  { phase: "A (identity-lite)", filename: "identity_lite.modular.yaml" },
];

const knownFilenames = new Set(KNOWN_PHASE_ORDER.map((e) => e.filename));

// Build the final ordered list: known phases first (in spec order), then any
// newly discovered files appended alphabetically so they are linted and not
// silently exempt.
const orderedEntries: Array<{ phase: string; filename: string }> = [
  ...KNOWN_PHASE_ORDER,
  ...allModularFilenames
    .filter((f) => !knownFilenames.has(f))
    .sort()
    .map((f) => ({ phase: f, filename: f })),
];

const phaseOrder: Array<{ phase: string; ids: string[] }> = orderedEntries.map(
  ({ phase, filename }) => ({ phase, ids: allIds(loadManifest(filename)) }),
);

// Build the set of all manifested IDs for exemption check.
const manifestedIds = new Set<string>(
  phaseOrder.flatMap((p) => p.ids),
);

// ---------------------------------------------------------------------------
// Orphan-input analysis
//
// Optional `overrideInputs` map: { [questionId]: readonly IRPath[] }
// When provided, the given question's inputs are replaced with the override
// value. Used by the negative probe to inject a bogus input without
// re-implementing the full producer-set walk.
// ---------------------------------------------------------------------------

interface OrphanReport {
  questionId: string;
  phase: string;
  orphanPaths: string[];
}

function analyzeOrphans(
  overrideInputs?: Readonly<Record<string, readonly import("@keyboard-studio/contracts").IRPath[]>>,
): OrphanReport[] {
  const reports: OrphanReport[] = [];
  // Accumulated producer set (as formatted path strings) — grows as we walk
  // questions in flow order.
  const producerSet = new Set<string>();

  for (const { phase, ids } of phaseOrder) {
    for (const id of ids) {
      const mod = questionRegistry[id];
      if (mod === undefined) {
        // Registry miss: this is a broken manifest, not an exempt question.
        // The separate sanity test catches it, but we must not silently skip
        // here or the orphan gate becomes dependent on that sanity test.
        expect.fail(
          `Manifested question '${id}' (phase ${phase}) is absent from ` +
            `questionRegistry. Add it to the registry before running the orphan-lint.`,
        );
      }

      // Use override inputs if provided for this id; otherwise use declared inputs.
      const inputs =
        overrideInputs !== undefined && Object.prototype.hasOwnProperty.call(overrideInputs, id)
          ? overrideInputs[id]!
          : (mod.inputs ?? []);
      const writes = mod.writes ?? [];

      // Check inputs against the accumulated producer set (excludes self).
      const orphanPaths: string[] = [];
      for (const inputPath of inputs) {
        const key = formatIRPath(inputPath);
        if (!producerSet.has(key)) {
          orphanPaths.push(key);
        }
      }

      if (orphanPaths.length > 0) {
        reports.push({ questionId: id, phase, orphanPaths });
      }

      // After checking inputs, add this question's writes to the producer set.
      for (const writePath of writes) {
        producerSet.add(formatIRPath(writePath));
      }
    }
  }

  return reports;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("orphan-input lint — every manifested input has a prior producer", () => {
  it("manifests loaded successfully (sanity)", () => {
    // Every discovered .modular.yaml must have at least one question.
    // This catches empty or unloadable manifests early.
    for (const { phase, ids } of phaseOrder) {
      expect(
        ids.length,
        `Manifest for phase '${phase}' has no questions — empty or failed to load`,
      ).toBeGreaterThan(0);
    }
    // Confirm all four currently-known manifests are present.
    expect(
      allModularFilenames,
      "Expected at least 4 .modular.yaml files in content/flows/",
    ).toSatisfy((files: string[]) => files.length >= 4);
  });

  it("questionRegistry covers all manifested questions (sanity)", () => {
    for (const { ids } of phaseOrder) {
      for (const id of ids) {
        expect(
          questionRegistry[id],
          `Manifested question '${id}' not found in questionRegistry`,
        ).toBeDefined();
      }
    }
  });

  it("no manifested question has an orphan input", () => {
    const reports = analyzeOrphans();

    if (reports.length > 0) {
      const details = reports
        .map(
          ({ questionId, phase, orphanPaths }) =>
            `  Phase ${phase} / ${questionId}: orphan input(s) ${orphanPaths.join(", ")}`,
        )
        .join("\n");
      expect.fail(
        `Found ${reports.length} question(s) with orphan inputs:\n${details}\n` +
          `An orphan input has no preceding producer (writes declaration) in any ` +
          `prior manifest step. Either add the producer or correct the inputs declaration.`,
      );
    }

    expect(reports).toHaveLength(0);
  });

  it("all registry modules are referenced by a manifest (no non-manifested modules today)", () => {
    // Documents the current state: every registry entry appears in a manifest.
    // If a library/reserve module is intentionally added without a manifest
    // entry, move it to an explicit allowlist and update this assertion.
    // spec 046: pb_mark_input_order is intentionally NON-manifested — its
    // content is RELOCATED into the marks series' S3 station
    // (survey/marks/InputOrderStation.tsx reads the module's definition), so
    // the module stays registered/on disk but off every flow manifest.
    const RELOCATED_EXEMPT = new Set(["pb_mark_input_order"]);
    const registryIds = Object.keys(questionRegistry);
    const nonManifested = registryIds.filter(
      (id) => !manifestedIds.has(id) && !RELOCATED_EXEMPT.has(id),
    );
    expect(
      nonManifested,
      `Registry modules not referenced by any manifest: [${nonManifested.join(", ")}]. ` +
        `Add them to a manifest, or move to an explicit exempt allowlist if intentionally library/reserve.`,
    ).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Negative probe — inject a bogus input via analyzeOrphans() overrideInputs
// and confirm the lint catches it. Uses irPath/ARRAY_INDEX from contracts
// to build a type-safe IRPath; never mutates the real registry.
// ---------------------------------------------------------------------------

describe("orphan-input lint — negative probe (catches real orphans)", () => {
  it("detects an injected bogus input that has no producer", () => {
    // Pick a question that normally has inputs: [] and temporarily give it
    // a path that nobody writes — groups[].rules[] is a deep IR path with
    // no producer in any manifest question.
    const PROBE_ID = "pf_credits"; // phase F, safe to probe
    // irPath() produces a type-safe IRPath; formatIRPath renders it as "groups[].rules[]".
    const BOGUS_PATH = irPath("groups", ARRAY_INDEX, "rules", ARRAY_INDEX);
    const BOGUS_PATH_KEY = formatIRPath(BOGUS_PATH); // "groups[].rules[]"

    // Run the standard analysis with the bogus path injected into PROBE_ID's inputs.
    // analyzeOrphans() reuses the same producer-set walk — no duplicated logic.
    const pf_credits_orig = questionRegistry[PROBE_ID]!;
    const overrideInputs: Record<string, readonly import("@keyboard-studio/contracts").IRPath[]> = {
      [PROBE_ID]: [...(pf_credits_orig.inputs ?? []), BOGUS_PATH],
    };

    const reports = analyzeOrphans(overrideInputs);

    // The probe question should appear in the reports with the bogus path.
    const probeReport = reports.find((r) => r.questionId === PROBE_ID);
    expect(
      probeReport,
      `Negative probe failed: '${PROBE_ID}' did not appear in orphan reports. ` +
        `The lint is not catching injected orphan inputs.`,
    ).toBeDefined();
    expect(probeReport!.orphanPaths).toContain(BOGUS_PATH_KEY);
  });
});
