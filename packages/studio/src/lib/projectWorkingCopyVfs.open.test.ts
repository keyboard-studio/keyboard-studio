// Open mode (spec 111) in the projection: tool changes reach the .kmn as a
// splice into the text, and a change that cannot be placed precisely is named
// and held for the author's agreement instead of silently reformatting.

import { describe, expect, it } from "vitest";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { parseKmn } from "@keyboard-studio/engine";
import { projectWorkingCopyVfs } from "./projectWorkingCopyVfs.ts";
import type { ProjectWorkingCopyVfsInput } from "./projectWorkingCopyVfs.ts";

const ID = "tiny";
const KMN = [
  "c a hand-written comment",
  "store(&NAME) 'Tiny'",
  "store(&VERSION) '10.0'",
  "begin Unicode > use(main)",
  "group(main) using keys",
  "+ [K_A] > 'a'",
  "+ [K_B] > 'b'",
  "",
].join("\r\n");

const KMN_WITHOUT_B = [
  "c a hand-written comment",
  "store(&NAME) 'Tiny'",
  "store(&VERSION) '10.0'",
  "begin Unicode > use(main)",
  "group(main) using keys",
  "+ [K_A] > 'a'",
  "",
].join("\r\n");

function run(opts: { stripSourceLine?: boolean; consent?: boolean }) {
  const vfs = createVirtualFS();
  // A stripped file is the text an earlier step changed out from under the starting keyboard:
  // its rule count no longer matches, so spans cannot be re-read.
  vfs.set(`source/${ID}.kmn`, opts.stripSourceLine === true ? KMN_WITHOUT_B : KMN, false);
  const startIr = parseKmn(KMN, ID).ir;
  const group = startIr.groups.find((g) => !g.readonly)!;
  const rule = group.rules[0]!;
  const input: ProjectWorkingCopyVfsInput = {
    vfs,
    keyboardId: ID,
    startIr,
    deletedNodeIds: new Set([rule.nodeId]),
    assignments: [],
    getPattern: () => undefined,
    identity: null,
    openMode: { kps: { nameEdited: false }, ...(opts.consent === true ? { consentedReemit: true } : {}) },
  };
  const result = projectWorkingCopyVfs(input);
  return { result, text: vfs.get(`source/${ID}.kmn`)!.content as string };
}

describe("projectWorkingCopyVfs: Open mode", () => {
  it("splices a deleted rule out of the text and keeps CRLF and the comment", () => {
    const { result, text } = run({});
    expect(result.reformatRequired).toBeUndefined();
    expect(text).toContain("c a hand-written comment\r\n");
    expect(text).not.toContain("[K_A]");
    expect(text).toContain("+ [K_B] > 'b'\r\n");
    expect(text).not.toMatch(/[^\r]\n/);
  });

  it("names a file it cannot edit precisely and leaves it unchanged until the author agrees", () => {
    const { result, text } = run({ stripSourceLine: true });
    expect(result.reformatRequired).toEqual([`source/${ID}.kmn`]);
    expect(result.warnings.some((w) => w.startsWith("[open]") && w.includes(`source/${ID}.kmn`))).toBe(true);
    expect(text).toBe(KMN_WITHOUT_B);
  });

  it("re-emits the file once the author agrees", () => {
    const { result, text } = run({ stripSourceLine: true, consent: true });
    expect(result.reformatRequired).toBeUndefined();
    expect(text).not.toBe(KMN);
    expect(text).not.toContain("[K_A]");
  });
});
