// Tests for in-memory per-decision checkpoints (spec 093 T005, FR-003):
// the trail layout (index 0 = starting point + empty overlay), the resume
// point for an edit, and incremental replay splicing a fresh tail onto the
// retained prefix.

import { describe, it, expect } from "vitest";
import { makeTestIR } from "@keyboard-studio/contracts/fixtures";
import type { KeyboardIR } from "@keyboard-studio/contracts";
import type { QuestionModule } from "../survey/types.ts";
import type { Decision, DecisionId, DecisionSet } from "./decisionTypes.ts";
import { providerFromModules, replayKeyboard } from "./replayKeyboard.ts";
import {
  checkpointBefore,
  replayFromCheckpoint,
  resumePointFor,
  seedTrail,
} from "./replayCheckpoints.ts";

const mod = (partial: Partial<QuestionModule> & { id: string }): QuestionModule => ({
  definition: { id: partial.id, type: "text", prompt: partial.id },
  fixtures: { valid: [], invalid: [] },
  ...partial,
} as QuestionModule);

const headerModule = (id: string, decision: DecisionId, field: string) =>
  mod({
    id,
    provides: [decision],
    writes: [["header"]],
    apply: (value) => ({ ir: { header: { [field]: String(value ?? "") } } }),
  });

const MODULES = [
  headerModule("q_a", "language-name", "name"),
  headerModule("q_b", "language-code", "bcp47"),
  headerModule("q_c", "target-script", "script"),
];
const ORDER: DecisionId[] = ["language-name", "language-code", "target-script"];

const rec = (id: DecisionId, value: unknown): Decision =>
  ({ id, value, provenance: "asked" }) as Decision;

const start = (): KeyboardIR =>
  makeTestIR({ header: { name: "base", keyboardId: "base_id", version: "1.0" } });

const canonical = (v: unknown): string => JSON.stringify(v);

describe("replayCheckpoints (T005)", () => {
  it("seedTrail holds only index 0: the starting point + empty overlay", () => {
    const ir = start();
    const trail = seedTrail(ir);
    expect(trail).toHaveLength(1);
    expect(trail[0]).toMatchObject({ orderIndex: 0, decisionId: null });
    expect(trail[0]!.ir).toBe(ir);
    expect(trail[0]!.overlay).toEqual({});
  });

  it("checkpointBefore returns the state before the edited decision", () => {
    const provider = providerFromModules(MODULES);
    const decisions: DecisionSet = {
      "language-name": rec("language-name", "Lang"),
      "language-code": rec("language-code", "lg"),
      "target-script": rec("target-script", "Latn"),
    };
    const { checkpoints } = replayKeyboard(provider, {
      decisions,
      order: ORDER,
      startingPointIR: start(),
    });
    // Before "language-code" (position 1): only language-name has applied.
    const before = checkpointBefore(checkpoints, ORDER, "language-code");
    expect(before?.orderIndex).toBe(1);
    expect(before?.ir.header.name).toBe("Lang");
    expect(before?.ir.header.bcp47).toEqual([]); // the fixture default — "lg" not yet applied
    // Before the first decision: the starting point itself.
    expect(checkpointBefore(checkpoints, ORDER, "language-name")?.orderIndex).toBe(0);
    // Unknown id: no checkpoint (caller falls back to full replay).
    expect(checkpointBefore(checkpoints, ORDER, "author-name")).toBeUndefined();
  });

  it("resumePointFor picks the earliest changed decision", () => {
    const provider = providerFromModules(MODULES);
    const decisions: DecisionSet = {
      "language-name": rec("language-name", "Lang"),
      "language-code": rec("language-code", "lg"),
      "target-script": rec("target-script", "Latn"),
    };
    const { checkpoints } = replayKeyboard(provider, {
      decisions,
      order: ORDER,
      startingPointIR: start(),
    });
    const point = resumePointFor(
      checkpoints,
      ORDER,
      new Set<DecisionId>(["target-script", "language-code"]),
    );
    expect(point?.index).toBe(1);
    expect(point?.checkpoint.orderIndex).toBe(1);
  });

  it("incremental replay from a checkpoint reproduces the full replay exactly", () => {
    const provider = providerFromModules(MODULES);
    const before: DecisionSet = {
      "language-name": rec("language-name", "Lang"),
      "language-code": rec("language-code", "lg"),
      "target-script": rec("target-script", "Latn"),
    };
    const first = replayKeyboard(provider, {
      decisions: before,
      order: ORDER,
      startingPointIR: start(),
    });
    // Edit the middle decision and replay incrementally.
    const after: DecisionSet = {
      ...before,
      "language-code": rec("language-code", "lg2"),
    };
    const { outcome, trail } = replayFromCheckpoint(provider, first.checkpoints, {
      decisions: after,
      order: ORDER,
      changed: new Set<DecisionId>(["language-code"]),
      startingPointIR: start(),
    });
    const full = replayKeyboard(provider, {
      decisions: after,
      order: ORDER,
      startingPointIR: start(),
    });
    expect(canonical(outcome.state.ir)).toBe(canonical(full.state.ir));
    expect(canonical(outcome.state.overlay)).toBe(canonical(full.state.overlay));
    // The trail retains the untouched prefix and covers the order; the
    // resumed checkpoint wraps the same retained IR reference.
    expect(trail).toHaveLength(ORDER.length + 1);
    expect(trail[0]).toBe(first.checkpoints[0]);
    expect(trail[1]!.ir).toBe(first.checkpoints[1]!.ir);
    expect(canonical(trail[3]!.ir)).toBe(canonical(full.state.ir));
  });

  it("falls back to a full replay when the trail does not cover the order", () => {
    const provider = providerFromModules(MODULES);
    const decisions: DecisionSet = {
      "language-name": rec("language-name", "Lang"),
    };
    const { outcome, trail } = replayFromCheckpoint(provider, seedTrail(start()), {
      decisions,
      order: ORDER,
      changed: new Set<DecisionId>(["language-name"]),
      startingPointIR: start(),
    });
    expect(outcome.state.ir.header.name).toBe("Lang");
    expect(trail).toHaveLength(ORDER.length + 1);
  });
});
