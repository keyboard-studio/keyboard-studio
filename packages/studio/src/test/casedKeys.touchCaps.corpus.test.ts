// Touch caps layer corpus check (spec 112, SC-005): for each Copy base the
// decision-point matrix uses, scaffold the copy from the corpus package, run
// the projection with the cased-keys decision, and assert the projected touch
// layout passes criterion 18.16. The decision-point replay does not install a
// touch layout, so this goes through the scaffolder and projection directly.
//
// Reads the sibling ../keyboards corpus, so it runs under vitest.corpus.config.ts.

import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createVirtualFS, makeStartKeyboard, parseTouchLayoutString } from "@keyboard-studio/contracts";
import { createScaffolderService, parseKmn } from "@keyboard-studio/engine";
import { checkTouchCapsLayer } from "@keymanapp/keyboard-lint";
import { projectWorkingCopyVfs } from "../lib/projectWorkingCopyVfs.ts";
import { readVfsText } from "../lib/vfsText.ts";
import { DECISION_POINT_BASES } from "./decisionPointBases.ts";

const here = dirname(fileURLToPath(import.meta.url));
const corpus = resolve(here, "..", "..", "..", "..", "..", "keyboards");
const present = existsSync(join(corpus, "release"));
if (!present) {
  console.warn(`[WARN] keyboards corpus not found at ${corpus}; skipping the touch caps corpus check`);
}

const PROXY = "http://corpus.invalid";
const KBID = "touch_caps_copy";

/** Serve corpus files through the loader's fetch seam; anything absent is a 404. */
async function corpusFetch(url: string) {
  const abs = join(corpus, url.slice(PROXY.length + 1));
  if (!existsSync(abs)) return { ok: false, status: 404 } as never;
  const buf = readFileSync(abs);
  return {
    ok: true,
    status: 200,
    text: async () => buf.toString("utf-8"),
    arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
  } as never;
}

describe.skipIf(!present)("touch caps layer on the Copy bases (SC-005)", () => {
  for (const b of DECISION_POINT_BASES.filter((x) => x.track === "copy")) {
    it(`${b.base}: the projected copy passes 18.16`, async () => {
      const kb = makeStartKeyboard({
        id: b.base,
        script: b.script,
        path: `release/${b.group}/${b.base}`,
        targets: ["windows"],
        displayName: b.displayName,
        version: "1.0",
        languages: ["en"],
      });
      const svc = createScaffolderService({ proxyBase: PROXY, fetchImpl: corpusFetch as never });
      const { vfs } = await svc.scaffold(kb, KBID, b.displayName);
      const kmn = readVfsText(vfs, `source/${KBID}.kmn`) ?? "";
      expect(kmn).not.toBe("");
      const work = createVirtualFS(
        vfs.list().flatMap((p) => {
          const e = vfs.get(p);
          return e === undefined ? [] : [{ path: p, content: e.content, isBinary: typeof e.content !== "string" }];
        }),
      );
      projectWorkingCopyVfs({
        vfs: work,
        keyboardId: KBID,
        startIr: parseKmn(kmn, KBID).ir,
        deletedNodeIds: new Set(),
        assignments: [],
        getPattern: () => undefined,
        identity: { bcp47: "en" },
        capsHandling: { mode: "cased-keys" },
      });
      const touchPath = `source/${KBID}.keyman-touch-layout`;
      const touch = readVfsText(work, touchPath);
      expect(touch, "the copy carries a touch layout").toBeDefined();
      const result = checkTouchCapsLayer(parseTouchLayoutString(touch!), touchPath, { bcp47: "en" });
      expect(result.findings.map((f) => f.message)).toEqual([]);
    }, 60_000);
  }
});
