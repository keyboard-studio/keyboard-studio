// E2E: Preview touch height — the Touch gallery's Mobile KB must keep
// proportionate keys at desktop widths.
//
// Matthew's report (2026-11-11): the touch keyboard is well proportioned on
// the "Choose your touch layout" starting-point page (tablet profile,
// 980x420) but squashed vertically in the Touch gallery (phone profile,
// 320x290, stretched across a ~1000px pane with its height pinned at 290:
// ~90px-wide keys in 58px rows). `oskSizeFor` in public/osk-frame.js scales
// the height down only when the host is narrower than the profile; wider
// hosts keep the profile height ("keys widen, they do not grow taller").
// The fix (`fitTouchHeight` in the same file) grows a touch/tablet box to
// height = width * rows / cols once the layout has rendered, so keys stay
// roughly square — never shrinking, so the phone's designed tall keys at
// phone widths are untouched.
//
// The squash only shows at wide hosts (at the default 1280px viewport the
// gallery pane is ~704px and the keys are already roughly square), so this
// spec runs at 1920x1080. It walks to the Touch gallery preview with
// sil_cameroon_qwerty and asserts the OSK box height matches the layout
// geometry (within 15%) and the median key is roughly square.
//
// Run (dev server on http://localhost:5273; playwright.config.ts starts
// one if none is running):
//   cd packages/studio && npx playwright test preview-touch-height.spec.ts
//
// This is a full authoring walk (~3 min), so it runs in the nightly full
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
import { serveKmwOskAssets } from "./helpers/kmwAssets";

const OSK_FRAME_SELECTOR = 'iframe[src="/osk-frame.html"]';
const START_KEYBOARD_ID = "sil_cameroon_qwerty";

test.use({ viewport: { width: 1920, height: 1080 } });

type OskGeometry = {
  box: { width: number; height: number };
  rows: number;
  cols: number;
  /** Median painted key width / height, default layer only. */
  medianKeyAspect: number;
};

/** Painted-key geometry of the live OSK: box rect, row/column counts of the
 *  visible layer, and the median key aspect. KMW renders every layer's keys
 *  in the DOM, so only keys that actually paint count. */
async function oskGeometry(page: Page): Promise<OskGeometry> {
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
    const boxEl = document.querySelector(".kmw-osk-frame");
    const boxRect = boxEl ? boxEl.getBoundingClientRect() : { width: NaN, height: NaN };
    let rows = 0;
    let cols = 0;
    const aspects: number[] = [];
    for (const row of document.querySelectorAll(".kmw-key-row")) {
      const keys = [...row.querySelectorAll(".kmw-key")].filter(isPainted);
      if (keys.length === 0) continue;
      rows++;
      cols = Math.max(cols, keys.length);
      for (const k of keys) {
        const b = k.getBoundingClientRect();
        if (b.width > 0 && b.height > 0) aspects.push(b.width / b.height);
      }
    }
    aspects.sort((a, b) => a - b);
    const medianKeyAspect = aspects.length > 0 ? aspects[Math.floor(aspects.length / 2)]! : NaN;
    return { box: { width: boxRect.width, height: boxRect.height }, rows, cols, medianKeyAspect };
  });
}

test.describe("Preview touch height", () => {
  test("Mobile KB keys stay roughly square at desktop width", async ({ page }) => {
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
    // fitTouchHeight runs after the view renders; let the box settle.
    await page.waitForTimeout(1_000);

    const geo = await oskGeometry(page);
    expect(geo.rows, "expected the OSK to render rows").toBeGreaterThan(0);
    expect(geo.cols, "expected the OSK to render keys").toBeGreaterThan(0);
    expect(geo.box.width, "expected a wide gallery pane at 1920px").toBeGreaterThan(900);

    // The box height must follow the layout geometry, not the phone
    // profile's pinned 290px: at ~1000px wide a 5-row / 11-col layout needs
    // ~450px. (Before the fix the box stayed 290 tall here.)
    const expectedHeight = (geo.box.width * geo.rows) / geo.cols;
    expect(
      geo.box.height,
      `OSK box height ${geo.box.height} should match the layout geometry ` +
        `(width ${geo.box.width} x ${geo.rows} rows / ${geo.cols} cols = ${expectedHeight})`,
    ).toBeGreaterThan(expectedHeight * 0.85);
    expect(
      geo.box.height,
      `OSK box height ${geo.box.height} should match the layout geometry ` +
        `(width ${geo.box.width} x ${geo.rows} rows / ${geo.cols} cols = ${expectedHeight})`,
    ).toBeLessThan(expectedHeight * 1.15);

    // The user-visible property: keys roughly square, not wide and flat.
    expect(
      geo.medianKeyAspect,
      `median key aspect ${geo.medianKeyAspect} should be roughly square (wide flat keys read as squashed)`,
    ).toBeGreaterThan(0.7);
    expect(
      geo.medianKeyAspect,
      `median key aspect ${geo.medianKeyAspect} should be roughly square (tall narrow keys read as stretched)`,
    ).toBeLessThan(1.35);
  });
});
