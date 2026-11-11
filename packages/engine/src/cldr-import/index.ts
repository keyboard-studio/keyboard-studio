// CLDR legacy (43.1) import — combined desktop + touch entry points and the
// start-keyboard picker surface (issue #2599).
//
// A locale's desktop file (windows > osx > chromeos) seeds the rules; its
// Android phone file seeds the phone touch layout and the 600dpi file the
// tablet layout. Locales with an Android file but no desktop file (10 of 266
// picker groups) fall back to deriving the desktop half from the Android
// phone file's letter keyMaps — its `opt` keyMaps stay touch-only (ruling §4).

import {
  makeStartKeyboard,
  type StartKeyboard,
} from "@keyboard-studio/contracts";
import { CLDR_INDEX, type CldrIndexEntry } from "./cldr-index.generated.js";
import {
  type CldrLegacyKeyboard,
} from "./legacyXml.js";
import {
  importCldrDesktopKeyboard,
  type CldrDesktopImportReport,
  type CldrDesktopImportResult,
} from "./toIr.js";
import {
  importCldrTouchLayout,
  makeDesktopTouchResolver,
  type CldrTouchImportReport,
} from "./touch.js";

export { CLDR_INDEX, type CldrIndexEntry };
export {
  parseCldrLegacyKeyboard,
  type CldrLegacyKeyboard,
  type CldrLegacyKeyMap,
  type CldrLegacyMap,
  type CldrLegacyTransform,
} from "./legacyXml.js";
export {
  importCldrDesktopKeyboard,
  type CldrDesktopImportReport,
  type CldrDesktopImportResult,
  type CldrSkippedItem,
} from "./toIr.js";
export {
  importCldrTouchLayout,
  makeDesktopTouchResolver,
  type CldrTouchImportReport,
  type CldrTouchImportResult,
  type CldrTouchKeyResolver,
} from "./touch.js";
export { isoToVkey, expandModifiers, formForLocale } from "./isoKeys.js";
export { deadkeyNameFor } from "./toIr.js";

/** Pinned CLDR source for this importer. */
export const CLDR_REPO = "unicode-org/cldr";
export const CLDR_TAG = "release-43-1";
export const CLDR_RAW_BASE =
  `https://raw.githubusercontent.com/${CLDR_REPO}/${CLDR_TAG}/keyboards`;

/** Raw URL of one indexed file. */
export function cldrFileUrl(
  platform: CldrIndexEntry["platform"],
  file: string,
): string {
  return `${CLDR_RAW_BASE}/${platform}/${file}`;
}

/** Repo-relative path used in attribution (`Adapted from:` lines). */
export function cldrAttributionPath(
  platform: CldrIndexEntry["platform"],
  file: string,
): string {
  return `${CLDR_REPO}@${CLDR_TAG}:keyboards/${platform}/${file}`;
}

/** Pinned tag commit SHA from the generated index (null when unknown). */
export function cldrSourceCommit(): string | null {
  return CLDR_INDEX.source.commit;
}

export interface ImportCldrKeyboardOptions {
  desktop: CldrLegacyKeyboard;
  /** Android phone file — seeds the phone touch layout. */
  android?: CldrLegacyKeyboard;
  /** Android 600dpi file — seeds the tablet touch layout. */
  androidTablet?: CldrLegacyKeyboard;
  keyboardId: string;
  displayName: string;
  bcp47?: string[];
  /**
   * `"android"` when `desktop` IS the Android phone file (Android-only
   * locale fallback, ruling §4) — its `opt` keyMaps stay touch-only.
   */
  desktopFileKind?: "desktop" | "android";
  /** Repo-relative source paths, e.g. `keyboards/windows/de-t-k0-windows.xml`. */
  sourceFiles: {
    desktop: string;
    android?: string;
    androidTablet?: string;
  };
}

export interface ImportCldrKeyboardResult {
  ir: CldrDesktopImportResult["ir"];
  desktopReport: CldrDesktopImportReport;
  touchReport?: CldrTouchImportReport;
  tabletReport?: CldrTouchImportReport;
}

/**
 * Import one CLDR locale into a working-copy IR: desktop rules from the
 * desktop file, phone + tablet touch layouts from the Android files.
 * The `&LAYOUTFILE` store is added when a touch layout was imported, so the
 * emitted `.kmn` references the sibling `.keyman-touch-layout` file.
 */
export function importCldrKeyboard(
  opts: ImportCldrKeyboardOptions,
): ImportCldrKeyboardResult {
  const { ir, report: desktopReport } = importCldrDesktopKeyboard(
    opts.desktop,
    {
      keyboardId: opts.keyboardId,
      displayName: opts.displayName,
      ...(opts.bcp47 !== undefined ? { bcp47: opts.bcp47 } : {}),
      sourceFile: opts.sourceFiles.desktop,
      ...(opts.desktopFileKind !== undefined
        ? { fileKind: opts.desktopFileKind }
        : {}),
    },
  );

  let touchReport: CldrTouchImportReport | undefined;
  let tabletReport: CldrTouchImportReport | undefined;
  const touchPlatforms: NonNullable<
    typeof ir.touchLayout
  >["platforms"] = [];
  if (opts.android !== undefined || opts.androidTablet !== undefined) {
    const resolver = makeDesktopTouchResolver(opts.desktop);
    if (opts.android !== undefined) {
      const phone = importCldrTouchLayout(opts.android, {
        platform: "phone",
        resolver,
      });
      touchPlatforms.push(...phone.touchLayout.platforms);
      touchReport = phone.report;
    }
    if (opts.androidTablet !== undefined) {
      const tablet = importCldrTouchLayout(opts.androidTablet, {
        platform: "tablet",
        resolver,
      });
      touchPlatforms.push(...tablet.touchLayout.platforms);
      tabletReport = tablet.report;
    }
    ir.touchLayout = { platforms: touchPlatforms, nodeIds: [] };
    ir.stores.push({
      nodeId: "store:cldr:LAYOUTFILE",
      name: "LAYOUTFILE",
      isSystem: true,
      items: [...`${opts.keyboardId}.keyman-touch-layout`].map((ch) => ({
        kind: "char",
        value: ch,
      }) as const),
    });
    // Extend the source comment with the touch origin (ruling §10).
    const comment = ir.comments.find((c) => c.nodeId === "comment:cldr-source");
    if (comment !== undefined) {
      const touchSources = [
        opts.sourceFiles.android,
        opts.sourceFiles.androidTablet,
      ]
        .filter((s): s is string => s !== undefined)
        .join(", ");
      comment.text += ` Touch layout from CLDR 43.1 ${touchSources} under the same licence.`;
    }
  }

  return {
    ir,
    desktopReport,
    ...(touchReport !== undefined ? { touchReport } : {}),
    ...(tabletReport !== undefined ? { tabletReport } : {}),
  };
}

// ---------------------------------------------------------------------------
// Start-keyboard picker entries (ruling §2a)
// ---------------------------------------------------------------------------

const DESKTOP_PRECEDENCE: ReadonlyArray<CldrIndexEntry["platform"]> = [
  "windows",
  "osx",
  "chromeos",
];

/** `de` → `de`; `zh-Hant` → `zh_hant`; `es-US` → `es_us`. */
function sanitizeIdPart(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

/** Desktop platforms a CLDR index entry can carry (never android). */
export type CldrDesktopPlatform = "windows" | "osx" | "chromeos";

export interface CldrPickerGroup {
  locale: string;
  variant: string;
  desktop?: CldrIndexEntry & { platform: CldrDesktopPlatform };
  androidPhone?: CldrIndexEntry;
  androidTablet?: CldrIndexEntry;
}

/** Group the per-file index into one picker entry per (locale, variant). */
export function groupCldrIndex(
  entries: readonly CldrIndexEntry[] = CLDR_INDEX.entries,
): CldrPickerGroup[] {
  const groups = new Map<string, CldrPickerGroup>();
  for (const entry of entries) {
    const key = `${entry.locale}\0${entry.variant}`;
    const group = groups.get(key) ?? {
      locale: entry.locale,
      variant: entry.variant,
    };
    if (entry.platform === "android") {
      if (entry.dpi === undefined) {
        if (group.androidPhone === undefined) group.androidPhone = entry;
      } else if (entry.dpi === "600dpi") {
        if (group.androidTablet === undefined) group.androidTablet = entry;
      }
      // 768dpi duplicates the 600dpi tablet layout; the tablet platform
      // carries one file, so the second dpi variant is not a group member.
    } else {
      // entry.platform is windows | osx | chromeos here (android took the
      // branch above); CldrIndexEntry is not a discriminated union, so the
      // cast records that narrowing for the group's desktop slot.
      const desktopEntry = entry as CldrIndexEntry & {
        platform: CldrDesktopPlatform;
      };
      if (
        group.desktop === undefined ||
        DESKTOP_PRECEDENCE.indexOf(desktopEntry.platform) <
          DESKTOP_PRECEDENCE.indexOf(group.desktop.platform)
      ) {
        group.desktop = desktopEntry;
      }
    }
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) =>
    a.locale.localeCompare(b.locale) ||
    a.variant.localeCompare(b.variant),
  );
}

const PLATFORM_LABEL: Record<CldrIndexEntry["platform"], string> = {
  windows: "Windows",
  osx: "macOS",
  chromeos: "ChromeOS",
  android: "Android",
};

const TARGETS_ALL = [
  "windows",
  "macosx",
  "linux",
  "web",
  "mobile",
  "tablet",
] as const;
const TARGETS_DESKTOP_ONLY = ["windows", "macosx", "linux", "web"] as const;
const TARGETS_TOUCH_ONLY = ["web", "mobile", "tablet"] as const;

/**
 * One `StartKeyboard` per (locale, variant) group: the desktop file (windows
 * > osx > chromeos) plus the Android phone/tablet files when they exist.
 * Groups with no desktop file (Android-only locales) still appear — the
 * loader derives their desktop half from the Android phone file (ruling §4).
 */
export function cldrStartKeyboards(
  entries: readonly CldrIndexEntry[] = CLDR_INDEX.entries,
): StartKeyboard[] {
  return groupCldrIndex(entries).map((group) => {
    const primary = group.desktop ?? group.androidPhone;
    if (primary === undefined) {
      throw new Error(
        `CLDR index group ${group.locale} ${group.variant}: no file`,
      );
    }
    const hasDesktop = group.desktop !== undefined;
    const hasTouch = group.androidPhone !== undefined;
    const idParts = ["cldr", sanitizeIdPart(group.locale)];
    if (group.variant !== "") idParts.push(sanitizeIdPart(group.variant));
    const displayPlatform = hasDesktop
      ? PLATFORM_LABEL[group.desktop?.platform as CldrIndexEntry["platform"]]
      : "Android";
    return makeStartKeyboard({
      id: idParts.join("_"),
      path: `cldr/${primary.platform}/${primary.file}`,
      script: primary.script,
      targets: [
        ...(hasDesktop && hasTouch
          ? TARGETS_ALL
          : hasDesktop
            ? TARGETS_DESKTOP_ONLY
            : TARGETS_TOUCH_ONLY),
      ],
      displayName: `${primary.name} (CLDR ${displayPlatform})`,
      version: "43.1",
      sourceUrl: `https://github.com/${CLDR_REPO}/blob/${CLDR_TAG}/keyboards/${primary.platform}/${primary.file}`,
      languages: [group.locale],
      origin: "cldr",
      cldr: {
        locale: group.locale,
        variant: group.variant,
        ...(group.desktop !== undefined
          ? {
              desktopPlatform: group.desktop.platform,
              desktopFile: group.desktop.file,
            }
          : {}),
        ...(group.androidPhone !== undefined
          ? { androidFile: group.androidPhone.file }
          : {}),
        ...(group.androidTablet !== undefined
          ? { tabletFile: group.androidTablet.file }
          : {}),
      },
    });
  });
}
