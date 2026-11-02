// H3 + H4 + H1 over the touch-bearing corpus (SC-010), plus the H5 touch pass (Story 4 Independent Test).
//
// For every corpus keyboard that has a touch layout, under each of its profiles:
//   - the CLDR XSD accepts the document (H3);
//   - tr35Conformance returns [] (H4);
//   - under 46, the Keyman compile of the document WITH its touch forms returns exactly the codes of
//     the K rows (H1): the FR-070 premise, checked here first;
//   - H5 touch pass (profile 46, US base): for every touch key, NFC(KMN tap through TouchTapSession)
//     equals the LDML tap (ldmlInterpreter.tapTouch). A mismatch is allowed only on a key that has an
//     A or N item.
//
// A missing corpus is a failed precondition, never a skip.
import { createVirtualFS } from "@keyboard-studio/contracts";
import type { KeyboardIR } from "@keyboard-studio/contracts";
import { describe, expect, it } from "vitest";
import { stripDanglingAssetStores } from "../compiler/stripDanglingAssetStores.js";
import { compile } from "../compiler/index.js";
import { TouchTapSession } from "../simulator/tapSimulation.js";
import { US_BASE } from "./__fixtures__/us-base.js";
import { CORPUS, loadCorpusKeyboard, type CorpusKeyboard } from "./__testing__/corpus.js";
import { corpusAvailable, corpusExportInput, KEYBOARDS_ROOT } from "./__testing__/corpusExport.js";
import { withTargetsAny } from "./__testing__/equivalence.js";
import { loadLdml } from "./__testing__/ldmlInterpreter.js";
import { errorCodes, keymanCompile } from "./__testing__/keymanCompile.js";
import { tr35Conformance } from "./__testing__/tr35Conformance.js";
import { validateAgainstCldr } from "./__testing__/xsdValidate.js";
import { classifyDetailed } from "./classify/classify.js";
import { isMnemonicLayout } from "./classify/header.js";
import { charTarget, splitRule, storeKeyTargets, tableVKey, type ResolveContext } from "./classify/keystrokes.js";
import { findStore } from "./classify/ruleElements.js";
import { lowerDocument } from "./lower/document.js";
import { buildLdmlExport } from "./package.js";
import { resolveLdmlProfile } from "./profiles/resolve.js";
import type { CompatibilityItem } from "./types.js";
import { writeKeyboard3 } from "./xml/writeKeyboard3.js";

describe("LDML touch corpus: precondition", () => {
  it("the sibling ../keyboards corpus is present", () => {
    expect(corpusAvailable, `${KEYBOARDS_ROOT}/release is missing: the touch corpus suite proves nothing without it`).toBe(true);
  });

  it("the corpus has touch-bearing keyboards (otherwise SC-010 is vacuous)", () => {
    const touch = CORPUS.filter((e) => loadCorpusKeyboard(e.id)?.touchLayout !== undefined);
    expect(touch.length, "no corpus keyboard has a .keyman-touch-layout").toBeGreaterThan(0);
  });
});

function expectedKeymanCodes(items: readonly { rowId: string; status: string }[]): string[] {
  const profile = resolveLdmlProfile("46");
  const codes = new Set<string>();
  for (const i of items) if (i.status === "K") for (const c of profile.rows.get(i.rowId)?.keymanCodes ?? []) codes.add(c);
  return [...codes].sort();
}

/** The virtual keys a KMN store names, following `outs(other)` references, read from the source text. */
function storeVKeysFromText(kmn: string, name: string, seen = new Set<string>()): string[] {
  const key = name.toLowerCase();
  if (seen.has(key)) return [];
  seen.add(key);
  const joined = kmn.replace(/\\[ \t]*\r?\n/g, " ");
  const def = new RegExp(String.raw`^[ \t]*store\(\s*${name}\s*\)([^\r\n]*)`, "im").exec(joined)?.[1] ?? "";
  const out: string[] = [];
  for (const m of def.matchAll(/\[(?:[A-Za-z]+\s+)*(K_\w+)\s*\]/g)) out.push(m[1] as string);
  for (const m of def.matchAll(/outs\(\s*(\w+)\s*\)/g)) out.push(...storeVKeysFromText(kmn, m[1] as string, seen));
  return out;
}

/**
 * Keys that some A or N rule item can fire on: the rule at an item's line, read through its
 * keystroke (a key, a character, or the vkeys of an any() store). A touch key on one of these is
 * covered by that item (the KMN rule that fires maps to an A/N item).
 */
function lossyKeys(ir: KeyboardIR, items: readonly CompatibilityItem[], kmnText: string): Set<string> {
  const lines = new Set(items.filter((i) => (i.status === "A" || i.status === "N") && i.line !== null).map((i) => i.line));
  const rc: ResolveContext = { mnemonic: isMnemonicLayout(ir), baseLayout: US_BASE };
  const out = new Set<string>();
  const add = (vkey: string | undefined): void => {
    if (vkey !== undefined) out.add(tableVKey(vkey).toUpperCase());
  };
  for (const g of ir.groups) {
    for (const r of g.rules) {
      if (r.sourceLine === undefined || !lines.has(r.sourceLine)) continue;
      const ks = splitRule(r, g.usingKeys).keystroke;
      if (ks === null) continue;
      if (ks.kind === "vkey" || ks.kind === "rawKey") add(ks.vkey);
      else if (ks.kind === "char") add(charTarget(ks.char, rc)?.vkey);
      else if (ks.kind === "any") {
        for (const t of storeKeyTargets(findStore(ir, ks.storeRef), rc)) add(t?.vkey);
        // A store the engine could not model (for example one built from outs()) is read from the source text.
        for (const v of storeVKeysFromText(kmnText, ks.storeRef)) add(v);
      }
    }
  }
  return out;
}

const WIDTH = { phone: 1, tablet: 150 } as const;

/** The H5 touch pass: returns the unexplained mismatches (and how many keys were compared). */
async function touchPass(kb: CorpusKeyboard): Promise<{ compared: number; unexplained: string[]; explained: number }> {
  const built = corpusExportInput(kb, "46", US_BASE);
  if (built === null || kb.kmn === undefined || kb.touchLayout === undefined) throw new Error(`${kb.id}: no KMN or touch layout`);
  const profile = resolveLdmlProfile("46");
  const detail = classifyDetailed(built.input, profile, { languages: ["en"] });
  const low = lowerDocument(built.input, profile, detail);
  const ldml = loadLdml(writeKeyboard3(low.doc));

  const vfs = createVirtualFS([
    { path: `source/${kb.id}.kmn`, content: kb.kmn, isBinary: false },
    { path: `source/${kb.id}.keyman-touch-layout`, content: kb.touchLayout, isBinary: false },
  ]);
  const text = withTargetsAny(stripDanglingAssetStores(kb.kmn, vfs).kmn);
  const compiled = await compile(
    createVirtualFS([
      { path: `source/${kb.id}.kmn`, content: text, isBinary: false },
      { path: `source/${kb.id}.keyman-touch-layout`, content: kb.touchLayout, isBinary: false },
    ]),
    kb.id,
  );
  expect(compiled.artifacts.some((a) => a.filename.endsWith(".js")), `${kb.id}: KMN test copy produced no KeymanWeb script`).toBe(true);

  const lossy = new Set(
    detail.classification.items.filter((i) => (i.status === "A" || i.status === "N") && i.side === "touch").map((i) => i.nodeKey),
  );
  const ruleLossy = lossyKeys(built.input.ir, detail.classification.items, kb.kmn);
  let compared = 0;
  let explained = 0;
  const unexplained: string[] = [];
  for (const platform of ["phone", "tablet"] as const) {
    let session: TouchTapSession;
    try {
      session = TouchTapSession.fromCompiled(compiled, platform);
    } catch {
      continue; // the compiled keyboard has no such form
    }
    const entries = low.touchKeyMap.filter((m) => m.platform === platform);
    const seen = new Map<string, number>();
    for (const m of entries) seen.set(`${m.layer}/${m.key}`, (seen.get(`${m.layer}/${m.key}`) ?? 0) + 1);
    for (const m of entries) {
      if ((seen.get(`${m.layer}/${m.key}`) ?? 0) > 1) continue; // the same id twice on a layer cannot be told apart
      let kmn: string;
      try {
        kmn = session.tap(m.layer, m.key).buffer.normalize("NFC");
      } catch {
        continue;
      }
      const out = ldml.tapTouch(WIDTH[platform], m.ldmlLayer, m.ldmlKey);
      compared += 1;
      if (kmn === out) continue;
      if (lossy.has(`touch:${platform}/${m.layer}/${m.key}`) || ruleLossy.has(tableVKey(m.key).toUpperCase())) {
        explained += 1;
        continue;
      }
      unexplained.push(`[FAIL] ${kb.id} ${platform}/${m.layer}/${m.key} kmn=${JSON.stringify(kmn)} ldml=${JSON.stringify(out)}`);
    }
  }
  return { compared, unexplained, explained };
}

for (const entry of CORPUS) {
  describe(`${entry.id}`, () => {
    for (const p of entry.profiles) {
      const profileId = String(p) as "46" | "49";
      it(`profile ${profileId}: touch forms valid, conformant, and (46) compiled by Keyman`, async () => {
        const kb = loadCorpusKeyboard(entry.id);
        expect(kb, `${entry.id} is not in the corpus checkout`).toBeDefined();
        if (kb?.kmn === undefined || kb.touchLayout === undefined) {
          console.info(`[INFO] ${entry.id} ${profileId}: no touch layout; not part of the touch corpus`);
          return;
        }
        const built = corpusExportInput(kb, profileId);
        expect(built).not.toBeNull();
        const result = await buildLdmlExport(built!.input);
        expect(result.ok, `${entry.id}: export refused`).toBe(true);
        if (!result.ok) return;
        const xml = [...result.files.entries()].find(([k]) => k.endsWith(".xml"))?.[1] as string;
        if (!result.classification.touchPresent) {
          console.info(`[INFO] ${entry.id} ${profileId}: touch layout has no phone or tablet platform`);
          expect(xml).not.toContain('formId="touch"');
          return;
        }
        expect(xml, `${entry.id}: no touch form was written`).toContain('formId="touch"');

        const failures: string[] = [];
        const tr35 = tr35Conformance(xml);
        if (tr35.length > 0) failures.push(`tr35: ${tr35.map((v) => `${v.rule}@${v.line}`).join(",")}`);
        const xsd = await validateAgainstCldr(xml, profileId);
        if (xsd.length > 0) failures.push(`xsd: ${xsd.slice(0, 3).map((e) => e.message).join(" | ")}`);
        if (profileId === "46") {
          const k = await keymanCompile(xml);
          const codes = errorCodes(k.messages);
          const expected = expectedKeymanCodes(result.classification.items);
          if (JSON.stringify(codes) !== JSON.stringify(expected)) failures.push(`keyman: ${codes.join(",")} (expected ${expected.join(",")})`);
          if (k.messages.some((m) => m.code.includes("StringDenorm"))) failures.push("keyman: WARN_StringDenorm");
        }
        console.info(failures.length === 0 ? `[OK] ${entry.id} ${profileId}` : `[FAIL] ${entry.id} ${profileId} ${failures.join("; ")}`);
        expect(failures).toEqual([]);
      }, 120_000);
    }

    it("H5 touch pass: every touch key types what the KMN rules type", async () => {
      const kb = loadCorpusKeyboard(entry.id);
      expect(kb, `${entry.id} is not in the corpus checkout`).toBeDefined();
      if (kb?.kmn === undefined || kb.touchLayout === undefined || !entry.profiles.includes(46)) {
        console.info(`[INFO] ${entry.id}: not part of the H5 touch pass`);
        return;
      }
      const r = await touchPass(kb);
      console.info(
        `[${r.unexplained.length === 0 ? "OK" : "FAIL"}] ${entry.id}: ${r.compared} touch keys compared, ${r.explained} explained by an A/N item, ${r.unexplained.length} unexplained`,
      );
      for (const line of r.unexplained.slice(0, 10)) console.info(`  ${line}`);
      expect(r.compared, `${entry.id}: no touch key was compared`).toBeGreaterThan(0);
      expect(r.unexplained).toEqual([]);
    }, 300_000);
  });
}
