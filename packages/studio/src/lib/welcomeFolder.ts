// welcomeFolder — the `source/welcome/` folder convention's paths and the one
// "which base images went missing" rule (spec 076 FR-002 / FR-006).
//
// Split out of serializeWorkingCopy.ts so the Output documentation checklist
// (hooks/useDocMemberStates.ts) can compute the same missing-image warning the
// projection emits WITHOUT importing the projection module — that module pulls
// the pattern library, zip, and compiler services, which component tests mock
// wholesale, and a mocked barrel would leave these pure helpers undefined.

import type { ChartPreference, WelcomeFolderImage } from "@keyboard-studio/contracts";
import { extractWelcomeImageRefs } from "@keyboard-studio/engine";

/**
 * The layout-chart choice in force (spec 076 FR-015): the author's explicit
 * choice when made, else keep the base's own images when it ships any and
 * generate charts otherwise. The one place the default is resolved — the
 * Output checklist control and the projection both read it.
 */
export function effectiveChartPreference(
  chartPreference: ChartPreference | null,
  baseShipsImages: boolean,
): ChartPreference {
  return chartPreference ?? (baseShipsImages ? "keep-base-images" : "regenerate");
}

/** The `source/`-relative welcome folder (spec 076 FR-002). */
export const WELCOME_FOLDER = "welcome";
/** Where the welcome page ships (FR-002). */
export const WELCOME_PAGE_PATH = `source/${WELCOME_FOLDER}/welcome.htm`;
/** The pre-076 flat path, which output must never carry (FR-002). */
export const FLAT_WELCOME_PATH = "source/welcome.htm";

/** The carried base images that live in the welcome folder, in carry order. */
export function carriedWelcomeImages(images: readonly WelcomeFolderImage[] | null): WelcomeFolderImage[] {
  return (images ?? []).filter((img) => img.path.startsWith(`${WELCOME_FOLDER}/`));
}

/** Bare file names (no folder prefix) of the carried welcome-folder images. */
export function welcomeFolderFileNames(images: readonly WelcomeFolderImage[] | null): string[] {
  return carriedWelcomeImages(images).map((img) => img.path.slice(WELCOME_FOLDER.length + 1));
}

/**
 * The base page's relative `<img src>` targets that no carried image satisfies.
 *
 * A reference is satisfied when it names a carried file either as the bare
 * name (`chart.png` — the page and images share the folder) or with the
 * folder prefix (`welcome/chart.png` — a flat-convention page pointing INTO
 * the folder). Case-insensitive, like the descriptor comparison.
 */
export function missingInheritedImageRefs(
  baseWelcomeHtmText: string,
  carriedNames: readonly string[],
): string[] {
  const carried = new Set(carriedNames.map((n) => n.toLowerCase()));
  return extractWelcomeImageRefs(baseWelcomeHtmText).filter((ref) => {
    const key = ref.toLowerCase();
    const bare = key.startsWith(`${WELCOME_FOLDER}/`) ? key.slice(WELCOME_FOLDER.length + 1) : key;
    return !carried.has(bare);
  });
}
