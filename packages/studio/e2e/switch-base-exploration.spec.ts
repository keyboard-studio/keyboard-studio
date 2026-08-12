// EXPLORATORY instrumentation spec — switch-base-keyboards popup behavior map.
//
// NOT a pass/fail regression suite: every scenario records what actually
// happens (dialogs, console traffic, resulting UI state) into JSON files under
// RESULTS_DIR, at several survey completion levels, for each of:
//   - page refresh
//   - browser back button (two presses)
//   - switching the base keyboard (re-confirming a different base), with the
//     confirm dialog cancelled vs accepted.
//
// The "popup" under investigation is the native window.confirm() fired by
// src/lib/confirmRebase.ts (confirmRebaseIfEdited) when re-instantiating over
// an edited working copy.
//
// Run: cd packages/studio && npx playwright test switch-base-exploration --workers=1

import { test, expect, type Page, type Dialog } from "playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  driveIdentityLite,
  chooseAdaptTrack,
  confirmPrefill,
  buildOneCharacterList,
  seedReturningVisitor,
} from "./helpers/surveyFlow";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const RESULTS_DIR =
  "/private/tmp/claude-501/-Users-grace-github-sil-keyboards/5f050279-211d-4d0e-83d1-b72d58a70f25/scratchpad/switch-base-results";

const BASE_A = "bj_cree_woods"; // initial base (has raw rule#93 for the carve level)
const BASE_B = "basic_kbdfr"; // the "different base" switched to
const CARVE_NODE_ID = "rule#93";

type DialogAction = "accept" | "dismiss";

interface DialogRecord {
  type: string;
  message: string;
  actionTaken: DialogAction;
  atMs: number;
}

interface ScenarioRecord {
  scenario: string;
  level: string;
  probe: string;
  startedAt: string;
  dialogs: DialogRecord[];
  console: { kind: string; text: string; atMs: number }[];
  pageErrors: string[];
  steps: { note: string; atMs: number }[];
  states: Record<string, unknown>[];
  outcome: "completed" | "failed";
  failure?: string;
}

// ---------------------------------------------------------------------------
// Instrumentation
// ---------------------------------------------------------------------------

interface Harness {
  rec: ScenarioRecord;
  t0: number;
  setDialogAction: (a: DialogAction) => void;
  note: (s: string) => void;
  dump: (page: Page, label: string) => Promise<void>;
  save: () => void;
}

function attach(page: Page, scenario: string, level: string, probe: string): Harness {
  const t0 = Date.now();
  const rec: ScenarioRecord = {
    scenario,
    level,
    probe,
    startedAt: new Date().toISOString(),
    dialogs: [],
    console: [],
    pageErrors: [],
    steps: [],
    states: [],
    outcome: "failed",
  };
  let dialogAction: DialogAction = "dismiss";

  page.on("dialog", async (d: Dialog) => {
    const entry: DialogRecord = {
      type: d.type(),
      message: d.message(),
      actionTaken: dialogAction,
      atMs: Date.now() - t0,
    };
    rec.dialogs.push(entry);
    try {
      if (dialogAction === "accept") await d.accept();
      else await d.dismiss();
    } catch {
      /* already handled */
    }
  });

  page.on("console", (msg) => {
    const text = msg.text();
    if (
      msg.type() === "error" ||
      msg.type() === "warning" ||
      /instantiat|rebase|draft|choose_base|carve|working.?copy|resume/i.test(text)
    ) {
      rec.console.push({ kind: msg.type(), text: text.slice(0, 300), atMs: Date.now() - t0 });
    }
  });

  page.on("pageerror", (err) => {
    rec.pageErrors.push(String(err).slice(0, 500));
  });

  const dump = async (p: Page, label: string) => {
    const state: Record<string, unknown> = { label, atMs: Date.now() - t0, url: p.url() };
    const vis = async (sel: () => ReturnType<Page["getByTestId"]>) =>
      sel()
        .first()
        .isVisible({ timeout: 400 })
        .catch(() => false);
    try {
      state.visible = {
        welcome: await p
          .getByText(/keyboard studio/i)
          .first()
          .isVisible({ timeout: 400 })
          .catch(() => false),
        basePicker: await vis(() => p.getByTestId("base-picker")),
        baseConfirm: await vis(() => p.getByTestId("base-confirm")),
        trackAdapt: await vis(() => p.getByTestId("track-adapt")),
        prefillConfirm: await vis(() => p.getByTestId("prefill-confirm")),
        phaseBIntro: await vis(() => p.getByTestId("phase-b-intro-next")),
        carveGallery: await vis(() => p.getByTestId("carve-gallery")),
        surveyBack: await vis(() => p.getByTestId("survey-back")),
        surveyAdvance: await vis(() => p.getByTestId("survey-advance")),
        identityQ1: await p
          .locator("#il_language_english")
          .isVisible({ timeout: 400 })
          .catch(() => false),
      };
      state.headings = await p
        .locator("h1, h2, h3")
        .allInnerTexts()
        .then((a) => a.slice(0, 6))
        .catch(() => []);
      state.bodySnippet = await p
        .evaluate(() => document.body?.innerText?.replace(/\s+/g, " ").slice(0, 260) ?? "")
        .catch(() => "(unavailable)");
      state.localStorageKs = await p
        .evaluate(() =>
          Object.keys(localStorage)
            .filter((k) => k.startsWith("ks."))
            .map((k) => `${k} (${(localStorage.getItem(k) ?? "").length}B)`),
        )
        .catch(() => "(unavailable)");
      state.hook = await p
        .evaluate(() => {
          const h = window.__ksE2E__;
          if (!h) return { present: false };
          const ir = h.getWorkingIr();
          const header = ir?.header as Record<string, unknown> | undefined;
          return {
            present: true,
            instantiated: ir !== null,
            irHeader: header
              ? Object.fromEntries(
                  Object.entries(header).filter(
                    ([, v]) => typeof v === "string" || typeof v === "number",
                  ),
                )
              : null,
            deletedNodeIds: h.getDeletedNodeIds(),
          };
        })
        .catch((e) => ({ present: "eval-failed", error: String(e).slice(0, 120) }));
    } catch (e) {
      state.dumpError = String(e).slice(0, 200);
    }
    rec.states.push(state);
  };

  return {
    rec,
    t0,
    setDialogAction: (a) => {
      dialogAction = a;
    },
    note: (s) => rec.steps.push({ note: s, atMs: Date.now() - t0 }),
    dump,
    save: () => {
      mkdirSync(RESULTS_DIR, { recursive: true });
      writeFileSync(join(RESULTS_DIR, `${scenario}.json`), JSON.stringify(rec, null, 2));
    },
  };
}

// TS mirror of the flag-gated window hook (src/lib/e2eHook.ts)
declare global {
  interface Window {
    __ksE2E__?: {
      getWorkingIr(): { header?: unknown } | null;
      getDeletedNodeIds(): string[];
    };
  }
}

// ---------------------------------------------------------------------------
// Base-picker interactions (preview vs confirm kept separate on purpose)
// ---------------------------------------------------------------------------

async function previewBase(page: Page, id: string, h: Harness): Promise<void> {
  const card = page.getByTestId(`base-card-${id}`);
  if (await card.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await card.click();
    h.note(`previewed ${id} via suggestion card`);
  } else {
    await page.getByTestId("search-scope-all").click();
    const search = page.getByPlaceholder(/Type to search by name/i);
    await search.fill(id);
    await page.locator(`[id$="-opt-${id}"]`).first().click({ timeout: 20_000 });
    h.note(`previewed ${id} via search`);
  }
  await expect(page.getByTestId("base-confirm")).toBeEnabled({ timeout: 120_000 });
  h.note(`preview compile settled for ${id} (confirm enabled)`);
}

async function confirmBase(page: Page, h: Harness): Promise<void> {
  await page.getByTestId("base-confirm").click();
  h.note("clicked base-confirm (Choose this keyboard)");
}

/**
 * Walk back to the base picker using whatever back affordance is visible,
 * recording each hop. Falls back to browser back if no in-app back is found.
 */
async function backToBasePicker(page: Page, h: Harness): Promise<boolean> {
  for (let i = 0; i < 20; i++) {
    if (await page.getByTestId("base-picker").isVisible({ timeout: 800 }).catch(() => false)) {
      h.note(`reached base picker after ${i} back hops`);
      return true;
    }
    let clicked = false;
    for (const [name, loc] of [
      ["survey-back", page.getByTestId("survey-back")],
      ["base-back", page.getByTestId("base-back")],
      ["role-back", page.getByRole("button", { name: /^(←\s*)?back$/i }).first()],
    ] as const) {
      const visible = await loc.isVisible({ timeout: 400 }).catch(() => false);
      const enabled = visible && (await loc.isEnabled().catch(() => false));
      if (enabled) {
        await loc.click();
        h.note(`back hop ${i + 1}: clicked ${name}`);
        clicked = true;
        break;
      }
    }
    if (!clicked) {
      await page.goBack();
      h.note(`back hop ${i + 1}: browser goBack fallback (url now ${page.url()})`);
    }
    await page.waitForTimeout(700);
  }
  h.note("FAILED to reach base picker within 20 hops");
  return false;
}

// ---------------------------------------------------------------------------
// Completion-level builders
// ---------------------------------------------------------------------------

type Level =
  | "L1-identity-done"
  | "L2-base-previewed"
  | "L3-base-confirmed"
  | "L4-track-chosen"
  | "L5-prefill-confirmed"
  | "L6-phaseB-done"
  | "L7-carve-deleted";

async function buildToLevel(page: Page, level: Level, h: Harness): Promise<void> {
  await seedReturningVisitor(page);
  await page.goto("/?e2e=1");
  h.note("navigated to /?e2e=1 (returning visitor seeded)");

  await driveIdentityLite(page, { english: "Test", autonym: "Nehiyawewin", script: "other" });
  h.note("identity-lite complete; at base picker");
  if (level === "L1-identity-done") return;

  await previewBase(page, BASE_A, h);
  if (level === "L2-base-previewed") return;

  await confirmBase(page, h);
  await expect(page.getByTestId("track-adapt")).toBeVisible({ timeout: 30_000 });
  h.note("base confirmed; at track step");
  if (level === "L3-base-confirmed") return;

  await chooseAdaptTrack(page);
  await page.waitForSelector('[data-testid="prefill-confirm"]', { timeout: 30_000 });
  h.note("track chosen (adapt); at prefill confirmation");
  if (level === "L4-track-chosen") return;

  await confirmPrefill(page);
  await page.waitForSelector('[data-testid="phase-b-intro-next"]', { timeout: 30_000 });
  h.note("prefill confirmed; at Phase B intro");
  if (level === "L5-prefill-confirmed") return;

  await buildOneCharacterList(page, "᙮"); // marks-free char → marks step auto-skips
  await expect(page.getByTestId("carve-gallery")).toBeVisible({ timeout: 60_000 });
  h.note("Phase B done (added ᙮); at carve gallery");
  if (level === "L6-phaseB-done") return;

  // BROKEN (refs #1628): carve-card-<id> / raw-remove-anyway / raw-confirm-remove
  // are v1 CarveGallery/Rail/Inspector test-ids. CarveGalleryV2 is the sole
  // live carve gallery now (carveAdapter.tsx renders it unconditionally; v1 is
  // commented out) and never renders these ids, so targetCard.toBeVisible()
  // below times out — every L7-carve-deleted scenario in the matrix currently
  // fails here. Needs porting to CarveGalleryV2's actual discard interaction
  // (see CarveGalleryV2.test.tsx for its real test-ids) before L7 is reachable
  // again; left as-is rather than silently deleted since the matrix's other
  // six levels are unaffected and still validate real behavior.
  const targetCard = page.getByTestId(`carve-card-${CARVE_NODE_ID}`);
  await expect(targetCard).toBeVisible({ timeout: 30_000 });
  await targetCard.click();
  await page.getByTestId("raw-remove-anyway").click();
  await page.getByTestId("raw-confirm-remove").click();
  await expect
    .poll(() => page.evaluate(() => window.__ksE2E__?.getDeletedNodeIds() ?? []), {
      timeout: 10_000,
    })
    .toContain(CARVE_NODE_ID);
  h.note(`carved ${CARVE_NODE_ID}; still at carve gallery`);
}

// ---------------------------------------------------------------------------
// Probes
// ---------------------------------------------------------------------------

async function probeRefresh(page: Page, h: Harness, action: DialogAction = "dismiss"): Promise<void> {
  await h.dump(page, "before-refresh");
  h.setDialogAction(action);
  await page.reload();
  await page.waitForTimeout(2_500);
  await h.dump(page, "after-refresh");
  // Second dump after the pipeline settles, in case the reload-time dialog's
  // outcome mutates the working copy asynchronously.
  await page.waitForTimeout(3_000);
  await h.dump(page, "after-refresh-settled");
}

async function probeBrowserBack(page: Page, h: Harness): Promise<void> {
  await h.dump(page, "before-back");
  await page.goBack();
  await page.waitForTimeout(1_500);
  await h.dump(page, "after-back-1");
  await page.goBack().catch(() => h.note("second goBack threw"));
  await page.waitForTimeout(1_500);
  await h.dump(page, "after-back-2");
}

async function probeSwitchBase(page: Page, h: Harness, action: DialogAction): Promise<void> {
  await h.dump(page, "before-switch");
  const reached = await backToBasePicker(page, h);
  await h.dump(page, "at-base-picker");
  if (!reached) return;

  await previewBase(page, BASE_B, h);
  await h.dump(page, "previewed-different-base");

  h.setDialogAction(action);
  await confirmBase(page, h);
  await page.waitForTimeout(2_500);
  await h.dump(page, `after-confirm-dialog-${action}`);

  // Where did we land? Give the wizard a moment more, then final dump.
  await page.waitForTimeout(2_000);
  await h.dump(page, "final");
}

// ---------------------------------------------------------------------------
// Scenario matrix
// ---------------------------------------------------------------------------

const LEVELS: Level[] = [
  "L1-identity-done",
  "L2-base-previewed",
  "L3-base-confirmed",
  "L4-track-chosen",
  "L5-prefill-confirmed",
  "L6-phaseB-done",
  "L7-carve-deleted",
];

// Base-switch scenarios only make sense once a base exists to switch away
// from (L2+). Pre-confirm (L2) is the control: switching previews is free.
const SWITCH_LEVELS: Level[] = LEVELS.slice(1);

test.describe.configure({ mode: "serial" });
test.describe("switch-base exploration matrix", () => {
  for (const level of LEVELS) {
    test(`${level} × refresh`, async ({ page }) => {
      const h = attach(page, `${level}__refresh`, level, "refresh");
      try {
        await buildToLevel(page, level, h);
        await probeRefresh(page, h);
        h.rec.outcome = "completed";
      } catch (e) {
        h.rec.failure = String(e).slice(0, 800);
        throw e;
      } finally {
        h.save();
      }
    });

    test(`${level} × browser-back`, async ({ page }) => {
      const h = attach(page, `${level}__browser-back`, level, "browser-back");
      try {
        await buildToLevel(page, level, h);
        await probeBrowserBack(page, h);
        h.rec.outcome = "completed";
      } catch (e) {
        h.rec.failure = String(e).slice(0, 800);
        throw e;
      } finally {
        h.save();
      }
    });
  }

  // The refresh probe surfaces a reload-time confirm dialog at some levels;
  // these variants press OK on it instead of the default Cancel.
  for (const level of LEVELS.slice(2)) {
    test(`${level} × refresh (OK on dialog)`, async ({ page }) => {
      const h = attach(page, `${level}__refresh-accept`, level, "refresh-accept");
      try {
        await buildToLevel(page, level, h);
        await probeRefresh(page, h, "accept");
        h.rec.outcome = "completed";
      } catch (e) {
        h.rec.failure = String(e).slice(0, 800);
        throw e;
      } finally {
        h.save();
      }
    });
  }

  for (const level of SWITCH_LEVELS) {
    for (const action of ["dismiss", "accept"] as const) {
      test(`${level} × switch-base (${action === "accept" ? "OK" : "Cancel"})`, async ({
        page,
      }) => {
        const h = attach(page, `${level}__switch-${action}`, level, `switch-${action}`);
        try {
          await buildToLevel(page, level, h);
          await probeSwitchBase(page, h, action);
          h.rec.outcome = "completed";
        } catch (e) {
          h.rec.failure = String(e).slice(0, 800);
          throw e;
        } finally {
          h.save();
        }
      });
    }
  }
});
