// Layout-tab edits (spec 117, step 2.2) on Open (spec 111 FR-008..FR-010): the replayed
// `kmn-edits` log reaches the .kmn as a splice into the opened text, never a whole re-emit.
// A change the splice cannot place leaves the file unchanged (named for the author's
// agreement) or, with consent, is re-emitted with an `[open]` warning. Copy is unchanged.

import { describe, expect, it, vi } from "vitest";
import { createVirtualFS } from "@keyboard-studio/contracts";
import type { KmnEditsValue } from "@keyboard-studio/contracts";
import { diffIR, emitKmn, parseKmn, replayKmnEdits } from "@keyboard-studio/engine";
import { projectWorkingCopyVfs } from "./projectWorkingCopyVfs.ts";
import type { ProjectWorkingCopyVfsInput } from "./projectWorkingCopyVfs.ts";

// Lets a test force the splice to refuse; otherwise the real implementation runs.
const forced = vi.hoisted(() => ({ refuse: false }));
vi.mock("@keyboard-studio/engine", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@keyboard-studio/engine")>();
  return {
    ...actual,
    projectKmnText: (...args: Parameters<typeof actual.projectKmnText>) =>
      forced.refuse ? { ok: false as const, reason: "forced for test" } : actual.projectKmnText(...args),
  };
});

const ID = "lay";
const KMN = [
  "c leading comment",
  "store(&VERSION) '10.0'",
  "",
  "store(&NAME) 'Lay'",
  'store(&Targets) "any"',
  "c group comment",
  "begin Unicode > use(main)",
  "",
  "group(main) using keys",
  "c before a",
  "+ [K_A] > 'a'",
  "",
  "+ [K_B] > 'b'  c trailing",
  "+ [K_C] > 'c'",
  "",
].join("\n");

const SET_B: KmnEditsValue = {
  entries: [{ op: "set-key", vkey: "K_B", layer: [], output: { kind: "text", text: "ŋ" }, seq: 1, at: 0 }],
};

function run(openMode: ProjectWorkingCopyVfsInput["openMode"], kmnEdits: KmnEditsValue = SET_B) {
  const vfs = createVirtualFS();
  vfs.set(`source/${ID}.kmn`, KMN, false);
  const result = projectWorkingCopyVfs({
    vfs,
    keyboardId: ID,
    startIr: parseKmn(KMN, ID).ir,
    deletedNodeIds: new Set(),
    assignments: [],
    getPattern: () => undefined,
    identity: null,
    kmnEdits,
    ...(openMode !== undefined ? { openMode } : {}),
  });
  return { result, text: vfs.get(`source/${ID}.kmn`)!.content as string };
}

describe("projectWorkingCopyVfs step 2.2 on Open", () => {
  it("changes only the affected rule's lines; comments, blanks and store order are byte-identical", () => {
    forced.refuse = false;
    const { text, result } = run({ kps: { nameEdited: false } });
    expect(result.reformatRequired).toBeUndefined();
    // The edited rule's line (index 12) is replaced by the new rule at the end of the group.
    const expected = KMN.split("\n");
    expected.splice(12, 1);
    expected.splice(expected.length - 1, 0, "+ [K_B] > U+014B");
    expect(text.split("\n")).toEqual(expected);
  });

  it("leaves the file unchanged and reports it when the change cannot be placed", () => {
    forced.refuse = true;
    const { result, text } = run({ kps: { nameEdited: false } });
    expect(text).toBe(KMN);
    expect(result.reformatRequired).toEqual([`source/${ID}.kmn`]);
    expect(result.warnings.some((w) => w.startsWith("[open]") && w.includes(`source/${ID}.kmn`))).toBe(true);
  });

  it("re-emits with the [open] warning once the author agrees", () => {
    forced.refuse = true;
    const { result, text } = run({ kps: { nameEdited: false }, consentedReemit: true });
    expect(result.reformatRequired).toBeUndefined();
    expect(text).toContain("U+014B");
    expect(text).not.toBe(KMN);
    expect(result.warnings.some((w) => w.startsWith("[open]") && w.includes("reformatted"))).toBe(true);
  });

  it("a deadkey overlay on Open is spliced too, not re-emitted", () => {
    forced.refuse = false;
    const vfs = createVirtualFS();
    vfs.set(`source/${ID}.kmn`, KMN, false);
    projectWorkingCopyVfs({
      vfs,
      keyboardId: ID,
      startIr: parseKmn(KMN, ID).ir,
      deletedNodeIds: new Set(),
      assignments: [],
      getPattern: () => undefined,
      identity: null,
      deadkeyOps: [{ kind: "define", triggerKey: "e", id: 0x3001, accentChar: "\u0301" }],
      openMode: { kps: { nameEdited: false } },
    });
    const text = vfs.get(`source/${ID}.kmn`)!.content as string;
    expect(text).toContain("dk(3001)");
    expect(text.startsWith("c leading comment\nstore(&VERSION) '10.0'\n\nstore(&NAME) 'Lay'\n")).toBe(true);
  });

  it("a Code-tab entry replays at step 2.9 as a splice too: only the changed rule's line moves", () => {
    forced.refuse = false;
    const changes = diffIR(
      parseKmn(KMN, ID).ir,
      parseKmn(KMN.replace("+ [K_C] > 'c'", "+ [K_C] > 'z'"), ID).ir,
    );
    const { text, result } = run(
      { kps: { nameEdited: false } },
      { entries: [{ op: "code-apply", seq: 1, at: 0, changes, overrides: [] }] },
    );
    expect(result.reformatRequired).toBeUndefined();
    expect(text).toBe(KMN.replace("+ [K_C] > 'c'", "+ [K_C] > U+007A"));
  });

  it("a Code-tab entry on Open that the splice cannot place leaves the file unchanged and says so", () => {
    forced.refuse = true;
    const changes = diffIR(
      parseKmn(KMN, ID).ir,
      parseKmn(KMN.replace("+ [K_C] > 'c'", "+ [K_C] > 'z'"), ID).ir,
    );
    const { text, result } = run(
      { kps: { nameEdited: false } },
      { entries: [{ op: "code-apply", seq: 1, at: 0, changes, overrides: [] }] },
    );
    expect(text).toBe(KMN);
    expect(result.reformatRequired).toEqual([`source/${ID}.kmn`]);
  });

  it("Copy mode keeps the full emit", () => {
    forced.refuse = true; // must not matter: Copy never splices
    const { result, text } = run(undefined);
    const ir = parseKmn(KMN, ID).ir;
    expect(text).toBe(emitKmn(replayKmnEdits(ir, SET_B.entries).ir));
    expect(text).not.toBe(KMN);
    expect(result.reformatRequired).toBeUndefined();
  });
});
