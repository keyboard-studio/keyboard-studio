// E2E: Documentation code view height — the Code mode Monaco pane must
// fill the available page height on desktop.
//
// Matthew's report (2026-11-11): on the Documentation step, switching to
// Code mode shows only a short strip of Monaco, a few lines tall, that does
// not fill the page.
//
// The collapse (measured at 1920x1080 on the unfixed tree — see the
// chain this spec logs): HtmlEditor's tree row uses
// alignItems:"flex-start", so the right column is content-height instead
// of stretched to the row (row 809px, right column 95px in Write mode
// before TipTap loads; 5268px once its content lays out — the column
// follows content, never the row). Every flex:1 below it then has no free
// space to grow into, and the code pane bottoms out at its min-heights
// (300px code branch, 200px Monaco wrapper). The fix stretches the right
// column (alignSelf:"stretch") and gives HtmlCodePane the CssCodePane root
// (flex:1, minHeight:0); the file tree's bordered box must NOT stretch
// with it.
//
// MEASURED BOX: the Monaco wrapper (bordered div around the editor), not
// `.monaco-editor` itself — see docsGeometry's header for why (the CDN
// Monaco core cannot load in this sandbox's browser).
//
// This is a full authoring walk (~6 min), so it runs in the nightly full
// set only, not the PR quick slice (docs/tooling.md, "Adding a walk").
//
// Run (dev server on http://localhost:5273; playwright.config.ts starts
// one if none is running):
//   cd packages/studio && npx playwright test docs-code-height.spec.ts

import { test, expect, type Page } from "playwright/test";
import {
  driveIdentityLite,
  pickStartKeyboard,
  confirmCopyTrack,
  driveAttributionStep,
  acceptProjectName,
  confirmPrefill,
  buildOneCharacterList,
  driveDeadkeysStep,
  driveMechanismsGallery,
  driveTouchGallery,
  drivePhaseFToGate,
  seedReturningVisitor,
  surveyAdvance,
} from "./helpers/surveyFlow";
import { serveKmwOskAssets } from "./helpers/kmwAssets";

const START_KEYBOARD_ID = "sil_cameroon_qwerty";

test.use({ viewport: { width: 1920, height: 1080 } });

type Box = { width: number; height: number; top: number };
type ChainLink = {
  depth: number;
  tag: string;
  height: number;
  display: string;
  alignItems: string;
  minHeight: string;
  flexGrow: string;
};

type DocsGeometry = {
  viewport: { width: number; height: number };
  root: Box;
  treeRow: Box & { alignItems: string };
  tree: Box;
  rightCol: Box;
  editorFlex: Box;
  codeBranch: Box | null;
  paneRoot: Box | null;
  monacoWrapper: Box | null;
  monaco: Box | null;
  richBox: Box | null;
  chain: ChainLink[];
};

/**
 * Measure the Documentation step's layout chain.
 *
 * - Rich mode: the leaf is the TipTap editor (`.tiptap`).
 * - Code mode: the leaf is the Monaco wrapper — the bordered div around the
 *   editor (min-height 200px), found from the pane's Apply button. It is the
 *   user-visible code area, and it exists as soon as the pane mounts, whether
 *   or not Monaco's editor core has loaded: HtmlCodePane (like CssCodePane)
 *   loads Monaco from a CDN at runtime, and this sandbox's browser cannot
 *   reach it (ERR_TUNNEL_CONNECTION_FAILED — curl reaches it fine), so
 *   `.monaco-editor` never appears locally. On CI (direct internet) it does,
 *   and it fills the wrapper 1:1 (Editor height="100%"), so the wrapper
 *   height is the same number in both places. When `.monaco-editor` IS
 *   present its height is recorded too.
 */
async function docsGeometry(page: Page, mode: "rich" | "code"): Promise<DocsGeometry> {
  return page.evaluate(
    ({ mode: m }) => {
      const boxOfLocal = (el: Element | null) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { width: r.width, height: r.height, top: r.top };
      };
      const h1 = [...document.querySelectorAll("h1")].find((h) => h.textContent === "Documentation");
      if (!h1) throw new Error("Documentation heading not found");
      const root = h1.parentElement!;
      const tree = document.querySelector('[role="tree"]');
      if (!tree) throw new Error("file tree not found");
      const treeRow = tree.parentElement!;
      const rightCol = tree.nextElementSibling as HTMLElement;
      const cs = (el: Element) => getComputedStyle(el);
      // The leaf: TipTap in rich mode; the Monaco wrapper (via the pane's
      // Apply button: status bar -> pane root -> first child) in code mode.
      let leaf: Element | null = null;
      if (m === "rich") {
        leaf = document.querySelector(".tiptap");
      } else {
        const applyBtn = [...document.querySelectorAll("button")].find(
          (b) => b.textContent?.trim() === "Apply",
        );
        if (!applyBtn) throw new Error("Apply button not found");
        const paneRoot = applyBtn.parentElement?.parentElement ?? null;
        leaf = paneRoot?.firstElementChild ?? null;
      }
      if (!leaf) throw new Error(`leaf element not found in ${m} mode`);
      // The editor/preview flex div: the right column's child that holds
      // the leaf.
      let editorFlex: Element | null = null;
      {
        let n: Element | null = leaf;
        while (n && n.parentElement !== rightCol) n = n.parentElement;
        editorFlex = n;
      }
      // Named ancestors of the leaf, by their min-height signatures.
      const ancestorWithMinHeight = (min: string): Element | null => {
        let n: Element | null = leaf;
        while (n) {
          if (cs(n).minHeight === min) return n;
          n = n.parentElement;
        }
        return null;
      };
      const codeBranch = ancestorWithMinHeight("300px");
      const monacoWrapper = ancestorWithMinHeight("200px");
      const chain: Array<{
        depth: number;
        tag: string;
        height: number;
        display: string;
        alignItems: string;
        minHeight: string;
        flexGrow: string;
      }> = [];
      let n: Element | null = leaf;
      let depth = 0;
      while (n && depth < 10) {
        const s = cs(n);
        chain.push({
          depth,
          tag: n.tagName.toLowerCase(),
          height: n.getBoundingClientRect().height,
          display: s.display,
          alignItems: s.alignItems,
          minHeight: s.minHeight,
          flexGrow: s.flexGrow,
        });
        n = n.parentElement;
        depth++;
      }
      // Rich box: the bordered, scrollable div around the TipTap editor
      // (overflow-y:auto) — NOT .tiptap itself, which carries
      // min-height:280px in the pane's <style> and is always
      // content-height (its parent scrolls). Pre-fix this box was the
      // full laid-out document (page scrolls); post-fix it is
      // viewport-height with an internal scroll.
      const richLeaf = document.querySelector(".tiptap");
      const richBox = richLeaf
        ? (() => {
            let r: Element | null = richLeaf;
            while (r) {
              if (cs(r).overflowY === "auto") return r;
              r = r.parentElement;
            }
            return null;
          })()
        : null;
      return {
        viewport: { width: window.innerWidth, height: window.innerHeight },
        root: boxOfLocal(root)!,
        treeRow: { ...boxOfLocal(treeRow)!, alignItems: cs(treeRow).alignItems },
        tree: boxOfLocal(tree)!,
        rightCol: boxOfLocal(rightCol)!,
        editorFlex: boxOfLocal(editorFlex),
        codeBranch: boxOfLocal(codeBranch),
        paneRoot: codeBranch ? boxOfLocal(codeBranch.firstElementChild) : null,
        monacoWrapper: boxOfLocal(monacoWrapper),
        monaco: boxOfLocal(document.querySelector(".monaco-editor")),
        richBox: boxOfLocal(richBox),
        chain,
      };
    },
    { mode },
  );
}

/**
 * Walk Phase F up to (not past) the Documentation step: the shared
 * Phase F prefix (drivePhaseFToGate — welcome paragraph, font guidance,
 * first usage tip, undecided history entry, more-detail "No" gate),
 * then any remaining optional Phase F questions until the html-continue
 * footer button appears.
 */
async function driveToHtmlStep(page: Page): Promise<void> {
  await drivePhaseFToGate(page);

  // Remaining optional Phase F questions, if any, until Documentation.
  for (let guard = 0; guard < 20; guard++) {
    if (await page.getByTestId("html-continue").isVisible().catch(() => false)) return;
    const next = surveyAdvance(page);
    if (await next.isVisible().catch(() => false)) {
      await expect(next).not.toBeDisabled({ timeout: 15_000 });
      await next.click();
      continue;
    }
    throw new Error(
      `driveToHtmlStep: stuck before the Documentation step (url: ${page.url()}) — ` +
        "no survey-advance or html-continue visible",
    );
  }
  throw new Error("driveToHtmlStep: did not reach the Documentation step within the step budget");
}

test.describe("Documentation code view height", () => {
  test("Code mode Monaco fills the page height at 1920x1080", async ({ page }) => {
    // The walk is longer than the config's 240s cap (touch gallery +
    // help phase on top of the preview-touch-height route).
    test.setTimeout(900_000);
    await serveKmwOskAssets(page);
    await seedReturningVisitor(page);
    await page.goto("/");

    await driveIdentityLite(page, { english: "Test", autonym: "Bafut", script: "Latn" });
    await pickStartKeyboard(page, START_KEYBOARD_ID);
    await confirmCopyTrack(page);
    await driveAttributionStep(page);
    await acceptProjectName(page);
    await confirmPrefill(page);
    await buildOneCharacterList(page, "é");

    // Carve: advance with nothing carved.
    await page.getByTestId("carve-gallery").waitFor({ timeout: 30_000 });
    await page.getByTestId("carve-continue").click();
    await driveDeadkeysStep(page);
    await page.getByTestId("rules-continue").click();
    await driveMechanismsGallery(page);
    await driveTouchGallery(page);
    await driveToHtmlStep(page);

    // Documentation step, default Write (rich) mode — comparison point.
    // TipTap is lazy-loaded: wait for it, or the measurement catches the
    // "Loading editor…" fallback and the column reads near-zero.
    await page.getByRole("heading", { name: "Documentation" }).waitFor({ timeout: 30_000 });
    await page.locator(".tiptap").first().waitFor({ state: "visible", timeout: 120_000 });
    const rich = await docsGeometry(page, "rich");
    // eslint-disable-next-line no-console
    console.log(`RICH richBox=${rich.richBox?.height} rightCol=${rich.rightCol.height} treeRow=${rich.treeRow.height} root=${rich.root.height}`);

    // Switch to Code mode. The pane mounts as soon as the lazy chunk
    // lands (Apply button in its status bar); the Monaco wrapper is the
    // measured box — see docsGeometry's header for why .monaco-editor
    // itself is not the wait target.
    await page.getByRole("button", { name: "Code", exact: true }).click();
    await page.getByRole("button", { name: "Apply" }).waitFor({ state: "visible", timeout: 60_000 });
    await page.waitForTimeout(1_000);

    const geo = await docsGeometry(page, "code");
    // eslint-disable-next-line no-console
    console.log(
      `CODE monaco=${geo.monaco?.height} wrapper=${geo.monacoWrapper?.height} ` +
        `codeBranch=${geo.codeBranch?.height} paneRoot=${geo.paneRoot?.height} ` +
        `editorFlex=${geo.editorFlex?.height} rightCol=${geo.rightCol.height} ` +
        `treeRow=${geo.treeRow.height} tree=${geo.tree.height} root=${geo.root.height}`,
    );
    for (const link of geo.chain) {
      // eslint-disable-next-line no-console
      console.log(
        `  chain[${link.depth}] <${link.tag}> h=${link.height} display=${link.display} ` +
          `alignItems=${link.alignItems} minHeight=${link.minHeight} flexGrow=${link.flexGrow}`,
      );
    }

    // Write mode fills the page too (its bordered box is the full
    // laid-out document pre-fix — ~5100px, page scrolls — and
    // viewport-height with an internal scroll post-fix). This assertion
    // passes pre-fix as well; it guards the fix against breaking Write
    // mode, it is not the RED/GREEN signal (that is the wrapper below).
    expect(rich.richBox, "rich editor box must render").not.toBeNull();
    expect(rich.richBox!.height, `rich box ${rich.richBox!.height} should fill the page`).toBeGreaterThan(400);
    // The code view area: the Monaco wrapper must fill the page, not
    // bottom out at its 200px min-height (pre-fix: exactly 200px).
    expect(geo.monacoWrapper, "Monaco wrapper must render").not.toBeNull();
    expect(geo.monacoWrapper!.height, `Monaco wrapper height ${geo.monacoWrapper!.height} should fill the page, not bottom out at its 200px min-height`).toBeGreaterThan(400);
    // Where the editor core did load (CI), it fills the wrapper 1:1.
    if (geo.monaco !== null) {
      expect(geo.monaco.height, `Monaco editor ${geo.monaco.height} should fill its wrapper ${geo.monacoWrapper!.height}`).toBeGreaterThan(400);
    }
    expect(
      geo.rightCol.height,
      `right column ${geo.rightCol.height} should stretch to the tree row ${geo.treeRow.height}, not sit at content height`,
    ).toBeGreaterThan(geo.treeRow.height * 0.8);
    // The file tree stays compact: its bordered box must NOT stretch to
    // fill the row with the right column.
    expect(
      geo.tree.height,
      `file tree ${geo.tree.height} must stay compact, not stretch to the right column's ${geo.rightCol.height}`,
    ).toBeLessThan(geo.rightCol.height);
  });
});
