/**
 * E2E: spec 089 SC-001 — the golden walk. One fixed authoring walk on the
 * copy track from `basic_kbdfr`, ending in the source-.zip download; the
 * emitted files are compared byte-for-byte against the committed baseline.
 * Specs 090–093 reuse this same walk as their no-visible-change oracle.
 *
 * THE WALK (fixed answers — changing any of them re-baselines the fixture):
 *   identity-lite: english "Test", autonym "Test Autonym", language code
 *     "fr", target script "other" (the driveIdentityLite defaults +
 *     languageCode "fr" — the same fixture spec 088's SC-001 walk uses)
 *     -> layout confirm -> base picker (basic_kbdfr) -> track (copy)
 *       -> attribution (#1901): author "Test Author", email + holder blank
 *         (the driveAttributionStep defaults — the same ANSWERS the walk
 *         always gave, at their post-track position)
 *       -> project name (accept the pre-fill) -> prefill confirm
 *         -> characters: build-list method, add "é" (marks / punctuation /
 *            invisibles / convenience accepted as proposed). NOTE:
 *            pb_standard_letters is NOT on this path — it is answered only
 *            on Phase B's "manual" question method, which has no e2e
 *            driver; the apply seam's byte-sensitivity for that question is
 *            pinned at store level (tests/steps/stepHost.goldenWalk +
 *            steps/applyDecisionEffects.test.ts), and the flag-on capture
 *            environment below is retained per R9 regardless.
 *           -> carve: discard nothing, continue
 *             -> mechanisms: driveMechanismsGallery defaults
 *               -> touch: seed-source default, long-press on K_A per char
 *                 -> help: welcome "Welcome to the keyboard.", tip
 *                    "Press a key to start.", history left undecided,
 *                    more-detail gate "No", remaining optionals skipped
 *                   -> Output: download the source .zip (emit-download)
 *
 * COMPARISON SHAPE: whole-archive bytes are NOT compared — fflate stamps
 * zip entries with the wall-clock time, so two archives of identical files
 * never share bytes. What SC-001 actually locks is the emitted FILES: the
 * entry-name set and every entry's uncompressed bytes must match the
 * baseline exactly, with TWO documented exceptions:
 *   - `.studio/decision-record.json` embeds `recordedAt` wall-clock
 *     timestamps by design (spec 053), so it is checked for presence and
 *     JSON parseability only, never byte-compared.
 *   - `HISTORY.md`'s top entry heading carries the walk's date
 *     (`## 1.0 (YYYY-MM-DD)`), so that one date is masked on both sides
 *     before the byte comparison; the rest of the file is compared as is.
 *     Unmasked, the baseline only matched on its capture day.
 * A mismatch fails with the differing entry names, so the spec delta that
 * changed the output is named, not inferred.
 *
 * CAPTURE ENVIRONMENT (research R9): the baseline was only meaningful
 * under the seam-on environment; since spec 089 T021 deleted the flag
 * (OI-1 ruled global) the seam is unconditional — the emitter always
 * includes the `kmStandardLetters` store pb_standard_letters' apply
 * writes, and no environment pin remains to set.
 *
 * CAPTURE / RE-CAPTURE (one command):
 *   GOLDEN_WALK_CAPTURE=1 npx playwright test \
 *     e2e/golden-walk.spec.ts --project=desktop
 * writes the downloaded archive to
 *   e2e/fixtures/golden-walk/basic-kbdfr-copy.zip
 * and the test passes trivially. Record the capture in
 * e2e/fixtures/golden-walk/README.md (base commit, date, environment) —
 * the HISTORY proposal's capture date is masked by the comparison, so a
 * re-capture on a different day does not differ in that entry.
 *
 * VERIFY (the default mode):
 *   npx playwright test \
 *     e2e/golden-walk.spec.ts --project=desktop
 */
import { test, expect } from "playwright/test";
import { unzipSync } from "fflate";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import {
  seedReturningVisitor,
  driveIdentityLite,
  pickStartKeyboard,
  chooseTrackCopy,
  driveAttributionStep,
  acceptProjectName,
  confirmPrefill,
  buildOneCharacterList,
  driveDeadkeysStep,
  driveMechanismsGallery,
  driveTouchGallery,
  driveHelpPhase,
  triggerDownload,
} from "./helpers/surveyFlow";

const BASELINE_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  "golden-walk",
  "basic-kbdfr-copy.zip",
);

/** Entries checked for presence/shape only — see the header for why. */
const NON_BYTE_COMPARED = new Set([".studio/decision-record.json"]);

/** The top HISTORY.md entry heading's date — the walk's wall-clock day. */
const HISTORY_TOP_DATE = /^(## \S+ )\(\d{4}-\d{2}-\d{2}\)/m;

/** An entry's bytes as compared: HISTORY.md with its top date masked. */
function comparableBytes(name: string, bytes: Uint8Array): Uint8Array {
  if (name !== "HISTORY.md") return bytes;
  const text = new TextDecoder().decode(bytes);
  return new TextEncoder().encode(text.replace(HISTORY_TOP_DATE, "$1(DATE)"));
}

const CAPTURE = process.env["GOLDEN_WALK_CAPTURE"] === "1";

test("spec 089 SC-001: golden walk emits the baseline source zip byte-for-byte", async ({
  page,
}) => {
  // Timeout sized to the walk, not the config default (240s). This is the
  // one walk that still drives the FULL French fixture by design — its
  // fixture is its purpose — and at observed CI pace the route cannot fit
  // 240s: on run 37679303677 both the base-code capture and this verify
  // consumed the entire cap and died at the same final-phase fill
  // (driveHelpPhase, #pf_welcome_paragraph) with identity -> mechanisms
  // (23 targets) -> touch (whole inventory) already complete behind them.
  // The route's mechanisms+touch core alone measured ~524s of action time
  // in copy-edit:455's trace at comparable pace, and the smaller
  // de-fixtured 455 took 449s in that same job. 1200s is ~2x the
  // pace-adjusted estimate for the full route. Tripwire: a death at
  // 1200s with the walk incomplete is NOT pace — treat it as a genuine
  // stall and re-diagnose instead of raising again. (The recurring
  // 1200s death was diagnosed 2026-10-15: not the Phase F form — this
  // walk was missing the deadkeys/rules pass-through every other walk
  // has, so it stranded on the Deadkeys step while its helpers waited
  // out their soft timeouts, and the fill at the end was just where the
  // cap landed. First diagnostic for any recurrence: the retained
  // error-context snapshot shows which step the app is actually on.)
  // The byte-for-byte comparison below is untouched by this sizing.
  test.setTimeout(1_200_000);
  await seedReturningVisitor(page);
  await page.goto("/");

  await driveIdentityLite(page, { languageCode: "fr" });
  await pickStartKeyboard(page, "basic_kbdfr");
  await chooseTrackCopy(page);
  await driveAttributionStep(page, { authorName: "Test Author" });
  await acceptProjectName(page);
  await confirmPrefill(page);

  await buildOneCharacterList(page, "é");

  // Carve: discard nothing — the fixed walk keeps the base's full inventory.
  await page.getByTestId("carve-gallery").waitFor({ state: "visible", timeout: 30_000 });
  await page.getByTestId("carve-continue").click();
  // Deadkeys (spec 083) and rules (spec 082) sit between carve and
  // mechanisms — walk through both, defining/installing nothing. This
  // pass-through was missing here (copy-edit and decision-log have it),
  // which stranded this walk on the Deadkeys step: the gallery helpers'
  // soft waits expired against a screen with no gallery UI, and the
  // failure surfaced 20 minutes later as driveHelpPhase's fill waiting
  // on #pf_welcome_paragraph. Diagnosed from a locally retained
  // error-context snapshot showing the app still on Deadkeys at the cap.
  // The deadkeys half goes through driveDeadkeysStep (the race-hardened
  // helper copy-edit / decision-log use — it races deadkeys-continue
  // against rules-continue) rather than a plain wait here, so this walk
  // carries on if a future gate ever completes deadkeys without a
  // screen instead of parking on the wait.
  await driveDeadkeysStep(page);
  await page.getByTestId("rules-continue").waitFor({ state: "visible", timeout: 30_000 });
  await page.getByTestId("rules-continue").click();

  await driveMechanismsGallery(page);
  await driveTouchGallery(page);
  await driveHelpPhase(page, "Welcome to the keyboard.", "Press a key to start.");
  await page.waitForURL(/#output$/, { timeout: 30_000 });

  const download = await triggerDownload(page);
  const zipPath = await download.path();
  expect(zipPath).not.toBeNull();
  const walked = fs.readFileSync(zipPath!);

  if (CAPTURE) {
    fs.mkdirSync(path.dirname(BASELINE_PATH), { recursive: true });
    fs.writeFileSync(BASELINE_PATH, walked);
    return;
  }

  expect(
    fs.existsSync(BASELINE_PATH),
    `golden-walk baseline missing at ${BASELINE_PATH} — capture it with GOLDEN_WALK_CAPTURE=1 (see this file's header)`,
  ).toBe(true);
  const baseline = fs.readFileSync(BASELINE_PATH);

  const baselineEntries = unzipSync(baseline);
  const walkedEntries = unzipSync(new Uint8Array(walked));

  const baselineNames = Object.keys(baselineEntries).sort();
  const walkedNames = Object.keys(walkedEntries).sort();
  expect(
    walkedNames,
    "golden walk emitted a different file set than the baseline",
  ).toEqual(baselineNames);

  const differing: string[] = [];
  for (const name of baselineNames) {
    if (NON_BYTE_COMPARED.has(name)) {
      // Presence (asserted by the name-set equality above) + parseability.
      const text = new TextDecoder().decode(walkedEntries[name]);
      expect(() => JSON.parse(text) as unknown, `${name} must stay valid JSON`).not.toThrow();
      continue;
    }
    const a = comparableBytes(name, baselineEntries[name]!);
    const b = comparableBytes(name, walkedEntries[name]!);
    if (a.length !== b.length || !a.every((byte, i) => byte === b[i])) {
      differing.push(name);
    }
  }
  expect(
    differing,
    `golden walk output differs from the baseline in: ${differing.join(", ") || "(none)"}`,
  ).toEqual([]);
});
