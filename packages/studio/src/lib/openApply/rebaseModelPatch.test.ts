// rebaseModelPatch -- node-level re-basing of a queued `model` change
// (issue #2666). Pure IR-level tests: `base` is the parse the patch was
// composed against, `next` the queued result (built the way a module's apply
// builds it — mapped over the base, nodeIds kept), `current` a fresh parse of
// the file as it stands when the author agrees.

import { describe, expect, it } from "vitest";
import { irPath, type KeyboardIR } from "@keyboard-studio/contracts";
import { parseKmn } from "@keyboard-studio/engine";
import { rebaseModelPatch } from "./rebaseModelPatch.ts";

const ID = "tiny";
const KMN = [
  "store(&NAME) 'Tiny'",
  "store(&VERSION) '10.0'",
  "store(testStore) 'one'",
  "",
  "begin Unicode > use(main)",
  "",
  "group(main) using keys",
  "+ [K_A] > 'a'",
  "+ [K_B] > 'b'",
  "+ [K_C] > 'c'",
  "",
].join("\r\n");

const parse = (text: string): KeyboardIR => parseKmn(text, ID).ir;
/** The queued result of removing the K_B rule, as a module's apply builds it (nodeIds kept). */
function withoutB(base: KeyboardIR): KeyboardIR {
  return {
    ...base,
    groups: base.groups.map((g) => ({
      ...g,
      rules: g.rules.filter((r) => !JSON.stringify(r).includes("K_B")),
    })),
  };
}
/** The queued result of changing the K_B rule's output to 'B'. */
function bToUpper(base: KeyboardIR): KeyboardIR {
  return {
    ...base,
    groups: base.groups.map((g) => ({
      ...g,
      rules: g.rules.map((r) =>
        JSON.stringify(r).includes("K_B")
          ? { ...r, output: [{ kind: "char", value: "B" }] }
          : r,
      ),
    })),
  };
}
/** The queued result of changing the testStore items to 'two'. */
function storeToTwo(base: KeyboardIR): KeyboardIR {
  return {
    ...base,
    stores: base.stores.map((s) =>
      s.name === "testStore" ? { ...s, items: [{ kind: "char", value: "two" }] } : s,
    ),
  };
}
const ruleTexts = (ir: KeyboardIR): string[] =>
  ir.groups.flatMap((g) => g.rules.map((r) => JSON.stringify(r.output)));
const storeItems = (ir: KeyboardIR, name: string): unknown =>
  ir.stores.find((s) => s.name === name)?.items;

describe("rebaseModelPatch", () => {
  it("an unrelated rule edited meanwhile: both changes land", () => {
    const base = parse(KMN);
    const current = parse(KMN.replace("+ [K_A] > 'a'", "+ [K_A] > 'A'"));
    const rebased = rebaseModelPatch(base, withoutB(base), current, [irPath("groups")]);
    expect(rebased).not.toBeNull();
    expect(ruleTexts(rebased!)).toEqual([JSON.stringify([{ kind: "char", value: "A" }]), JSON.stringify([{ kind: "char", value: "c" }])]);
  });

  it("the patch's own rule edited meanwhile: rejected", () => {
    const base = parse(KMN);
    const current = parse(KMN.replace("+ [K_B] > 'b'", "+ [K_B] > 'B'"));
    expect(rebaseModelPatch(base, withoutB(base), current, [irPath("groups")])).toBeNull();
    // ... and a patch that changes the rule is rejected too.
    expect(rebaseModelPatch(base, bToUpper(base), current, [irPath("groups")])).toBeNull();
  });

  it("the patch's own rule deleted meanwhile: rejected", () => {
    const base = parse(KMN);
    const current = parse(KMN.replace("+ [K_B] > 'b'\r\n", ""));
    expect(rebaseModelPatch(base, withoutB(base), current, [irPath("groups")])).toBeNull();
  });

  it("a rule added meanwhile, before the patch's node (positional ids shift): both land", () => {
    const base = parse(KMN);
    const current = parse(KMN.replace("+ [K_A] > 'a'", "+ [K_0] > '0'\r\n+ [K_A] > 'a'"));
    const rebased = rebaseModelPatch(base, withoutB(base), current, [irPath("groups")]);
    expect(rebased).not.toBeNull();
    expect(ruleTexts(rebased!)).toEqual([
      JSON.stringify([{ kind: "char", value: "0" }]),
      JSON.stringify([{ kind: "char", value: "a" }]),
      JSON.stringify([{ kind: "char", value: "c" }]),
    ]);
  });

  it("the patch's own store edited meanwhile: rejected", () => {
    const base = parse(KMN);
    const current = parse(KMN.replace("store(testStore) 'one'", "store(testStore) 'three'"));
    expect(rebaseModelPatch(base, storeToTwo(base), current, [irPath("stores")])).toBeNull();
  });

  it("an unrelated store edited meanwhile: both land", () => {
    const base = parse(KMN);
    const current = parse(KMN.replace("store(&VERSION) '10.0'", "store(&VERSION) '11.0'"));
    const rebased = rebaseModelPatch(base, storeToTwo(base), current, [irPath("stores")]);
    expect(rebased).not.toBeNull();
    expect(storeItems(rebased!, "testStore")).toEqual([{ kind: "char", value: "two" }]);
    // &VERSION parses into per-character items; the meanwhile edit survives as parsed.
    expect(storeItems(rebased!, "VERSION")).toEqual(storeItems(current, "VERSION"));
  });

  it("nothing changed meanwhile: the queued result, re-based onto the same parse", () => {
    const base = parse(KMN);
    const rebased = rebaseModelPatch(base, withoutB(base), parse(KMN), [irPath("groups")]);
    expect(rebased).not.toBeNull();
    expect(ruleTexts(rebased!)).toEqual([
      JSON.stringify([{ kind: "char", value: "a" }]),
      JSON.stringify([{ kind: "char", value: "c" }]),
    ]);
  });

  it("a non-node write changed meanwhile: rejected; unchanged: applied", () => {
    const base = parse(KMN);
    const renamed = { ...base, header: { ...base.header, name: "Big" } };
    expect(rebaseModelPatch(base, renamed, parse(KMN), [irPath("header", "name")])).not.toBeNull();
    const current = parse(KMN.replace("store(&NAME) 'Tiny'", "store(&NAME) 'Huge'"));
    // The header name follows the &NAME store in the parse, so a meanwhile rename rejects.
    expect(rebaseModelPatch(base, renamed, current, [irPath("header", "name")])).toBeNull();
  });
});
