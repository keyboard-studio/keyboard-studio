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
import { readFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";
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
// Load the three modular manifests in phase order A -> B -> F
// using the canonical validated parser from loadModularFlow.ts.
// ---------------------------------------------------------------------------

function loadManifest(filename: string) {
  const raw = readFileSync(path.join(flowsDir, filename), "utf-8");
  return parseThinYaml(raw);
}

const manifestA = loadManifest("phase_a_identity.modular.yaml");
const manifestB = loadManifest("phase_b_characters.modular.yaml");
const manifestF = loadManifest("phase_f_helpdocs.modular.yaml");

// All question IDs referenced by any manifest, in phase order.
// provenance_questions are part of phase A flow and run after main questions.
function allIds(manifest: ReturnType<typeof parseThinYaml>): string[] {
  const ids = [...manifest.questions];
  if (manifest.provenance_questions) {
    ids.push(...manifest.provenance_questions);
  }
  return ids;
}

const phaseOrder: Array<{ phase: string; ids: string[] }> = [
  { phase: "A", ids: allIds(manifestA) },
  { phase: "B", ids: allIds(manifestB) },
  { phase: "F", ids: allIds(manifestF) },
];

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
    expect(manifestA.questions.length).toBeGreaterThan(0);
    expect(manifestB.questions.length).toBeGreaterThan(0);
    expect(manifestF.questions.length).toBeGreaterThan(0);
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
    const registryIds = Object.keys(questionRegistry);
    const nonManifested = registryIds.filter((id) => !manifestedIds.has(id));
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
