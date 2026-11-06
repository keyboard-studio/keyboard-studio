// The fallback-policy decision replays into the same keyboard the walk downloaded
// (issue #2366). Reads the sibling ../keyboards corpus, so it runs under
// vitest.corpus.config.ts.

import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_FALLBACK_POLICY } from "@keyboard-studio/contracts";
import { parseKmn } from "@keyboard-studio/engine";
import type { DecisionSet } from "../decisions/decisionTypes.ts";
import type { CarvedLayoutValue } from "../survey/carve/carveValue.ts";
import { buildOutputBundle } from "../lib/buildOutputBundle.ts";
import { readVfsText } from "../lib/vfsText.ts";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { buildDecisionPointFixture } from "./decisionPointFixture.ts";
import { DECISION_POINT_BASES, DECISION_POINT_FIXTURE_DIR, fixtureRelPath } from "./decisionPointBases.ts";
import { announceSc004Skip, loadVfs, sc004GatesEnabled } from "./sc004Harness.ts";

announceSc004Skip("fallback-policy replay", (name) => it.skip(name, () => {}));

const here = dirname(fileURLToPath(import.meta.url));
const base = DECISION_POINT_BASES.find((b) => b.profile === "p4-unwrap-bafut-camqwerty")!;
const recorded = JSON.parse(
  readFileSync(resolve(here, "..", "..", DECISION_POINT_FIXTURE_DIR, fixtureRelPath(base, "assignments")), "utf-8"),
) as DecisionSet;

/**
 * The policy only shapes a keyboard that carves something, so the replayed walk
 * carves its first five rules.
 */
function withCarve(set: DecisionSet): DecisionSet {
  const ir = parseKmn(
    readVfsText(loadVfs({ id: base.base, group: base.group }), `source/${base.base}.kmn`)!,
    base.base,
  ).ir;
  const nodeIds = ir.groups.flatMap((g) => g.rules).slice(0, 5).map((r) => r.nodeId);
  const value: CarvedLayoutValue = {
    removals: nodeIds.map((id) => ({ kind: "node" as const, id, provenance: "asked" as const })),
  };
  return { ...set, "carved-layout": { ...set["carved-layout"]!, value } };
}

const committed = sc004GatesEnabled ? withCarve(recorded) : recorded;

const kmnOf = (vfs: Parameters<typeof readVfsText>[0], id: string): string => readVfsText(vfs, `source/${id}.kmn`)!;

describe.skipIf(!sc004GatesEnabled)("fallback-policy replay (Bafut on Cameroon QWERTY)", () => {
  let oldRecordKmn: string;
  let walkKmn: string;
  let replayKmn: string;
  let replayPolicy: string;
  let oldPolicy: string;

  beforeAll(async () => {
    // A record that predates the decision: nothing to restore.
    const old = await buildDecisionPointFixture({ ...base, point: "assignments", decisions: committed });
    oldRecordKmn = kmnOf(old.vfs, old.keyboardId);
    oldPolicy = useWorkingCopyStore.getState().fallbackPolicy;

    // The walk: same decisions, the author sets pass-through, then downloads.
    useWorkingCopyStore.getState().setFallbackPolicy("pass-through");
    const bundle = (await buildOutputBundle())!;
    walkKmn = kmnOf(bundle.vfs, bundle.keyboardId);

    // The replay: the record carries the decision; nothing else sets the policy.
    const replay = await buildDecisionPointFixture({
      ...base,
      point: "assignments",
      decisions: {
        ...committed,
        "fallback-policy": { id: "fallback-policy", value: "pass-through", provenance: "asked" },
      },
    });
    replayKmn = kmnOf(replay.vfs, replay.keyboardId);
    replayPolicy = useWorkingCopyStore.getState().fallbackPolicy;
  }, 240_000);

  it("a record without the decision replays with the default", () => {
    expect(oldPolicy).toBe(DEFAULT_FALLBACK_POLICY);
  });

  it("the policy changes the projected keyboard (the comparison is not vacuous)", () => {
    expect(walkKmn).not.toBe(oldRecordKmn);
  });

  it("the replayed decision restores the walk's policy and projects the same .kmn", () => {
    expect(replayPolicy).toBe("pass-through");
    expect(replayKmn).toBe(walkKmn);
  });
});
