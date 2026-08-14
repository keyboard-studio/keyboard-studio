// E2E: character-discard deletion round-trip (spec §11 carve gallery; engine
// pattern-apply/carveFilterIr.ts).
//
// Proves the full AC2 chain for the carve feature: importing a keyboard with
// recognized patterns, discarding a CHARACTER in the v2 character-first carve
// gallery (CarveGalleryV2.tsx — the live carve gallery; v1's rule/node "Rail"
// view, CarveGallery.tsx, is retained but commented out in carveAdapter.tsx
// for rollback and is no longer reachable), confirming the live working-copy
// IR reflects the cascade deletion via the window.__ksE2E__ hook, then
// confirming the emitted .kmn genuinely omits the deleted rules' distinguishing
// output token.
//
// Fixture: bj_cree_woods (Western Cree, TH-Woods variant — see
// docs/keyboard-index.md).
//
// PORT NOTE (v1 -> v2): the pre-overhaul version of this spec targeted
// nodeId "rule#93", a raw/opaque fragment —
//
//   if(option_key = '') U+1427 any(C_ef) > index(C_efc,3)
//
// — carved out via v1's rule-level Inspector two-step confirm
// (raw-remove-anyway / raw-confirm-remove). That path has NO v2 equivalent:
// v2 is character-first, and `collectCharContributors` (engine) can only
// ever list an opaque RawKmnFragment's contribution in `blocked`
// (`blockedReasonCode: 'opaque-fragment'`), never in `ruleNodeIds` or
// `storeSlotIds` — by design, per that function's own header doc ("OPAQUE
// FRAGMENTS: RawKmnFragment producers can only be whole-fragment-deleted").
// `characterCellIsToggleable` (irToCharacterView.ts) reads only
// `ruleNodeIds`/`storeSlotIds`, so every one of the 76 characters
// rule#93 alone produces (the full C_efc store, referenced by no other
// rule) renders as a NON-toggleable cell in CarveGalleryV2 — confirmed
// empirically (parseKmn + collectCharContributors against this exact
// fixture) before this port, not assumed. `recommendedRemovalChars` shields
// the same characters for the same reason ("any collectCharContributors
// `blocked` entry ... shields immediately"). There is currently NO UI path
// in v2 to discard a character whose sole producer is an opaque fragment —
// a genuine v1/v2 capability gap, flagged here rather than silently
// dropped or worked around.
//
// This spec is ported to the EQUIVALENT case v2 DOES support: two literal,
// non-opaque, single-character-output rules — rule#18 (`+ "l" > U+14EC`) and
// rule#20 (`+ "L" > U+14EC`) — both producing U+14EC (ᓬ, the western-style
// "l/L" sigma character) and reachable through no other rule or store in
// this fixture (verified by grep: "U+14EC" appears only on those two source
// lines). Discarding the character in the v2 gallery cascades to BOTH
// producing rules at once (`collectCharContributors` returns every rule
// whose entire output equals the target char), so "U+14EC" disappearing
// from the emitted .kmn proves the SAME cascade-delete -> re-emit contract
// AC2 always asserted, just via v2's character-first model instead of
// v1's rule-first one.
//
// Run (Playwright is the global CLI only — see playwright.config.ts header):
//   cd packages/studio && npx playwright test carve.spec.ts
//
// Requires `pnpm install` to have linked the `fflate` devDependency added to
// packages/studio/package.json alongside this spec (see report — reused at
// the same pinned version already vetted for @keyboard-studio/engine's own
// zip writer, not a new library introduction).

import { test, expect } from "playwright/test";
import { expectNoSeriousAxeViolations } from "./helpers/axe";
import { unzipSync, strFromU8 } from "fflate";
import { readFile } from "node:fs/promises";
import type { KeyboardIR } from "@keyboard-studio/contracts";
import {
  driveIdentityLite,
  pickBaseKeyboard,
  chooseAdaptTrack,
  confirmPrefill,
  buildOneCharacterList,
  confirmMechanismsEmpty,
  driveTouchGallery,
  driveHelpPhase,
  seedReturningVisitor,
} from "./helpers/surveyFlow";

// ---------------------------------------------------------------------------
// Fixture constants
// ---------------------------------------------------------------------------

const BASE_KEYBOARD_ID = "bj_cree_woods";
// Both producing rules for the target character (see the PORT NOTE above) —
// discarding the character cascades to both at once.
const TARGET_RULE_IDS = ["rule#18", "rule#20"];
// The codepoint-label text CarveGalleryV2's search box and grid cells key on
// (irToCharacterView.ts's codepointLabel()/CarveGalleryV2.tsx's aria-label).
const TARGET_CODEPOINT_LABEL = "U+14EC";
// Present in the emitted .kmn iff EITHER of rule#18/rule#20 (the sole
// producers of U+14EC in this fixture — verified by grep, no store or other
// rule references it) survives.
const KEPT_ONLY_TOKEN = "U+14EC";
const KMN_ZIP_PATH = `source/${BASE_KEYBOARD_ID}.kmn`;

/**
 * Pre-existing 1.4.3 (Contrast Minimum) offenders on the carve gallery,
 * excluded by selector with the criterion and reason named inline — the same
 * idiom e2e/tab-roundtrip.spec.ts and e2e/decision-deeplink.spec.ts use
 * (KNOWN_CONTRAST_DEBT). This is spec 056's open tracker debt
 * (specs/056-ada-accessibility/wcag-2.2-aa-tracker.md, 1.4.3 is an open
 * `unknown` row).
 *
 * PORT NOTE (v1 -> v2): this list previously named v1's Rail-only surfaces
 * (Rail.tsx's carve-card buttons and sticky SectionHeader, GlyphCell.tsx's
 * cross-reference chips, and CarveGallery.tsx's "Hide info panel" toggle) —
 * none of those components render anymore now that CarveGalleryV2 is the
 * live gallery (v1 is commented out in carveAdapter.tsx), so those entries
 * are retired rather than left as no-op selectors. The RemovalBanner
 * entries stay: v2 reuses RemovalBanner.tsx unchanged ("reused as-is" per
 * CarveGalleryV2.tsx's own comment), so its pre-existing debt still applies.
 * The Continue-button entry is kept conservatively (v2's button reuses the
 * same var(--app-accent)-background/white-text combo v1's carried) but is
 * UNVERIFIED against v2's actual render — flagged for a fresh axe pass
 * rather than assumed.
 */
const KNOWN_CONTRAST_DEBT: readonly string[] = [
  // 1.4.3 — CarveGalleryV2's footer "Continue" button — see the port note
  // above; unverified against v2's own render, kept conservative.
  'button[data-testid="carve-continue"]',
  // 1.4.3 — RemovalBanner's dismiss control (assignLoop/parts/RemovalBanner.tsx),
  // reused unchanged by v2.
  'button[aria-label="Dismiss removal recommendation"]',
  // 1.4.3 — RemovalBanner's own region (its collapsed-strip text sits on the
  // green-tinted background at a ratio axe flags). Excluded by the banner's
  // stable aria-label rather than the anonymous div chain axe reports (the
  // chain has no data-testid/aria hook of its own to key on).
  'div[aria-label="Removal recommendation"]',
];

/**
 * Pre-existing 1.4.3 offenders on the OUTPUT screen (same rules and evidence
 * trail as KNOWN_CONTRAST_DEBT above — spec 056's open tracker debt; both
 * components predate and are untouched by spec 057). Kept as a separate list
 * because the two screens share no offending component.
 */
const KNOWN_CONTRAST_DEBT_OUTPUT: readonly string[] = [
  // 1.4.3 — OskModeToggle's inactive mode button (components/OskModeToggle.tsx):
  // the unselected toggle half's text on the group background falls short.
  'div[role="group"] > button',
  // 1.4.3 — SignUpPanel's GitHub button; the same exclusion
  // decision-deeplink.spec.ts already carries for shared chrome.
  'button[aria-label="Sign up with GitHub"]',
];

// ---------------------------------------------------------------------------
// window.__ksE2E__ typing — mirrors packages/studio/src/lib/e2eHook.ts.
// Declared locally (not imported) so this spec has no compile-time coupling
// to studio's src/ internals beyond the documented window contract.
// ---------------------------------------------------------------------------

interface KsE2EHook {
  getWorkingIr(): KeyboardIR | null;
  getDeletedItemIds(): string[];
}

declare global {
  interface Window {
    __ksE2E__?: KsE2EHook;
  }
}

// ---------------------------------------------------------------------------
// Page-object-lite helpers (carve-specific)
// ---------------------------------------------------------------------------
//
// The shared survey prelude (identity-lite, base picker, track choice,
// prefill, character list, mechanism/touch galleries, help phase) now lives
// in ./helpers/surveyFlow and is imported above. There is no carve-local
// driver left: the standalone Sequence Gallery step (formerly inserted
// between mechanisms and the touch fork) has been retired — S-03 sequences
// now build inline inside the Mechanism Gallery's method chooser (selecting
// the "sequence" method swaps the right/preview pane for SequenceBuilderPanel;
// see MechanismGallery.tsx). This fixture's mechanism step never flags a
// character for anything (confirmMechanismsEmpty's "No new characters to
// add." empty-diff path), so there is no per-character loop here to drive the
// sequence builder through — nothing to replace the old pass-through driver
// with for THIS walk.

// ---------------------------------------------------------------------------
// Spec
// ---------------------------------------------------------------------------

test.describe("Carve gallery (v2) — discard one character, verify IR + emitted .kmn", () => {
  test("discarding U+14EC in the carve gallery removes both producing rules from the deleted-item IR state and from the emitted .kmn", async ({ page }) => {
    // ?e2e=1 is the runtime override for installE2eHook() (src/lib/e2eHook.ts)
    // — no VITE_E2E build flag needed. Seed the returning-visitor flag first
    // so the fresh browser context skips WelcomeScreen (see seedReturningVisitor).
    await seedReturningVisitor(page);
    await page.goto("/?e2e=1");

    await driveIdentityLite(page, {
      english: "Test",
      autonym: "Nehiyawewin",
      script: "other",
    });
    await pickBaseKeyboard(page, BASE_KEYBOARD_ID);
    await chooseAdaptTrack(page);
    await confirmPrefill(page);
    await buildOneCharacterList(page, "᙮");

    // Manifest spine order (StudioShell.tsx) is characters -> marks -> carve ->
    // mechanisms -> touch -> help (no separate sequences step — S-03 builds
    // inline in the Mechanism Gallery, see the note above); the marks-free
    // alphabet ("᙮") auto-skips the marks step, so carve renders right after
    // Phase B.

    // ---------------------------------------------------------------------
    // Carve gallery (v2 — CarveGalleryV2.tsx, character-first)
    // ---------------------------------------------------------------------
    const carveGallery = page.getByTestId("carve-gallery");
    await expect(carveGallery).toBeVisible({ timeout: 30_000 });

    // Accessibility gate (spec 056 FR-003): scan the carve gallery screen.
    await expectNoSeriousAxeViolations(page, "carve gallery (bj_cree_woods)", {
      exclude: KNOWN_CONTRAST_DEBT,
    });

    // Narrow the character grid to the target character via the search box
    // (matches on codepoint-label text, irToCharacterView.ts's
    // codepointLabel()), then click its cell directly — v2 is single-click
    // discard ("Click any character to discard it — nothing is deleted
    // until you continue", CarveGalleryV2.tsx's own header copy), unlike
    // v1's rule-level two-step raw-remove-anyway/raw-confirm-remove confirm.
    await page.getByLabel("Search a character or code point").fill(TARGET_CODEPOINT_LABEL);
    const targetCell = page.locator(`button[aria-label*="${TARGET_CODEPOINT_LABEL}"]`);
    await expect(targetCell).toBeVisible();
    await expect(targetCell).toHaveAttribute("aria-pressed", "false");

    await targetCell.click();
    await expect(targetCell).toHaveAttribute("aria-pressed", "true");

    // ---------------------------------------------------------------------
    // AC2 checkpoint 1: the IR reflects the deletion.
    //
    // getWorkingIr() still LISTS rule#18/rule#20 in their group — the rules
    // array is filtered at emit time by carveFilterIr, not mutated in place.
    // The deletion is recorded in the deletedItemIds overlay (asserted via
    // getDeletedItemIds(), NOT getDeletedNodeIds() — CarveGalleryV2's
    // cascadeDelete routes whole-rule deletes through the item channel by
    // design; getDeletedNodeIds() only reflects v1 CarveGallery's deleteNode
    // path and stays empty here — see e2eHook.ts's getDeletedItemIds doc).
    // ---------------------------------------------------------------------
    await expect
      .poll(
        () => page.evaluate(() => window.__ksE2E__?.getDeletedItemIds() ?? []),
        { timeout: 5_000 },
      )
      .toEqual(expect.arrayContaining(TARGET_RULE_IDS));

    const workingIr = await page.evaluate(() => window.__ksE2E__?.getWorkingIr() ?? null);
    expect(workingIr).not.toBeNull();
    for (const ruleId of TARGET_RULE_IDS) {
      expect(
        workingIr?.groups.some((g) => g.rules.some((r) => r.nodeId === ruleId)),
        `expected ${ruleId} still listed in the live (pre-carve-filter) IR`,
      ).toBe(true);
    }

    await page.getByTestId("carve-continue").click();

    // ---------------------------------------------------------------------
    // Remaining spine steps: mechanisms, touch, help. (No separate sequences
    // step — see the note above the describe block.)
    // ---------------------------------------------------------------------
    await confirmMechanismsEmpty(page);
    await driveTouchGallery(page);
    await driveHelpPhase(page);

    // handlePhaseFComplete navigates to #output.
    await page.waitForURL(/#output$/);

    // Accessibility gate (spec 056 FR-003): scan the output screen.
    await expectNoSeriousAxeViolations(page, "output screen (carve walk)", {
      exclude: KNOWN_CONTRAST_DEBT_OUTPUT,
    });

    // ---------------------------------------------------------------------
    // AC2 checkpoint 2: the emitted .kmn omits both deleted rules.
    // ---------------------------------------------------------------------
    const downloadButton = page.getByTestId("emit-download");
    await expect(downloadButton).toBeEnabled({ timeout: 30_000 });

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      downloadButton.click(),
    ]);

    const zipPath = await download.path();
    expect(zipPath).not.toBeNull();

    const zipBytes = await readFile(zipPath as string);
    const entries = unzipSync(new Uint8Array(zipBytes));

    const kmnBytes = entries[KMN_ZIP_PATH];
    expect(kmnBytes, `expected ${KMN_ZIP_PATH} in the emitted zip`).toBeDefined();
    const kmnText = strFromU8(kmnBytes as Uint8Array);

    expect(kmnText).not.toContain(KEPT_ONLY_TOKEN);

    // -------------------------------------------------------------------
    // The source zip now also ships the compiled artifacts, so the
    // descriptor's `..\build\<id>.*` members resolve and the project opens
    // cleanly in Keyman Developer (spec §12 always claimed this; until the
    // .kmp work it was not true).
    // -------------------------------------------------------------------
    const zipNames = Object.keys(entries);
    expect(
      zipNames.some((n) => n.startsWith("build/") && n.endsWith(".kmx")),
      `expected a compiled build/*.kmx in the zip, got: ${zipNames.join(", ")}`,
    ).toBe(true);

    // -------------------------------------------------------------------
    // The PRIMARY download: an installable .kmp. This is the artifact an
    // ordinary author double-clicks — no Keyman Developer, no unzipping.
    // -------------------------------------------------------------------
    const kmpButton = page.getByTestId("emit-download-kmp");
    await expect(kmpButton).toBeEnabled({ timeout: 30_000 });

    const [kmpDownload] = await Promise.all([
      page.waitForEvent("download"),
      kmpButton.click(),
    ]);

    expect(kmpDownload.suggestedFilename()).toMatch(/\.kmp$/);

    const kmpPath = await kmpDownload.path();
    expect(kmpPath).not.toBeNull();
    const kmpBytes = new Uint8Array(await readFile(kmpPath as string));

    // A .kmp is a zip; Keyman reads kmp.json out of it at install time.
    const kmpEntries = unzipSync(kmpBytes);
    const kmpNames = Object.keys(kmpEntries).sort();
    expect(kmpNames, `.kmp members: ${kmpNames.join(", ")}`).toContain("kmp.json");
    expect(kmpNames).toContain("kmp.inf");
    expect(kmpNames.some((n) => n.endsWith(".kmx"))).toBe(true);
    // Members are flattened to basename inside a package — no directories.
    expect(kmpNames.every((n) => !n.includes("/"))).toBe(true);

    // The descriptor Keyman actually reads must name the keyboard and a language.
    const kmpJson = JSON.parse(strFromU8(kmpEntries["kmp.json"] as Uint8Array)) as {
      keyboards?: { id?: string; version?: string; languages?: unknown[] }[];
    };
    expect(kmpJson.keyboards?.[0]?.id).toBeTruthy();
    expect(kmpJson.keyboards?.[0]?.languages?.length ?? 0).toBeGreaterThan(0);

    // No package-build error banner was shown.
    await expect(page.getByTestId("emit-download-kmp-error")).toHaveCount(0);
  });

  // Positive control — same walk, but the character (and its two producing
  // rules) is left in place, so the emitted .kmn MUST contain the token.
  // This is the guard that proves the primary test's negative assertion is
  // actually exercising the carve path rather than passing because the
  // token was never emitted at all (e.g. a scaffold/base-resolution
  // regression that silently drops these rules before the carve step even
  // runs).
  test("control: keeping U+14EC leaves its distinguishing token in the emitted .kmn", async ({ page }) => {
    await seedReturningVisitor(page);
    await page.goto("/?e2e=1");

    await driveIdentityLite(page, {
      english: "Test",
      autonym: "Nehiyawewin",
      script: "other",
    });
    await pickBaseKeyboard(page, BASE_KEYBOARD_ID);
    await chooseAdaptTrack(page);
    await confirmPrefill(page);
    await buildOneCharacterList(page, "᙮");

    const carveGallery = page.getByTestId("carve-gallery");
    await expect(carveGallery).toBeVisible({ timeout: 30_000 });

    // Confirm the target cell is present and not (yet) discarded, but do NOT
    // click it — this is the "nothing carved" control path.
    await page.getByLabel("Search a character or code point").fill(TARGET_CODEPOINT_LABEL);
    const targetCell = page.locator(`button[aria-label*="${TARGET_CODEPOINT_LABEL}"]`);
    await expect(targetCell).toBeVisible();
    await expect(targetCell).toHaveAttribute("aria-pressed", "false");

    await expect
      .poll(
        () => page.evaluate(() => window.__ksE2E__?.getDeletedItemIds() ?? []),
        { timeout: 5_000 },
      )
      .not.toEqual(expect.arrayContaining(TARGET_RULE_IDS));

    await page.getByTestId("carve-continue").click();

    await confirmMechanismsEmpty(page);
    await driveTouchGallery(page);
    await driveHelpPhase(page);

    await page.waitForURL(/#output$/);

    const downloadButton = page.getByTestId("emit-download");
    await expect(downloadButton).toBeEnabled({ timeout: 30_000 });

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      downloadButton.click(),
    ]);

    const zipPath = await download.path();
    expect(zipPath).not.toBeNull();

    const zipBytes = await readFile(zipPath as string);
    const entries = unzipSync(new Uint8Array(zipBytes));

    const kmnBytes = entries[KMN_ZIP_PATH];
    expect(kmnBytes, `expected ${KMN_ZIP_PATH} in the emitted zip`).toBeDefined();
    const kmnText = strFromU8(kmnBytes as Uint8Array);

    expect(kmnText).toContain(KEPT_ONLY_TOKEN);
  });
});
