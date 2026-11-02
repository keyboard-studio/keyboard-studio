// Test-only: builds an LdmlExportInput from a corpus keyboard (contracts/test-harnesses.md "Corpus").
// Never import this from product code.

import { createVirtualFS } from "@keyboard-studio/contracts";
import type { KeyboardIR, TouchLayoutIR } from "@keyboard-studio/contracts";
import { parse, parseKvks } from "../../codec/index.js";
import { parseTouchLayout } from "../../codec/parse-touch.js";
import { stripDanglingAssetStores } from "../../compiler/stripDanglingAssetStores.js";
import { AZERTY_BASE } from "../__fixtures__/azerty-base.js";
import { US_BASE } from "../__fixtures__/us-base.js";
import type { LdmlBaseLayout, LdmlExportInput, LdmlProfileId } from "../types.js";
import { corpusAvailable, KEYBOARDS_ROOT, type CorpusKeyboard } from "./corpus.js";

export { corpusAvailable, KEYBOARDS_ROOT };

/** The text with dangling asset stores removed, its IR (line numbers rebased) and the touch layout. */
export function prepareCorpusKeyboard(kb: CorpusKeyboard): { ir: KeyboardIR; text: string; touch: TouchLayoutIR | null; lineOffset: number } | null {
  if (kb.kmn === undefined) return null;
  const raw = kb.kmn;
  const stripped = stripDanglingAssetStores(raw, createVirtualFS([])).kmn;
  const text = stripped.replace(/^[ \t]*store\(&(?:LAYOUTFILE|VISUALKEYBOARD|BITMAP|KMW_HELPFILE|KMW_EMBEDJS)\).*$/gim, "c");
  const lines = (t: string): number => t.split(/\r?\n/).length;
  const offset = lines(raw) - lines(text);
  const ir = parse(text, kb.id).ir;
  const shift = <T extends { sourceLine?: number }>(n: T): T => (n.sourceLine === undefined ? n : { ...n, sourceLine: n.sourceLine + offset });
  const rebased: KeyboardIR =
    offset === 0
      ? ir
      : {
          ...ir,
          stores: ir.stores.map(shift),
          comments: ir.comments.map(shift),
          raw: ir.raw.map(shift),
          groups: ir.groups.map((g) => ({ ...shift(g), rules: g.rules.map(shift) })),
        };
  let touch: TouchLayoutIR | null = null;
  if (kb.touchLayout !== undefined) {
    try {
      touch = parseTouchLayout(kb.touchLayout);
    } catch {
      touch = null;
    }
  }
  return { ir: rebased, text, touch, lineOffset: offset };
}

export function baseFor(id: string): LdmlBaseLayout {
  return id === "basic_kbdfr" || id === "sil_cameroon_azerty" ? AZERTY_BASE : US_BASE;
}

export function corpusExportInput(
  kb: CorpusKeyboard,
  profileId: LdmlProfileId,
  base?: LdmlBaseLayout,
): { input: LdmlExportInput; text: string; lineOffset: number } | null {
  const prepared = prepareCorpusKeyboard(kb);
  if (prepared === null) return null;
  const id = kb.id.toLowerCase().replace(/[^a-z0-9_]/g, "_");
  let visual = null;
  if (kb.kvks !== undefined) {
    try {
      visual = parseKvks(kb.kvks);
    } catch {
      visual = null;
    }
  }
  return {
    text: prepared.text,
    lineOffset: prepared.lineOffset,
    input: {
      ir: prepared.ir,
      touchLayout: prepared.touch,
      visualKeyboard: visual,
      baseLayout: base ?? baseFor(kb.id),
      profileId,
      keyboardId: id,
      metadata: {
        projectId: `${id}_ldml`,
        name: prepared.ir.header.name || kb.id,
        version: prepared.ir.header.version || "1.0",
        languages: ["en"],
        author: "Corpus",
        authorEmail: "",
        copyright: prepared.ir.header.copyright,
        licenceName: "MIT",
        description: "",
        homePage: "",
        attributionText: "",
        indicator: null,
      },
      packageFiles: { readmeHtm: "", welcomeHtm: "", licenseMd: "", readmeMd: "", historyMd: "", icon: null, fonts: [] },
      studioVersion: "corpus",
    },
  };
}
