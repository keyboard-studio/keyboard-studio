import type {
  ScaffolderService,
  ScaffoldOptions,
  ScaffoldResult,
  RoutingGroup,
} from "@keyboard-studio/contracts";
import type { BaseKeyboard, VirtualFS, KeyboardIR, Attribution } from "@keyboard-studio/contracts";
import {
  createVirtualFS,
  validateScaffolderKeyboardId as contractsValidateKeyboardId,
  renderLicense,
  renderHolderLine,
  effectiveHolder,
  parseCopyright,
  addHolder,
  orderHolders,
  MIT_BODY,
  DEFAULT_MARKER,
} from "@keyboard-studio/contracts";
import { fetchKeyboardSourceToVfs, type FetchFn } from "../loader/fetchKeyboardSourceToVfs.js";
import { parse } from "../codec/parse.js";
import { emit } from "../codec/emit.js";
import { detectBaseLayoutFamily } from "../placement/filters.js";
import { scaffoldIR, sanitizeDisplayName, kmnStringEscape } from "./scaffold-ir.js";

export { scaffoldIR, resetIdentity } from "./scaffold-ir.js";
export type { ScaffoldIROptions, ScaffoldIRIdentity } from "./scaffold-ir.js";
export { scaffoldTouchLayout, buildMinimalPhoneTouchLayout } from "./scaffoldTouchLayout.js";

export interface ScaffolderServiceOptions {
  proxyBase?: string;
  fetchImpl?: FetchFn;
}

// Defuse PHP block-comment terminator '*/' for stub generation.
function phpCommentEscape(s: string): string {
  return s.replace(/\*\//g, "* /");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Id-string fallback for routing-group detection, used before the base IR is
 * parsed and whenever the structural detector cannot determine the layout.
 * The id heuristic alone misses AZERTY keyboards whose id lacks the
 * "azerty"/"fr*" tokens (Belgian kbdbe, African French, basic_kbdfr, …); those
 * are corrected by groupFromLayoutFamily() once the IR is available.
 */
function detectGroup(base: BaseKeyboard): RoutingGroup {
  if (base.script !== "Latn") return "non-roman";
  const id = base.id.toLowerCase();
  if (id.includes("azerty") || id.startsWith("fre_") || id.startsWith("french_") || id.startsWith("fr_")) {
    return "azerty";
  }
  return "qwerty-qwertz";
}

/**
 * Map a structurally-detected layout family (from the parsed base IR) to its
 * routing group. Returns null for "other" (structurally undetermined) so the
 * caller falls back to the id-based detectGroup() heuristic.
 */
function groupFromLayoutFamily(
  family: ReturnType<typeof detectBaseLayoutFamily>,
): RoutingGroup | null {
  if (family === "AZERTY") return "azerty";
  if (family === "QWERTY" || family === "QWERTZ") return "qwerty-qwertz";
  return null;
}

// Escape regex metacharacters in a literal string so it can be used as a token.
function escapeForRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Rewrite file-path references in .kps XML text.
 * Mirrors kmc-copy's copyKpsSourceFile (../keyman/developer/src/kmc-copy/src/KeymanProjectCopier.ts):
 * only <Name> values that look like file paths (contain "/" or ".") and exact-
 * match <ID> values are rewritten. Free-text fields — <Info><Name>, <Author>,
 * <Copyright>, <Description> — are left untouched because they do not look
 * like file paths. Word-boundary anchors prevent partial-token rewrites.
 */
function rewriteKpsFilePaths(xml: string, baseId: string, keyboardId: string): string {
  const escaped = escapeForRegex(baseId);
  const tokenRe = new RegExp(`(?<![\\w])${escaped}(?![\\w])`, "g");
  let out = xml.replace(
    /(<Name\b[^>]*>)([^<]*)(<\/Name>)/gi,
    (m, open: string, value: string, close: string) => {
      if (!value.includes("/") && !value.includes(".")) return m;
      return `${open}${value.replace(tokenRe, keyboardId)}${close}`;
    }
  );
  out = out.replace(
    new RegExp(`(<ID\\b[^>]*>)${escaped}(<\\/ID>)`, "gi"),
    `$1${keyboardId}$2`
  );
  return out;
}

/**
 * Rewrite the <kbdname> element in .kvks XML text.
 * kmc-copy does NOT rewrite .kvks content at all (copySourceFile = generic copy).
 * We scope to <kbdname> only because our generated stubs and the original kvks
 * place the keyboard ID there. Free text in <encoding fontname="...">, layer
 * names, and key contents is preserved.
 */
function rewriteKvksKbdname(xml: string, baseId: string, keyboardId: string): string {
  const escaped = escapeForRegex(baseId);
  return xml.replace(
    new RegExp(`(<kbdname\\b[^>]*>)${escaped}(<\\/kbdname>)`, "gi"),
    `$1${keyboardId}$2`
  );
}

/** @internal Exported for unit testing only. */
export function renameFilesInVfs(vfs: VirtualFS, baseId: string, keyboardId: string): void {
  // Sibling-file extensions that conventionally use the keyboard id as
  // their basename in keymanapp/keyboards. The rename is gated on the
  // path actually existing at `source/<baseId><ext>` so unrelated files
  // in subdirectories (e.g. source/welcome/welcome.htm) are not touched.
  // `.css`, `.htm`, and `.js` mirror the path-bearing system stores
  // (&KMW_EMBEDCSS, &KMW_HELPFILE, &KMW_EMBEDJS) so the renamed file path
  // matches the rewritten store reference.
  const extensions = [
    ".kmn",
    ".kps",
    ".kvks",
    ".keyman-touch-layout",
    ".ico",
    ".css",
    ".htm",
    ".js",
  ];
  for (const ext of extensions) {
    const oldPath = `source/${baseId}${ext}`;
    const entry = vfs.get(oldPath);
    if (entry !== undefined) {
      vfs.delete(oldPath);
      const newPath = `source/${keyboardId}${ext}`;
      let content = entry.content;
      if (!entry.isBinary && typeof content === "string") {
        if (ext === ".kps") {
          content = rewriteKpsFilePaths(content, baseId, keyboardId);
        } else if (ext === ".kvks") {
          content = rewriteKvksKbdname(content, baseId, keyboardId);
        }
      }
      vfs.set(newPath, content, entry.isBinary);
    }
  }

  const oldHelp = `source/help/${baseId}.php`;
  const helpEntry = vfs.get(oldHelp);
  if (helpEntry !== undefined) {
    vfs.delete(oldHelp);
    vfs.set(`source/help/${keyboardId}.php`, helpEntry.content, helpEntry.isBinary);
  }

  // Rewrite `.kmw-keyboard-<baseId>` selectors in every *.css entry.
  // Word-boundary anchor ensures we don't rewrite substrings that start with
  // the base id followed by additional alphanumerics (e.g. `base_id_extra`).
  // Iterated AFTER the file-rename pass so the matched *.css files already
  // live at their new <keyboardId>.css paths.
  const cssBaseClassRe = new RegExp(`kmw-keyboard-${baseId}\\b`, "g");
  for (const cssPath of vfs.list("").filter((p) => p.endsWith(".css"))) {
    const cssEntry = vfs.get(cssPath);
    if (cssEntry === undefined || typeof cssEntry.content !== "string") continue;
    const rewritten = cssEntry.content.replace(cssBaseClassRe, `kmw-keyboard-${keyboardId}`);
    if (rewritten !== cssEntry.content) {
      vfs.set(cssPath, rewritten, false);
    }
  }
}

function applyTouchLayoutCleanup(vfs: VirtualFS, keyboardId: string): void {
  const path = `source/${keyboardId}.keyman-touch-layout`;
  const entry = vfs.get(path);
  if (entry === undefined || typeof entry.content !== "string") return;

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(entry.content) as Record<string, unknown>;
  } catch {
    return;
  }

  delete (data as Record<string, unknown>)["phone"];

  for (const device of ["tablet"] as const) {
    const deviceData = data[device] as { layer?: Array<Record<string, unknown>> } | undefined;
    if (deviceData?.layer == null) continue;
    const layers = deviceData.layer;

    const shiftLayer = layers.find((l) => l["id"] === "shift");
    const capsLayer = layers.find((l) => l["id"] === "caps");
    if (shiftLayer !== undefined && capsLayer === undefined) {
      const cloned = JSON.parse(JSON.stringify(shiftLayer)) as Record<string, unknown>;
      cloned["id"] = "caps";
      layers.push(cloned);
    }

    const rightaltShiftLayer = layers.find((l) => l["id"] === "rightalt-shift");
    const rightaltCapsLayer = layers.find((l) => l["id"] === "rightalt-caps");
    if (rightaltShiftLayer !== undefined && rightaltCapsLayer === undefined) {
      const cloned = JSON.parse(JSON.stringify(rightaltShiftLayer)) as Record<string, unknown>;
      cloned["id"] = "rightalt-caps";
      layers.push(cloned);
    }

    for (const layer of layers) {
      const layerId = layer["id"] as string | undefined;
      if (layerId === "default" || (layerId != null && layerId.includes("caps"))) continue;
      const rows = layer["row"] as Array<{ key?: Array<{ sp?: number; nextlayer?: string | null }> }> | undefined;
      if (rows == null) continue;
      for (const row of rows) {
        if (row.key == null) continue;
        for (const key of row.key) {
          const sp = key.sp;
          // sp codes that must NOT get nextlayer defaulted:
          // 1=special, 2=specialActive, 3=customSpecial, 4=customSpecialActive (frame/modifier keys),
          // 8=deadkey, 9=blank, 10=spacer. Only sp=0/absent (normal char key) should default.
          if (![1, 2, 3, 4, 8, 9, 10].includes(sp ?? -1) && key.nextlayer == null) {
            key.nextlayer = "default";
          }
        }
      }
    }
  }

  vfs.set(path, JSON.stringify(data, null, 2));
}

// &TARGETS tokens for which kmcmplib emits a KeymanWeb `.js` artifact. Desktop-only
// tokens (windows/macosx/linux/desktop) produce no `.js`, so referencing one in the
// package `<Files>` would make kmc fail with KM04003 (file not found); conversely a
// web/touch target with no `.js` in the package warns KM0401A (fatal under
// CompilerWarningsAsErrors). The list must therefore mirror what the build emits.
// Derived from the emitted `.kmn`'s `&TARGETS` store (what kmc actually reads), not
// from `BaseKeyboard.targets` — the two can diverge during scaffolding/import.
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

/**
 * Build a package (`.kps`) that Keyman Developer can compile to a `.kmp`.
 *
 * The empty `<Package><Info/><Files/></Package>` stub fails `kmc` with KM04021
 * (blank package version) and KM09010 (missing Description). This emits the
 * minimum buildable shape: `<FollowKeyboardVersion/>` (so the package inherits
 * the keyboard version), a non-empty Description, at least one language, and a
 * `<Files>` list derived from what the build actually produces — `.kmx` always,
 * `.js` only for web/touch targets, `.kvk` only when a visual keyboard exists.
 * `languages` are the base keyboard's BCP47 tags; `und` stands in when unknown.
 * `version` propagates from the base keyboard into `<Keyboards><Keyboard><Version>`
 * so Track 2 import does not silently downgrade a 2.0 keyboard to 1.0.
 */
/**
 * Collapse a multi-holder block onto ONE line for `store(&COPYRIGHT)` and the
 * `.kps <Copyright>`, which are single-valued (spec 037 T038).
 *
 * Uses the convention the corpus already established. 33 shipped keyboards
 * express exactly this, identically in both files — e.g.
 * release/fv/fv_dakelh:
 *
 *   (c) 2008-2024 FirstVoices, SIL International. Portions (c) 2006 Chris Harvey
 *
 * So: a PRIMARY holder, then `. Portions ` and the earlier ones. Semantically
 * "this work is copyright X; parts of it are copyright Y", which is exactly the
 * derivation relationship — the derived keyboard is the new author's work
 * incorporating portions of the base.
 *
 * The primary is the CURRENT session's holder when there is one, otherwise the
 * newest inherited holder. Portions keep the chronological D3 order.
 *
 * `LICENSE.md` remains the authoritative notice (D4) with one holder per line;
 * these two fields are metadata mirrors of it. Note the deliberate consequence:
 * `parseCopyright` reads this back as ONE compound holder rather than several,
 * exactly as it does for fv_dakelh today. That is acceptable because D4 makes
 * `LICENSE.md` the source a fork reads — the `.kmn` is not a lossless fallback
 * for a multi-generation chain.
 */
function singleLineNotice(
  block: readonly import("@keyboard-studio/contracts").CopyrightHolder[],
): string | null {
  if (block.length === 0) return null;
  if (block.length === 1) return renderHolderLine(block[0]!);

  // Primary: the holder added this session, else the newest inherited one
  // (block is in D3 order, oldest first).
  const primaryIdx = block.findIndex((h) => !h.inherited);
  const primary = block[primaryIdx >= 0 ? primaryIdx : block.length - 1]!;
  const portions = block.filter((h) => h !== primary);

  // Portions drop the leading "Copyright" — the primary clause already carries
  // it, matching the corpus form.
  const portionText = portions
    .map((h) => renderHolderLine(h).replace(/^Copyright\s+/, ""))
    .join(", ");
  return `${renderHolderLine(primary)}. Portions ${portionText}`;
}

/**
 * The single source of truth for this keyboard's attribution (spec 037 FR-003).
 *
 * LICENSE.md, store(&COPYRIGHT) and .kps <Copyright> all read from HERE, so they
 * cannot drift — 22 shipped keyboards disagree between their LICENSE.md and .kmn
 * precisely because those strings were built independently.
 *
 * ACCUMULATES rather than replaces (spec 037 US2 / FR-007 / FR-008). MIT requires
 * the original copyright notice be retained in a derivative, so a keyboard derived
 * from a base carries the base's holders VERBATIM and appends the new author:
 *
 *   Copyright (c) 2016-2021 Original Author     <- inherited, byte-identical
 *   Copyright (c) 2024 Second Author            <- inherited, byte-identical
 *   Copyright © 2026 New Author                 <- added by this session
 *
 * Ordering is chronological by earliest year with inherited holders first (D3),
 * so the provenance chain reads top to bottom. A holder who derives again has
 * their year range extended rather than a duplicate line added (P8).
 *
 * `line` is null only when there is NOTHING to state — no attribution AND no
 * inherited holders. The scaffolder then omits the notice rather than inventing
 * one; it never names the keyboard's own display name as rights holder.
 */
function attributionText(
  attribution: Attribution | undefined,
  emitYear: number,
  inherited: readonly import("@keyboard-studio/contracts").CopyrightHolder[] = [],
): { line: string | null; license: string; holderCount: number } {
  const holder = attribution !== undefined ? effectiveHolder(attribution) : "";
  const block =
    holder !== ""
      ? addHolder(inherited, holder, emitYear)
      : orderHolders(inherited);

  if (block.length === 0) {
    // MIT body alone — no holder to name.
    return { line: null, license: `${MIT_BODY}\n`, holderCount: 0 };
  }

  return { line: singleLineNotice(block), license: renderLicense(block), holderCount: block.length };
}

function buildKpsContent(
  keyboardId: string,
  displayName: string,
  kmnText: string,
  languages: string[],
  version = "1.0",
  attribution?: Attribution,
  copyrightLine?: string | null,
): string {
  const targetsMatch = /store\s*\(\s*&TARGETS\s*\)\s*'([^']*)'/i.exec(kmnText);
  const targetTokens = (targetsMatch?.[1] ?? "").toLowerCase().split(/[\s,]+/).filter(Boolean);
  const emitsJs = targetTokens.some((t) => KMW_JS_TARGETS.has(t));
  const hasVisualKeyboard = /store\s*\(\s*&VISUALKEYBOARD\s*\)/i.test(kmnText);

  const files = [`..\\build\\${keyboardId}.kmx`];
  if (emitsJs) files.push(`..\\build\\${keyboardId}.js`);
  if (hasVisualKeyboard) files.push(`..\\build\\${keyboardId}.kvk`);
  files.push("welcome.htm", "readme.htm");

  const fileEntries = files
    .map((f) => {
      const ext = f.slice(f.lastIndexOf("."));
      return `    <File>\n      <Name>${escapeHtml(f)}</Name>\n      <FileType>${ext}</FileType>\n    </File>`;
    })
    .join("\n");

  const langTags = languages.length > 0 ? languages : ["und"];
  const langEntries = langTags
    .map((t) => `        <Language ID="${escapeHtml(t)}">${escapeHtml(t)}</Language>`)
    .join("\n");

  const name = escapeHtml(displayName);
  const description = escapeHtml(`${displayName} keyboard, generated by Keyboard Studio.`);

  // spec 037 FR-003: both fields come from the shared copyright line / attribution,
  // never from displayName. Omitted entirely when attribution is absent, so the
  // .kps never carries a fabricated rights holder. 917/918 shipped keyboards
  // populate <Copyright> and 442 populate <Author>.
  const infoExtra =
    (copyrightLine !== undefined && copyrightLine !== null
      ? `    <Copyright URL="">${escapeHtml(copyrightLine)}</Copyright>\n`
      : "") +
    (attribution !== undefined && attribution.authorName.trim() !== ""
      ? `    <Author URL="${attribution.authorEmail !== undefined && attribution.authorEmail !== "" ? `mailto:${escapeHtml(attribution.authorEmail)}` : ""}">${escapeHtml(attribution.authorName.trim())}</Author>\n`
      : "");

  return (
    `<?xml version="1.0" encoding="utf-8"?>\n` +
    `<Package>\n` +
    `  <System>\n    <KeymanDeveloperVersion>17.0.0.0</KeymanDeveloperVersion>\n    <FileVersion>7.0</FileVersion>\n  </System>\n` +
    `  <Options>\n    <ReadMeFile>readme.htm</ReadMeFile>\n    <WelcomeFile>welcome.htm</WelcomeFile>\n    <FollowKeyboardVersion/>\n  </Options>\n` +
    `  <Info>\n    <Name URL="">${name}</Name>\n    <Description URL="">${description}</Description>\n${infoExtra}  </Info>\n` +
    `  <Files>\n${fileEntries}\n  </Files>\n` +
    `  <Keyboards>\n    <Keyboard>\n      <Name>${name}</Name>\n      <ID>${escapeHtml(keyboardId)}</ID>\n      <Version>${escapeHtml(version)}</Version>\n      <Languages>\n${langEntries}\n      </Languages>\n    </Keyboard>\n  </Keyboards>\n` +
    `</Package>\n`
  );
}

function generateStubs(
  vfs: VirtualFS,
  keyboardId: string,
  displayName: string,
  languages: string[],
  version: string,
  attribution: Attribution | undefined,
  emitYear: number,
  inherited: readonly import("@keyboard-studio/contracts").CopyrightHolder[],
): void {
  const now = new Date();
  const yyyy = emitYear;
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  // spec 037 US2: the merged block — inherited holders retained verbatim with the
  // new author appended, NOT replaced.
  const { line: copyrightLine, license } = attributionText(attribution, emitYear, inherited);

  const stubs: Array<{ path: string; content: string | Uint8Array; isBinary?: boolean }> = [
    {
      path: `source/${keyboardId}.kmn`,
      // spec 037 FR-003: the stub gains a COPYRIGHT store when attribution is
      // known (922 of 924 shipped keyboards carry one). Same source as
      // LICENSE.md and the .kps, so the three cannot drift.
      content:
        `store(&NAME) '${kmnStringEscape(displayName)}'\n` +
        (copyrightLine !== null ? `store(&COPYRIGHT) '${kmnStringEscape(copyrightLine)}'\n` : "") +
        `store(&VERSION) '14.0'\nstore(&KEYBOARDVERSION) '1.0'\nstore(&TARGETS) 'any'\nbegin Unicode > use(main)\ngroup(main) using keys\n`,
    },
    {
      path: `source/${keyboardId}.kvks`,
      content: `<KeyboardVisualKeyboard/>`,
    },
    {
      path: `source/${keyboardId}.keyman-touch-layout`,
      content: `{"tablet":{"layer":[{"id":"default","row":[]}]}}`,
    },
    {
      path: `source/${keyboardId}.ico`,
      content: new Uint8Array(0),
      isBinary: true,
    },
    {
      path: `source/welcome.htm`,
      content: `<html><body><p>Welcome to ${escapeHtml(displayName)}</p></body></html>`,
    },
    {
      path: `source/readme.htm`,
      content: `<html><body><p>${escapeHtml(displayName)} keyboard</p></body></html>`,
    },
    {
      path: `source/help/${keyboardId}.php`,
      content: `<?php /* ${phpCommentEscape(displayName)} help */ ?>`,
    },
    {
      path: `LICENSE.md`,
      // spec 037 FR-004: previously `Copyright © ${yyyy} ${displayName}`, which
      // named the KEYBOARD as its own rights holder. Now rendered from the shared
      // copyright line; with no attribution the notice is omitted rather than
      // invented, and the warning pushed in scaffold() surfaces that.
      content: license,
    },
    {
      // Track-1 HISTORY.md entry (new-from-base). For the parallel Track-2 entry
      // format (adapt-existing), see packages/engine/src/output/adapt-staging.ts
      // stageAdaptHistory(). Both must use the same ATX heading style; keep them in sync.
      path: `HISTORY.md`,
      content: `## 1.0 (${yyyy}-${mm}-${dd})\n* Initial release.\n`,
    },
    {
      path: `README.md`,
      content: `# ${displayName}\n`,
    },
    {
      path: `tests/${keyboardId}_tests.kmn`,
      content: `c ${displayName} tests\n`,
    },
  ];

  for (const stub of stubs) {
    if (vfs.get(stub.path) === undefined) {
      vfs.set(stub.path, stub.content, stub.isBinary ?? false);
    }
  }

  // Generate the package last: it reads the final `.kmn` (base-derived or the
  // stub just written above) to decide which build artifacts to list.
  const kpsPath = `source/${keyboardId}.kps`;
  if (vfs.get(kpsPath) === undefined) {
    const kmnEntry = vfs.get(`source/${keyboardId}.kmn`);
    const kmnText =
      kmnEntry !== undefined && typeof kmnEntry.content === "string" ? kmnEntry.content : "";
    vfs.set(
      kpsPath,
      buildKpsContent(keyboardId, displayName, kmnText, languages, version, attribution, copyrightLine),
      false,
    );
  }
}

export function createScaffolderService(opts?: ScaffolderServiceOptions): ScaffolderService {
  const proxyBase = opts?.proxyBase;
  const fetchImpl = opts?.fetchImpl;

  return {
    validateKeyboardId(id: string): string | null {
      return contractsValidateKeyboardId(id);
    },

    async scaffold(
      base: BaseKeyboard,
      keyboardId: string,
      displayName: string,
      scaffoldOpts?: ScaffoldOptions
    ): Promise<ScaffoldResult> {
      const idError = contractsValidateKeyboardId(keyboardId);
      if (idError !== null) {
        return Promise.reject(new Error(`invalid keyboardId: ${idError}`));
      }

      displayName = sanitizeDisplayName(displayName);
      // Initial group: explicit override, else the id-string fallback. When a
      // base IR becomes available below, structural layout detection refines
      // this (it reliably identifies AZERTY that the id heuristic misses).
      let group: RoutingGroup = scaffoldOpts?.group ?? detectGroup(base);
      const refineGroupFromIR = (ir: KeyboardIR): void => {
        if (scaffoldOpts?.group !== undefined || base.script !== "Latn") return;
        group = groupFromLayoutFamily(detectBaseLayoutFamily(ir)) ?? group;
      };
      const vfs = createVirtualFS();
      const warnings: string[] = [];
      let baseLicenseText: string | undefined;
      const attribution = scaffoldOpts?.attribution;
      // spec 037 D2: the year records when the work was PUBLISHED, and is
      // injectable so tests never read the clock.
      const emitYear = scaffoldOpts?.emitYear ?? new Date().getFullYear();
      // Shared IR-apply path for both the base-fetched .kmn and the caller-supplied
      // pre-parsed IR branches below: refine group, scaffold identity/group into
      // the IR, then emit the .kmn text back into the VFS.
      const applyIrAndEmit = (ir: KeyboardIR, targetBaseId: string): void => {
        refineGroupFromIR(ir);
        scaffoldIR(ir, {
          identity: {
            keyboardId,
            displayName,
            // spec 037 T010: WITHOUT this, resetIdentity fabricates
            // `Copyright © <year> <displayName>` and OVERWRITES the copyright
            // parse() read from the base — stripping the original author's notice
            // from the emitted .kmn. Passing the confirmed line is the fix, and
            // keeps the .kmn store identical to LICENSE.md and the .kps (FR-003).
            ...(copyrightLine !== null ? { copyright: copyrightLine } : {}),
          },
          group,
        });
        vfs.set(`source/${targetBaseId}.kmn`, emit(ir));
      };

      let loaderFonts: import("@keyboard-studio/contracts").KpsFontEntry[] = [];
      let loaderStylesheets: import("@keyboard-studio/contracts").KpsStylesheetEntry[] = [];
      try {
        const loaderOpts = {
          ...(proxyBase !== undefined ? { proxyBase } : {}),
          ...(fetchImpl !== undefined ? { fetchImpl } : {}),
        };
        const loaderResult = await fetchKeyboardSourceToVfs(base, vfs, loaderOpts);
        loaderFonts = loaderResult.fonts;
        loaderStylesheets = loaderResult.stylesheets;
        warnings.push(...loaderResult.warnings);
        baseLicenseText = loaderResult.baseLicenseText;
      } catch (err) {
        // fetchKeyboardSourceToVfs throws when the required .kmn is unreachable
        // (network error, 404, or offline). Fall through to stub-only output and
        // surface the failure so callers can inform the user.
        warnings.push(
          `base keyboard source unavailable — stub-only output (${err instanceof Error ? err.message : String(err)})`
        );
      }

      // ---------------------------------------------------------------------
      // spec 037 US2: resolve the INHERITED copyright holders now that the base
      // has been fetched, then merge the new author on top.
      //
      // D4 precedence: LICENSE.md is authoritative. It is the notice MIT's own
      // text refers to ("the above copyright notice"), and it is the better-formed
      // source — 918 of 920 shipped license lines carry a year, against 366 of 922
      // .kmn COPYRIGHT values. The two are NEVER merged into separate holders:
      // the 22 observed disagreements are the in-progress SIL International ->
      // SIL Global rename applied to one file and not the other, and treating
      // that as two rights holders would fabricate one out of drift.
      // ---------------------------------------------------------------------
      let inheritedHolders: readonly import("@keyboard-studio/contracts").CopyrightHolder[] = [];
      let licenseUnparseable: { reason: string; line: string } | null = null;

      const holderOverride = scaffoldOpts?.baseHolderOverride?.trim() ?? "";
      if (holderOverride !== "") {
        // D5 escape hatch: the author told us who held the copyright, so the
        // notice is retained rather than dropped. No year — that is precisely
        // what the unreadable line failed to establish, and inventing one would
        // put a fabricated fact into a legal notice.
        inheritedHolders = [
          { name: holderOverride, years: [], marker: DEFAULT_MARKER, inherited: true },
        ];
      } else if (baseLicenseText !== undefined) {
        const parsed = parseCopyright(baseLicenseText);
        if (parsed.ok) {
          inheritedHolders = parsed.block;
        } else if (parsed.reason === "no_copyright_line") {
          // A license file with no notice at all states no holder to retain.
          // Nothing to inherit, and nothing was destroyed.
          inheritedHolders = [];
        } else {
          // D5: the file HAS a notice we cannot read (an unfilled template, or a
          // year with no holder). Refuse rather than silently drop it — emitting
          // a LICENSE.md whose only holder is the current user would strip a real
          // notice, which is the defect FR-010 exists to prevent.
          licenseUnparseable = { reason: parsed.reason, line: parsed.line };
        }
      }

      const { line: copyrightLine, holderCount } = attributionText(
        attribution,
        emitYear,
        inheritedHolders,
      );

      // Signalled via ScaffoldResult.attributionMissing rather than a warning:
      // `warnings` means "fell back to stub-only output", and overloading it
      // would make every un-attributed scaffold look like a fetch failure.
      const attributionMissing = copyrightLine === null;

      const kmnVfsPath = vfs.list("source/").find((p) => p.endsWith(".kmn"));
      const actualBaseId = kmnVfsPath != null
        ? kmnVfsPath.replace(/^source\//, "").replace(/\.kmn$/, "")
        : base.id;

      const kmnEntry = vfs.get(`source/${actualBaseId}.kmn`);
      if (kmnEntry !== undefined && typeof kmnEntry.content === "string") {
        const ir = scaffoldOpts?.ir ?? parse(kmnEntry.content, actualBaseId).ir;
        applyIrAndEmit(ir, actualBaseId);
      } else if (scaffoldOpts?.ir !== undefined) {
        // No base .kmn was fetched but caller supplied a pre-parsed IR — use it.
        applyIrAndEmit(scaffoldOpts.ir, actualBaseId);
      }

      renameFilesInVfs(vfs, actualBaseId, keyboardId);
      applyTouchLayoutCleanup(vfs, keyboardId);
      generateStubs(
        vfs,
        keyboardId,
        displayName,
        base.languages ?? [],
        base.version ?? "1.0",
        attribution,
        emitYear,
        inheritedHolders,
      );

      return {
        vfs,
        warnings,
        fonts: loaderFonts,
        stylesheets: loaderStylesheets,
        attributionMissing,
        inheritedHolderCount: inheritedHolders.length,
        ...(licenseUnparseable !== null ? { licenseUnparseable } : {}),
      };
    },

    async listTemplates(): Promise<string[]> {
      return ["qwerty-qwertz", "azerty", "non-roman"];
    },
  };
}
