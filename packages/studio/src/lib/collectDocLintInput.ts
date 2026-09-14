// collectDocLintInput — assemble the Layer C documentation checks' input from
// the working copy (spec 076 US7 / FR-019, research R7) and compute the base's
// own baseline findings for the upstream classifier (FR-020, research R8).
//
// Pure functions over plain data: the rendered member texts (the SAME
// `helpDocsRender` / `renderHistoryMd` output the projection ships, so the
// checks validate exactly what will be produced), the `.kmn` header stores,
// the `.kps` copyright line, the desktop `.kvks` and touch layers, and the
// LICENSE text. Nothing here reads a store or a timer; the hook that calls it
// (`hooks/useDocumentationFindings.ts`) is a `useMemo` (Decision D3).
//
// `deletedFilenames` (criterion 3.7) is always empty in v1: the working copy
// never removes a base file — every edit is an IR mutation or a documentation
// slice — so no file can be "referenced by HISTORY but deleted". The check
// stays wired for a future surface that does delete files.

import type { DocLintInput, DocMemberId, LintFinding } from "@keyboard-studio/contracts";
import { DOC_MEMBER_IDS } from "@keyboard-studio/contracts";
import { parseKvks, parseTargetTokens, parseTouchLayout, docMemberPath } from "@keyboard-studio/engine";
import { runDocChecks } from "@keymanapp/keyboard-lint";

export interface CollectDocLintInputArgs {
  keyboardId: string;
  displayName: string;
  /** The release version the shipped HISTORY heading uses (bumped on an adaptation). */
  keyboardVersion: string;
  /** The `.kmn` text: `&TARGETS` and `&COPYRIGHT`. */
  kmnText: string | null;
  /** The `.kps` text: `<Copyright>`. */
  kpsText: string | null;
  /** The `.kvks` text: desktop layer ids. */
  kvksText: string | null;
  /** The Phase E touch layout JSON: touch layer ids. */
  touchLayoutJson: string | null;
  /** The rendered / current member texts (absent members are simply not checked). */
  members: Partial<Record<DocMemberId, string>>;
  /** The base's HISTORY at instantiation (criterion 3.4); omit on a copy. */
  baseHistoryMdText?: string | null;
}

/**
 * The holder named by a copyright notice line, or undefined when the line
 * carries none: strips the "Copyright" word, a `(c)` / `©` marker, years and
 * ranges, and an "All rights reserved" tail. Shared by every source so the
 * 4.7 comparison is holder-vs-holder, never notice-vs-notice.
 */
export function holderFromNotice(notice: string | undefined | null): string | undefined {
  if (notice === undefined || notice === null) return undefined;
  let s = notice.trim();
  s = s.replace(/^copyright\b:?/i, "").trim();
  s = s.replace(/^(\(c\)|©)\s*/i, "").trim();
  s = s.replace(/^[\d\s,\-–—]+/, "").trim();
  s = s.replace(/[.\s]*all rights reserved\.?$/i, "").trim();
  s = s.replace(/[.,;\s]+$/, "").trim();
  return s === "" ? undefined : s;
}

/** The first line of `text` that reads as a copyright notice, or undefined. */
export function copyrightNoticeLine(text: string | null | undefined): string | undefined {
  if (text === undefined || text === null) return undefined;
  for (const line of text.split(/\r?\n/)) {
    if (/\bcopyright\b|\(c\)|©/i.test(line)) return line.trim();
  }
  return undefined;
}

const KMN_STORE_RE = (name: string): RegExp =>
  new RegExp(`store\\(\\s*&${name}\\s*\\)\\s*(?:'([^']*)'|"([^"]*)")`, "i");

/** A `store(&NAME) '…'` system-store value from `.kmn` text, or undefined. */
export function kmnSystemStore(kmnText: string | null | undefined, name: string): string | undefined {
  if (kmnText === undefined || kmnText === null) return undefined;
  const m = KMN_STORE_RE(name).exec(kmnText);
  if (m === null) return undefined;
  const value = (m[1] ?? m[2] ?? "").trim();
  return value === "" ? undefined : value;
}

/**
 * The keyboard release version a `.kmn` declares: `&KEYBOARDVERSION` first
 * (the codec's own preference), else `"1.0"` — never `&VERSION`, which is the
 * file-format version.
 */
export function keyboardVersionFromKmn(kmnText: string | null | undefined): string {
  return kmnSystemStore(kmnText, "KEYBOARDVERSION") ?? "1.0";
}

/** The `<Copyright>` element text of a `.kps`, or undefined. */
export function kpsCopyright(kpsText: string | null | undefined): string | undefined {
  if (kpsText === undefined || kpsText === null) return undefined;
  const m = /<Copyright(?:\s[^>]*)?>([^<]*)<\/Copyright>/i.exec(kpsText);
  const value = m?.[1]?.trim() ?? "";
  return value === "" ? undefined : value;
}

/**
 * The `.kvks` shift-state tokens as help-page layer ids (`data-states`):
 * the unshifted layer is `default`; every other shift string is lower-cased
 * with its modifier letters spelled out the way the help site names layers
 * (`S` -> `shift`, `RA` -> `rightalt`, ...). Unknown tokens pass through
 * lower-cased so a genuinely unusual layer is never flagged as phantom.
 */
const KVKS_MODIFIER_NAMES: Record<string, string> = {
  s: "shift",
  c: "ctrl",
  lc: "leftctrl",
  rc: "rightctrl",
  a: "alt",
  la: "leftalt",
  ra: "rightalt",
};

export function kvksLayerId(shift: string): string {
  const trimmed = shift.trim();
  if (trimmed === "") return "default";
  return trimmed
    .split(/\s+/)
    .map((tok) => KVKS_MODIFIER_NAMES[tok.toLowerCase()] ?? tok.toLowerCase())
    .join("-");
}

/** Desktop + touch layer ids for criterion 11.6; malformed inputs contribute nothing. */
export function collectLayerIds(kvksText: string | null, touchLayoutJson: string | null): string[] {
  const ids = new Set<string>(["default"]);
  if (kvksText !== null && kvksText.trim() !== "") {
    try {
      for (const layer of parseKvks(kvksText).layers) ids.add(kvksLayerId(layer.shift));
    } catch {
      // A visual keyboard the codec cannot read contributes no layer ids.
    }
  }
  if (touchLayoutJson !== null) {
    try {
      for (const platform of parseTouchLayout(touchLayoutJson).platforms) {
        for (const layer of platform.layers) ids.add(layer.id);
      }
    } catch {
      // Same: unreadable touch layout, no ids.
    }
  }
  return [...ids];
}

export function collectDocLintInput(args: CollectDocLintInputArgs): DocLintInput {
  const { keyboardId, displayName, keyboardVersion, kmnText, kpsText, kvksText, touchLayoutJson, members } = args;
  const holders: DocLintInput["copyrightHolders"] = {};
  const license = holderFromNotice(copyrightNoticeLine(members["license-md"]));
  const kmn = holderFromNotice(kmnSystemStore(kmnText, "COPYRIGHT"));
  const kps = holderFromNotice(kpsCopyright(kpsText));
  const readme = holderFromNotice(copyrightNoticeLine(members["readme-md"]));
  const history = holderFromNotice(copyrightNoticeLine(members["history-md"]));
  if (license !== undefined) holders.license = license;
  if (kmn !== undefined) holders.kmn = kmn;
  if (kps !== undefined) holders.kps = kps;
  if (readme !== undefined) holders.readme = readme;
  if (history !== undefined) holders.history = history;

  const baseHistory = args.baseHistoryMdText;
  return {
    keyboardId,
    keyboardVersion,
    targets: parseTargetTokens(kmnText ?? ""),
    layerIds: collectLayerIds(kvksText, touchLayoutJson),
    displayName,
    copyrightHolders: holders,
    members,
    deletedFilenames: [],
    ...(baseHistory !== undefined && baseHistory !== null ? { baseHistoryMdText: baseHistory } : {}),
  };
}

/** The member a finding's `location.file` names, or undefined for a non-member path. */
export function docMemberForPath(file: string | undefined, keyboardId: string): DocMemberId | undefined {
  if (file === undefined) return undefined;
  return DOC_MEMBER_IDS.find((m) => docMemberPath(m, keyboardId) === file);
}

export interface BaselineDocFindingsArgs {
  keyboardId: string;
  displayName: string;
  kmnText: string | null;
  kpsText: string | null;
  kvksText: string | null;
  touchLayoutJson: string | null;
  base: {
    welcomeHtmText: string | null;
    helpPhpText: string | null;
    readmeMdText: string | null;
    historyMdText: string | null;
    licenseText: string | null;
  };
}

/**
 * The documentation findings the BASE's own files carry, computed once at
 * instantiation (FR-020, research R8): the same twelve checks over the base's
 * member texts as fetched. A later finding on an `inherited` member whose code
 * appears here is the base's problem, not the author's, and renders muted.
 * The base's version comes from its own `.kmn`, so a version disagreement in
 * the base's HISTORY is captured as the base's, never invented.
 */
export function computeBaselineDocFindings(args: BaselineDocFindingsArgs): LintFinding[] {
  const members: Partial<Record<DocMemberId, string>> = {};
  if (args.base.welcomeHtmText !== null) members["welcome-htm"] = args.base.welcomeHtmText;
  if (args.base.helpPhpText !== null) members["help-php"] = args.base.helpPhpText;
  if (args.base.readmeMdText !== null) members["readme-md"] = args.base.readmeMdText;
  if (args.base.historyMdText !== null) members["history-md"] = args.base.historyMdText;
  if (args.base.licenseText !== null) members["license-md"] = args.base.licenseText;
  if (Object.keys(members).length === 0) return [];
  return runDocChecks(
    collectDocLintInput({
      keyboardId: args.keyboardId,
      displayName: args.displayName,
      keyboardVersion: keyboardVersionFromKmn(args.kmnText),
      kmnText: args.kmnText,
      kpsText: args.kpsText,
      kvksText: args.kvksText,
      touchLayoutJson: args.touchLayoutJson,
      members,
    }),
  );
}
