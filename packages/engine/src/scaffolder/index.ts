import type {
  ScaffolderService,
  ScaffoldOptions,
  ScaffoldResult,
  RoutingGroup,
} from "@keyboard-studio/contracts";
import type { BaseKeyboard, VirtualFS, KeyboardIR } from "@keyboard-studio/contracts";
import {
  createVirtualFS,
  validateScaffolderKeyboardId as contractsValidateKeyboardId,
} from "@keyboard-studio/contracts";
import { fetchKeyboardSourceToVfs, type FetchFn } from "../loader/fetchKeyboardSourceToVfs.js";
import { parse } from "../codec/parse.js";
import { emit } from "../codec/emit.js";
import { detectBaseLayoutFamily } from "../placement/filters.js";
import { scaffoldIR, sanitizeDisplayName, kmnStringEscape } from "./scaffold-ir.js";
import { assetFileExtensions } from "../shared/siblingAssetStores.js";
// The doc stubs (welcome/readme) own their own escaping now — see
// ../shared/packageDocs.ts, which imports escapeHtml itself. The scaffolder no
// longer references escapeHtml directly, so main's `escapeHtml` import is dropped
// here as dead once the stubs move out.
import { welcomeHtm, readmeHtm, licenseMd } from "../shared/packageDocs.js";
import {
  buildKpsContent,
  type PackageDescriptorIdentity,
} from "../package-descriptor/index.js";

export { scaffoldIR, resetIdentity } from "./scaffold-ir.js";
export type { ScaffoldIROptions, ScaffoldIRIdentity } from "./scaffold-ir.js";
export {
  scaffoldTouchLayout,
  scaffoldTouchLayoutWithDiagnostics,
  buildMinimalPhoneTouchLayout,
} from "./scaffoldTouchLayout.js";
export type { ScaffoldTouchLayoutResult } from "./scaffoldTouchLayout.js";

export interface ScaffolderServiceOptions {
  proxyBase?: string;
  fetchImpl?: FetchFn;
}

// Defuse PHP block-comment terminator '*/' for stub generation.
function phpCommentEscape(s: string): string {
  return s.replace(/\*\//g, "* /");
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

// Build a word-boundary-anchored matcher for a literal id token, so a base id
// that is a prefix of another token (e.g. `base_id_extra`) is not over-rewritten.
function buildIdTokenRegex(baseId: string): RegExp {
  return new RegExp(`(?<![\\w])${escapeForRegex(baseId)}(?![\\w])`, "g");
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
  const tokenRe = buildIdTokenRegex(baseId);
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

/**
 * Rewrite a Keyman project file (.kpj) so its per-file <Filename>/<Filepath>
 * references to the id-basename source files (e.g. `<baseId>.kmn`,
 * `source\<baseId>.kps`) point at the new id after a rename. Only the base-id
 * *token* inside <Filename>/<Filepath> element text is rewritten (word-boundary
 * anchored), so file GUIDs (<ID>id_…</ID>), display <Name>s, and files that do
 * not use the id as their basename (HISTORY.md, LICENSE.md, README.md) are left
 * untouched. The compiler flags the loader/compiler actually read
 * (parseKpjFlags) are content-independent of this; the rewrite exists so the
 * emitted project stays coherent when opened in Keyman Developer.
 */
function rewriteKpjFilePaths(xml: string, baseId: string, keyboardId: string): string {
  const tokenRe = buildIdTokenRegex(baseId);
  return xml.replace(
    /(<(Filename|Filepath)\b[^>]*>)([^<]*)(<\/\2>)/gi,
    (_m, open: string, _tag: string, value: string, close: string) =>
      `${open}${value.replace(tokenRe, keyboardId)}${close}`
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
  // matches the rewritten store reference. The asset-store extensions
  // (`.kvks`, `.keyman-touch-layout`, `.ico`, `.css`, `.htm`, `.js`) come from
  // the canonical siblingAssetStores table; `.kmn`/`.kps` are the keyboard's
  // own source/project files, not asset-store entries, and stay separate.
  const extensions = [".kmn", ".kps", ...assetFileExtensions()];
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

  // The .kpj project file lives at the VFS ROOT (`<baseId>.kpj`), not under
  // source/, so the extension loop above never sees it. compile() looks it up
  // as `<keyboardId>.kpj`; without this rename the file keeps the old id,
  // compile() misses it, and the base keyboard's compiler flags are silently
  // dropped (falls back to defaults). Rename it and rewrite its internal
  // <Filename>/<Filepath> references so the emitted project stays coherent.
  const oldKpj = `${baseId}.kpj`;
  const kpjEntry = vfs.get(oldKpj);
  if (kpjEntry !== undefined) {
    vfs.delete(oldKpj);
    let content = kpjEntry.content;
    if (!kpjEntry.isBinary && typeof content === "string") {
      content = rewriteKpjFilePaths(content, baseId, keyboardId);
    }
    vfs.set(`${keyboardId}.kpj`, content, kpjEntry.isBinary);
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

// The scaffolder no longer owns a private `.kps` builder. `buildKpsContent`,
// the `&TARGETS`->`.js` target table it reads, and the `<Languages>` shape all
// live in `package-descriptor/` now (spec 059 FR-005) so the output projection
// can re-derive the descriptor from the AUTHOR's identity on both authoring
// tracks. Behaviour here is unchanged: still generated last, still only when the
// path is absent.

/**
 * Fill in every scaffold stub file that is MISSING from `vfs` — `.kmn`,
 * `.kvks`, touch layout, icon, welcome/readme, help, LICENSE, HISTORY,
 * README, tests, and (last, because it reads the final `.kmn`) the `.kps`
 * package. Existing entries are never overwritten, so calling this on an
 * already-populated VFS only completes the keyboard directory.
 *
 * Exported for the output path: the working copy of a Track 1 (new-from-base)
 * project is instantiated from `fetchKeyboardSourceToVfs`, which deliberately
 * never writes the base's `.kps` into the VFS (it references compiled
 * `../build/*` artifacts). Whether the scaffolded VFS (which does carry a
 * generated `.kps`) ever replaces it in the working-copy store is a race the
 * commit seam intentionally does not re-run (StudioShell's
 * `instantiatedForBaseIdRef`), so serialization completes the directory here
 * instead — a downloaded keyboard must be submittable as-is (spec §12).
 */
export function generateStubs(
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
      // Shared with the adapt track's output-time stubs — see
      // ../shared/packageDocs.ts. The descriptor lists both files, so both
      // tracks must produce them or the .kmp build fails on a missing member.
      content: welcomeHtm(displayName),
    },
    {
      path: `source/readme.htm`,
      content: readmeHtm(displayName),
    },
    {
      path: `source/help/${keyboardId}.php`,
      content: `<?php /* ${phpCommentEscape(displayName)} help */ ?>`,
    },
    {
      path: `LICENSE.md`,
      content: licenseMd(displayName, yyyy),
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
  //
  // The base's languages are what this stage knows — the author has not answered
  // the identity questions yet at scaffold time. The output projection's step 3.6
  // replaces this block with the author's own tag before anything ships (spec 059
  // FR-001), so declaring the base's tags here is a placeholder, not the final
  // word. `languages[0]` because the descriptor declares exactly ONE language;
  // `undefined` (no base tag) degrades to the writer's `und` placeholder.
  const kpsPath = `source/${keyboardId}.kps`;
  if (vfs.get(kpsPath) === undefined) {
    const kmnEntry = vfs.get(`source/${keyboardId}.kmn`);
    const kmnText =
      kmnEntry !== undefined && typeof kmnEntry.content === "string" ? kmnEntry.content : "";
    const identity: PackageDescriptorIdentity = {
      displayName,
      ...(languages[0] !== undefined ? { languageTag: languages[0] } : {}),
    };
    vfs.set(kpsPath, buildKpsContent(keyboardId, identity, kmnText, version), false);
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
      // Shared IR-apply path for both the base-fetched .kmn and the caller-supplied
      // pre-parsed IR branches below: refine group, scaffold identity/group into
      // the IR, then emit the .kmn text back into the VFS.
      const applyIrAndEmit = (ir: KeyboardIR, targetBaseId: string): void => {
        refineGroupFromIR(ir);
        scaffoldIR(ir, {
          identity: { keyboardId, displayName },
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
        applyIrAndEmit(ir, actualBaseId);
      } else if (scaffoldOpts?.ir !== undefined) {
        // No base .kmn was fetched but caller supplied a pre-parsed IR — use it.
        applyIrAndEmit(scaffoldOpts.ir, actualBaseId);
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
