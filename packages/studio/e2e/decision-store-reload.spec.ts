/**
 * E2E: spec 088 SC-001 — answers survive a reload, stored only in `decisions`.
 *
 * Walk (live app, `pnpm dev`):
 *   identity-lite (language code "fr", author "Test Author")
 *     -> layout confirm -> base picker (basic_kbdfr)
 *       -> track choice (copy) -> project name (accepted pre-fill)
 * Then:
 *   1. Read the saved draft from localStorage (`ks.draft.<key>.v2`):
 *      the `decisions` slice holds language-code / authoring-track /
 *      project-display-name / project-keyboard-id records, and the
 *      persisted `surveyAnswers` slice holds NO survey-question answers.
 *   2. Reload the page: the draft is restored (the app resumes the project
 *      at the step the walk reached — the characters step's prefill
 *      confirmation, "Confirm the basics", whose forward control is
 *      `prefill-confirm`, not a SurveyRunner `survey-advance`) instead of
 *      restarting at identity, and the decisions are unchanged.
 *
 * The store-level half of SC-001 (records restored with value + provenance
 * through the real StepHost) is pinned by StepHost.test.tsx (spec 088 T012);
 * this spec is the live-app half. Reuses the copy-edit walk helpers.
 */
import { test, expect, type Page } from "playwright/test";
import {
  driveIdentityLite,
  pickBaseKeyboard,
  chooseTrackCopy,
  acceptProjectName,
  seedReturningVisitor,
} from "./helpers/surveyFlow";

interface DraftShape {
  version: number;
  decisions?: Record<string, { value: unknown; provenance: string } | undefined>;
  surveyAnswers?: { steps: Record<string, { answers: Record<string, unknown> }> };
}

async function readSavedDraft(page: Page): Promise<DraftShape> {
  return page.evaluate(() => {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key === null || !key.startsWith("ks.draft.") || !key.endsWith(".v2")) continue;
      if (key.includes("__pending__")) continue;
      const raw = localStorage.getItem(key);
      if (raw !== null) return JSON.parse(raw) as DraftShape;
    }
    throw new Error("no saved .v2 draft found in localStorage");
  });
}

test("spec 088 SC-001: answers survive a reload, stored only in decisions", async ({ page }) => {
  await seedReturningVisitor(page);
  await page.goto("/");

  await driveIdentityLite(page, { languageCode: "fr", authorName: "Test Author" });
  await pickBaseKeyboard(page, "basic_kbdfr");
  await chooseTrackCopy(page);
  await acceptProjectName(page);

  // The walk now sits on the characters step's prefill confirmation — the
  // surface the reload below must return to.
  await expect(page.getByTestId("prefill-confirm")).toBeVisible({ timeout: 15_000 });

  // The autosave lands shortly after the project_name completion.
  await page.waitForTimeout(1_500);
  const draft = await readSavedDraft(page);
  expect(draft.version).toBe(2);

  const decisions = draft.decisions ?? {};
  expect(decisions["language-code"]?.value).toBe("fr");
  expect(decisions["authoring-track"]?.value).toBe("copy");
  expect(typeof decisions["project-display-name"]?.value).toBe("string");
  expect(typeof decisions["project-keyboard-id"]?.value).toBe("string");
  // Copyright holder defaults to the author name in the identity flow (D1);
  // when the flow records it, it must be a decision record too.
  if (decisions["copyright-holder"] !== undefined) {
    expect(decisions["copyright-holder"]?.value).toBe("Test Author");
  }

  // No survey-question answer persists outside `decisions` (FR-006).
  const persistedAnswerIds = Object.values(draft.surveyAnswers?.steps ?? {}).flatMap((s) =>
    Object.keys(s.answers),
  );
  for (const id of persistedAnswerIds) {
    expect(id.startsWith("il_")).toBe(false);
    expect(["track_choice", "project_display_name", "project_keyboard_id"]).not.toContain(id);
  }

  await page.reload();
  // The restored draft resumes the project at the same surface (the
  // prefill confirmation, showing the restored base keyboard), and the
  // draft on disk still carries the same decisions.
  await expect(page.getByTestId("prefill-confirm")).toBeVisible({ timeout: 90_000 });
  await expect(page.getByText("French Basic (basic_kbdfr)")).toBeVisible();
  const after = await readSavedDraft(page);
  expect(after.decisions?.["language-code"]?.value).toBe("fr");
  expect(after.decisions?.["authoring-track"]?.value).toBe("copy");
});
