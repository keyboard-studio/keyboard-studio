// E2E: Preview longpress popup — a top-row longpress must paint above the OSK.
//
// Matthew's report (2026-11-11): in the Preview, a longpress on the top row
// was hidden under the text UI. The autosuggest bar that normally gives the
// popup room inside the box is absent — no predictive-text model is
// configured, so KMW's banner is 0px and the top row sits flush with the
// box top — and the popup paints entirely ABOVE the OSK box's top edge. The
// frame's #osk-host-frame carried overflow:hidden, a leftover from the
// Keyman Developer debug-host scaffold whose device mockup is long gone, so
// the popup was clipped away completely.
//
// This spec walks to the Touch gallery preview with sil_cameroon_qwerty,
// holds a top-row key that carries longpress alternatives, and asserts the
// popup is really painting: the element at the popup's centre must be inside
// #kmw-popup-keys (before the fix it resolved to the frame body — clipped
// away), and the popup's rect must extend above the OSK box top.
//
// Run (dev server on http://localhost:5273; playwright.config.ts starts
// one if none is running):
//   cd packages/studio && npx playwright test preview-longpress-popup.spec.ts
//
// This is a full authoring walk (~2 min), so it runs in the nightly full
// set only, not the PR quick slice (docs/tooling.md, "Adding a walk").

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
  driveOskEditor,
  seedReturningVisitor,
} from "./helpers/surveyFlow";

const OSK_FRAME_SELECTOR = 'iframe[src="/osk-frame.html"]';
const START_KEYBOARD_ID = "sil_cameroon_qwerty";

/** KMW's OSK stylesheet/font, served from the same hardcoded CDN URL the
 *  frame itself documents as [TEMP] in public/osk-frame.html. Fetched once
 *  with node fetch and served back through Playwright routes so the spec is
 *  hermetic against CDN outages (and against sandboxed browsers that cannot
 *  reach s.keyman.com at all — without the stylesheet the keys render
 *  unstyled and stacked, and no longpress popup ever appears). If the fetch
 *  fails, no routes are registered and the frame loads the assets from the
 *  CDN directly, as it does in production. */
async function serveKmwOskAssets(page: Page): Promise<void> {
  const assets = [
    { match: "kmwosk.css", url: "https://s.keyman.com/kmw/engine/18.0.245/osk/kmwosk.css", type: "text/css" },
    { match: "globe-hint.css", url: "https://s.keyman.com/kmw/engine/18.0.245/osk/globe-hint.css", type: "text/css" },
    { match: "keymanweb-osk.ttf", url: "https://s.keyman.com/kmw/engine/18.0.245/osk/keymanweb-osk.ttf", type: "font/ttf" },
  ] as const;
  try {
    const bodies = await Promise.all(
      assets.map(async (a) => ({ ...a, body: Buffer.from(await (await fetch(a.url)).arrayBuffer()) })),
    );
    for (const a of bodies) {
      await page.route((url) => url.href.includes(a.match), (route) =>
        route.fulfill({ contentType: a.type, body: a.body }),
      );
    }
  } catch {
    // No local copies — the frame falls back to the CDN.
  }
}

type TopRowKey = {
  keyId: string;
  text: string;
  rect: { top: number; bottom: number; left: number; right: number; width: number; height: number };
};

/** Painted top-row keys of the live OSK, with their longpress alternatives
 *  read off KMW's own key spec (spec.longpress / spec.sk). KMW renders every
 *  layer's keys in the DOM, so only keys that actually paint count. */
async function topRowKeys(page: Page): Promise<{ keys: TopRowKey[]; boxTop: number }> {
  const frame = page.frame({ url: /osk-frame\.html/ });
  expect(frame, "OSK frame must be attached").not.toBeNull();
  return frame!.evaluate(() => {
    const isPainted = (el: Element): boolean => {
      if (!(el as HTMLElement).offsetParent && getComputedStyle(el).position !== "fixed") return false;
      let n: Element | null = el;
      while (n) {
        const cs = getComputedStyle(n);
        if (cs.visibility === "hidden" || cs.display === "none") return false;
        n = n.parentElement;
      }
      return true;
    };
    const hasLongpress = (el: Element): boolean => {
      try {
        const spec = (el as unknown as { key?: { spec?: { longpress?: unknown; sk?: unknown[] } } }).key?.spec;
        return Boolean(spec?.longpress || (spec?.sk && spec.sk.length));
      } catch {
        return false;
      }
    };
    const box = document.querySelector(".kmw-osk-frame");
    const boxTop = box ? box.getBoundingClientRect().top : Number.NaN;
    const keys = [...document.querySelectorAll(".kmw-key")].filter(isPainted);
    const tops = keys.map((k) => k.getBoundingClientRect().top);
    const minTop = Math.min(...tops);
    const topRow = keys
      .filter((k) => k.getBoundingClientRect().top - minTop < 12)
      .filter(hasLongpress)
      .map((k) => {
        const b = k.getBoundingClientRect();
        return {
          keyId: (k as unknown as { keyId: string }).keyId,
          text: (k.textContent ?? "").trim(),
          rect: { top: b.top, bottom: b.bottom, left: b.left, right: b.right, width: b.width, height: b.height },
        };
      });
    return { keys: topRow, boxTop };
  });
}

/** While a key is held, what the popup is doing: its rect, and which element
 *  hit-testing finds at its centre. A clipped popup still has a layout rect
 *  — only the hit-test proves it paints. */
async function popupWhileHolding(page: Page): Promise<{
  popup: { top: number; bottom: number; left: number; right: number } | null;
  elAtCentreInsidePopup: boolean;
  elAtCentre: string | null;
}> {
  const frame = page.frame({ url: /osk-frame\.html/ });
  expect(frame, "OSK frame must be attached").not.toBeNull();
  return frame!.evaluate(() => {
    const p = document.querySelector("#kmw-popup-keys");
    if (!p) return { popup: null, elAtCentreInsidePopup: false, elAtCentre: null };
    const b = p.getBoundingClientRect();
    const el = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
    return {
      popup: { top: b.top, bottom: b.bottom, left: b.left, right: b.right },
      elAtCentreInsidePopup: el ? el.closest("#kmw-popup-keys") !== null : false,
      elAtCentre: el ? `${el.tagName.toLowerCase()}#${el.id || ""}.${String(el.className).slice(0, 50)}` : null,
    };
  });
}

test.describe("Preview longpress popup", () => {
  test("top-row longpress popup paints above the OSK box", async ({ page }) => {
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
    await driveOskEditor(page);

    // Touch seed source: accept the default (import & adapt), confirm.
    await page.getByTestId("seed-source-confirm").click();
    // Touch gallery intro splash.
    const startButton = page.getByRole("button", { name: "Start the touch gallery" });
    if (await startButton.waitFor({ state: "visible", timeout: 15_000 }).then(() => true).catch(() => false)) {
      await startButton.click();
    }

    // The live preview: wait for the OSK to render real keys.
    const oskFrame = page.frameLocator(OSK_FRAME_SELECTOR);
    await oskFrame.locator(".kmw-key:not(.kmw-key-hidden)").first().waitFor({ timeout: 120_000 });

    const { keys, boxTop } = await topRowKeys(page);
    expect(keys.length, "expected a top-row key with longpress alternatives").toBeGreaterThan(0);
    const key = keys[0] as TopRowKey;
    expect(key.rect.top, "top-row key must sit at the OSK box top").toBeGreaterThanOrEqual(boxTop - 12);

    // Hold the key (KMW's longpress delay is 500ms) and probe the popup
    // while it is up — it vanishes on release.
    const iframeBox = await page.locator(OSK_FRAME_SELECTOR).boundingBox();
    expect(iframeBox, "OSK iframe must have a bounding box").not.toBeNull();
    const cx = (iframeBox as NonNullable<typeof iframeBox>).x + key.rect.left + key.rect.width / 2;
    const cy = (iframeBox as NonNullable<typeof iframeBox>).y + key.rect.top + key.rect.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.waitForTimeout(900);
    const held = await popupWhileHolding(page);
    await page.mouse.up();

    expect(held.popup, `expected a longpress popup while holding ${key.keyId}`).not.toBeNull();
    const popup = held.popup as NonNullable<typeof held.popup>;
    expect(
      popup.top,
      "popup must extend above the OSK box top (it has no autosuggest bar to sit in)",
    ).toBeLessThan(boxTop);
    expect(
      held.elAtCentreInsidePopup,
      `popup must actually paint at its centre (hit-test found ${held.elAtCentre ?? "nothing"} — ` +
        "a clipped popup keeps its layout rect but paints nothing)",
    ).toBe(true);
  });
});
