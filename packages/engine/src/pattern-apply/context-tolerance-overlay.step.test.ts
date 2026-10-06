// The normalization-step batch of the context-tolerance overlay (spec 086):
// replay appends the group and redirects the entry, removal restores the
// original entry, and replaying onto a projection that already holds the step
// never stacks a second one.

import { describe, expect, it } from "vitest";

import { emit } from "../codec/emit.js";
import { parse } from "../codec/parse.js";
import { ALTERNATES_KMN, parseFixture } from "./__fixtures__/normalization.js";
import {
  applyContextToleranceOverlay,
  buildNormalizationStepOverlay,
  isNormalizationStepBatch,
  presentContextToleranceSites,
  removeContextToleranceOverlay,
  NORMALIZATION_STEP_SITE_ID,
} from "./context-tolerance-overlay.js";
import { NORMALIZATION_GROUP, NORMALIZATION_STORE_PREFIX } from "./normalization-step/constants.js";
import { proposeNormalizationStep } from "./normalization-step/index.js";

async function overlayFor() {
  const ir = parseFixture(ALTERNATES_KMN);
  const result = await proposeNormalizationStep(ir);
  if (result.kind !== "step") throw new Error(`expected a step, got ${result.reason}`);
  return { ir, overlay: buildNormalizationStepOverlay(result.step), step: result.step };
}

describe("overlay batch kind normalization-step (spec 086)", () => {
  it("records the step as one batch carrying the displaced entry", async () => {
    const { overlay, step } = await overlayFor();
    expect(overlay.batches).toHaveLength(1);
    const batch = overlay.batches[0]!;
    expect(isNormalizationStepBatch(batch)).toBe(true);
    if (!isNormalizationStepBatch(batch)) return;
    expect(batch.groupName).toBe(NORMALIZATION_GROUP);
    expect(batch.originalEntry).toBe(step.originalEntry);
    expect(batch.siteKey).toBe(NORMALIZATION_STEP_SITE_ID);
  });

  it("replay appends the group and sets entryPoints.main; JSON round trip keeps it", async () => {
    const { ir, overlay } = await overlayFor();
    const revived = JSON.parse(JSON.stringify(overlay)) as typeof overlay;
    const { ir: out, warnings } = applyContextToleranceOverlay(ir, revived);
    expect(warnings).toEqual([]);
    expect(out.groups.at(-1)?.name).toBe(NORMALIZATION_GROUP);
    expect(out.groups.at(-1)?.usingKeys).toBe(false);
    expect(out.header.entryPoints?.main).toBe(NORMALIZATION_GROUP);
    expect(emit(out)).toContain(`begin Unicode > use(${NORMALIZATION_GROUP})`);
    expect(presentContextToleranceSites(out, revived)).toEqual([NORMALIZATION_STEP_SITE_ID]);
    expect(presentContextToleranceSites(ir, revived)).toEqual([]);
  });

  it("removal restores the original entry and deletes the group and its stores", async () => {
    const { ir, overlay } = await overlayFor();
    const applied = applyContextToleranceOverlay(ir, overlay).ir;
    const removed = removeContextToleranceOverlay(applied, overlay);
    expect(removed.header.entryPoints?.main).toBe(ir.header.entryPoints?.main ?? "main");
    expect(removed.groups.some((g) => g.name === NORMALIZATION_GROUP)).toBe(false);
    expect(removed.stores.some((s) => s.name.startsWith(NORMALIZATION_STORE_PREFIX))).toBe(false);
    expect(emit(removed)).toBe(emit(ir));
  });

  it("replay on a projection that already holds the step does not stack", async () => {
    const { ir, overlay } = await overlayFor();
    const once = applyContextToleranceOverlay(ir, overlay).ir;
    const twice = applyContextToleranceOverlay(once, overlay).ir;
    expect(twice.groups.filter((g) => g.name === NORMALIZATION_GROUP)).toHaveLength(1);
    expect(emit(twice)).toBe(emit(once));
  });

  it("removal restores the entry on a projection read back from emitted text", async () => {
    const { ir, overlay } = await overlayFor();
    const reparsed = parse(emit(applyContextToleranceOverlay(ir, overlay).ir), "step_fixture").ir;
    const removed = removeContextToleranceOverlay(reparsed, overlay);
    expect(removed.groups.some((g) => g.name === NORMALIZATION_GROUP)).toBe(false);
    expect(removed.header.entryPoints?.main).toBe(ir.header.entryPoints?.main ?? "main");
  });
});
