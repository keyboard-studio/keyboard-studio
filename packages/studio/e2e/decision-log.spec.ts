/**
 * E2E: spec 090 SC-003 — the decision trail holds exactly one live entry
 * per decision after a full authoring walk. The walk is the golden walk's
 * (copy track from `basic_kbdfr`, same fixed answers, same helpers), plus
 * the deadkeys/rules pass-through copy-edit.spec.ts uses; at Output the
 * downloaded source .zip's `.studio/decision-record.json` sidecar is
 * parsed and checked:
 *
 *   - every one of the fourteen gallery decision ids has EXACTLY ONE live
 *     `decision`-kind entry (live = no other entry's `supersedes` names
 *     it), carrying a non-empty summary within the format's bound;
 *   - no slot of any kind holds more than one live entry (the exactly-once
 *     invariant SC-003 states; slots here are keyed per kind the way
 *     decisions/decisionLogStore.ts keys them — decision slots by
 *     decisionId, which is the production key for the new kind).
 *
 * What is deliberately NOT asserted: a `base-contribution` entry. The
 * HANDOFF G7 starting-point item is a known open residue (see
 * specs/090-gallery-decision-modules/followups.md): the completion
 * recorder fires before the working copy is instantiated, so
 * recordBaseContribution returns null on this walk too. Asserting its
 * presence here would fail for a reason owned by the 088/092 boundary,
 * not by 090.
 *
 * This spec runs in CI (the standing live-capture ruling: sandbox
 * Chromium blocks localhost navigation, so in-sandbox evidence for SC-003
 * is the store-level StepHost suite,
 * src/decisions/galleryLogEntries.test.ts).
 *
 *   npx playwright test e2e/decision-log.spec.ts --project=desktop
 */
import { test, expect } from "playwright/test";
import { unzipSync } from "fflate";
import * as fs from "node:fs";
import {
  seedReturningVisitor,
  driveIdentityLite,
  pickBaseKeyboard,
  chooseTrackCopy,
  driveAttributionStep,
  acceptProjectName,
  confirmPrefill,
  buildOneCharacterList,
  driveMechanismsGallery,
  driveTouchGallery,
  driveHelpPhase,
  triggerDownload,
} from "./helpers/surveyFlow";

/** The fourteen gallery decision ids (spec 090 FR-002's coverage set). */
const GALLERY_DECISION_IDS = [
  "windows-layout",
  "base-keyboard",
  "character-inventory",
  "marks-treatment",
  "punctuation-inventory",
  "invisibles-inventory",
  "retained-convenience-chars",
  "carved-layout",
  "deadkeys-defined",
  "rule-set",
  "physical-layout",
  "touch-seed-source",
  "touch-layout",
  "help-docs",
] as const;

interface SidecarEntry {
  entryId: string;
  stepId: string;
  supersedes: string | null;
  payload:
    | { kind: "decision"; decisionId: string; summary: string }
    | { kind: "survey-answer"; questionId: string }
    | { kind: "editor-action"; actionType: string }
    | { kind: string };
}

/** Slot key per kind, mirroring decisionLogStore.slotKeyOf's shapes. */
function slotKeyOf(entry: SidecarEntry): string {
  const p = entry.payload;
  if (p.kind === "decision") return `decision:${(p as { decisionId: string }).decisionId}`;
  if (p.kind === "survey-answer") return `survey:${entry.stepId}:${(p as { questionId: string }).questionId}`;
  if (p.kind === "editor-action") return `editor:${entry.stepId}:${(p as { actionType: string }).actionType}`;
  return `${p.kind}:${entry.stepId}`;
}

test("spec 090 SC-003: full walk leaves exactly one live log entry per decision", async ({
  page,
}) => {
  await seedReturningVisitor(page);
  await page.goto("/");

  await driveIdentityLite(page, { languageCode: "fr" });
  await pickBaseKeyboard(page, "basic_kbdfr");
  await chooseTrackCopy(page);
  await driveAttributionStep(page);
  await acceptProjectName(page);
  await confirmPrefill(page);

  await buildOneCharacterList(page, "é");

  // Carve: discard nothing — the fixed walk keeps the base's full inventory.
  await page.getByTestId("carve-gallery").waitFor({ state: "visible", timeout: 30_000 });
  await page.getByTestId("carve-continue").click();
  // Deadkeys (spec 083) and rules (spec 082) sit between carve and
  // mechanisms — walk through both, defining/installing nothing.
  await page.getByTestId("deadkeys-continue").waitFor({ state: "visible", timeout: 30_000 });
  await page.getByTestId("deadkeys-continue").click();
  await page.getByTestId("rules-continue").waitFor({ state: "visible", timeout: 30_000 });
  await page.getByTestId("rules-continue").click();

  await driveMechanismsGallery(page);
  await driveTouchGallery(page);
  await driveHelpPhase(page, "Welcome to the keyboard.", "Press a key to start.");
  await page.waitForURL(/#output$/, { timeout: 30_000 });

  const download = await triggerDownload(page);
  const zipPath = await download.path();
  if (zipPath === null) throw new Error("download produced no file");
  const entries = unzipSync(new Uint8Array(fs.readFileSync(zipPath)));
  const sidecarBytes = entries[".studio/decision-record.json"];
  expect(sidecarBytes, "the download carries the decision-record sidecar").toBeDefined();
  const record = JSON.parse(new TextDecoder().decode(sidecarBytes)) as {
    entries: SidecarEntry[];
  };
  expect(Array.isArray(record.entries)).toBe(true);

  const superseded = new Set(
    record.entries.map((e) => e.supersedes).filter((id) => id !== null),
  );
  const live = record.entries.filter((e) => !superseded.has(e.entryId));

  // Exactly-once, universally: no slot holds two live entries.
  const liveBySlot = new Map<string, number>();
  for (const entry of live) {
    const slot = slotKeyOf(entry);
    liveBySlot.set(slot, (liveBySlot.get(slot) ?? 0) + 1);
  }
  const doubled = [...liveBySlot.entries()].filter(([, count]) => count > 1);
  expect(doubled, `slots with more than one live entry: ${JSON.stringify(doubled)}`).toEqual([]);

  // The fourteen gallery decisions: exactly one live decision-kind entry
  // each, with a bounded human-readable summary (the format contract the
  // trail renders from — no per-module knowledge needed downstream).
  for (const decisionId of GALLERY_DECISION_IDS) {
    const mine = live.filter(
      (e) => e.payload.kind === "decision" && (e.payload as { decisionId: string }).decisionId === decisionId,
    );
    expect(mine, `live decision entries for ${decisionId}`).toHaveLength(1);
    const summary = (mine[0]!.payload as { summary: string }).summary;
    expect(summary.length).toBeGreaterThan(0);
    expect(summary.length).toBeLessThanOrEqual(200);
  }
});
