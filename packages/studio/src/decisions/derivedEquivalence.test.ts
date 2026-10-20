// derivedEquivalence — spec 105 Phase 0 equivalence gate harness
// (spec.md FR-010). MUST PASS on current dev behaviour: it changes no
// behaviour, it gates the future in which the working copy is purely
// derived. Arms:
//   A. Member census — the registry's classification map names EXACTLY
//      the live WorkingCopyState members (decisionIRConsistency
//      pattern: absence = failure, never a default).
//   B. Registry integrity — ids unique, pending surfaces phased, every
//      claimed action/field real, every EDITOR-AUTHORED / UNCLASSIFIED
//      member claimed by a surface.
//   C. Replay equivalence (the proven arm) — rebuildWorkingCopyFromStores
//      installs IR + overlay channels deep-equal to a manual fold of
//      the same modules' apply() patches over the starting point.
//   D. Draft-load sufficiency (the WC-slice-absent arm, BYPASS FORM) —
//      see the arm's own header below for why this proves the v3
//      premise directly instead of going through loadDraft.
//   E. Self-test — a planted unregistered authored action is reported
//      uncovered by the same check arm B uses (galleryWriteAudit
//      planted-violation pattern).

import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { makeTestIR } from "@keyboard-studio/contracts/fixtures";
import type { KeyboardIR } from "@keyboard-studio/contracts";
import {
  DERIVED_SURFACES,
  WORKING_COPY_MEMBER_CLASSIFICATION,
  uncoveredAuthoredMembers,
  type DerivedSurfaceStatus,
  type WorkingCopyBackboneClass,
} from "./derivedSurfaceRegistry.ts";
import type { Decision, DecisionId, DecisionSet } from "./decisionTypes.ts";
import {
  decisionOrderFor,
  rebuildWorkingCopyFromStores,
  resetRebuildTrail,
} from "./rebuildWorkingCopy.ts";
import {
  emptyOverlay,
  foldPatch,
  providerFromModules,
  type ReplayState,
} from "./replayKeyboard.ts";
import { assertPatchChannelsAuthorized } from "../steps/applyAuthorization.ts";
import { questionRegistry } from "../survey/questions/registry.ts";
import type { QuestionModule } from "../survey/types.ts";
import {
  applyDecisionSnapshot,
  getDecisionSnapshot,
  useDecisionStore,
} from "../stores/decisionStore.ts";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { useSurveySessionStore } from "../stores/surveySessionStore.ts";

// serverDraftStore's fetch transport is mocked at the module boundary,
// exactly as src/lib/draftPersistence.test.ts mocks it, so saveDraft's
// module graph never touches the network in arm D.
vi.mock("../lib/serverDraftStore.ts", () => ({
  saveServerDraft: vi.fn(async () => true),
  saveServerDraftBeacon: vi.fn(),
  clearServerDraft: vi.fn(async () => true),
}));

import { draftKey, saveDraft } from "../lib/draftPersistence.ts";
import { instantiateMinimal } from "../test/draftSeeds.ts";

const SRC_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const ALLOWED_CLASSES: ReadonlySet<string> = new Set<WorkingCopyBackboneClass>([
  "STARTING-POINT",
  "DECISION-DERIVED",
  "OVERLAY-CHANNEL",
  "EDITOR-AUTHORED",
  "SURVEY-SLOT",
  "EPHEMERAL",
  "UNCLASSIFIED",
]);

const ALLOWED_STATUSES: ReadonlySet<string> = new Set<DerivedSurfaceStatus>([
  "equivalence-proven",
  "pending",
  "starting-point",
  "session-only",
  "dormant-no-live-writer",
]);

// ---------------------------------------------------------------------------
// Arm A helper: extract WorkingCopyState member names from the live
// interface (galleryWriteAudit idiom: fs scan resolved from this file).
// Members are the two-space-indented identifiers between
// `export interface WorkingCopyState {` and its closing `}` at column 0.
// ---------------------------------------------------------------------------

function extractWorkingCopyMembers(): string[] {
  const source = readFileSync(resolve(SRC_ROOT, "stores/workingCopyStore.ts"), "utf-8");
  const lines = source.split("\n");
  const start = lines.indexOf("export interface WorkingCopyState {");
  if (start < 0) throw new Error("WorkingCopyState interface not found in workingCopyStore.ts");
  const members: string[] = [];
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i]!;
    if (line === "}") break;
    const match = /^\s{2}([A-Za-z_][A-Za-z0-9_]*)\s*[:(]/.exec(line);
    if (match) members.push(match[1]!);
  }
  return members;
}

// ---------------------------------------------------------------------------
// Arms C/D shared seeding: the rebuildWorkingCopy.test.ts decision set —
// real registry providers, pure applies, context-light by construction
// (the identity/attribution/helpDocs applies compose their channels
// from ctx.decisions alone; author-name and authoring-track have no IR
// or overlay effect beyond ordering). No ir-writing decision is added:
// the proven arm's IR equality is the starting-point IR folded through
// these applies, which is exactly what the existing live-entry test
// asserts for this set.
// ---------------------------------------------------------------------------

const rec = (partial: Partial<Decision> & { id: DecisionId }): Decision =>
  ({ value: undefined, provenance: "asked", ...partial }) as Decision;

// The proven decision set, as one table: RECORDED_IDS is the canonical
// list of ids recordProvenDecisions() records, and RECORDED_VALUES carries
// each id's value — a single source of truth, so the recorded set can
// never drift from the list that names it.
const RECORDED_IDS = [
  "author-name",
  "authoring-track",
  "copyright-holder",
  "project-keyboard-id",
  "project-display-name",
  "help-welcome-paragraph",
] as const satisfies readonly DecisionId[];

const RECORDED_VALUES: Readonly<Record<(typeof RECORDED_IDS)[number], string>> = {
  "author-name": "Test Author",
  "authoring-track": "copy",
  "copyright-holder": "Test Author",
  "project-keyboard-id": "testish_new",
  "project-display-name": "Testish New",
  "help-welcome-paragraph": "Welcome to the keyboard.",
};

function recordProvenDecisions(): void {
  useDecisionStore.getState().recordAll(
    RECORDED_IDS.map((id) => rec({ id, value: RECORDED_VALUES[id], provenance: "asked" })),
  );
}

interface DerivedCapture {
  ir: KeyboardIR | null;
  identity: unknown;
  attribution: unknown;
  helpDocs: unknown;
  historyEntryState: unknown;
}

/** The derived WC state the gate compares: IR + the four overlay channels. */
function captureDerivedFromWorkingCopy(): DerivedCapture {
  const wc = useWorkingCopyStore.getState();
  return {
    ir: wc.ir,
    identity: wc.identity,
    attribution: wc.attribution,
    helpDocs: wc.helpDocs,
    historyEntryState: wc.historyEntryState,
  };
}

function captureFromReplayState(state: ReplayState): DerivedCapture {
  return {
    ir: state.ir,
    identity: state.overlay.identity ?? null,
    attribution: state.overlay.attribution ?? null,
    helpDocs: state.overlay.helpDocs ?? null,
    historyEntryState: state.overlay.historyEntryState ?? null,
  };
}

/**
 * The manual fold arm C compares against: fold each recorded decision's
 * apply patch, in decisionOrderFor order, through replayKeyboard's
 * foldPatch over providerFromModules(questionRegistry modules) — the
 * same checked primitives (A3 authorization, then fold) replay itself
 * composes. A module applies once, at its first provided id, with that
 * record's value (replayKeyboard's rule). The carve fold beside apply()
 * is not exercised here: no carved-layout decision is recorded.
 */
function manualFold(startingPointIR: KeyboardIR, decisions: DecisionSet): ReplayState {
  const modules = Object.values(questionRegistry) as QuestionModule[];
  const order = decisionOrderFor(modules);
  const providerFor = providerFromModules(modules);
  let state: ReplayState = { ir: startingPointIR, overlay: emptyOverlay() };
  const appliedModules = new Set<QuestionModule>();
  for (const id of order) {
    const record = decisions[id];
    if (record === undefined || record.inactive === true) continue;
    const mod = providerFor(id);
    if (mod === undefined || mod.apply === undefined || appliedModules.has(mod)) continue;
    let value: unknown;
    let hasRecord = false;
    for (const providedId of mod.provides ?? []) {
      const r = decisions[providedId];
      if (r !== undefined && r.inactive !== true) {
        value = r.value;
        hasRecord = true;
        break;
      }
    }
    if (!hasRecord) continue;
    appliedModules.add(mod);
    const writes = mod.writes ?? [];
    const patch = mod.apply(value as string | string[] | undefined, {
      ir: state.ir,
      writes,
      decisions,
      currentHistoryEntryState: state.overlay.historyEntryState ?? null,
    });
    if (assertPatchChannelsAuthorized(mod.definition.id, mod, patch)) {
      state = foldPatch(state, patch, writes);
    }
  }
  return state;
}

beforeEach(() => {
  useDecisionStore.getState().reset();
  useWorkingCopyStore.getState().reset();
  useSurveySessionStore.getState().reset();
  resetRebuildTrail();
  localStorage.clear();
});

// ---------------------------------------------------------------------------
// Arm A — member census
// ---------------------------------------------------------------------------

describe("A. member census", () => {
  it("the classification map names exactly the live WorkingCopyState members", () => {
    const extracted = extractWorkingCopyMembers();
    const classified = Object.keys(WORKING_COPY_MEMBER_CLASSIFICATION);
    const inStoreNotClassified = extracted.filter((m) => !(m in WORKING_COPY_MEMBER_CLASSIFICATION));
    const classifiedNotInStore = classified.filter((m) => !extracted.includes(m));
    expect(
      inStoreNotClassified,
      `WorkingCopyState members missing from WORKING_COPY_MEMBER_CLASSIFICATION ` +
        `(census extracted ${extracted.length} members): ${inStoreNotClassified.join(", ")}`,
    ).toEqual([]);
    expect(
      classifiedNotInStore,
      `WORKING_COPY_MEMBER_CLASSIFICATION names not in WorkingCopyState: ${classifiedNotInStore.join(", ")}`,
    ).toEqual([]);
    expect(new Set(extracted).size, "interface member names are unique").toBe(extracted.length);
  });

  it("every classification is a field/action of an allowed backbone class", () => {
    for (const [name, info] of Object.entries(WORKING_COPY_MEMBER_CLASSIFICATION)) {
      expect(["field", "action"], `${name} kind`).toContain(info.kind);
      expect(ALLOWED_CLASSES.has(info.class), `${name} class ${info.class}`).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Arm B — registry integrity
// ---------------------------------------------------------------------------

describe("B. registry integrity", () => {
  it("surface ids are unique and statuses are in the allowed set", () => {
    const ids = DERIVED_SURFACES.map((s) => s.id);
    expect(new Set(ids).size, `duplicate surface ids: ${ids.join(", ")}`).toBe(ids.length);
    for (const surface of DERIVED_SURFACES) {
      expect(ALLOWED_STATUSES.has(surface.status), `${surface.id} status ${surface.status}`).toBe(true);
      expect(surface.evidence.length, `${surface.id} carries evidence`).toBeGreaterThan(0);
    }
  });

  it("every pending surface names a phase in 1–9", () => {
    for (const surface of DERIVED_SURFACES) {
      if (surface.status !== "pending") continue;
      expect(
        surface.phase !== null && surface.phase >= 1 && surface.phase <= 9,
        `${surface.id} is pending but its phase is ${surface.phase}`,
      ).toBe(true);
    }
  });

  it("every storeAction a surface names is a real WorkingCopyState action", () => {
    const census = new Set(extractWorkingCopyMembers());
    const bad: string[] = [];
    for (const surface of DERIVED_SURFACES) {
      for (const action of surface.storeActions) {
        if (!census.has(action) || WORKING_COPY_MEMBER_CLASSIFICATION[action]?.kind !== "action") {
          bad.push(`${surface.id}: ${action}`);
        }
      }
    }
    expect(bad, `surface storeActions that are not WorkingCopyState actions: ${bad.join(", ")}`).toEqual([]);
  });

  it("every field a surface names is a real WorkingCopyState field", () => {
    const census = new Set(extractWorkingCopyMembers());
    const bad: string[] = [];
    for (const surface of DERIVED_SURFACES) {
      for (const field of surface.fields) {
        if (!census.has(field) || WORKING_COPY_MEMBER_CLASSIFICATION[field]?.kind !== "field") {
          bad.push(`${surface.id}: ${field}`);
        }
      }
    }
    expect(bad, `surface fields that are not WorkingCopyState fields: ${bad.join(", ")}`).toEqual([]);
  });

  it("every EDITOR-AUTHORED / UNCLASSIFIED member is claimed by a surface", () => {
    expect(uncoveredAuthoredMembers(WORKING_COPY_MEMBER_CLASSIFICATION, DERIVED_SURFACES)).toEqual([]);
  });

  it("recordPhase is covered (survey-residue surface)", () => {
    const claimed = DERIVED_SURFACES.flatMap((s) => s.storeActions);
    expect(claimed).toContain("recordPhase");
  });

  it("exactly one surface is equivalence-proven today: the survey replay arm", () => {
    const proven = DERIVED_SURFACES.filter((s) => s.status === "equivalence-proven").map((s) => s.id);
    expect(proven).toEqual(["survey-decision-replay"]);
  });
});

// ---------------------------------------------------------------------------
// Arm C — replay equivalence (the proven arm)
// ---------------------------------------------------------------------------

describe("C. replay equivalence", () => {
  it("rebuildWorkingCopyFromStores installs exactly the manual replay fold", () => {
    const ir = makeTestIR({
      header: { name: "base-name", keyboardId: "base_id", version: "1.0" },
    });
    useWorkingCopyStore.setState({ startIr: ir, ir });
    recordProvenDecisions();

    // Expected: the same modules' applies folded by hand over the
    // starting point, computed BEFORE the live rebuild touches the store.
    const expected = captureFromReplayState(manualFold(ir, getDecisionSnapshot()));

    const out = rebuildWorkingCopyFromStores(["copyright-holder"]);
    expect(out).not.toBeNull();

    const installed = captureDerivedFromWorkingCopy();
    expect(installed).toEqual(expected);
    // The channels this decision set is known to produce, pinned so the
    // deep-equal above cannot pass vacuously on two empty states.
    expect(installed.attribution).toMatchObject({ copyrightHolder: "Test Author" });
    expect(installed.identity).toMatchObject({ keyboardId: "testish_new" });
    expect(installed.helpDocs).toMatchObject({ description: "Welcome to the keyboard." });
    expect(installed.ir?.header.keyboardId).toBe("base_id");
  });
});

// ---------------------------------------------------------------------------
// Arm D — draft-load sufficiency (WC-slice-absent, bypass form)
//
// Why the bypass: today's applyEnvelopeToStores is not exported and
// loadDraft restores the working copy FROM its slice, so exercising
// loadDraft would prove only that the v2 restore path works — the
// thing spec 105 removes. Phase 0 therefore proves the v3 premise
// directly: save a real draft with the real saveDraft, take ONLY its
// starting-point id and its decisions slice back out of the stored
// envelope (the envelope's workingCopy property is deleted), re-supply
// the starting point by re-running instantiateMinimal with the same
// base id (the v3 premise: the starting point is re-fetched by id),
// restore the decisions via applyDecisionSnapshot (decisionStore's
// exported snapshot restore), rebuild, and require the derived working
// copy to deep-equal the pre-save rebuilt state.
// ---------------------------------------------------------------------------

describe("D. draft-load sufficiency without the working-copy slice", () => {
  it("decisions + starting-point id alone rebuild the saved project's derived state", () => {
    const baseId = "derived_gate_base";

    // First session: instantiate the starting point, record, rebuild.
    instantiateMinimal(baseId);
    recordProvenDecisions();
    expect(rebuildWorkingCopyFromStores(["copyright-holder"])).not.toBeNull();
    const first = captureDerivedFromWorkingCopy();
    expect(first.identity).toMatchObject({ keyboardId: "testish_new" });

    // Save with the real writer and read the stored envelope back.
    saveDraft(baseId);
    const raw = localStorage.getItem(draftKey(baseId));
    expect(raw).not.toBeNull();
    const envelope = JSON.parse(raw!) as {
      decisions?: DecisionSet;
      workingCopy?: unknown;
      [key: string]: unknown;
    };
    expect(envelope.workingCopy).toBeDefined();
    expect(envelope.decisions?.["copyright-holder"]?.value).toBe("Test Author");
    const decisionsFromEnvelope = envelope.decisions!;

    // The v3 move: the working-copy slice is GONE from what we carry on.
    delete envelope.workingCopy;
    expect("workingCopy" in envelope).toBe(false);

    // Cold reset — nothing left to inherit from.
    useWorkingCopyStore.getState().reset();
    useDecisionStore.getState().reset();
    useSurveySessionStore.getState().reset();
    resetRebuildTrail();
    expect(useWorkingCopyStore.getState().ir).toBeNull();

    // Re-supply ONLY (i) the starting point, re-fetched by id, and
    // (ii) the decision set from the envelope.
    instantiateMinimal(baseId);
    applyDecisionSnapshot(decisionsFromEnvelope);
    resetRebuildTrail();

    expect(rebuildWorkingCopyFromStores(["copyright-holder"])).not.toBeNull();
    const second = captureDerivedFromWorkingCopy();
    expect(second).toEqual(first);
  });
});

// ---------------------------------------------------------------------------
// Arm E — self-test (planted violation)
// ---------------------------------------------------------------------------

describe("E. self-test", () => {
  it("a planted unregistered authored action is reported uncovered", () => {
    const plantedMap = {
      ...WORKING_COPY_MEMBER_CLASSIFICATION,
      plantedDirectWrite: { kind: "action", class: "EDITOR-AUTHORED" } as const,
    };
    expect(uncoveredAuthoredMembers(plantedMap, DERIVED_SURFACES)).toEqual(["plantedDirectWrite"]);
  });

  it("a planted unclassified field with no setter claimed is reported uncovered", () => {
    const plantedMap = {
      ...WORKING_COPY_MEMBER_CLASSIFICATION,
      plantedOrphanSlice: { kind: "field", class: "UNCLASSIFIED" } as const,
    };
    expect(uncoveredAuthoredMembers(plantedMap, DERIVED_SURFACES)).toEqual(["plantedOrphanSlice"]);
  });

  it("the real registry leaves nothing uncovered (the self-test's control)", () => {
    expect(uncoveredAuthoredMembers(WORKING_COPY_MEMBER_CLASSIFICATION, DERIVED_SURFACES)).toEqual([]);
  });
});
