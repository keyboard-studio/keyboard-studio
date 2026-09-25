// Applying a recorded context-tolerance decision (spec 078 T030).
//
// - accept, end to end with the real engine: the verified overlay, replayed
//   onto a fresh parse, makes decomposed input behave like composed input;
// - the working-IR write goes through applyMutatePatch against
//   CONTEXT_TOLERANCE_WRITES, and a patch outside them throws;
// - a stale decision (fingerprint changed) applies nothing and reports it;
// - an accepted site with no matching rule is dropped and reported;
// - a non-committed gate result leaves everything unchanged;
// - re-running for the same decision does nothing (FR-008).

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook } from "@testing-library/react";
import { createVirtualFS, type KeyboardIR } from "@keyboard-studio/contracts";
import {
  applyContextToleranceOverlay,
  applyFacetTransform,
  compile,
  emitKmn,
  parseKmn,
  removeContextToleranceOverlay,
} from "@keyboard-studio/engine";

import { analyseContextTolerance } from "../lib/contextToleranceAnalysis.ts";
import { applyContextToleranceDecision, contextTolerancePatch } from "../lib/contextToleranceApply.ts";
import { loadContextToleranceEngine } from "../lib/contextToleranceEngine.ts";
import { CONTEXT_TOLERANCE_WRITES } from "../steps/contextToleranceWrites.ts";
import { applyMutatePatch, MutatePatchContainmentError } from "../steps/mutateApply.ts";
import { useWorkingCopyStore, type ContextToleranceState } from "../stores/workingCopyStore.ts";
import { useContextToleranceApply } from "./useContextToleranceApply.ts";

afterEach(cleanup);

// A mnemonic keyboard whose acute key only works on the joined à: the
// decomposed a + U+0300 falls through to the bare fallback.
const KMN = [
  "store(&NAME) 'Apply'",
  "store(&VERSION) '14.0'",
  "store(&TARGETS) 'any'",
  "store(&mnemoniclayout) '1'",
  "begin Unicode > use(main)",
  "group(main) using keys",
  "store(base) U+00E0",
  "store(acute) U+00E2",
  "store(key.act) ']'",
  "any(base) + any(key.act) > index(acute,1)",
  "+ ']' > U+00B4",
  "",
].join("\n");

type Ready = Extract<ContextToleranceState, { status: "ready" }>;

async function analyse(ir: KeyboardIR): Promise<Ready> {
  const result = await analyseContextTolerance(ir, () => true);
  if (result === null) throw new Error("analysis was superseded");
  return { status: "ready", runId: 1, ...result };
}

describe("applyContextToleranceDecision — real engine (spec 078)", () => {
  it("accept: the verified overlay, replayed onto a fresh parse, fixes decomposed input and keeps composed input", async () => {
    const ir = parseKmn(KMN, "apply_fixture").ir;
    const analysis = await analyse(ir);
    expect(analysis.fixableRuleIds.length).toBe(1);
    const siteKeys = analysis.fixableRuleIds.map((id) => analysis.siteKeys[id]!);

    const engine = await loadContextToleranceEngine();
    const outcome = await applyContextToleranceDecision(
      { acceptedSiteIds: siteKeys, fingerprint: analysis.fingerprint },
      analysis,
      { engine, applyFacetTransform },
    );
    expect(outcome.kind).toBe("applied");
    if (outcome.kind !== "applied") return;
    expect(outcome.staleSiteIds).toEqual([]);
    expect(outcome.overlay.batches.map((b) => b.siteKey)).toEqual(siteKeys);

    const fresh = parseKmn(emitKmn(ir), "apply_fixture").ir;
    const fixed = applyContextToleranceOverlay(fresh, outcome.overlay);
    expect(fixed.warnings).toEqual([]);
    const [before, after] = await Promise.all([
      compile(buildVfs(fresh), "apply_fixture"),
      compile(buildVfs(parseKmn(emitKmn(fixed.ir), "apply_fixture").ir), "apply_fixture"),
    ]);
    const key = [{ vkey: "K_RBRKT", modifiers: [] as never[] }];
    const joinedBefore = engine.simulate(before, key, { text: "à" }).finalOutput;
    const joinedAfter = engine.simulate(after, key, { text: "à" }).finalOutput;
    const separateAfter = engine.simulate(after, key, { text: "à" }).finalOutput;
    expect(joinedAfter).toBe(joinedBefore);
    expect(separateAfter.normalize("NFC")).toBe(joinedAfter.normalize("NFC"));

    // Re-analysing the fixed keyboard: same fingerprint, the site now fixed.
    const again = await analyseContextTolerance(parseKmn(emitKmn(fixed.ir), "apply_fixture").ir, () => true, {
      fingerprint: analysis.fingerprint,
      acceptedSiteIds: siteKeys,
      overlay: outcome.overlay,
    });
    expect(again?.fingerprint).toBe(analysis.fingerprint);
    expect(Object.values(again?.classification ?? {})).toContain("made-tolerant");
  }, 60_000);
});

/** The fixture declares &TARGETS 'any' itself, so its emitted text compiles to a .js as is. */
function buildVfs(ir: KeyboardIR) {
  const vfs = createVirtualFS();
  vfs.set(`source/${ir.header.keyboardId}.kmn`, emitKmn(ir), false);
  return vfs;
}

describe("applyContextToleranceDecision — decision handling", () => {
  const analysis = (): Ready => ({
    status: "ready",
    runId: 1,
    report: { findings: [], notAnalysedCount: 0 },
    findings: [],
    classification: {},
    proposal: { ir: parseKmn(KMN, "x").ir, variants: [], disclosures: {} },
    analysedIr: parseKmn(KMN, "x").ir,
    fixableRuleIds: ["r1", "r2"],
    siteKeys: { r1: "k1", r2: "k2" },
    fingerprint: "f1",
  });
  const engine = {
    createContextToleranceMigrationRule: vi.fn(() => ({}) as never),
    buildContextToleranceOverlay: vi.fn(() => ({ batches: [] })),
  };

  it("a changed fingerprint is stale: nothing applied, every accepted site reported", async () => {
    const gate = vi.fn();
    const outcome = await applyContextToleranceDecision({ acceptedSiteIds: ["k1"], fingerprint: "OLD" }, analysis(), {
      engine,
      applyFacetTransform: gate as never,
    });
    expect(outcome).toEqual({ kind: "stale", staleSiteIds: ["k1"] });
    expect(gate).not.toHaveBeenCalled();
  });

  it("an accepted site with no matching rule is dropped and reported; the rest applies", async () => {
    const gate = vi.fn(async () => ({ status: "committed", nextIr: parseKmn(KMN, "x").ir, producedSetChanged: false, ledger: [] }));
    const outcome = await applyContextToleranceDecision({ acceptedSiteIds: ["k1", "gone"], fingerprint: "f1" }, analysis(), {
      engine,
      applyFacetTransform: gate as never,
    });
    expect(outcome.kind).toBe("applied");
    expect(outcome.kind === "applied" && outcome.staleSiteIds).toEqual(["gone"]);
    const proposal = (gate.mock.calls[0] as unknown[])[1] as { affectedSites: { siteId: string; userDisposition: string }[] };
    expect(proposal.affectedSites).toEqual([
      expect.objectContaining({ siteId: "r1", userDisposition: "accepted" }),
      expect.objectContaining({ siteId: "r2", userDisposition: "declined" }),
    ]);
    expect(engine.buildContextToleranceOverlay).toHaveBeenCalledWith(expect.anything(), new Set(["r1"]), { r1: "k1", r2: "k2" });
  });

  it("a non-committed gate result is refused and builds no overlay", async () => {
    engine.buildContextToleranceOverlay.mockClear();
    const gate = vi.fn(async () => ({ status: "commit-failed", failure: { cause: "compile-regression", reason: "boom" } }));
    const outcome = await applyContextToleranceDecision({ acceptedSiteIds: ["k1"], fingerprint: "f1" }, analysis(), {
      engine,
      applyFacetTransform: gate as never,
    });
    expect(outcome).toEqual({ kind: "refused", reason: "boom" });
    expect(engine.buildContextToleranceOverlay).not.toHaveBeenCalled();
  });
});

describe("the working-IR write goes through the mutate seam", () => {
  const overlay = {
    batches: [
      {
        siteKey: "k1",
        groupName: "main",
        beforeRuleText: null,
        comment: "Accept the accent typed as a separate character (decomposed text) as well as the joined form.",
        rules: [{ nodeId: "decomposed_accent_x_0", context: [{ kind: "char" as const, value: "x" }], output: [{ kind: "char" as const, value: "y" }] }],
      },
    ],
  };
  const ops = { applyContextToleranceOverlay, removeContextToleranceOverlay };

  it("the patch stays inside CONTEXT_TOLERANCE_WRITES and applies", () => {
    const ir = parseKmn(KMN, "seam").ir;
    const patch = contextTolerancePatch(ir, null, overlay, ops);
    const next = applyMutatePatch(ir, patch, CONTEXT_TOLERANCE_WRITES);
    expect(next.groups[0]!.rules.at(-1)!.nodeId).toBe("decomposed_accent_x_0");
    // Removing it again restores the original rules.
    const back = applyMutatePatch(next, contextTolerancePatch(next, overlay, null, ops), CONTEXT_TOLERANCE_WRITES);
    expect(back.groups[0]!.rules.map((r) => r.nodeId)).toEqual(ir.groups[0]!.rules.map((r) => r.nodeId));
  });

  it("a patch outside the declared writes throws", () => {
    const ir = parseKmn(KMN, "seam").ir;
    const patch = contextTolerancePatch(ir, null, overlay, ops);
    expect(() => applyMutatePatch(ir, { ...patch, header: { ...ir.header, name: "x" } }, CONTEXT_TOLERANCE_WRITES)).toThrow(
      MutatePatchContainmentError,
    );
  });
});

describe("useContextToleranceApply — idempotence (FR-008)", () => {
  it("does nothing when the applied overlay already matches the decision", () => {
    const store = useWorkingCopyStore.getState();
    store.reset();
    store.recordPhase({
      phase: "C",
      answers: [],
      marksContextTolerance: { decision: "accept", acceptedSiteIds: ["k1"], proposedSiteIds: ["k1"], fingerprint: "f1" },
    });
    store.setContextToleranceOverlay({ fingerprint: "f1", acceptedSiteIds: ["k1"], overlay: { batches: [] } });
    const before = useWorkingCopyStore.getState().contextToleranceOverlay;

    const { result } = renderHook(() => useContextToleranceApply(true));
    expect(result.current).toBeNull();
    expect(useWorkingCopyStore.getState().contextToleranceOverlay).toBe(before);
  });

  it("a decline removes an applied fix", () => {
    const store = useWorkingCopyStore.getState();
    store.reset();
    store.recordPhase({
      phase: "C",
      answers: [],
      marksContextTolerance: { decision: "decline", acceptedSiteIds: [], proposedSiteIds: ["k1"], fingerprint: "f1" },
    });
    store.setContextToleranceOverlay({ fingerprint: "f1", acceptedSiteIds: ["k1"], overlay: { batches: [] } });
    renderHook(() => useContextToleranceApply(true));
    expect(useWorkingCopyStore.getState().contextToleranceOverlay).toBeNull();
  });

  it("with the flag off it touches nothing", () => {
    const store = useWorkingCopyStore.getState();
    store.reset();
    store.recordPhase({
      phase: "C",
      answers: [],
      marksContextTolerance: { decision: "decline", acceptedSiteIds: [], proposedSiteIds: ["k1"], fingerprint: "f1" },
    });
    store.setContextToleranceOverlay({ fingerprint: "f1", acceptedSiteIds: ["k1"], overlay: { batches: [] } });
    renderHook(() => useContextToleranceApply(false));
    expect(useWorkingCopyStore.getState().contextToleranceOverlay).not.toBeNull();
  });
});
