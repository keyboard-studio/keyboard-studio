// Corpus sweep for swallowUndefined (spec 109 SC-002, SC-006).
//
// For every `.kmn` under the sibling keymanapp/keyboards checkout
// (`../keyboards/release`) whose source the codec parses, with "Do nothing"
// confirmed for every class:
//
//   1. no unhandled printable position on a covered layer is left (the store's
//      one `any()` rule binds every one of them),
//   2. every frame key and every original rule is untouched, the store holds no
//      frame key, and no `nomatch > nul` rule appears,
//   3. the emitted source adds no Layer A/B finding and no behaviour-owned
//      `nul` on text context, and
//   4. it compiles through kmcmplib with no more error diagnostics than the
//      untouched source (several corpus keyboards need sibling files or fail
//      standalone; the swallow must not make any of them worse).
//
// An unconfirmed draft's output is also pinned byte-equal to the single-value
// output it replaced (SC-006).
//
// When `../keyboards` is absent every test is skipped, the same convention as
// the other corpus suites. A skip is not a pass: run it locally with
//
//   pnpm --filter @keyboard-studio/engine exec vitest run --config vitest.corpus.config.ts swallowUndefined.corpus

import { afterAll, describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createVirtualFS, uniformFallbackPolicy, type KeyboardIR } from "@keyboard-studio/contracts";
import { emit } from "../codec/emit.js";
import { parse } from "../codec/parse.js";
import { compile } from "../compiler/index.js";
import { runAllChecks } from "../validator/index.js";
import { checkBehaviourNulOnTextContext } from "../validator/layer-a-prime.js";
import { deriveCarvedIr } from "./carvePipeline.js";
import { applySwallowUndefined, SWALLOW_UNDEFINED_OWNER } from "./swallowUndefined.js";
import { enumerateUnhandledPositions } from "./unhandledPositions.js";

const __dir = dirname(fileURLToPath(import.meta.url));
const RELEASE_ROOT = resolve(__dir, "../../../../../keyboards/release");
const available = existsSync(RELEASE_ROOT);

const BINARY_EXTS = new Set([".ico", ".ttf", ".otf", ".woff", ".woff2", ".png", ".jpg", ".jpeg", ".gif", ".bmp"]);
const FRAME_KEYS = ["K_BKSP", "K_ENTER", "K_TAB", "K_ESC", "K_DEL", "K_SPACE", "K_LEFT", "K_RIGHT", "K_UP", "K_DOWN"];
const ALL_SWALLOW = uniformFallbackPolicy("swallow");

interface Entry {
  id: string;
  sourceDir: string;
}

function listCorpus(): Entry[] {
  if (!available) return [];
  const out: Entry[] = [];
  for (const shard of readdirSync(RELEASE_ROOT)) {
    const shardDir = join(RELEASE_ROOT, shard);
    if (!statSync(shardDir).isDirectory()) continue;
    for (const id of readdirSync(shardDir)) {
      const sourceDir = join(shardDir, id, "source");
      if (existsSync(join(sourceDir, `${id}.kmn`))) out.push({ id, sourceDir });
    }
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

function loadSourceFiles(sourceDir: string, replaceKmn: { id: string; text: string }) {
  return readdirSync(sourceDir, { withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => {
      const ext = e.name.slice(e.name.lastIndexOf(".")).toLowerCase();
      const isBinary = BINARY_EXTS.has(ext);
      const isKmn = e.name === `${replaceKmn.id}.kmn`;
      return {
        path: `source/${e.name}`,
        content: isKmn
          ? replaceKmn.text
          : isBinary
            ? new Uint8Array(readFileSync(join(sourceDir, e.name)))
            : readFileSync(join(sourceDir, e.name), "utf8"),
        isBinary: isBinary && !isKmn,
      };
    });
}

async function errorCount(entry: Entry, kmn: string): Promise<number> {
  const vfs = createVirtualFS(loadSourceFiles(entry.sourceDir, { id: entry.id, text: kmn }));
  try {
    const result = await compile(vfs, entry.id);
    return result.diagnostics.filter((d) => d.severity === "error" || d.severity === "fatal").length;
  } catch {
    // A compiler throw is the same outcome before and after; count it once.
    return 1;
  }
}

const errorFindings = (kmn: string) =>
  runAllChecks(kmn).filter((f) => f.severity === "error" || f.severity === "fatal").length;

const stats = { total: 0, parsed: 0, parseFailed: 0, swallowed: 0, noKeyedGroup: 0, compiled: 0 };

describe.skipIf(!available)("swallowUndefined corpus sweep", () => {
  const corpus = listCorpus();

  afterAll(() => {
    console.log(`[swallowUndefined.corpus] ${JSON.stringify(stats)}`);
  });

  it("finds a corpus", () => {
    expect(corpus.length).toBeGreaterThan(0);
  });

  it(
    "suppresses every unhandled printable position, keeps frame keys and original rules, and compiles",
    async () => {
      for (const entry of corpus) {
        stats.total += 1;
        const text = readFileSync(join(entry.sourceDir, `${entry.id}.kmn`), "utf8");
        let ir: KeyboardIR;
        try {
          ir = parse(text, entry.id).ir;
        } catch {
          stats.parseFailed += 1;
          continue;
        }
        stats.parsed += 1;

        const out = applySwallowUndefined(ir, { policy: ALL_SWALLOW, leaks: [] });
        const ownedRules = out.groups.flatMap((g) => g.rules).filter((r) => r.ownedByBehaviour === SWALLOW_UNDEFINED_OWNER);
        const ownedStores = out.stores.filter((s) => s.ownedByBehaviour === SWALLOW_UNDEFINED_OWNER);
        if (ownedRules.length === 0) {
          // Nothing emitted: every covered position was already handled, or there is no keyed entry group.
          expect(ownedStores).toHaveLength(0);
          expect(out).toEqual(ir);
          continue;
        }
        stats.swallowed += 1;

        // One store, one nul rule, no nomatch added, no frame key in the store.
        expect(ownedRules, entry.id).toHaveLength(1);
        // One store the rule reads; a long position list is split into part stores it pulls in.
        const anyRef = ownedRules[0]?.context.find((el) => el.kind === "any");
        expect(ownedStores.filter((st) => anyRef?.kind === "any" && st.name === anyRef.storeRef), entry.id).toHaveLength(1);
        expect(ownedRules[0]?.output).toEqual([{ kind: "nul" }]);
        const before = ir.groups.flatMap((g) => g.rules);
        const after = out.groups.flatMap((g) => g.rules).filter((r) => r.ownedByBehaviour !== SWALLOW_UNDEFINED_OWNER);
        expect(after, entry.id).toEqual(before);
        const nomatchBefore = before.filter((r) => r.matchKind === "nomatch").length;
        expect(out.groups.flatMap((g) => g.rules).filter((r) => r.matchKind === "nomatch").length).toBe(nomatchBefore);
        const storeText = JSON.stringify(ownedStores.map((st) => st.items));
        for (const frame of FRAME_KEYS) expect(storeText, `${entry.id} ${frame}`).not.toContain(`"${frame}"`);

        // SC-002: nothing printable is left unhandled on a covered layer.
        expect(
          enumerateUnhandledPositions(out).filter((p) => p.layerBound),
          entry.id,
        ).toEqual([]);

        // Layer A/B and Layer A' on the emitted source add nothing.
        const kmn = emit(out);
        expect(errorFindings(kmn), `${entry.id} Layer A/B`).toBeLessThanOrEqual(errorFindings(emit(ir)));
        expect(checkBehaviourNulOnTextContext(out), entry.id).toEqual([]);

        // kmcmplib: no more errors than the untouched source.
        const errsBefore = await errorCount(entry, emit(ir));
        const errsAfter = await errorCount(entry, kmn);
        stats.compiled += 1;
        expect(errsAfter, `${entry.id} kmcmplib`).toBeLessThanOrEqual(errsBefore);
      }
      // Not vacuous: most of the corpus parses, takes the swallow store, and compiles.
      expect(stats.parsed).toBeGreaterThan(100);
      expect(stats.compiled).toBe(stats.swallowed);
      expect(stats.swallowed).toBeGreaterThan(100);
    },
    3_600_000,
  );

  it(
    "an unconfirmed draft's output is byte-equal to the single-value output it replaced (SC-006)",
    () => {
      let checked = 0;
      for (const entry of corpus) {
        let ir: KeyboardIR;
        try {
          ir = parse(readFileSync(join(entry.sourceDir, `${entry.id}.kmn`), "utf8"), entry.id).ir;
        } catch {
          continue;
        }
        const first = ir.groups.flatMap((g) => g.rules).find((r) => r.ownedByBehaviour === undefined);
        const carve = first === undefined ? new Set<string>() : new Set([first.nodeId]);
        const input = { deletedNodeIds: carve, deletedItemIds: new Set<string>() };
        const perClass = deriveCarvedIr(ir, { ...input, fallbackPolicy: ALL_SWALLOW });
        const single = deriveCarvedIr(ir, { ...input, fallbackPolicy: "swallow" });
        expect(emit(perClass.ir), entry.id).toBe(emit(single.ir));
        checked += 1;
      }
      expect(checked).toBeGreaterThan(0);
    },
    600_000,
  );
});
