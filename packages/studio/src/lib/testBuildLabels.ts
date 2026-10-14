// testBuildLabels — the "Test build N" text a test build carries in its
// package name, description and welcome page (spec 094 FR-008, contracts C2).
//
// Localized through the catalog like every other author-facing string (FR-018),
// in the author's UI locale: one notice block, not per-language welcome pages
// (spec §16). Resolved against the app's global Lingui instance once a locale
// is active; falls back to the English source otherwise (resolveMessage's
// convention), so a projection run outside the app still labels the build.

import { i18n } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { resolveMessage } from "./i18nResolve.ts";

function activeI18n() {
  return i18n.locale !== undefined && i18n.locale !== "" ? i18n : undefined;
}

/** Appended to the package's display name: "Bambara (Test build 2)". */
export function testBuildNameSuffix(number: number): string {
  return resolveMessage(activeI18n(), msg({ id: "output.testing.package.nameSuffix", message: `(Test build ${number})` }));
}

/** Put before the package description: "Test build 2 — …". */
export function testBuildDescriptionPrefix(number: number): string {
  return resolveMessage(activeI18n(), msg({ id: "output.testing.package.descriptionPrefix", message: `Test build ${number} —` }));
}

/** The notice at the top of the welcome page, as plain text. */
export function testBuildWelcomeNotice(number: number, version: string): string {
  return resolveMessage(
    activeI18n(),
    msg({
      id: "output.testing.package.welcomeNotice",
      message: `Test build ${number} (version ${version}). This is a test version of the keyboard, shared for checking before it is published. The published keyboard will replace it.`,
    }),
  );
}
