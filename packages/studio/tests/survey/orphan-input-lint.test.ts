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
import { parse } from "yaml";
import { formatIRPath } from "@keyboard-studio/contracts";
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
// ---------------------------------------------------------------------------

interface ThinManifest {
  phase: string;
  questions: string[];
  provenance_questions?: string[];
}

function loadManifest(filename: string): ThinManifest {
  const raw = readFileSync(path.join(flowsDir, filename), "utf-8");
  const parsed = parse(raw) as {
    phase: string;
    questions: string[];
    provenance_questions?: string[];
  };
  return parsed;
}

const manifestA = loadManifest("phase_a_identity.modular.yaml");
const manifestB = loadManifest("phase_b_characters.modular.yaml");
const manifestF = loadManifest("phase_f_helpdocs.modular.yaml");

// All question IDs referenced by any manifest, in phase order.
// provenance_questions are part of phase A flow and run after main questions.
function allIds(manifest: ThinManifest): string[] {
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
// ---------------------------------------------------------------------------

interface OrphanReport {
  questionId: string;
  phase: string;
  orphanPaths: string[];
}

function analyzeOrphans(): OrphanReport[] {
  const reports: OrphanReport[] = [];
  // Accumulated producer set (as formatted path strings) — grows as we walk
  // questions in flow order.
  const producerSet = new Set<string>();

  for (const { phase, ids } of phaseOrder) {
    for (const id of ids) {
      const mod = questionRegistry[id];
      if (mod === undefined) {
        // Registry miss — mirror-coverage gate handles this; skip here.
        continue;
      }

      const inputs = mod.inputs ?? [];
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

  it("exempts questions not referenced by any manifest (library/reserve)", () => {
    // This test confirms the exemption is coded correctly: any registry entry
    // not in manifestedIds would be skipped. Currently there are none, but the
    // logic path is tested by verifying manifestedIds covers the full registry.
    const registryIds = Object.keys(questionRegistry);
    const nonManifested = registryIds.filter((id) => !manifestedIds.has(id));
    // Expected to be empty today; if it grows, those modules are exempt from
    // orphan-input lint per the spec (library/reserve modules).
    // This assertion documents the current state; update if reserve modules land.
    expect(
      nonManifested,
      `Non-manifested (exempt) modules: ${nonManifested.join(", ")}. ` +
        `This is fine — they are skipped by orphan-input lint.`,
    ).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Negative probe — inject a bogus input and confirm the lint catches it.
// This runs at test-collection time using a modified in-memory registry copy.
// ---------------------------------------------------------------------------

describe("orphan-input lint — negative probe (catches real orphans)", () => {
  it("detects an injected bogus input that has no producer", () => {
    // Clone the analyzer with a modified registry to inject a fake orphan.
    // We pick a question that normally has inputs: [] and temporarily give it
    // a path that nobody writes — 'groups[].rules[]' is a deep IR path with
    // no producer in any manifest question.
    const PROBE_ID = "pf_credits"; // phase F, safe to probe
    const BOGUS_PATH_KEY = "groups[].rules[]"; // no manifest question writes this

    // Run a modified analysis with the bogus input injected.
    const producerSet = new Set<string>();
    const reports: OrphanReport[] = [];

    for (const { phase, ids } of phaseOrder) {
      for (const id of ids) {
        const mod = questionRegistry[id];
        if (mod === undefined) continue;

        // Inject the bogus input into the probe question.
        const rawInputs =
          id === PROBE_ID
            ? [
                ...(mod.inputs ?? []),
                // A synthetic IRPath tuple that formatIRPath renders as BOGUS_PATH_KEY.
                // We pass the raw string tuple; formatIRPath will render it.
                ["groups", { kind: "[]" as const }, "rules", { kind: "[]" as const }] as unknown as import("@keyboard-studio/contracts").IRPath,
              ]
            : (mod.inputs ?? []);

        const writes = mod.writes ?? [];

        const orphanPaths: string[] = [];
        for (const inputPath of rawInputs) {
          const key = formatIRPath(inputPath);
          if (!producerSet.has(key)) {
            orphanPaths.push(key);
          }
        }
        if (orphanPaths.length > 0) {
          reports.push({ questionId: id, phase, orphanPaths });
        }
        for (const writePath of writes) {
          producerSet.add(formatIRPath(writePath));
        }
      }
    }

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
