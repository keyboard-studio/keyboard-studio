// welcomeFolder — the `source/welcome/` folder convention's paths and the one
// "which base images went missing" rule (spec 079 FR-002 / FR-006).
//
// Split out of serializeWorkingCopy.ts so the Output documentation checklist
// (hooks/useDocMemberStates.ts) can compute the same missing-image warning the
// projection emits WITHOUT importing the projection module — that module pulls
// the pattern library, zip, and compiler services, which component tests mock
// wholesale, and a mocked barrel would leave these pure helpers undefined.

import type { ChartPreference, WelcomeFolderImage } from "@keyboard-studio/contracts";
import { extractWelcomeImageRefs } from "@keyboard-studio/engine";

/**
 * The layout-chart choice in force (spec 079 FR-015): the author's explicit
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

/** The `source/`-relative welcome folder (spec 079 FR-002). */
export const WELCOME_FOLDER = "welcome";
/** Where the welcome page ships (FR-002). */
export const WELCOME_PAGE_PATH = `source/${WELCOME_FOLDER}/welcome.htm`;
/** The pre-076 flat path, which output must never carry (FR-002). */
export const FLAT_WELCOME_PATH = "source/welcome.htm";

/** File types a copy carries from the base's welcome folder. */
const WELCOME_IMAGE_EXTENSIONS = /\.(png|jpe?g|gif|svg|webp|bmp)$/i;

/**
 * The carried base files that live in the welcome folder, in carry order.
 *
 * `imagesOnly` is the track rule (spec 080 R9 / FR-007): a copy
 * inherits the base's welcome IMAGES and nothing of its prose, so a copy
 * passes `true` and the folder's sub-pages (`.htm`) and stylesheets (`kb.css`)
 * stay behind — its pages are fresh renders with their own inline style. An
 * adaptation passes `false`: those files are its own documentation, which its
 * inherited pages link to.
 */
export function carriedWelcomeImages(
  images: readonly WelcomeFolderImage[] | null,
  imagesOnly: boolean,
): WelcomeFolderImage[] {
  return (images ?? []).filter(
    (img) => img.path.startsWith(`${WELCOME_FOLDER}/`) && (!imagesOnly || WELCOME_IMAGE_EXTENSIONS.test(img.path)),
  );
}

/** Bare file names (no folder prefix) of the carried welcome-folder files. */
export function welcomeFolderFileNames(images: readonly WelcomeFolderImage[] | null, imagesOnly: boolean): string[] {
  return carriedWelcomeImages(images, imagesOnly).map((img) => img.path.slice(WELCOME_FOLDER.length + 1));
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
  startWelcomeHtmText: string,
  carriedNames: readonly string[],
): string[] {
  const carried = new Set(carriedNames.map((n) => n.toLowerCase()));
  return extractWelcomeImageRefs(startWelcomeHtmText).filter((ref) => {
    const key = ref.toLowerCase();
    const bare = key.startsWith(`${WELCOME_FOLDER}/`) ? key.slice(WELCOME_FOLDER.length + 1) : key;
    return !carried.has(bare);
  });
}
