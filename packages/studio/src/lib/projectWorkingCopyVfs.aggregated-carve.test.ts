// Issue #1809 — ruling §1 (ONE aggregated carved set R, one nomination pass)
// and §11 (.kmn, .kvks, and touch-layout projection consume the same pruned
// slot result), plus the §7 non-divergence proof for the explicit
// touch-method deletion path (deletedTouchKeyIds, step 1.6).
//
// The carve gallery discards characters one toggle at a time and unions the
// per-character contributor records into the incremental `deletedItemIds`
// set — but that union is NOT equivalent to a single aggregated-R pass for
// whole-rule "no rows left" deletion and fully-tainted literal outputs. The
// projection must therefore union collectTaintedContributors(baseIr,
// carveChars) over the incremental set, and every artifact (.kmn, .kvks,
// .keyman-touch-layout) must see that same union.
//
// AC#1 (§1+§11): a rule with literal all-char output "äö", carved via
//   carveChars={"ä","ö"} with an EMPTY incremental union (each per-character
//   pass sees a partially-tainted literal whose kept char is stranded, so it
//   nominates nothing — the "blocked" classification). The projection must
//   still drop the rule from the .kmn AND blank its "äö" keycaps in .kvks and
//   the touch layout. Without the aggregated union, nothing would happen at
//   all (hasCarveEdit would be false).
// AC#2 (§7): carving a character whose touch key was ALSO explicitly deleted
//   via deletedTouchKeyIds resolves to a single coherent outcome — the step
//   1.5 carve cascade neutralizes the key, the step 1.6 explicit deletion
//   finds nothing left to do (idempotent), no warnings, no errors.
// AC#3 (§7): an explicit touch-method deletion for a NON-carved character is
//   independent of the carve cascade — it still applies when carveChars is
//   non-empty.

import { describe, it, expect } from "vitest";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { charStore, irGroup, makeTestIR } from "@keyboard-studio/contracts/fixtures";
import type { IRRule } from "@keyboard-studio/contracts";
import { parseKmn } from "@keyboard-studio/engine";
import { projectWorkingCopyVfs } from "./projectWorkingCopyVfs.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/**
 * Real parsed .kmn (not a hand-built IR): source spans resolve, so the
 * splice-first carve path runs warning-free — the same path production takes
 * for an imported keyboard.
 *
 * The `+ [K_Q] > 'äö'` rule has a literal two-char output. Carving 'ä' alone:
 * partially-tainted literal, kept 'ö' is stranded (no other producer) →
 * blocked, nominates nothing. Carving 'ö' alone: symmetric. Carving both
 * (R={"ä","ö"}): fully-tainted literal output → whole-rule delete.
 */
const LITERAL_KMN = [
  "store(&VERSION) '10.0'",
  "begin Unicode > use(main)",
  "group(main) using keys",
  "+ [K_A] > 'a'",
  "+ [K_Q] > 'äö'",
  "",
].join("\n");

const LITERAL_KVKS = `<visualkeyboard>
<header><version>10.0</version></header>
<encoding name="unicode" fontname="Arial">
<layer shift="">
<key vkey="K_A">a</key>
<key vkey="K_Q">äö</key>
</layer>
</encoding>
</visualkeyboard>`;

const LITERAL_TOUCH_LAYOUT = JSON.stringify({
  tablet: {
    layer: [
      {
        id: "default",
        row: [
          {
            id: 1,
            key: [
              { id: "K_A", text: "a" },
              { id: "K_Q", text: "äö", output: "äö" },
            ],
          },
        ],
      },
    ],
  },
});

function makeLiteralVfs(keyboardId: string) {
  return createVirtualFS([
    { path: `source/${keyboardId}.kmn`, content: LITERAL_KMN, isBinary: false },
    { path: `source/${keyboardId}.kvks`, content: LITERAL_KVKS, isBinary: false },
    {
      path: `source/${keyboardId}.keyman-touch-layout`,
      content: LITERAL_TOUCH_LAYOUT,
      isBinary: false,
    },
  ]);
}

/**
 * Deadkey fan-out IR: dk(0x3b) any(dkfX) > index(dktX, 2), dktX = ['é', 'à'].
 * Carving 'é' prunes slot 0; the 'é' touch key (K_E) carries a longpress entry
 * that the author ALSO explicitly deleted via the touch gallery.
 */
function makeFanOutIr() {
  const outputStore = charStore({
    nodeId: "store#dkt",
    name: "dktX",
    items: [
      { kind: "char", value: "é" },
      { kind: "char", value: "à" },
    ],
  });
  const inputStore = charStore({
    nodeId: "store#dkf",
    name: "dkfX",
    items: [
      { kind: "char", value: "e" },
      { kind: "char", value: "a" },
    ],
  });
  const rule: IRRule = {
    nodeId: "rule#dk",
    context: [
      { kind: "deadkey", id: 0x003b },
      { kind: "any", storeRef: "dkfX" },
    ],
    output: [{ kind: "index", storeRef: "dktX", offset: 2 }],
  };
  return makeTestIR(
    [irGroup({ nodeId: "group#main", name: "main", rules: [rule] })],
    [outputStore, inputStore],
  );
}

const FANOUT_KVKS = `<visualkeyboard>
<header><version>10.0</version></header>
<encoding name="unicode" fontname="Arial">
<layer shift="">
<key vkey="K_A">a</key>
<key vkey="K_E">é</key>
</layer>
</encoding>
</visualkeyboard>`;

const FANOUT_TOUCH_LAYOUT = JSON.stringify({
  tablet: {
    layer: [
      {
        id: "default",
        row: [
          {
            id: 1,
            key: [
              { id: "K_A", text: "a", sk: [{ id: "U_00E9", text: "é" }] },
              { id: "U_00E9", text: "é", output: "é" },
            ],
          },
        ],
      },
    ],
  },
});

function makeFanOutVfs(keyboardId: string) {
  return createVirtualFS([
    { path: `source/${keyboardId}.kmn`, content: "c stub\n", isBinary: false },
    { path: `source/${keyboardId}.kvks`, content: FANOUT_KVKS, isBinary: false },
    {
      path: `source/${keyboardId}.keyman-touch-layout`,
      content: FANOUT_TOUCH_LAYOUT,
      isBinary: false,
    },
  ]);
}

function touchKeys(vfs: ReturnType<typeof createVirtualFS>, keyboardId: string) {
  const raw = vfs.get(`source/${keyboardId}.keyman-touch-layout`)?.content as string;
  return JSON.parse(raw).tablet.layer[0].row[0].key as Array<Record<string, unknown>>;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("projectWorkingCopyVfs — issue #1809 ruling §1 + §11 aggregated carve", () => {
  it("AC#1: an aggregated-only whole-rule nomination drops the .kmn rule AND blanks its keycaps in .kvks and the touch layout", () => {
    const { ir } = parseKmn(LITERAL_KMN, "test_kb");
    const irBefore = structuredClone(ir);
    const vfs = makeLiteralVfs("test_kb");

    // The per-character passes nominate NOTHING for rule#literal (partially-
    // tainted literal, kept char stranded → blocked), so the incremental union
    // is empty — exactly what the gallery would have unioned after carving
    // 'ä' then 'ö'. The aggregated pass over R={"ä","ö"} must still fire.
    const { warnings } = projectWorkingCopyVfs({
      vfs,
      keyboardId: "test_kb",
      baseIr: ir,
      deletedNodeIds: new Set(),
      deletedItemIds: new Set<string>(),
      carveChars: new Set(["ä", "ö"]),
      assignments: [],
      getPattern: () => undefined,
      identity: null,
    });

    expect(warnings).toHaveLength(0);

    // .kmn: the fully-tainted literal rule is gone; the kept rule survives.
    const kmn = vfs.get("source/test_kb.kmn")?.content as string;
    expect(kmn).not.toContain("äö");
    expect(kmn).toContain("[K_A]");

    // .kvks: the "äö" keycap is blanked in place (element + layer survive).
    const kvks = vfs.get("source/test_kb.kvks")?.content as string;
    expect(kvks).toContain('<key vkey="K_Q"></key>');
    expect(kvks).toContain('<key vkey="K_A">a</key>');

    // .keyman-touch-layout: the carved output is deleted and the id
    // neutralized to an inert T_carved_* id; the sibling key is untouched.
    const keys = touchKeys(vfs, "test_kb");
    const carved = keys.find((k) => k["id"] === "T_carved_K_Q");
    expect(carved).toBeDefined();
    expect(carved!["text"]).toBe("");
    expect(carved!["output"]).toBeUndefined();
    expect(keys.find((k) => k["id"] === "K_A")).toMatchObject({ text: "a" });

    // baseIr is never mutated by the projection.
    expect(ir).toEqual(irBefore);
  });

  it("AC#1 control: without carveChars the same empty incremental union projects nothing", () => {
    const { ir } = parseKmn(LITERAL_KMN, "test_kb");
    const vfs = makeLiteralVfs("test_kb");

    const { warnings } = projectWorkingCopyVfs({
      vfs,
      keyboardId: "test_kb",
      baseIr: ir,
      deletedNodeIds: new Set(),
      deletedItemIds: new Set<string>(),
      // No carveChars — the pre-§1 behavior: nothing nominated, no edits.
      assignments: [],
      getPattern: () => undefined,
      identity: null,
    });

    expect(warnings).toHaveLength(0);
    const kvks = vfs.get("source/test_kb.kvks")?.content as string;
    expect(kvks).toContain('<key vkey="K_Q">äö</key>');
  });
});

describe("projectWorkingCopyVfs — issue #1809 §7 carve/explicit-touch-deletion non-divergence", () => {
  it("AC#2: carving a char whose touch key was also explicitly deleted resolves coherently — no warnings, no double-processing", () => {
    const ir = makeFanOutIr();
    const vfs = makeFanOutVfs("test_kb");

    // Carve 'é' (slot 0). The step-1.5 carve cascade will blank K_E's keycap
    // and REMOVE the matching U_00E9 longpress entry under K_A. The author
    // ALSO explicitly deleted that same longpress in the touch gallery.
    const { warnings } = projectWorkingCopyVfs({
      vfs,
      keyboardId: "test_kb",
      baseIr: ir,
      deletedNodeIds: new Set(),
      deletedItemIds: new Set(["store#dkt#0"]),
      carveChars: new Set(["é"]),
      deletedTouchKeyIds: new Set(["tablet:default:K_A:sk:U_00E9"]),
      assignments: [],
      getPattern: () => undefined,
      identity: null,
    });

    expect(warnings).toHaveLength(0);

    // .kvks: the é keycap blanked; structure survives.
    const kvks = vfs.get("source/test_kb.kvks")?.content as string;
    expect(kvks).toContain('<key vkey="K_E"></key>');

    // Touch layout: the carved U_00E9 main key is neutralized by the carve
    // cascade (id → T_carved_*, output deleted, text blanked); the longpress
    // entry is gone exactly once — the step-1.6 explicit deletion resolved
    // to nothing after the cascade removed it (idempotent, no error).
    const keys = touchKeys(vfs, "test_kb");
    const carvedMain = keys.find((k) => k["id"] === "T_carved_00E9");
    expect(carvedMain).toBeDefined();
    expect(carvedMain!["text"]).toBe("");
    expect(carvedMain!["output"]).toBeUndefined();
    const kA = keys.find((k) => k["id"] === "K_A");
    expect(kA).toBeDefined();
    expect(kA!["sk"]).toBeUndefined();
    expect(kA!["text"]).toBe("a");
  });

  it("AC#3: an explicit touch-method deletion for a non-carved char still applies when carveChars is non-empty", () => {
    const ir = makeFanOutIr();
    const vfs = makeFanOutVfs("test_kb");

    // Carve 'é', but explicitly delete the 'a' key's longpress-adjacent
    // method instead — here the whole K_A main key, which is NOT carved.
    const { warnings } = projectWorkingCopyVfs({
      vfs,
      keyboardId: "test_kb",
      baseIr: ir,
      deletedNodeIds: new Set(),
      deletedItemIds: new Set(["store#dkt#0"]),
      carveChars: new Set(["é"]),
      deletedTouchKeyIds: new Set(["tablet:default:K_A"]),
      assignments: [],
      getPattern: () => undefined,
      identity: null,
    });

    expect(warnings).toHaveLength(0);

    const keys = touchKeys(vfs, "test_kb");
    // The carve cascade still neutralized the é key...
    expect(keys.find((k) => k["id"] === "T_carved_00E9")).toBeDefined();
    // ...and the independent explicit deletion still neutralized K_A
    // (neutralizeId("K_A") === "T_touchdel_K_A"), with its text/output gone.
    const neutralizedA = keys.find((k) => k["id"] === "T_touchdel_K_A");
    expect(neutralizedA).toBeDefined();
    expect(neutralizedA!["text"]).toBeUndefined();
    expect(neutralizedA!["output"]).toBeUndefined();
  });
});
