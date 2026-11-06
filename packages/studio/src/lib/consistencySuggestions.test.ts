import { describe, expect, it } from "vitest";
import { parseKmn } from "@keyboard-studio/engine";
import { parseTouchLayoutString } from "@keyboard-studio/contracts";

import {
  computeConsistencyDelta,
  suggestionsFromDelta,
  type ConsistencyInput,
} from "./consistencySuggestions.ts";

const KMN = (rules: string) => `store(&VERSION) '10.0'
begin Unicode > use(main)
group(main) using keys
${rules}
`;

function touch(keys: string[]): string {
  const row = keys.map((c, i) => `{ "id": "K_${i}", "text": "${c}" }`).join(",");
  return `{ "phone": { "layer": [ { "id": "default", "row": [ { "id": 1, "key": [ ${row} ] } ] } ] } }`;
}

function input(rules: string, touchKeys: string[] | null, layers: string[] = ["default"]): ConsistencyInput {
  return {
    ir: parseKmn(KMN(rules), "t").ir,
    touchLayout: touchKeys === null ? null : parseTouchLayoutString(touch(touchKeys)),
    layerIds: layers,
  };
}

const A = "+ [K_A] > 'a'";
const B = "+ [K_B] > 'b'";

function run(before: ConsistencyInput, after: ConsistencyInput) {
  const r = computeConsistencyDelta(before, after);
  return { ...r, fixes: suggestionsFromDelta(r.delta, r.after) };
}

describe("consistency delta (per Apply)", () => {
  it("a character added to touch only offers physical keys and docs", () => {
    const { delta, fixes } = run(input(A, ["a"]), input(A, ["a", "ɔ"]));
    expect(delta.addedTouch).toEqual(["ɔ"]);
    expect(delta.addedPhysical).toEqual([]);
    expect(fixes.map((f) => f.id)).toEqual([
      "consistency:add:physical:ɔ",
      "consistency:refresh:docs:characters",
    ]);
    expect(fixes.every((f) => f.status === "pending" && f.kind === "consistency")).toBe(true);
  });

  it("a character added to the physical keys only offers touch", () => {
    const { fixes } = run(input(A, ["a"]), input(`${A}\n${B}`, ["a"]));
    expect(fixes.map((f) => f.id)).toContain("consistency:add:touch:b");
  });

  it("a removal is offered only where the other part still has the character", () => {
    const before = input(`${A}\n${B}`, ["a", "b"]);
    const after = input(A, ["a", "b"]);
    const { delta, fixes } = run(before, after);
    expect(delta.removedPhysical).toEqual(["b"]);
    expect(fixes.map((f) => f.id)).toContain("consistency:remove:touch:b");

    const both = run(before, input(A, ["a"]));
    expect(both.fixes.map((f) => f.id)).not.toContain("consistency:remove:touch:b");
  });

  it("an inconsistency that existed before the change is not a suggestion", () => {
    // touch already has a character the physical keys lack, before and after.
    const before = input(A, ["a", "ɔ"]);
    const after = input(`${A}\n${B}`, ["a", "ɔ", "b"]);
    const { delta, fixes } = run(before, after);
    expect(delta.addedTouch).toEqual(["b"]);
    expect(fixes.map((f) => f.id)).not.toContain("consistency:add:physical:ɔ");
  });

  it("a no-op change yields no suggestions", () => {
    const { fixes } = run(input(A, ["a"]), input(A, ["a"]));
    expect(fixes).toEqual([]);
  });

  it("a layer change offers a help layer-list update", () => {
    const { delta, fixes } = run(
      input(A, ["a"], ["default"]),
      input(A, ["a"], ["default", "shift"]),
    );
    expect(delta.addedLayers).toEqual(["shift"]);
    expect(fixes.map((f) => f.id)).toEqual(["consistency:refresh:docs:layers"]);
  });

  it("a keyboard with no touch layout never reports touch changes", () => {
    const { delta } = run(input(A, null), input(`${A}\n${B}`, null));
    expect(delta.addedTouch).toEqual([]);
    expect(delta.addedPhysical).toEqual(["b"]);
  });
});
