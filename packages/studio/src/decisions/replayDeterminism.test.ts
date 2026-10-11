// SC-002 determinism property test (spec 093 T020, FR-003): over random
// decision-edit sequences, the incremental rebuild (resume from the
// checkpoint before the first changed decision, fold only the tail)
// equals the full replay from the starting point — byte for byte, over
// a canonical serialization of the rebuilt state (IR + overlay
// accumulator, I-1). The module set includes an apply that reads the
// folded history-entry state, so a resume that lost the overlay
// accumulator would diverge observably.

import { describe, it, expect } from "vitest";
import { makeTestIR } from "@keyboard-studio/contracts/fixtures";
import type { KeyboardIR } from "@keyboard-studio/contracts";
import type { QuestionModule } from "../survey/types.ts";
import type { Decision, DecisionId, DecisionSet } from "./decisionTypes.ts";
import { providerFromModules, replayKeyboard } from "./replayKeyboard.ts";
import {
  replayFromCheckpoint,
  seedTrail,
  type CheckpointTrail,
} from "./replayCheckpoints.ts";

const mod = (partial: Partial<QuestionModule> & { id: string }): QuestionModule => ({
  definition: { id: partial.id, type: "text", prompt: partial.id },
  fixtures: { valid: [], invalid: [] },
  ...partial,
} as QuestionModule);

const rec = (partial: Partial<Decision> & { id: DecisionId }): Decision =>
  ({ value: undefined, provenance: "asked", ...partial }) as Decision;

function baseIR(): KeyboardIR {
  return makeTestIR({
    header: { name: "base-name", keyboardId: "base_id", version: "1.0" },
  });
}

const nameModule = mod({
  id: "q_name",
  provides: ["language-name"],
  writes: [["header"]],
  apply: (value) => ({ ir: { header: { name: `name:${String(value ?? "")}` } } }),
});
const kbIdModule = mod({
  id: "q_kbid",
  provides: ["project-keyboard-id"],
  requires: ["language-name"],
  writes: [["header"]],
  apply: (value) => ({
    identity: { keyboardId: String(value ?? ""), displayName: `dn:${String(value ?? "")}` },
    ir: { header: { keyboardId: String(value ?? "") } },
  }),
});
const holderModule = mod({
  id: "q_holder",
  provides: ["copyright-holder"],
  requires: ["project-keyboard-id"],
  apply: (value) => ({
    attribution: { authorName: "An Author", copyrightHolder: String(value ?? "") },
  }),
});
const welcomeModule = mod({
  id: "q_welcome",
  provides: ["help-welcome-paragraph"],
  requires: ["copyright-holder"],
  apply: (value, ctx) => ({
    helpDocs: { description: String(value ?? ""), usageTips: [] },
    historyEntryState: {
      status: "proposed",
      proposal: {
        bullets: [`prev:${ctx.currentHistoryEntryState === null ? "none" : "set"}`],
      },
      editedBullets: null,
    } as never,
  }),
});
// Reads the folded overlay — the resume-faithfulness tripwire.
const historyModule = mod({
  id: "q_history",
  provides: ["help-history-entry"],
  requires: ["help-welcome-paragraph"],
  writes: [["header"]],
  apply: (value, ctx) => ({
    ir: {
      header: {
        name:
          ctx.currentHistoryEntryState === null
            ? `hist:none:${String(value ?? "")}`
            : `hist:set:${String(value ?? "")}`,
      },
    },
  }),
});
const plainModule = mod({
  id: "q_plain",
  provides: ["plain-note"],
  requires: ["language-name"],
  // No apply: recorded, never folded.
});

const MODULES = [nameModule, kbIdModule, holderModule, welcomeModule, historyModule, plainModule];
const ORDER: DecisionId[] = [
  "language-name",
  "project-keyboard-id",
  "copyright-holder",
  "help-welcome-paragraph",
  "help-history-entry",
  "plain-note",
];
const provider = providerFromModules(MODULES);

/** Canonical serialization: recursively key-sorted JSON — the byte form
 *  two independently folded states must share to be "byte-identical". */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "undefined";
}

/** mulberry32 — a tiny seeded PRNG so a failing sequence reproduces. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const VALUE_POOL = ["alpha", "beta", "gamma", "delta", "epsilon", "zeta"];

function randomDecisions(rand: () => number): DecisionSet {
  const decisions: DecisionSet = {};
  for (const id of ORDER) {
    if (rand() < 0.2) continue; // absent record
    decisions[id] = rec({
      id,
      value: VALUE_POOL[Math.floor(rand() * VALUE_POOL.length)],
      provenance: "asked",
      ...(rand() < 0.15 ? { inactive: true } : {}),
    });
  }
  return decisions;
}

type Edit =
  | { kind: "set"; id: DecisionId; value: string }
  | { kind: "remove"; id: DecisionId }
  | { kind: "toggleInactive"; id: DecisionId };

function randomEdit(rand: () => number, decisions: DecisionSet): Edit {
  const id = ORDER[Math.floor(rand() * ORDER.length)]!;
  const roll = rand();
  if (roll < 0.55) {
    return { kind: "set", id, value: VALUE_POOL[Math.floor(rand() * VALUE_POOL.length)]! };
  }
  if (roll < 0.75 && decisions[id] !== undefined) return { kind: "remove", id };
  if (decisions[id] !== undefined) return { kind: "toggleInactive", id };
  return { kind: "set", id, value: VALUE_POOL[Math.floor(rand() * VALUE_POOL.length)]! };
}

function applyEdit(decisions: DecisionSet, edit: Edit): DecisionSet {
  const next: Record<string, Decision<unknown>> = { ...decisions };
  switch (edit.kind) {
    case "set":
      next[edit.id] = rec({ id: edit.id, value: edit.value, provenance: "asked" });
      break;
    case "remove":
      delete next[edit.id];
      break;
    case "toggleInactive": {
      const current = next[edit.id]!;
      const { inactive: _was, ...rest } = current;
      next[edit.id] =
        current.inactive === true
          ? (rest as Decision)
          : { ...current, inactive: true };
      break;
    }
  }
  return next as DecisionSet;
}

describe("SC-002 — incremental rebuild === full replay, byte for byte (T020)", () => {
  it("holds over random edit sequences (12 seeds × 25 edits)", () => {
    for (let seed = 1; seed <= 12; seed++) {
      const rand = rng(seed * 7919);
      const start = baseIR();
      let decisions = randomDecisions(rand);
      let trail: CheckpointTrail = seedTrail(start);

      // Establish the trail with a full fold of the initial set.
      const initial = replayFromCheckpoint(provider, trail, {
        decisions,
        order: ORDER,
        changed: new Set(ORDER),
        startingPointIR: start,
      });
      trail = initial.trail;

      for (let step = 0; step < 25; step++) {
        const edit = randomEdit(rand, decisions);
        decisions = applyEdit(decisions, edit);

        const incremental = replayFromCheckpoint(provider, trail, {
          decisions,
          order: ORDER,
          changed: new Set([edit.id]),
          startingPointIR: start,
        });
        const full = replayKeyboard(provider, {
          decisions,
          order: ORDER,
          startingPointIR: start,
        });

        const where = `seed ${seed} step ${step} edit ${JSON.stringify(edit)}`;
        expect(canonical(incremental.outcome.state), where).toBe(canonical(full.state));
        // The spliced trail must be the full trail, checkpoint by checkpoint.
        expect(incremental.trail.length, where).toBe(full.checkpoints.length);
        for (let k = 0; k < full.checkpoints.length; k++) {
          expect(canonical(incremental.trail[k]), where).toBe(
            canonical(full.checkpoints[k]),
          );
        }
        trail = incremental.trail;
      }
    }
  });

  it("a stale trail (wrong length) falls back to a full replay, still equal", () => {
    const start = baseIR();
    const decisions = randomDecisions(rng(42));
    const out = replayFromCheckpoint(provider, seedTrail(start), {
      decisions,
      order: ORDER,
      changed: new Set(["copyright-holder"]),
      startingPointIR: start,
    });
    const full = replayKeyboard(provider, {
      decisions,
      order: ORDER,
      startingPointIR: start,
    });
    expect(canonical(out.outcome.state)).toBe(canonical(full.state));
    expect(out.trail).toHaveLength(ORDER.length + 1);
  });
});
