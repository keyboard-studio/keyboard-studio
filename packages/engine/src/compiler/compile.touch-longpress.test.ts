/**
 * Regression test: compile a touch layout that contains longpress sub-keys
 * using the correct U_<HEX> key-id form produced by applyTouchAssignments
 * and scaffoldTouchLayout after the Phase E bug fix.
 *
 * The failure mode being guarded: sub-keys with K_*-prefixed ids (e.g.
 * "K_A_sk_e4") are treated by kmc-kmn as virtual-key references with no
 * backing rule, causing compile to return zero artifacts ("no usable artifacts
 * produced"). Sub-keys that output literal characters must use the
 * U_<UPPERHEX> id form so kmc-kmn derives the output from the id itself.
 *
 * Pattern audit: the same `${vkey}_sk_${hex}` generation existed in both
 * applyTouchAssignments.ts AND scaffoldTouchLayout.ts (two sites). Both are
 * covered by the id-shape assertion at the bottom of this file.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { compile } from "./index.js";
import { buildMinimalPhoneTouchLayout } from "../scaffolder/scaffoldTouchLayout.js";
import { applyTouchAssignments } from "../pattern-apply/applyTouchAssignments.js";
import { emitTouchLayout } from "../codec/index.js";
import type { TouchAssignment } from "@keyboard-studio/contracts";

const here = dirname(fileURLToPath(import.meta.url));
const kmnPath = resolve(here, "__fixtures__", "longpress_touch.kmn");
const kmnSource = readFileSync(kmnPath, "utf8");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build the touch layout JSON with a longpress sub-key applied. */
function buildLongpressLayout(): string {
  const base = buildMinimalPhoneTouchLayout();

  const assignment: TouchAssignment = {
    scope: "individual",
    target: "ä",
    modality: "touch",
    mechanisms: [
      {
        patternId: "longpress_alternates",
        slotValues: { hostKey: "K_A", char: "ä" },
      },
    ],
  };

  const { layout } = applyTouchAssignments(base, [assignment]);
  return emitTouchLayout(layout);
}

/** Extract all sk/multitap/flick sub-key ids from an emitted touch layout JSON. */
function collectSubkeyIds(layoutJson: string): string[] {
  const ids: string[] = [];
  function walk(val: unknown): void {
    if (Array.isArray(val)) {
      for (const item of val) walk(item);
    } else if (val !== null && typeof val === "object") {
      const obj = val as Record<string, unknown>;
      if (typeof obj["id"] === "string") {
        // Include only sub-key entries (not top-level keys) — but we collect
        // ALL ids here and filter below.
        ids.push(obj["id"]);
      }
      for (const v of Object.values(obj)) walk(v);
    }
  }
  walk(JSON.parse(layoutJson) as unknown);
  return ids;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("compile() — touch layout with longpress sub-keys (Phase E regression)", () => {
  it("produces a non-empty .kmx artifact when the layout has a U_-id longpress sk", async () => {
    const touchLayoutJson = buildLongpressLayout();

    const vfs = createVirtualFS([
      {
        path: "source/longpress_touch.kmn",
        content: kmnSource,
        isBinary: false,
      },
      {
        path: "source/longpress_touch.keyman-touch-layout",
        content: touchLayoutJson,
        isBinary: false,
      },
    ]);

    const result = await compile(vfs, "longpress_touch");

    const kmx = result.artifacts.find((a) => a.filename.endsWith(".kmx"));
    expect(
      kmx,
      "compile() must produce a .kmx artifact — zero artifacts means the sub-key id is invalid"
    ).toBeDefined();
    expect(kmx?.sizeBytes ?? 0).toBeGreaterThan(0);
  }, 30_000);

  it("emits no fatal or error diagnostics for a longpress layout", async () => {
    const touchLayoutJson = buildLongpressLayout();

    const vfs = createVirtualFS([
      {
        path: "source/longpress_touch.kmn",
        content: kmnSource,
        isBinary: false,
      },
      {
        path: "source/longpress_touch.keyman-touch-layout",
        content: touchLayoutJson,
        isBinary: false,
      },
    ]);

    const result = await compile(vfs, "longpress_touch");

    const blocking = result.diagnostics.filter(
      (d) => d.severity === "error" || d.severity === "fatal"
    );
    expect(blocking).toEqual([]);
  }, 30_000);

  it("applyTouchAssignments emits sk ids matching U_<HEX> (not K_*-prefixed)", () => {
    // This is the specific shape check: every sk/multitap/flick sub-key id
    // must start with U_ (or K_ for actual vkeys, or T_ for custom) — but
    // a compound id like "K_A_sk_e4" is invalid and must not appear.
    const touchLayoutJson = buildLongpressLayout();
    const allIds = collectSubkeyIds(touchLayoutJson);

    // The longpress sub-key for "ä" (U+00E4) must be "U_00E4".
    const aeSk = allIds.find((id) => id.toUpperCase() === "U_00E4");
    expect(
      aeSk,
      `sk id for ä (U+00E4) must be "U_00E4"; found ids: ${JSON.stringify(allIds)}`
    ).toBe("U_00E4");

    // No compound K_*_sk_* ids anywhere.
    const badIds = allIds.filter((id) => /^K_.*_sk_/i.test(id));
    expect(
      badIds,
      `K_*_sk_* compound ids must not appear in emitted layout: ${JSON.stringify(badIds)}`
    ).toHaveLength(0);
  });
});
