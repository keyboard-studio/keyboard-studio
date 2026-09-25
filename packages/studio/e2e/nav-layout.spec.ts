// Nav layout — every top-bar tab stays visible and clickable at common laptop
// widths.
//
// Regression guard for the 1280px overlap: the NavBar's left zone (wordmark +
// the current-keyboard selector, a fixed 220px trigger) was allowed to shrink
// to `minWidth: 0` while its content could not, so at a 1280x720 viewport the
// selector painted over the tab row. The Studio tab rendered cut off ("dio")
// and `#nav-current-keyboard-select` intercepted every click aimed at it —
// any walk that called `switchTab(page, "survey")` timed out. 1600x900 was
// fine, which is why it went unnoticed.
//
// Cheap by design: no corpus walk. `#survey` on a returning visitor already
// renders the full-width worst case the bug needs — the selector (shown on
// every route but welcome) and the survey-only Reset control in the right
// zone.
//
// Asserts on geometry + hit-testing rather than a screenshot: a tab is
// "reachable" when it lies inside the viewport, does not overlap the
// selector, and is the element a pointer at its centre actually lands on.
// Then the Studio tab — the one the bug swallowed — is clicked for real.
import { test, expect, type Page } from "playwright/test";
import { seedReturningVisitor } from "./helpers/surveyFlow";

// 1280x720 is Playwright's default viewport and the one the bug surfaced at;
// 1024x768 is the lower bound this layout is meant to hold at; 1600x900 is
// the width that already worked, kept so a fix for the narrow case cannot
// quietly break the wide one.
const VIEWPORTS = [
  { width: 1280, height: 720 },
  { width: 1024, height: 768 },
  { width: 1600, height: 900 },
] as const;

interface TabHit {
  href: string;
  inViewport: boolean;
  overlapsSelector: boolean;
  hitSelf: boolean;
}

async function measureTabs(page: Page): Promise<TabHit[]> {
  return page.evaluate(() => {
    const nav = document.querySelector("nav");
    if (nav === null) throw new Error("no <nav> rendered");
    const select = document.getElementById("nav-current-keyboard-select");
    const sel = select?.getBoundingClientRect() ?? null;
    return [...nav.querySelectorAll<HTMLAnchorElement>('a[href^="#"]')].map((a) => {
      const r = a.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return {
        href: a.getAttribute("href") ?? "",
        inViewport: r.left >= 0 && r.right <= window.innerWidth && r.width > 0,
        overlapsSelector:
          sel !== null &&
          r.left < sel.right &&
          sel.left < r.right &&
          r.top < sel.bottom &&
          sel.top < r.bottom,
        hitSelf: hit !== null && (hit === a || a.contains(hit)),
      };
    });
  });
}

for (const viewport of VIEWPORTS) {
  test.describe(`nav at ${viewport.width}x${viewport.height}`, () => {
    test.use({ viewport });

    test("every tab is visible, unobstructed, and the Studio tab is clickable", async ({
      page,
    }) => {
      await seedReturningVisitor(page);
      // Start on a non-survey tab so clicking Studio is an observable
      // navigation, not a no-op on the already-active route.
      await page.goto("/#trail");

      const selector = page.locator("#nav-current-keyboard-select");
      await expect(selector).toBeVisible();

      const studioTab = page.locator('nav a[href="#survey"]');
      await expect(studioTab).toBeVisible();
      await expect(studioTab).toHaveText("Studio");

      // No horizontal scroll: a tab pushed past the edge is not "visible".
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, "page must not scroll horizontally").toBeLessThanOrEqual(0);

      const tabs = await measureTabs(page);
      expect(tabs.length).toBeGreaterThanOrEqual(4);
      for (const tab of tabs) {
        expect(tab, `${tab.href} must be fully on screen`).toMatchObject({ inViewport: true });
        expect(tab, `${tab.href} must not sit under the keyboard selector`).toMatchObject({
          overlapsSelector: false,
        });
        expect(tab, `${tab.href} must receive a pointer at its centre`).toMatchObject({
          hitSelf: true,
        });
      }

      // The real click. A short timeout on purpose: the pre-fix failure mode
      // was Playwright retrying "…intercepts pointer events" until the whole
      // test timed out.
      await studioTab.click({ timeout: 5_000 });
      await expect.poll(() => page.evaluate(() => window.location.hash)).toBe("#survey");
      await expect(studioTab).toHaveAttribute("aria-current", "page");
    });

    test("the keyboard selector keeps its programmatic label and keyboard access", async ({
      page,
    }) => {
      await seedReturningVisitor(page);
      await page.goto("/#survey");

      // Named "Keyboard <current name>": the visible label leads (2.5.3), and
      // the full current name is in the accessible name even when the
      // trigger's visible text is ellipsized.
      const trigger = page.getByRole("button", { name: /^Keyboard\b.+/ });
      await expect(trigger).toBeVisible();
      await expect(trigger).toHaveAttribute("id", "nav-current-keyboard-select");

      // Still a real, keyboard-operable listbox trigger at this width.
      await trigger.focus();
      await page.keyboard.press("Enter");
      await expect(trigger).toHaveAttribute("aria-expanded", "true");
      await expect(page.getByRole("listbox")).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(trigger).toHaveAttribute("aria-expanded", "false");
      await expect(trigger).toBeFocused();
    });
  });
}
