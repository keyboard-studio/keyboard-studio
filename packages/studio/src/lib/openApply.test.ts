// openApply (spec 111 "live files", slice S1): an applied removal on Open is
// written into the files through the output's splice, and everything else in
// the file stays byte-identical. Real engine; no mocks.

import { beforeEach, describe, expect, it } from "vitest";
import { createVirtualFS, type StartKeyboard } from "@keyboard-studio/contracts";
import { parseKmn } from "@keyboard-studio/engine";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { useOpenRemovalStore } from "../stores/openRemovalStore.ts";
import { applyOpenChange } from "./openApply.ts";
import { readVfsText } from "./vfsText.ts";

const ID = "tiny";
const KMN_PATH = `source/${ID}.kmn`;

function kmnText(eol: string): string {
  return [
    "c a hand-written comment",
    "store(&NAME) 'Tiny'",
    "store(&VERSION) '10.0'",
    "",
    "begin Unicode > use(main)",
    "",
    "group(main) using keys",
    "c the vowels",
    "+ [K_A] > 'a'   c keep this spacing",
    "+ [K_B] > 'b'",
    "",
    "+ [K_C] > 'c'",
    "+ [K_D] > 'd'",
    "",
  ].join(eol);
}

const KB: StartKeyboard = {
  id: ID,
  path: `release/t/${ID}`,
  script: "Latn",
  targets: ["desktop"],
  displayName: "Tiny",
  version: "1.0",
  languages: ["en"],
} as StartKeyboard;

function open(eol = "\r\n", policy?: "swallow" | "pass-through"): string {
  useOpenRemovalStore.getState().clear();
  const text = kmnText(eol);
  const vfs = createVirtualFS([
    { path: KMN_PATH, content: text, isBinary: false },
    { path: `source/${ID}.kps`, content: "<Package/>", isBinary: false },
  ]);
  const wc = useWorkingCopyStore.getState();
  wc.reset();
  wc.instantiateFromExisting(KB, { vfs, ir: parseKmn(text, ID).ir });
  if (policy !== undefined) wc.setFallbackPolicy(policy);
  return text;
}

function ruleIdFor(vkey: string): string {
  const ir = useWorkingCopyStore.getState().startIr!;
  for (const g of ir.groups) {
    for (const r of g.rules) {
      if (r.context.some((c) => c.kind === "vkey" && c.name === vkey)) return r.nodeId;
    }
  }
  throw new Error(`no rule for ${vkey}`);
}

const fileText = (): string => readVfsText(useWorkingCopyStore.getState().startVfs!, KMN_PATH)!;
const linesOf = (s: string): string[] => s.split(/(?<=\n)/);

function remove(vkey: string, ch: string, consentedReemit = false) {
  return applyOpenChange(
    { kind: "remove", itemIds: [ruleIdFor(vkey)], chars: [ch] },
    consentedReemit ? { consentedReemit } : {},
  );
}

describe("applyOpenChange remove", () => {
  beforeEach(() => open());

  it("changes only the removed rule's lines; every other line is byte-identical (CRLF kept)", () => {
    const before = open("\r\n", "pass-through");
    const result = remove("K_B", "b");
    expect(result.status).toBe("applied");
    const after = fileText();
    const b = linesOf(before);
    const a = linesOf(after);
    expect(a).toHaveLength(b.length - 1);
    expect(a).toEqual(b.filter((l) => !l.includes("[K_B]")));
    expect(after).not.toMatch(/[^\r]\n/);
  });

  it("changes only the removed rule's lines in an LF file", () => {
    const before = open("\n", "pass-through");
    expect(remove("K_C", "c").status).toBe("applied");
    expect(linesOf(fileText())).toEqual(linesOf(before).filter((l) => !l.includes("[K_C]")));
  });

  it("writes the re-parsed keyboard into startIr and ir, and leaves every overlay empty", () => {
    open("\r\n", "pass-through");
    expect(remove("K_B", "b").status).toBe("applied");
    const s = useWorkingCopyStore.getState();
    const outputs = (s.startIr!.groups.flatMap((g) => g.rules)).length;
    expect(outputs).toBe(3);
    expect(s.ir).toBe(s.startIr);
    // Invariant: every replay field the projection reads is empty on Open.
    expect(s.deletedNodeIds.size).toBe(0);
    expect(s.deletedItemIds.size).toBe(0);
    expect(s.carveChars.size).toBe(0);
    expect(s.deletedTouchKeyIds.size).toBe(0);
    expect(s.carveTouchKeepInert).toEqual([]);
    expect(s.keyEditOverlay.ops).toEqual([]);
    expect(s.deadkeyOverlay.ops).toEqual([]);
    expect(s.contextToleranceOverlay).toBeNull();
    expect(s.undoStack).toEqual([]);
  });

  it("returns needs-consent and writes nothing when the change cannot be placed precisely", () => {
    open("\r\n", "pass-through");
    const before = useWorkingCopyStore.getState().startVfs!;
    // A rule with no source line cannot be spliced out.
    const ir = useWorkingCopyStore.getState().startIr!;
    for (const g of ir.groups) for (const r of g.rules) delete (r as { sourceLine?: number }).sourceLine;
    const result = remove("K_B", "b");
    expect(result).toEqual({ status: "needs-consent", files: [KMN_PATH] });
    expect(useWorkingCopyStore.getState().startVfs).toBe(before);
    expect(fileText()).toBe(kmnText("\r\n"));
  });

  it("re-emits once the author consents", () => {
    open("\r\n", "pass-through");
    const ir = useWorkingCopyStore.getState().startIr!;
    for (const g of ir.groups) for (const r of g.rules) delete (r as { sourceLine?: number }).sourceLine;
    const result = remove("K_B", "b", true);
    expect(result.status).toBe("applied");
    expect(fileText()).not.toContain("[K_B]");
    expect(fileText()).not.toBe(kmnText("\r\n"));
  });

  it("is not applied outside Open or without the descriptor", () => {
    const text = kmnText("\n");
    const vfs = createVirtualFS([{ path: KMN_PATH, content: text, isBinary: false }]);
    const wc = useWorkingCopyStore.getState();
    wc.reset();
    wc.instantiateFromExisting(KB, { vfs, ir: parseKmn(text, ID).ir });
    expect(remove("K_B", "b").status).toBe("failed");
    expect(fileText()).toBe(text);
  });
});

describe("applyOpenChange restore", () => {
  it("Restore puts the exact original text back (byte-identical file)", () => {
    const before = open("\r\n", "pass-through");
    expect(remove("K_B", "b").status).toBe("applied");
    expect(fileText()).not.toBe(before);
    const entries = useOpenRemovalStore.getState().entries;
    expect(entries).toHaveLength(1);
    expect(applyOpenChange({ kind: "reinsert", entries }).status).toBe("applied");
    expect(fileText()).toBe(before);
    expect(useOpenRemovalStore.getState().entries).toHaveLength(0);
  });

  it("Restore all reverts every removal, newest first, to the original bytes", () => {
    const before = open("\r\n", "pass-through");
    remove("K_A", "a");
    remove("K_C", "c");
    const entries = useOpenRemovalStore.getState().entries;
    expect(entries).toHaveLength(2);
    expect(applyOpenChange({ kind: "reinsert", entries: [...entries] }).status).toBe("applied");
    expect(fileText()).toBe(before);
  });

  it("restoring an earlier removal after a later one puts the rules back at their old place", () => {
    const before = open("\r\n", "pass-through");
    remove("K_B", "b");
    remove("K_D", "d");
    const [first] = useOpenRemovalStore.getState().entries;
    expect(applyOpenChange({ kind: "reinsert", entries: [first!] }).status).toBe("applied");
    const text = fileText();
    expect(text).toContain("+ [K_B] > 'b'\r\n");
    expect(text).not.toContain("[K_D]");
    // Original order: B sits right after A.
    const rules = linesOf(text).filter((l) => l.startsWith("+"));
    expect(rules.map((l) => l.slice(0, 8))).toEqual(["+ [K_A] ", "+ [K_B] ", "+ [K_C] "]);
    // Everything else is untouched.
    expect(linesOf(text).filter((l) => !l.includes("[K_B]"))).toEqual(
      linesOf(before).filter((l) => !l.includes("[K_B]") && !l.includes("[K_D]")),
    );
  });
});

describe("applyOpenChange under the store's default fallback policy", () => {
  it("removes and restores back to the original bytes", () => {
    const before = open("\r\n");
    expect(remove("K_B", "b").status).toBe("applied");
    const entries = useOpenRemovalStore.getState().entries;
    expect(applyOpenChange({ kind: "reinsert", entries: [...entries] }).status).toBe("applied");
    expect(fileText()).toBe(before);
  });
});

describe("applyOpenChange ir", () => {
  it("places an added rule where the IR has it (middle), not at the group's end", () => {
    const before = open("\r\n", "pass-through");
    const start = useWorkingCopyStore.getState().startIr!;
    const next = structuredClone(start);
    const group = next.groups.find((g) => !g.readonly)!;
    const template = group.rules[0]!;
    const added = {
      ...structuredClone(template),
      nodeId: "added#1",
      rulesStepAdded: true as const,
      output: [{ kind: "char" as const, value: "q" }],
    };
    delete (added as { sourceLine?: number }).sourceLine;
    group.rules.splice(1, 0, added);
    const result = applyOpenChange({ kind: "ir", nextIr: next });
    expect(result.status).toBe("applied");
    const rules = linesOf(fileText()).filter((l) => l.startsWith("+"));
    expect(rules).toHaveLength(5);
    expect(rules[0]).toContain("[K_A]");
    expect(rules[1]).toContain("U+0071");
    expect(rules[2]).toContain("[K_B]");
    // All original lines survive byte-identical.
    for (const l of linesOf(before)) expect(linesOf(fileText())).toContain(l);
  });
});
