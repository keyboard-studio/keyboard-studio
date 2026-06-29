// Spec 022 — no-delete library guardrail (FR-004 / FR-005, SC-003).
//
// "Demotion is NOT deletion." When the orphaned full non-identity Phase A is
// demoted to the inert library (rendered as reserve nodes via computeReserveNodes
// — see buildStepGraph.test.ts / driftGuardrail.test.ts), the no-delete guardrail
// (migration-plan §4) requires every demoted module to remain:
//   • REGISTERED   — a key in its sub-registry (phaseARegistry) and in the merged
//                    questionRegistry, with the key matching definition.id;
//   • ON DISK      — its module file resolves at survey/questions/a/<id>.ts;
//   • TEST-COVERED — a colocated spec exists in the mirrored tree
//                    (tests/survey/questions/a/<id>.test.ts);
//   • REVIVABLE    — by re-adding its id to a flow YAML / flow-source (no code
//                    change, no re-registration, no file restore — asserted
//                    structurally: the registry entry + file + test all persist).
//
// The assertion turns RED if any demoted module is deleted or unregistered. The
// RED-case is exercised below via an INJECTED clone of the registry/disk/coverage
// sets (the real registry and filesystem are never mutated), proving the guardrail
// is a genuine detector, not always-green.
//
// Scope (Amendment 2026-06-29): this covers the full non-identity Phase A only.
// The `pb_*` step-by-step battery is NOT library content — it stays a live,
// reachable, non-default branch off the IntroChooser gate — so it is deliberately
// NOT in the demoted set here.
//
// Test-only: no contracts bump, no write routing, no flag flip (FR-010/FR-011).

import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { questionRegistry } from "./registry.ts";
import { phaseARegistry } from "./registry.a.ts";

// ---------------------------------------------------------------------------
// The demoted set: the full non-identity Phase A (15 identity + 15 provenance_*).
// These are exactly the ids in content/flows/phase_a_identity.modular.yaml's
// `questions` + `provenance_questions` lists. They are demoted to the inert
// library (reserve); they MUST remain registered + on disk + test-covered.
//
// NOTE: the il_* identity-lite head (il_language_autonym, il_language_english,
// il_language_code, il_target_script, il_script_not_supported) is the CANONICAL
// identity experience and stays LIVE — it is NOT in the demoted set.
// ---------------------------------------------------------------------------

const DEMOTED_PHASE_A_IDENTITY = [
  "desktop_first_notice",
  "language_name_autonym",
  "language_name_english",
  "iso_code",
  "region",
  "primary_script",
  "writing_direction",
  "script_not_supported_stub",
  "layout_family",
  "script_family",
  "pa_primary_target",
  "author_display_name",
  "author_contact_email",
  "pa_copyright_holder",
  "provenance_opt_in",
] as const;

const DEMOTED_PHASE_A_PROVENANCE = [
  "provenance_requester_name",
  "provenance_requester_contact",
  "provenance_requester_affiliation",
  "provenance_requester_relation",
  "provenance_community_rep_name",
  "provenance_community_rep_role",
  "provenance_community_rep_email",
  "provenance_speaker_count",
  "provenance_regions",
  "provenance_language_status",
  "provenance_existing_tools",
  "provenance_orthography_url",
  "provenance_community_involvement",
  "provenance_casing_notes",
  "provenance_additional_notes",
] as const;

const DEMOTED_PHASE_A = [
  ...DEMOTED_PHASE_A_IDENTITY,
  ...DEMOTED_PHASE_A_PROVENANCE,
] as const;

// Resolve the on-disk module dir (./a/) and the mirrored test dir relative to
// THIS file (packages/studio/src/survey/questions/noDeleteGuardrail.test.ts).
const thisDir = path.dirname(fileURLToPath(import.meta.url));
const moduleDir = path.join(thisDir, "a");
const testDir = path.resolve(thisDir, "../../../tests/survey/questions/a");

function modulePath(id: string): string {
  return path.join(moduleDir, `${id}.ts`);
}
function testPath(id: string): string {
  return path.join(testDir, `${id}.test.ts`);
}

describe("spec 022 — no-delete library guardrail (demoted Phase A)", () => {
  it("covers exactly 30 demoted Phase A modules (15 identity + 15 provenance_*)", () => {
    expect(DEMOTED_PHASE_A_IDENTITY.length).toBe(15);
    expect(DEMOTED_PHASE_A_PROVENANCE.length).toBe(15);
    expect(new Set(DEMOTED_PHASE_A).size).toBe(30);
  });

  it("FR-004/FR-005: every demoted id is REGISTERED (sub-registry key + merged registry, key == definition.id)", () => {
    for (const id of DEMOTED_PHASE_A) {
      expect(
        Object.prototype.hasOwnProperty.call(phaseARegistry, id),
        `demoted module "${id}" missing from phaseARegistry — silent unregistration`,
      ).toBe(true);
      expect(
        Object.prototype.hasOwnProperty.call(questionRegistry, id),
        `demoted module "${id}" missing from merged questionRegistry`,
      ).toBe(true);
      expect(phaseARegistry[id]?.definition.id, `registry key "${id}" vs definition.id`).toBe(id);
    }
  });

  it("FR-004/FR-005: every demoted id RESOLVES TO A MODULE ON DISK (survey/questions/a/<id>.ts)", () => {
    for (const id of DEMOTED_PHASE_A) {
      expect(
        existsSync(modulePath(id)),
        `demoted module file missing on disk: ${modulePath(id)}`,
      ).toBe(true);
    }
  });

  it("FR-004/FR-005: every demoted id REMAINS TEST-COVERED (mirrored tests/survey/questions/a/<id>.test.ts)", () => {
    for (const id of DEMOTED_PHASE_A) {
      expect(
        existsSync(testPath(id)),
        `demoted module test coverage missing: ${testPath(id)}`,
      ).toBe(true);
    }
  });

  // FR-011 / Amendment: the pb_* battery is NOT demoted — it stays live/reachable.
  // Guard that this guardrail does not accidentally claim a pb_* id as demoted.
  it("Amendment: no pb_* id is in the demoted (library) set", () => {
    for (const id of DEMOTED_PHASE_A) {
      expect(id.startsWith("pb_"), `pb_* id "${id}" must not be treated as library content`).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// RED-case demonstration (SC-003): the guardrail is a genuine detector.
//
// We model the registry/disk/coverage check as a pure predicate over INJECTED
// clones — deleting/unregistering one demoted id in the clone turns the predicate
// RED, while the real registry/filesystem (asserted above) stay GREEN. This is the
// executable form of "RED on deletion/unregistration, then restore → GREEN".
// ---------------------------------------------------------------------------

interface NoDeleteViolations {
  /** demoted ids that are not registered. */
  unregistered: string[];
  /** demoted ids whose module file is absent. */
  missingOnDisk: string[];
  /** demoted ids whose test coverage is absent. */
  uncovered: string[];
}

/** Pure check over supplied id sets — the single RED/GREEN decision point. */
function noDeleteViolations(
  ids: readonly string[],
  registeredIds: ReadonlySet<string>,
  onDiskIds: ReadonlySet<string>,
  coveredIds: ReadonlySet<string>,
): NoDeleteViolations {
  return {
    unregistered: ids.filter((id) => !registeredIds.has(id)).sort(),
    missingOnDisk: ids.filter((id) => !onDiskIds.has(id)).sort(),
    uncovered: ids.filter((id) => !coveredIds.has(id)).sort(),
  };
}

describe("spec 022 — no-delete guardrail: RED on deletion/unregistration, GREEN on restore", () => {
  // Real sets, computed from the live registry + filesystem.
  const registered = new Set(DEMOTED_PHASE_A.filter((id) => Object.prototype.hasOwnProperty.call(phaseARegistry, id)));
  const onDisk = new Set(DEMOTED_PHASE_A.filter((id) => existsSync(modulePath(id))));
  const covered = new Set(DEMOTED_PHASE_A.filter((id) => existsSync(testPath(id))));

  it("baseline: the REAL sets produce NO violations (GREEN)", () => {
    expect(noDeleteViolations(DEMOTED_PHASE_A, registered, onDisk, covered)).toEqual({
      unregistered: [],
      missingOnDisk: [],
      uncovered: [],
    });
  });

  it("SC-003: UNREGISTERING a demoted id turns the guardrail RED (then restore → GREEN)", () => {
    const VICTIM = "provenance_orthography_url";
    const injected = new Set(registered);
    injected.delete(VICTIM); // simulate removing its sub-registry entry
    const v = noDeleteViolations(DEMOTED_PHASE_A, injected, onDisk, covered);
    expect(v.unregistered).toEqual([VICTIM]);
    // Restore (real set untouched) → GREEN.
    expect(registered.has(VICTIM)).toBe(true);
    expect(noDeleteViolations(DEMOTED_PHASE_A, registered, onDisk, covered).unregistered).toEqual([]);
  });

  it("SC-003: DELETING a demoted module file turns the guardrail RED (then restore → GREEN)", () => {
    const VICTIM = "primary_script";
    const injected = new Set(onDisk);
    injected.delete(VICTIM); // simulate deleting survey/questions/a/primary_script.ts
    const v = noDeleteViolations(DEMOTED_PHASE_A, registered, injected, covered);
    expect(v.missingOnDisk).toEqual([VICTIM]);
    // Restore (real set untouched) → GREEN.
    expect(onDisk.has(VICTIM)).toBe(true);
    expect(noDeleteViolations(DEMOTED_PHASE_A, registered, onDisk, covered).missingOnDisk).toEqual([]);
  });

  it("SC-003: REMOVING a demoted module's test coverage turns the guardrail RED (then restore → GREEN)", () => {
    const VICTIM = "iso_code";
    const injected = new Set(covered);
    injected.delete(VICTIM);
    const v = noDeleteViolations(DEMOTED_PHASE_A, registered, onDisk, injected);
    expect(v.uncovered).toEqual([VICTIM]);
    expect(covered.has(VICTIM)).toBe(true);
    expect(noDeleteViolations(DEMOTED_PHASE_A, registered, onDisk, covered).uncovered).toEqual([]);
  });
});
