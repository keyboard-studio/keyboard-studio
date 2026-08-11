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

import { escapeHtml } from "../shared/escapeHtml.js";

/**
 * `&TARGETS` tokens for which `kmc` emits a `.js` (KeymanWeb / touch) artifact.
 *
 * The `<Files>` list must mirror what the build actually emits: a listed file the
 * build does not produce fails `kmc` (and a produced file the package does not
 * list is dropped from the `.kmp`, silently, under CompilerWarningsAsErrors).
 * Derived from the emitted `.kmn`'s `&TARGETS` store (what kmc actually reads),
 * not from `BaseKeyboard.targets` — the two can diverge during scaffolding/import.
 */
const KMW_JS_TARGETS = new Set([
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
   * The single-line copyright notice for `<Info><Copyright>` (spec 059 FR-003).
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
  /** Author name for `<Info><Author>` (spec 059 FR-003). Omitted when blank. */
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
  const targetsMatch = /store\s*\(\s*&TARGETS\s*\)\s*'([^']*)'/i.exec(kmnText);
  return (targetsMatch?.[1] ?? "").toLowerCase().split(/[\s,]+/).filter(Boolean);
}

export function buildKpsContent(
  keyboardId: string,
  identity: PackageDescriptorIdentity,
  kmnText: string,
  version = "1.0",
): string {
  const targetTokens = parseTargetTokens(kmnText);
  const emitsJs = targetTokens.some((t) => KMW_JS_TARGETS.has(t));
  const hasVisualKeyboard = /store\s*\(\s*&VISUALKEYBOARD\s*\)/i.test(kmnText);

  const files = [`..\\build\\${keyboardId}.kmx`];
  if (emitsJs) files.push(`..\\build\\${keyboardId}.js`);
  if (hasVisualKeyboard) files.push(`..\\build\\${keyboardId}.kvk`);
  files.push("welcome.htm", "readme.htm");
  // LICENSE.md lives at the keyboard root, one level above this .kps's own
  // `source/` directory — like the `..\build\` artifacts, not like
  // welcome.htm/readme.htm, which sit alongside the .kps itself (criterion
  // 8.4-kps-includes-license-md).
  files.push("..\\LICENSE.md");

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
    `  <Options>\n    <ReadMeFile>readme.htm</ReadMeFile>\n    <WelcomeFile>welcome.htm</WelcomeFile>\n    <FollowKeyboardVersion/>\n  </Options>\n` +
    `  <Info>\n    <Name URL="">${name}</Name>\n    <Description URL="">${description}</Description>\n${website}${buildAttributionBlock(identity)}  </Info>\n` +
    `  <Files>\n${fileEntries}\n  </Files>\n` +
    `  <Keyboards>\n    <Keyboard>\n      <Name>${name}</Name>\n      <ID>${escapeHtml(keyboardId)}</ID>\n      <Version>${escapeHtml(version)}</Version>\n` +
    buildLanguagesBlock(identity) +
    `    </Keyboard>\n  </Keyboards>\n` +
    `</Package>\n`
  );
}

/**
 * The `<Copyright>` / `<Author>` lines for `<Info>`, indented and newline-terminated
 * (spec 059 FR-003), or `""` when there is nothing to state.
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
