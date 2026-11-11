// SC-006 (spec 117 US6): every key the keyboard does not handle is provisional, and no key the
// author assigned is. Over inline sparse keyboards here; the corpus set is swept in the engine's
// `layout-attribution/provisional.corpus.test.ts`, which needs no studio state.

import { describe, expect, it } from "vitest";
import { attributeLayer, listLayers, parseKmn } from "@keyboard-studio/engine";
import { baseFallbackCells } from "./baseFallbackCells.ts";
import { buildDesktopGridViewModel, countProvisional } from "./desktopGridViewModel.ts";
import { DESKTOP_VKEYS } from "./useLayoutAttribution.ts";
import type { WindowsLayout } from "../../lib/windowsLayouts.ts";

const US: WindowsLayout = { id: "00000409", name: "US", languages: [], family: "qwerty", host: "us" };

const KMN = `store(&VERSION) '10.0'
store(&NAME) 'T'
begin Unicode > use(main)
group(main) using keys
+ [K_A] > 'x'
+ [K_B] > 'y'
+ [SHIFT K_A] > 'X'
`;

function build(markAuthorEdited: boolean) {
  const ir = parseKmn(KMN, "t").ir;
  if (markAuthorEdited) {
    for (const rule of ir.groups[0]!.rules) {
      if ("context" in rule) rule.authorEdit = "layout-tab";
    }
  }
  return ir;
}

describe("SC-006 provenance", () => {
  for (const marked of [false, true]) {
    it(`every unhandled key is provisional and no handled or assigned key is (author-edited: ${marked})`, () => {
      const ir = build(marked);
      for (const layer of listLayers(ir)) {
        const cells = attributeLayer(ir, layer, DESKTOP_VKEYS);
        const view = buildDesktopGridViewModel({
          layer,
          cells,
          state: "ready",
          baseFallback: baseFallbackCells(ir, DESKTOP_VKEYS, layer, [US]),
        }).cells;
        for (const c of view) {
          const where = `${layer.join("+")} ${c.vkey}`;
          expect(c.provisional, where).toBe(!c.frame && c.attribution.unhandled);
          if (c.authorEdit !== undefined) expect(c.provisional, where).toBe(false);
        }
        expect(countProvisional(view)).toBe(cells.filter((c) => !c.frame && c.unhandled).length);
        if (marked && layer.length === 0) {
          expect(view.find((c) => c.vkey === "K_A")).toMatchObject({ authorEdit: "layout-tab", provisional: false });
        }
      }
    });
  }
});
