// build — construct a complete, buildable Keyman package descriptor (`.kps`).
//
// Moved here from the scaffolder's private `buildKpsContent` (spec 059 T002,
// contracts/package-descriptor.md). The move is what makes FR-005 true: there is
// exactly ONE writer of the descriptor's identity fields, and both authoring
// tracks reach it. Before the move the scaffolder owned the only copy, the adapt
// track never called the scaffolder, and so the adapt track shipped no descriptor
// at all while the copy track shipped one declaring the BASE keyboard's language.
//
// The one signature change from the original: the `languages: string[]` parameter
// (the base keyboard's tags) is replaced by `PackageDescriptorIdentity` — the
// AUTHOR's identity. Declaring the base's language was the defect, not a feature
// to preserve.

import type { PackageFontSet } from "@keyboard-studio/contracts";
import { escapeHtml } from "../shared/escapeHtml.js";

/**
 * `&TARGETS` tokens for which `kmc` emits a `.js` (KeymanWeb / touch) artifact.
 *
 * The `<Files>` list must mirror what the build actually emits: a listed file the
 * build does not produce fails `kmc` (and a produced file the package does not
 * list is dropped from the `.kmp`, silently, under CompilerWarningsAsErrors).
 * Derived from the emitted `.kmn`'s `&TARGETS` store (what kmc actually reads),
 * not from `StartKeyboard.targets` — the two can diverge during scaffolding/import.
 */
export const KMW_JS_TARGETS: ReadonlySet<string> = new Set([
  "any",
  "web",
  "mobile",
  "tablet",
  "iphone",
  "ipad",
  "androidphone",
  "androidtablet",
]);

/** The placeholder tag used when the author has declared no language at all. */
const UNDETERMINED_TAG = "und";

/**
 * The author's identity, as the descriptor declares it.
 *
 * See data-model.md §1 for the fallbacks. In short: a missing `languageTag`
 * degrades to the `und` placeholder and NEVER to the base keyboard's tags
 * (FR-007, SC-002), and a missing `languageName` lets the tag stand in as its
 * own display text — which is what the pre-057 writer already did for every tag.
 */
export interface PackageDescriptorIdentity {
  /** Drives `<Info><Name>`, `<Info><Description>`, `<Keyboards><Keyboard><Name>`. */
  displayName: string;
  /**
   * The composed BCP47 tag, taken WHOLE from the identity-lite result. Never
   * re-composed or re-parsed here — a second composition rule is a second
   * answer to "what tag did the author choose?" (FR-001, research D-03).
   */
  languageTag?: string;
  /** Display text for `<Language>` — the language's English name (FR-002). */
  languageName?: string;
  /**
   * The single-line copyright notice for `<Info><Copyright>` (spec 064 FR-003).
   *
   * Supplied by the caller from the SAME accumulated copyright block that wrote
   * `LICENSE.md` and `store(&COPYRIGHT)` — never composed here, for the reason
   * FR-005 exists: 22 shipped keyboards disagree between their `LICENSE.md` and
   * `.kmn` precisely because those strings were each built independently.
   *
   * Absent means "state no holder". The element is then omitted rather than
   * emitted with the display name in it, which is what named the keyboard as its
   * own rights holder before this feature.
   */
  copyrightLine?: string;
  /** Author name for `<Info><Author>` (spec 064 FR-003). Omitted when blank. */
  authorName?: string;
  /** Author email, emitted as the `<Author URL="mailto:…">` attribute. Optional. */
  authorEmail?: string;
  /**
   * The project's home-page URL, emitted as `<Info><WebSite>` (spec 061 FR-012,
   * research D-06). Sourced from `HelpDocsAnswers.projectHomeUrl` only — never
   * the help-page line, which has no corpus precedent as a second `<WebSite>`.
   * Omitted entirely when absent or blank.
   */
  websiteUrl?: string;
}

/**
 * Build a package (`.kps`) that Keyman Developer can compile to a `.kmp`.
 *
 * The empty `<Package><Info/><Files/></Package>` stub fails `kmc` with KM04021
 * (blank package version) and KM09010 (missing Description). This emits the
 * minimum buildable shape: `<FollowKeyboardVersion/>` (so the package inherits
 * the keyboard version), a non-empty Description, at least one language, and a
 * `<Files>` list derived from what the build actually produces — `.kmx` always,
 * `.js` only for web/touch targets, `.kvk` only when a visual keyboard exists.
 * `version` propagates from the source keyboard into
 * `<Keyboards><Keyboard><Version>` so Track 2 import does not silently downgrade
 * a 2.0 keyboard to 1.0.
 */
/**
 * The `&TARGETS` tokens declared in a `.kmn`'s header, lowercased.
 *
 * Exported so callers outside the descriptor (e.g. helpDocsRender's README
 * "Supported Platforms" list, spec 061 FR-008) parse the SAME store with the
 * SAME regex `buildKpsContent` uses for its own `.js`-emission decision,
 * rather than re-deriving the platform list a second way that could drift
 * from what `.kps` actually declares.
 */
export function parseTargetTokens(kmnText: string): string[] {
  // .kmn strings take either quote; about a fifth of the corpus writes
  // `store(&TARGETS) "any"`.
  const targetsMatch = /store\s*\(\s*&TARGETS\s*\)\s*(?:'([^']*)'|"([^"]*)")/i.exec(kmnText);
  return (targetsMatch?.[1] ?? targetsMatch?.[2] ?? "").toLowerCase().split(/[\s,]+/).filter(Boolean);
}

/**
 * The welcome page's `.kps` member reference — the folder convention's
 * backslash-relative form, as the corpus writes it (spec 080 FR-002).
 *
 * Exported so `patch.ts`'s welcome-path migration rewrites a flat reference
 * to the SAME string the generate path emits.
 */
export const WELCOME_PAGE_KPS_REF = "welcome\\welcome.htm";

/**
 * A welcome-folder file's `.kps` member reference from its bare name
 * (`desktop_default.png` → `welcome\desktop_default.png`). Shared by the
 * generate and migration paths so both list a carried image identically.
 */
export function welcomeFolderKpsRef(fileName: string): string {
  return `welcome\\${fileName.replace(/\//g, "\\")}`;
}

/**
 * A packaged font file's `.kps` member reference from its VFS key
 * (`shared/fonts/sil/x/Font.ttf` → `..\..\..\shared\fonts\sil\x\Font.ttf`).
 *
 * The VFS keeps fonts at their release-relative path, so the reference is the
 * one a keymanapp/keyboards descriptor writes from `release/<group>/<id>/source/`
 * (criterion 8: fonts referenced from `shared/fonts`). The in-browser `.kmp`
 * build resolves it to the same VFS key, because the rootless path normaliser
 * drops the `..` segments that climb past the keyboard root.
 *
 * A keyboard-local font (keyed `source/…` by the loader) sits
 * beside the `.kps`, so its reference is relative to `source/`.
 */
export function packageFontKpsRef(vfsPath: string): string {
  if (vfsPath.startsWith("source/")) return vfsPath.slice("source/".length).replace(/\//g, "\\");
  return `..\\..\\..\\${vfsPath.replace(/\//g, "\\")}`;
}

/** `<File>` entries for a font set, in its order (the base `.kps` order). */
function fontFileRefs(fonts: PackageFontSet | undefined): string[] {
  return fonts?.files.map(packageFontKpsRef) ?? [];
}

/** The `<OSKFont>` / `<DisplayFont>` lines for `<Keyboard>`, indented, or `""`. */
export function buildFontSelectionLines(fonts: PackageFontSet | undefined, indent = "      "): string {
  let out = "";
  if (fonts?.oskFont !== undefined) {
    out += `${indent}<OSKFont>${escapeHtml(packageFontKpsRef(fonts.oskFont))}</OSKFont>\n`;
  }
  if (fonts?.displayFont !== undefined) {
    out += `${indent}<DisplayFont>${escapeHtml(packageFontKpsRef(fonts.displayFont))}</DisplayFont>\n`;
  }
  return out;
}

/**
 * Normalise the caller's `welcomeFolderFiles` into distinct bare file names in
 * deterministic (caller) order: strips a `welcome/` or `welcome\` prefix if one
 * was passed, drops blanks, and drops the page itself (it is always listed
 * first, once, by the writer).
 */
export function normaliseWelcomeFolderFiles(welcomeFolderFiles: readonly string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of welcomeFolderFiles) {
    const name = raw.trim().replace(/\\/g, "/").replace(/^welcome\//i, "");
    if (name === "" || name.toLowerCase() === "welcome.htm") continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

/**
 * A font the descriptor must carry (#2308), in the writer's vocabulary: its
 * `.kps` member reference relative to `source/` (forward slashes; may climb
 * with `../` to reach the repo-level `shared/` tree) and whether the base
 * declared it as the keyboard's OSK/display font.
 */
export interface KpsFontDescriptorEntry {
  ref: string;
  isOskFont: boolean;
}

export function isKpsFontEntries(
  fonts: PackageFontSet | readonly KpsFontDescriptorEntry[] | undefined,
): fonts is readonly KpsFontDescriptorEntry[] {
  return Array.isArray(fonts);
}

/**
 * The `.kps` member reference for a loader-carried asset (a font, the keyboard
 * stylesheet), from its repo-relative path and the base keyboard's repo path.
 *
 * An asset inside the base's own `source/` ships inside the copy's `source/`
 * too, so its reference is the part below `source/`. Anything else — the
 * `shared/` fonts — lives at the keyboards-repo root, three levels up from
 * `<group>/<id>/source/`, which is the spelling the corpus writes
 * (`..\..\..\shared\fonts\…`).
 */
export function kpsMemberRef(relPath: string, baseKeyboardPath: string): string {
  const ownSourcePrefix = `${baseKeyboardPath}/source/`;
  if (relPath.startsWith(ownSourcePrefix)) {
    return relPath.slice(ownSourcePrefix.length);
  }
  const belowRelease = relPath.startsWith("release/")
    ? relPath.slice("release/".length)
    : relPath;
  return `../../../${belowRelease}`;
}

/**
 * Normalise the caller's font entries: trims refs, drops blanks, dedupes by
 * ref (case-insensitive — a base listing the same font as both a `<File>` and
 * an `<OSKFont>` must yield ONE entry, with the OSK flag winning).
 */
export function normaliseKpsFontEntries(
  fonts: readonly KpsFontDescriptorEntry[],
): KpsFontDescriptorEntry[] {
  const out: KpsFontDescriptorEntry[] = [];
  const indexByKey = new Map<string, number>();
  for (const font of fonts) {
    const ref = font.ref.trim().replace(/\\/g, "/");
    if (ref === "") continue;
    const key = ref.toLowerCase();
    const existingIdx = indexByKey.get(key);
    if (existingIdx !== undefined) {
      const prev = out[existingIdx];
      if (font.isOskFont && prev !== undefined) {
        out[existingIdx] = { ref: prev.ref, isOskFont: true };
      }
      continue;
    }
    indexByKey.set(key, out.length);
    out.push({ ref, isOskFont: font.isOskFont });
  }
  return out;
}

/** A member reference in the `.kps`'s backslash spelling. */
function toKpsRef(ref: string): string {
  return ref.replace(/\//g, "\\");
}

/**
 * The `<OSKFont>` / `<DisplayFont>` lines for `<Keyboard>`, or "" when no
 * carried font is the OSK font. The schema allows ONE of each element, and
 * the corpus points both at the same font, so the first OSK-flagged entry
 * fills both. Extra OSK-flagged fonts still ship via their `<File>` entries.
 */
function buildFontElements(fonts: readonly KpsFontDescriptorEntry[]): string {
  const osk = fonts.find((f) => f.isOskFont);
  if (osk === undefined) return "";
  const ref = escapeHtml(toKpsRef(osk.ref));
  return `      <OSKFont>${ref}</OSKFont>\n      <DisplayFont>${ref}</DisplayFont>\n`;
}

/**
 * @param welcomeFolderFiles the OTHER files shipped in `source/welcome/` beside
 *   the page — inherited base images and generated layout charts — as bare
 *   names relative to that folder (spec 080 FR-002/FR-006). Each is listed as
 *   `welcome\<name>`. The page itself is always listed and never needs passing.
 * @param fonts the starting keyboard's packaged fonts: each file
 *   is listed in `<Files>` and the OSK/display selections are declared on
 *   `<Keyboard>` (criteria 8 and 10).
 */
export function buildKpsContent(
  keyboardId: string,
  identity: PackageDescriptorIdentity,
  kmnText: string,
  version = "1.0",
  welcomeFolderFiles: readonly string[] = [],
  fonts?: PackageFontSet | readonly KpsFontDescriptorEntry[],
  /**
   * The base's carried keyboard stylesheet(s) (#2308), as member references
   * relative to `source/` — listed in `<Files>` beside the fonts. The caller
   * names the copy's file (the id-named sibling already renamed), matching
   * the file the loader carried.
   */
  stylesheets: readonly string[] = [],
): string {
  const targetTokens = parseTargetTokens(kmnText);
  const emitsJs = targetTokens.some((t) => KMW_JS_TARGETS.has(t));
  const hasVisualKeyboard = /store\s*\(\s*&VISUALKEYBOARD\s*\)/i.test(kmnText);

  const files = [`..\\build\\${keyboardId}.kmx`];
  if (emitsJs) files.push(`..\\build\\${keyboardId}.js`);
  if (hasVisualKeyboard) files.push(`..\\build\\${keyboardId}.kvk`);
  // spec 080 FR-002: the welcome page lives in the `welcome\` folder — the
  // corpus-majority convention (728 of 1026 bases) — with its images beside it.
  // The flat `welcome.htm` never appears in a produced package.
  files.push(WELCOME_PAGE_KPS_REF);
  for (const name of normaliseWelcomeFolderFiles(welcomeFolderFiles)) {
    files.push(welcomeFolderKpsRef(name));
  }
  files.push("readme.htm");
  const carriedFonts = isKpsFontEntries(fonts) ? normaliseKpsFontEntries(fonts) : undefined;
  const packageFonts = isKpsFontEntries(fonts) ? undefined : fonts;
  files.push(
    ...(carriedFonts?.map((font) => toKpsRef(font.ref)) ?? fontFileRefs(packageFonts)),
  );
  // LICENSE.md lives at the keyboard root, one level above this .kps's own
  // `source/` directory — like the `..\build\` artifacts, not like
  // welcome\welcome.htm/readme.htm, which sit alongside (or below) the .kps
  // itself (criterion 8.4-kps-includes-license-md).
  files.push("..\\LICENSE.md");
  // #2308: the keyboard stylesheet the loader carried is a package member too.
  for (const sheet of stylesheets) {
    const ref = sheet.trim().replace(/\\/g, "/");
    if (ref !== "") files.push(toKpsRef(ref));
  }

  const fileEntries = files
    .map((f) => {
      const ext = f.slice(f.lastIndexOf("."));
      return `    <File>\n      <Name>${escapeHtml(f)}</Name>\n      <FileType>${ext}</FileType>\n    </File>`;
    })
    .join("\n");

  const displayName = effectiveDisplayName(identity, keyboardId);
  const name = escapeHtml(displayName);
  const description = escapeHtml(`${displayName} keyboard, generated by Keyboard Studio.`);
  const websiteUrl = identity.websiteUrl?.trim() ?? "";
  const website =
    websiteUrl !== ""
      ? `    <WebSite URL="${escapeHtml(websiteUrl)}">${escapeHtml(websiteUrl)}</WebSite>\n`
      : "";

  return (
    `<?xml version="1.0" encoding="utf-8"?>\n` +
    `<Package>\n` +
    `  <System>\n    <KeymanDeveloperVersion>17.0.0.0</KeymanDeveloperVersion>\n    <FileVersion>7.0</FileVersion>\n  </System>\n` +
    `  <Options>\n    <ReadMeFile>readme.htm</ReadMeFile>\n    <LicenseFile>..\\LICENSE.md</LicenseFile>\n    <WelcomeFile>${WELCOME_PAGE_KPS_REF}</WelcomeFile>\n    <FollowKeyboardVersion/>\n  </Options>\n` +
    `  <Info>\n    <Name URL="">${name}</Name>\n    <Description URL="">${description}</Description>\n${website}${buildAttributionBlock(identity)}  </Info>\n` +
    `  <Files>\n${fileEntries}\n  </Files>\n` +
    `  <Keyboards>\n    <Keyboard>\n      <Name>${name}</Name>\n      <ID>${escapeHtml(keyboardId)}</ID>\n      <Version>${escapeHtml(version)}</Version>\n` +
    (carriedFonts !== undefined
      ? buildFontElements(carriedFonts)
      : buildFontSelectionLines(packageFonts)) +
    buildLanguagesBlock(identity) +
    `    </Keyboard>\n  </Keyboards>\n` +
    `</Package>\n`
  );
}

/**
 * The `<Copyright>` / `<Author>` lines for `<Info>`, indented and newline-terminated
 * (spec 064 FR-003), or `""` when there is nothing to state.
 *
 * Both elements are OMITTED rather than emitted empty when their source is absent.
 * An empty `<Copyright/>` asserts "this work has no copyright holder", which is a
 * different and false claim from saying nothing; and `kmc` does not require either
 * element, so silence is safe. For reference, 917/918 shipped keyboards populate
 * `<Copyright>` and 442 populate `<Author>`.
 *
 * `.trim()` on the guards, matching `effectiveDisplayName`: a field holding only a
 * space has not been filled in.
 */
function buildAttributionBlock(identity: PackageDescriptorIdentity): string {
  const copyrightLine = identity.copyrightLine?.trim() ?? "";
  const authorName = identity.authorName?.trim() ?? "";
  const authorEmail = identity.authorEmail?.trim() ?? "";

  const copyright =
    copyrightLine !== ""
      ? `    <Copyright URL="">${escapeHtml(copyrightLine)}</Copyright>\n`
      : "";
  const author =
    authorName !== ""
      ? `    <Author URL="${authorEmail !== "" ? `mailto:${escapeHtml(authorEmail)}` : ""}">${escapeHtml(authorName)}</Author>\n`
      : "";

  return copyright + author;
}

/**
 * The name the descriptor declares, with the blank fallback applied.
 *
 * An empty `<Info><Name>` fails `kmc` (KM09010), so a blank display name falls back
 * to the keyboard id (data-model.md §1). Shared by BOTH writer paths — generate and
 * patch — because a blank name must not mean "leave whatever was there": on the copy
 * track what was there is the BASE keyboard's name, and silently shipping that is the
 * same defect class as silently shipping the base's language (FR-003, FR-007).
 *
 * `.trim()` rather than `!== ""`: an author who types a space into a cleared field has
 * not named their keyboard.
 */
export function effectiveDisplayName(
  identity: PackageDescriptorIdentity,
  keyboardId: string,
): string {
  return identity.displayName.trim() !== "" ? identity.displayName : keyboardId;
}

/**
 * The single `<Language>` element the descriptor declares, unindented.
 *
 * Exported so `patch.ts` substitutes the SAME element an at-scratch build would
 * emit — the patch and generate paths must not disagree about the shape of the
 * one thing this feature exists to write.
 *
 * Exactly ONE language: the author's. The pre-057 writer emitted one `<Language>`
 * per BASE tag, which is precisely how a Bambara keyboard built on a French base
 * came to declare `fr`.
 */
export function buildLanguageElement(identity: PackageDescriptorIdentity): string {
  const tag = identity.languageTag?.trim() ?? "";
  const effectiveTag = tag !== "" ? tag : UNDETERMINED_TAG;
  // The name is display text only. Blank falls back to the tag, which is what the
  // pre-057 writer did for every tag it emitted (FR-002).
  const rawName = identity.languageName?.trim() ?? "";
  const effectiveName = rawName !== "" ? rawName : effectiveTag;

  return `<Language ID="${escapeHtml(effectiveTag)}">${escapeHtml(effectiveName)}</Language>`;
}

/** The `<Languages>` block, indented to sit inside `<Keyboards><Keyboard>`. */
export function buildLanguagesBlock(identity: PackageDescriptorIdentity): string {
  return (
    `      <Languages>\n` +
    `        ${buildLanguageElement(identity)}\n` +
    `      </Languages>\n`
  );
}
