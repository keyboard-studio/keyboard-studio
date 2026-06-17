import type {
  ScaffolderService,
  ScaffoldOptions,
  ScaffoldResult,
  RoutingGroup,
} from "@keyboard-studio/contracts";
import type { BaseKeyboard, VirtualFS } from "@keyboard-studio/contracts";
import {
  createVirtualFS,
  validateScaffolderKeyboardId as contractsValidateKeyboardId,
} from "@keyboard-studio/contracts";
import { fetchKeyboardSourceToVfs, type FetchFn } from "../loader/fetchKeyboardSourceToVfs.js";
import { parse } from "../codec/parse.js";
import { emit } from "../codec/emit.js";
import { scaffoldIR } from "./scaffold-ir.js";

export { scaffoldIR, resetIdentity } from "./scaffold-ir.js";
export type { ScaffoldIROptions, ScaffoldIRIdentity } from "./scaffold-ir.js";

export interface ScaffolderServiceOptions {
  proxyBase?: string;
  fetchImpl?: FetchFn;
}

// Replace C0/C1 control chars (incl. newlines, nulls) with spaces, then collapse and trim.
function sanitizeDisplayName(raw: string): string {
  return raw
    .replace(/[\x00-\x1F\x7F-\x9F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// In KMN, single-quoted strings have no escape sequence; U+2019 is the typographic equivalent.
function kmnStringEscape(s: string): string {
  return s.replace(/'/g, "’");
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

function detectGroup(base: BaseKeyboard): RoutingGroup {
  if (base.script !== "Latn") return "non-roman";
  const id = base.id.toLowerCase();
  if (id.includes("azerty") || id.startsWith("fre_") || id.startsWith("french_") || id.startsWith("fr_")) {
    return "azerty";
  }
  return "qwerty-qwertz";
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
function buildKpsContent(
  keyboardId: string,
  displayName: string,
  kmnText: string,
  languages: string[],
  version = "1.0",
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

  return (
    `<?xml version="1.0" encoding="utf-8"?>\n` +
    `<Package>\n` +
    `  <System>\n    <KeymanDeveloperVersion>17.0.0.0</KeymanDeveloperVersion>\n    <FileVersion>7.0</FileVersion>\n  </System>\n` +
    `  <Options>\n    <ReadMeFile>readme.htm</ReadMeFile>\n    <WelcomeFile>welcome.htm</WelcomeFile>\n    <FollowKeyboardVersion/>\n  </Options>\n` +
    `  <Info>\n    <Name URL="">${name}</Name>\n    <Description URL="">${description}</Description>\n  </Info>\n` +
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
): void {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");

  const stubs: Array<{ path: string; content: string | Uint8Array; isBinary?: boolean }> = [
    {
      path: `source/${keyboardId}.kmn`,
      content: `store(&NAME) '${kmnStringEscape(displayName)}'\nstore(&VERSION) '14.0'\nstore(&KEYBOARDVERSION) '1.0'\nstore(&TARGETS) 'any'\nbegin Unicode > use(main)\ngroup(main) using keys\n`,
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
      content: `Copyright © ${yyyy} ${displayName}\n\nMIT License\n`,
    },
    {
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
    vfs.set(kpsPath, buildKpsContent(keyboardId, displayName, kmnText, languages, version), false);
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
      const group: RoutingGroup = scaffoldOpts?.group ?? detectGroup(base);
      const vfs = createVirtualFS();
      const warnings: string[] = [];

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
      } catch (err) {
        // fetchKeyboardSourceToVfs throws when the required .kmn is unreachable
        // (network error, 404, or offline). Fall through to stub-only output and
        // surface the failure so callers can inform the user.
        warnings.push(
          `base keyboard source unavailable — stub-only output (${err instanceof Error ? err.message : String(err)})`
        );
      }

      const kmnVfsPath = vfs.list("source/").find((p) => p.endsWith(".kmn"));
      const actualBaseId = kmnVfsPath != null
        ? kmnVfsPath.replace(/^source\//, "").replace(/\.kmn$/, "")
        : base.id;

      const kmnEntry = vfs.get(`source/${actualBaseId}.kmn`);
      if (kmnEntry !== undefined && typeof kmnEntry.content === "string") {
        const ir = scaffoldOpts?.ir ?? parse(kmnEntry.content, actualBaseId).ir;
        scaffoldIR(ir, {
          identity: { keyboardId, displayName },
          group,
        });
        vfs.set(`source/${actualBaseId}.kmn`, emit(ir));
      } else if (scaffoldOpts?.ir !== undefined) {
        // No base .kmn was fetched but caller supplied a pre-parsed IR — use it.
        const ir = scaffoldOpts.ir;
        scaffoldIR(ir, {
          identity: { keyboardId, displayName },
          group,
        });
        vfs.set(`source/${actualBaseId}.kmn`, emit(ir));
      }

      renameFilesInVfs(vfs, actualBaseId, keyboardId);
      applyTouchLayoutCleanup(vfs, keyboardId);
      generateStubs(vfs, keyboardId, displayName, base.languages ?? [], base.version ?? "1.0");

      return { vfs, warnings, fonts: loaderFonts, stylesheets: loaderStylesheets };
    },

    async listTemplates(): Promise<string[]> {
      return ["qwerty-qwertz", "azerty", "non-roman"];
    },
  };
}
