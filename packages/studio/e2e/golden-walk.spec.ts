/**
 * E2E: spec 089 SC-001 — the golden walk. One fixed authoring walk on the
 * copy track from `basic_kbdfr`, ending in the source-.zip download; the
 * emitted files are compared byte-for-byte against the committed baseline.
 * Specs 090–093 reuse this same walk as their no-visible-change oracle.
 *
 * THE WALK (fixed answers — changing any of them re-baselines the fixture):
 *   identity-lite: english "Test", autonym "Test Autonym", language code
 *     "fr", target script "other", author "Test Author" (the driveIdentityLite
 *     defaults + languageCode "fr" — the same fixture spec 088's SC-001 walk
 *     uses)
 *     -> layout confirm -> base picker (basic_kbdfr) -> track (copy)
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
 * baseline exactly, with ONE documented exception:
 *   - `.studio/decision-record.json` embeds `recordedAt` wall-clock
 *     timestamps by design (spec 053), so it is checked for presence and
 *     JSON parseability only, never byte-compared.
 * A mismatch fails with the differing entry names, so the spec delta that
 * changed the output is named, not inferred.
 *
 * CAPTURE ENVIRONMENT (research R9): run with `VITE_KM_MUTATE_SEAM=1` in
 * the environment (the Playwright webServer inherits it for `pnpm dev`).
 * The baseline is only meaningful under the flag-on environment: once the
 * seam is unconditional the emitter includes the `kmStandardLetters` store
 * pb_standard_letters writes, and a flag-off baseline would make SC-001
 * unsatisfiable by construction.
 *
 * CAPTURE / RE-CAPTURE (one command):
 *   GOLDEN_WALK_CAPTURE=1 VITE_KM_MUTATE_SEAM=1 npx playwright test \
 *     e2e/golden-walk.spec.ts --project=desktop
 * writes the downloaded archive to
 *   e2e/fixtures/golden-walk/basic-kbdfr-copy.zip
 * and the test passes trivially. Record the capture in
 * e2e/fixtures/golden-walk/README.md (base commit, date, environment) —
 * note the HISTORY proposal carries the capture date, so a re-capture on
 * a different day legitimately differs in that entry alone.
 *
 * VERIFY (the default mode):
 *   VITE_KM_MUTATE_SEAM=1 npx playwright test \
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
  pickBaseKeyboard,
  chooseTrackCopy,
  acceptProjectName,
  confirmPrefill,
  buildOneCharacterList,
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

const CAPTURE = process.env["GOLDEN_WALK_CAPTURE"] === "1";

test("spec 089 SC-001: golden walk emits the baseline source zip byte-for-byte", async ({
  page,
}) => {
  await seedReturningVisitor(page);
  await page.goto("/");

  await driveIdentityLite(page, { languageCode: "fr", authorName: "Test Author" });
  await pickBaseKeyboard(page, "basic_kbdfr");
  await chooseTrackCopy(page);
  await acceptProjectName(page);
  await confirmPrefill(page);

  await buildOneCharacterList(page, "é");

  // Carve: discard nothing — the fixed walk keeps the base's full inventory.
  await page.getByTestId("carve-gallery").waitFor({ state: "visible", timeout: 30_000 });
  await page.getByTestId("carve-continue").click();

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
    const a = baselineEntries[name]!;
    const b = walkedEntries[name]!;
    if (a.length !== b.length || !a.every((byte, i) => byte === b[i])) {
      differing.push(name);
    }
  }
  expect(
    differing,
    `golden walk output differs from the baseline in: ${differing.join(", ") || "(none)"}`,
  ).toEqual([]);
});
