// Tests for the keyboard-wide fallback policy on the working copy (076 FR-019,
// per-carve override retired). Covers the store slot, the legacy-state
// migration (card + per-combo dispositions folded into one policy), draft
// persistence, and the carve decision value's legacy read.

import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { useWorkingCopyStore } from "./workingCopyStore.ts";
import { migrateFallbackPolicy } from "../survey/carve/fallbackPolicyMigration.ts";
import {
  snapshotWorkingCopyData,
  prepareWorkingCopySnapshot,
  type WorkingCopySnapshot,
} from "../lib/persistWorkingCopy.ts";
import { carveOverlayFromValue } from "../decisions/carveOverlay.ts";
import { carvedLayoutValueFromOverlay } from "../survey/carve/carveValue.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtureNames = ["prePrDraft.json", "v1-draft-18e63aa4.json"] as const;
const loadFixtureSnapshot = (name: (typeof fixtureNames)[number]): WorkingCopySnapshot =>
  (
    JSON.parse(readFileSync(path.join(here, "..", "lib", "__fixtures__", name), "utf8")) as {
      workingCopy: WorkingCopySnapshot;
    }
  ).workingCopy;

beforeEach(() => {
  useWorkingCopyStore.getState().reset();
});

const store = () => useWorkingCopyStore.getState();
const disp = (disposition: string, provenance = "bulk-default") => ({
  comboId: "x",
  disposition,
  provenance,
});

describe("fallbackPolicy store slot", () => {
  it("defaults to swallow, for every keyboard", () => {
    expect(store().fallbackPolicy).toBe("swallow");
  });

  it("setFallbackPolicy records each option", () => {
    store().setFallbackPolicy("pass-through");
    expect(store().fallbackPolicy).toBe("pass-through");
    store().setFallbackPolicy("swallow");
    expect(store().fallbackPolicy).toBe("swallow");
  });

  it("survives carving and un-carving (it is not carve metadata)", () => {
    store().setFallbackPolicy("pass-through");
    store().deleteNode("n1");
    store().restoreNode("n1");
    store().deleteItem("i1");
    store().restoreAll();
    expect(store().fallbackPolicy).toBe("pass-through");
  });

  it("reset() returns it to the default", () => {
    store().setFallbackPolicy("pass-through");
    store().reset();
    expect(store().fallbackPolicy).toBe("swallow");
  });

  it("no longer carries the per-combo store or the closed-keyboard card", () => {
    const keys = Object.keys(store());
    expect(keys).not.toContain("carveDispositions");
    expect(keys).not.toContain("closedKeyboardCard");
    expect(keys).not.toContain("prefillCarveDispositions");
  });
});

describe("migrateFallbackPolicy", () => {
  it("a current policy wins over legacy fields", () => {
    expect(migrateFallbackPolicy({ fallbackPolicy: "pass-through", closedKeyboardCard: "accepted" })).toBe(
      "pass-through",
    );
  });

  it("card accepted -> swallow; declined -> pass-through (card beats dispositions)", () => {
    expect(migrateFallbackPolicy({ closedKeyboardCard: "accepted", carveDispositions: [disp("allow-host")] })).toBe(
      "swallow",
    );
    expect(migrateFallbackPolicy({ closedKeyboardCard: "declined", carveDispositions: [disp("block")] })).toBe(
      "pass-through",
    );
  });

  it("no card: all non-deadkey allow-host -> pass-through; deadkey rows carry no signal", () => {
    expect(migrateFallbackPolicy({ carveDispositions: [disp("allow-host"), disp("allow-host")] })).toBe(
      "pass-through",
    );
    expect(
      migrateFallbackPolicy({
        dispositions: [disp("allow-host"), disp("block", "deadkey-requirement")],
      }),
    ).toBe("pass-through");
  });

  it("no card: any block among non-deadkey rows, or only deadkey rows -> swallow", () => {
    expect(migrateFallbackPolicy({ carveDispositions: [disp("allow-host"), disp("block")] })).toBe("swallow");
    expect(migrateFallbackPolicy({ carveDispositions: [disp("block", "deadkey-requirement")] })).toBe("swallow");
  });

  it("never throws on junk and falls back to swallow", () => {
    for (const junk of [null, undefined, 3, "x", [], { carveDispositions: "nope" }, { carveDispositions: [null, 7] }, { fallbackPolicy: "bogus" }]) {
      expect(migrateFallbackPolicy(junk as never)).toBe("swallow");
    }
  });
});

describe("draft persistence", () => {
  it("round-trips the policy through snapshot / prepare", () => {
    store().setFallbackPolicy("pass-through");
    const snap = snapshotWorkingCopyData();
    expect(snap.fallbackPolicy).toBe("pass-through");
    expect(snap).not.toHaveProperty("carveDispositions");
    expect(snap).not.toHaveProperty("closedKeyboardCard");
    expect(prepareWorkingCopySnapshot(snap).fallbackPolicy).toBe("pass-through");
  });

  for (const name of fixtureNames) {
    describe(`legacy fixture ${name}`, () => {
      it("loads without throwing and migrates the empty legacy fields to swallow", () => {
        const snap = loadFixtureSnapshot(name);
        expect(snap).toHaveProperty("carveDispositions");
        const prepared = prepareWorkingCopySnapshot(snap);
        expect(prepared.fallbackPolicy).toBe("swallow");
        expect(prepared).not.toHaveProperty("carveDispositions");
        expect(prepared).not.toHaveProperty("closedKeyboardCard");
      });

      it("migrates a declined card and an all-allow-host disposition list to pass-through", () => {
        const base = loadFixtureSnapshot(name);
        expect(prepareWorkingCopySnapshot({ ...base, closedKeyboardCard: "declined" }).fallbackPolicy).toBe(
          "pass-through",
        );
        expect(
          prepareWorkingCopySnapshot({ ...base, closedKeyboardCard: null, carveDispositions: [disp("allow-host")] })
            .fallbackPolicy,
        ).toBe("pass-through");
        expect(
          prepareWorkingCopySnapshot({ ...base, closedKeyboardCard: "accepted", carveDispositions: [disp("allow-host")] })
            .fallbackPolicy,
        ).toBe("swallow");
      });

      it("a loaded legacy draft is recorded once: re-snapshotting writes the policy, not the legacy fields", () => {
        const base = loadFixtureSnapshot(name);
        const prepared = prepareWorkingCopySnapshot({ ...base, closedKeyboardCard: "declined" });
        useWorkingCopyStore.setState(prepared);
        const resnap = snapshotWorkingCopyData();
        expect(resnap.fallbackPolicy).toBe("pass-through");
        expect(resnap).not.toHaveProperty("closedKeyboardCard");
      });
    });
  }
});

describe("carved-layout decision value", () => {
  it("new values carry only removals (no policy, dispositions or card)", () => {
    const value = carvedLayoutValueFromOverlay({
      deletedNodeIds: new Set(["n"]),
      deletedItemIds: new Set(),
      disabledFamilyIds: new Set(),
      carveChars: new Set(),
    });
    expect(Object.keys(value)).toEqual(["removals"]);
    expect(carveOverlayFromValue(value).legacyFallbackPolicy).toBeNull();
  });

  it("a legacy value (dispositions + card) reads cleanly and migrates", () => {
    const legacy = {
      removals: [{ kind: "node", id: "n", provenance: "asked" }],
      dispositions: [disp("allow-host")],
      closedKeyboardCard: null,
    };
    const slice = carveOverlayFromValue(legacy);
    expect([...slice.deletedNodeIds]).toEqual(["n"]);
    expect(slice.legacyFallbackPolicy).toBe("pass-through");
    expect(carveOverlayFromValue({ removals: [], closedKeyboardCard: "accepted" }).legacyFallbackPolicy).toBe(
      "swallow",
    );
  });
});
