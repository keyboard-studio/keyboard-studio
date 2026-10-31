// Fetch a base keyboard's source files from the keymanapp/keyboards
// release tree into the VirtualFS, ready for CompilerService.compile().
//
// Resolves `<proxyBase>/<startKeyboard.path>/source/<id>.kmn`, parses the
// header for sibling deps (see shared/siblingAssetStores.ts for the
// canonical store inventory), fetches each, plus the optional <id>.kpj for
// compiler flags. Writes everything flat into the VFS at `source/...` (the
// layout CompilerService.compile() expects).

import type {
  StartKeyboard,
  VirtualFS,
  KpsFontEntry,
  KpsStylesheetEntry,
  PackageFontSet,
  WelcomeConvention,
  WelcomeFolderImage,
} from "@keyboard-studio/contracts";
import { parseKmnHeaderStores } from "../compiler/parseKmnHeaderStores.js";
import { parseKpjFlags, type CompilerOptions } from "../compiler/parseKpjFlags.js";
import { kpsRefToPosix, parseKpsFiles, parseKpsFontRefs } from "../start-browser/kps-parser.js";
import { extractWelcomeImageRefs } from "../shared/helpDocsRender.js";
import { parseKvks } from "../codec/parse-kvks.js";
import { pathUtils } from "../compiler/pathUtils.js";

/** Structural fetch type — avoids pulling in the DOM lib for an isomorphic package. */
export type FetchFn = (
  url: string,
  init?: { headers?: Record<string, string> }
) => Promise<{
  ok: boolean;
  status: number;
  text(): Promise<string>;
  arrayBuffer(): Promise<ArrayBuffer>;
}>;

export interface FetchKeyboardSourceOptions {
  /** Default `/kbd-proxy` — Vite proxies it to raw.githubusercontent.com. */
  proxyBase?: string;
  /** Override `globalThis.fetch` (used in tests with a mock). */
  fetchImpl?: FetchFn;
}

// KpsFontEntry / KpsStylesheetEntry are defined in @keyboard-studio/contracts
// and re-exported below so callers that import from the engine barrel also
// get the types.
export type { KpsFontEntry, KpsStylesheetEntry };

/**
 * One fetched welcome/help stylesheet: the repo path it was fetched from
 * (`source/…`) and its text. The path rides along so a consumer can write
 * the stylesheet back at its own location; the fetch order alone cannot
 * say which text belongs to which page once a fetch has been skipped.
 */
export interface StartDocCssText {
  path: string;
  text: string;
}

export interface FetchKeyboardSourceResult {
  /** CompilerOptions derived from the .kpj (or defaults if .kpj absent). */
  options: Required<CompilerOptions>;
  /** VFS paths actually populated by this fetch. */
  filesLoaded: string[];
  /** Non-fatal issues (missing optional siblings, .kpj 404). */
  warnings: string[];
  /**
   * Font files fetched from the keyboards tree and written into the VFS.
   * Empty array when no .kps was found or no font entries were present.
   */
  fonts: KpsFontEntry[];
  /**
   * The fonts the base `.kps` packages — files (fonts plus their licence and
   * other companions, all written into the VFS) and its OSK/display font
   * selections — for the generated descriptor to re-declare.
   * Absent when the base packages no font, or none could be fetched.
   */
  packageFonts?: PackageFontSet;
  /**
   * Per-keyboard CSS stylesheets fetched from the keyboards tree and written
   * into the VFS. The studio injects these into the OSK iframe so the
   * keyboard's `.kmw-keyboard-<id>` rules apply to the preview. Empty when
   * no .kps was found or no `.css` <File> entries were present.
   */
  stylesheets: KpsStylesheetEntry[];
  /**
   * The base keyboard's own `LICENSE.md`, verbatim, or undefined when it has
   * none (spec 064 FR-011).
   *
   * Fetched because MIT requires the original copyright notice be retained in a
   * derivative: a keyboard derived from this base must ACCUMULATE the base
   * author's holder rather than replace it. Lives at the keyboard ROOT, not
   * under `source/`, so it is a separate fetch from the sibling-asset walk.
   *
   * NOT written into the VFS: the derived keyboard's LICENSE.md is the merged
   * block (base holders + the new author), so parking the base's copy at the
   * same path would collide with it.
   */
  startLicenseText?: string;
  /**
   * The base keyboard's own welcome page, verbatim, or undefined when it has
   * none (spec 061 FR-013). Fetched for merge purposes at render time only —
   * NOT written into the VFS, since the projected path is where the *rendered*
   * (merged) file belongs, not the base's raw copy.
   *
   * Resolved in this order (spec 080 research R3): the `.kps`-declared
   * `<WelcomeFile>` when it names a folder-convention page, then
   * `source/welcome/welcome.htm`, then the flat `source/welcome.htm` (or the
   * declared flat name). A declared file that 404s degrades to the next probe
   * rather than failing (edge case: ghost descriptor entry).
   */
  startWelcomeHtmText?: string;
  /**
   * The base keyboard's own `source/help/<id>.php`, verbatim, or undefined
   * when it has none. Same fetch-don't-write contract as
   * {@link startWelcomeHtmText}.
   */
  startHelpPhpText?: string;
  /**
   * Which welcome-page convention the base uses (spec 080 data-model §6):
   * `"folder"` (`source/welcome/welcome.htm`, the corpus majority), `"flat"`
   * (`source/welcome.htm`), or `"absent"`. `folder` wins when both exist.
   */
  startWelcomeConvention?: WelcomeConvention;
  /**
   * The base's welcome-folder images, fetched as bytes (spec 080 FR-006): every
   * `welcome\…` file its `.kps` `<Files>` lists other than the page itself, in
   * `.kps` order, followed by any image the page's own `<img src>` references
   * that the `.kps` forgot to list. Only populated for the folder convention.
   * Listed-but-unfetchable files are skipped and recorded in `warnings` (edge
   * case: descriptor names a file the base does not ship). Same
   * fetch-don't-write contract: the projection writes them beside the
   * rendered page at output.
   */
  startWelcomeImages?: WelcomeFolderImage[];
  /**
   * The base keyboard's own `README.md`, verbatim, or undefined when it has
   * none (spec 080 FR-006 inheritance). Fetch-don't-write, like
   * {@link startLicenseText}: it lives at the keyboard root.
   */
  startReadmeMdText?: string;
  /**
   * The base keyboard's own `HISTORY.md`, verbatim, or undefined when it has
   * none. Fetch-don't-write; the adapt track's rendered HISTORY preserves
   * these entries below the new one (criterion 3.4).
   */
  startHistoryMdText?: string;
  /**
   * The stylesheets the base's welcome / help pages use
   * (`source/welcome/*.css`, `source/help/*.css` — conventionally both are
   * `kb.css`), each with the path it was fetched from, in page order
   * (welcome first, then help), or undefined when neither page names one
   * that could be fetched (issue #2139).
   *
   * Fetched for criterion 11.8 only: a custom help image's width constraint
   * may live in a class rule in these files, and the KMW stylesheet in the
   * VFS (`source/<id>.css`) has no help-page rules, so judging 11.8 without
   * them flags class-constrained images (e.g. sil_cameroon_qwerty's
   * `.full { width: 98% }`) as unconstrained. Fetch-don't-write, like
   * {@link startWelcomeHtmText}: the rendered pages are what ships.
   */
  startDocCssTexts?: StartDocCssText[];
}

const DEFAULT_PROXY = "/kbd-proxy";

/**
 * Resolve a raw font path (as it appears in the .kps, relative to `source/`)
 * to its repo-relative path (e.g. "release/shared/fonts/sil/.../AndikaAfr-R.ttf").
 *
 * Returns null if the resolved path would escape the "release/" tree —
 * the "release/" prefix check is the intentional traversal safety net.
 * The caller must skip any null result.
 *
 * Exported so unit tests can exercise path-traversal edge cases in isolation.
 */
export function resolveKpsFontPath(rawPath: string, kbPath: string): string | null {
  // The font path is relative to <kbPath>/source (where the .kps lives).
  // pathUtils.normalize handles the separators + `.`/`..` resolution.
  const resolved = pathUtils.normalize(`${kbPath}/source/${rawPath}`);
  // Domain guard: a resolved path that escaped the release/ tree is rejected
  // (the intentional traversal safety net). The caller must skip null results.
  if (!resolved.startsWith("release/")) return null;
  return resolved;
}
/**
 * The VFS key for a release-relative `.kps` asset. Keyboard-local assets use
 * `source/…` so the scaffolder can rename them; shared assets retain their
 * release-relative path for the package descriptor's `..\..\..\` references.
 */
export function releasePathToVfsKey(releasePath: string, kbPath: string): string {
  const ownSource = `${kbPath}/source/`;
  return releasePath.startsWith(ownSource)
    ? `source/${releasePath.slice(ownSource.length)}`
    : releasePath.slice("release/".length);
}

const DEFAULT_OPTIONS: Required<CompilerOptions> = {
  compilerWarningsAsErrors: false,
  warnDeprecatedCode: true,
};

async function getText(
  url: string,
  fetchImpl: FetchFn,
): Promise<{ ok: boolean; status: number; text?: string; networkError?: string }> {
  let r: Awaited<ReturnType<FetchFn>>;
  try {
    r = await fetchImpl(url);
  } catch (err) {
    return { ok: false, status: 0, networkError: String(err) };
  }
  if (!r.ok) return { ok: false, status: r.status };
  return { ok: true, status: r.status, text: await r.text() };
}

async function getBytes(
  url: string,
  fetchImpl: FetchFn,
): Promise<{ ok: boolean; status: number; bytes?: Uint8Array; networkError?: string }> {
  let r: Awaited<ReturnType<FetchFn>>;
  try {
    r = await fetchImpl(url);
  } catch (err) {
    return { ok: false, status: 0, networkError: String(err) };
  }
  if (!r.ok) return { ok: false, status: r.status };
  const ab = await r.arrayBuffer();
  return { ok: true, status: r.status, bytes: new Uint8Array(ab) };
}

/**
 * Populate the VFS with the source files for the chosen base keyboard.
 *
 * Throws on a missing required file (the `.kmn` itself, or a required
 * sibling store) and returns silently (adding a warning string) on a missing
 * optional file or `.kpj` — see shared/siblingAssetStores.ts for the
 * canonical store inventory and which stores are required vs. optional.
 */
export async function fetchKeyboardSourceToVfs(
  startKeyboard: StartKeyboard,
  vfs: VirtualFS,
  opts?: FetchKeyboardSourceOptions,
): Promise<FetchKeyboardSourceResult> {
  const proxyBase = opts?.proxyBase ?? DEFAULT_PROXY;
  const fetchImpl = opts?.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const baseUrl = `${proxyBase}/${startKeyboard.path}`;
  const filesLoaded: string[] = [];
  const warnings: string[] = [];

  // Step 1: required .kmn.
  const kmnUrl = `${baseUrl}/source/${startKeyboard.id}.kmn`;
  const kmnResp = await getText(kmnUrl, fetchImpl);
  if (!kmnResp.ok || kmnResp.text === undefined) {
    const detail = kmnResp.networkError
      ? `network error: ${kmnResp.networkError}`
      : `HTTP ${kmnResp.status}`;
    throw new Error(
      `fetchKeyboardSourceToVfs: required .kmn not found at ${kmnUrl} (${detail})`,
    );
  }
  const kmnVfsPath = `source/${startKeyboard.id}.kmn`;
  vfs.set(kmnVfsPath, kmnResp.text);
  filesLoaded.push(kmnVfsPath);

  // Step 2: discover sibling deps.
  const stores = parseKmnHeaderStores(kmnResp.text);

  // Step 3: fetch each dep in parallel.
  const depResults = await Promise.all(
    stores.map(async (s) => {
      const url = `${baseUrl}/source/${s.path}`;
      const r = await getBytes(url, fetchImpl);
      return { store: s, url, ...r };
    }),
  );

  for (const r of depResults) {
    if (!r.ok || r.bytes === undefined) {
      const detail = r.networkError
        ? `network error: ${r.networkError}`
        : `HTTP ${r.status}`;
      if (r.store.required) {
        throw new Error(
          `fetchKeyboardSourceToVfs: required sibling ` +
            `&${r.store.storeName} '${r.store.path}' not found at ${r.url} (${detail})` +
            ` for keyboard '${startKeyboard.id}'`,
        );
      }
      warnings.push(
        `optional sibling &${r.store.storeName} '${r.store.path}' missing (${detail})`,
      );
      continue;
    }
    const path = `source/${r.store.path}`;
    // Text vs binary: kmcmplib's text inputs are .kmn / .keyman-touch-layout / .kvks
    // (XML) / .js (KMW_EMBEDJS) / .css (KMW_EMBEDCSS) / .htm. Binary: .ico / fonts.
    const isText =
      /\.(kmn|keyman-touch-layout|kvks|js|css|htm|html|txt|xml|json)$/i.test(r.store.path);
    if (isText) {
      vfs.set(path, new TextDecoder().decode(r.bytes));
    } else {
      // isBinary MUST be passed explicitly: VirtualFS.set defaults it to false,
      // and consumers that branch on the flag rather than on the content type
      // then treat these bytes as a string. That is how the &BITMAP icon used
      // to be destroyed by a draft snapshot (persistWorkingCopy.serializeEntry)
      // — and kmcmplib emits ZERO artifacts when it cannot read an icon a header
      // store names (see stripDanglingAssetStores.ts).
      vfs.set(path, r.bytes, true);
    }
    filesLoaded.push(path);
  }

  // Step 4: optional .kps — fetch font and stylesheet references.
  // The raw .kps is NOT written to the VFS (it references compiled artifacts
  // like ../build/*.kmx that must not leak into the VFS).
  const fonts: KpsFontEntry[] = [];
  let packageFonts: PackageFontSet | undefined;
  const stylesheets: KpsStylesheetEntry[] = [];
  const kpsUrl = `${baseUrl}/source/${startKeyboard.id}.kps`;
  const kpsResp = await getText(kpsUrl, fetchImpl);
  // Hoisted: the welcome-page resolution below (spec 080 R3) reads the same
  // descriptor for `<WelcomeFile>` and the `welcome\…` `<Files>` entries.
  const kpsText = kpsResp.ok && kpsResp.text !== undefined ? kpsResp.text : undefined;
  if (kpsText !== undefined) {
    const fontRefs = parseKpsFontRefs(kpsText);
    const { oskFonts, fileFonts, stylesheets: cssRefs } = fontRefs;
    /** Raw `.kps` font reference -> the VFS key it was written to. */
    const fetchedFontVfsPaths = new Map<string, string>();

    // Build a deduped map of rawPath -> isOskFont.
    const allRaw = new Map<string, boolean>();
    for (const p of oskFonts) allRaw.set(p, true);
    for (const p of fileFonts) {
      if (!allRaw.has(p)) allRaw.set(p, false);
    }

    // Resolve the .kvks font family (used on OSK-font entries).
    // VFS.get() returns a VirtualFSEntry ({ path, content, isBinary }), not
    // the raw content — read .content. Text siblings were written with
    // string content; binary entries would have Uint8Array which we skip.
    const kvksVfsPath = `source/${startKeyboard.id}.kvks`;
    let kvksFamilyStr: string | undefined;
    const kvksEntry = vfs.get(kvksVfsPath);
    if (kvksEntry !== undefined && typeof kvksEntry.content === "string") {
      kvksFamilyStr = parseKvks(kvksEntry.content).fontFamily;
    }
    // Fallback: check the touch-layout's top-level "font" value.
    if (kvksFamilyStr === undefined) {
      const tlVfsPath = `source/${startKeyboard.id}.keyman-touch-layout`;
      const tlEntry = vfs.get(tlVfsPath);
      if (tlEntry !== undefined && typeof tlEntry.content === "string") {
        try {
          const tlJson = JSON.parse(tlEntry.content) as Record<string, unknown>;
          // Touch-layout root can have "phone"/"tablet" etc.; each may carry "font".
          for (const section of Object.values(tlJson)) {
            if (
              section !== null &&
              typeof section === "object" &&
              "font" in section &&
              typeof (section as Record<string, unknown>)["font"] === "string"
            ) {
              kvksFamilyStr = (section as Record<string, string>)["font"];
              break;
            }
          }
        } catch {
          // malformed JSON — ignore
        }
      }
    }

    // Fetch each font file in parallel.
    const fontFetchResults = await Promise.all(
      [...allRaw.entries()].map(async ([rawPath, isOskFont]) => {
        const ttfRelPath = resolveKpsFontPath(rawPath, startKeyboard.path);
        if (ttfRelPath === null) {
          return {
            ok: false as const,
            warn: `font path '${rawPath}' resolves outside release/ tree — skipped`,
          };
        }
        const fontUrl = `${proxyBase}/${ttfRelPath}`;
        const r = await getBytes(fontUrl, fetchImpl);
        if (!r.ok || r.bytes === undefined) {
          const detail = r.networkError
            ? `network error: ${r.networkError}`
            : `HTTP ${r.status}`;
          return {
            ok: false as const,
            warn: `font '${ttfRelPath}' not fetched (${detail}) — skipped`,
          };
        }
        return { ok: true as const, rawPath, ttfRelPath, isOskFont, bytes: r.bytes };
      }),
    );

    for (const fr of fontFetchResults) {
      if (!fr.ok) {
        warnings.push(fr.warn);
        continue;
      }
      // VFS path strips the leading "release/" so it sits alongside the
      // keyboard source tree root (mirrors how shared/ assets are addressed
      // relative to the keyboard root).
      const vfsPath = releasePathToVfsKey(fr.ttfRelPath, startKeyboard.path);
      // Font files are binary — flag them (see the sibling-asset write above for
      // what an unflagged byte payload costs downstream).
      vfs.set(vfsPath, fr.bytes, true);
      filesLoaded.push(vfsPath);

      const entry: KpsFontEntry = {
        vfsPath,
        ttfRelPath: fr.ttfRelPath,
        isOskFont: fr.isOskFont,
      };
      // Attach the CSS family only to OSK-font entries and only when known.
      if (fr.isOskFont && kvksFamilyStr !== undefined) {
        entry.family = kvksFamilyStr;
      }
      fonts.push(entry);
      fetchedFontVfsPaths.set(fr.rawPath, vfsPath);
    }

    // Criteria 8/9/10: the fonts the base packages, re-declared
    // by the generated descriptor. A font's companions — the licence, FONTLOG
    // and README the base lists from the same shared folder — ship with it.
    // Companions are taken only from a folder OUTSIDE the keyboard's own tree:
    // a keyboard-local font sits in source/, where "same folder" would sweep
    // in every other source member.
    packageFonts = await collectPackageFonts({
      kpsText,
      kbPath: startKeyboard.path,
      fetchedFontVfsPaths,
      refs: { oskFont: fontRefs.oskFont, displayFont: fontRefs.displayFont },
      proxyBase,
      fetchImpl,
      vfs,
      warnings,
      filesLoaded,
    });

    // Fetch each per-keyboard CSS file in parallel. These live next to the .kps
    // in source/ and may use the same `..\..\..` traversal pattern as fonts;
    // resolveKpsFontPath enforces the release/ tree boundary for both.
    const cssFetchResults = await Promise.all(
      cssRefs.map(async (rawPath) => {
        const cssRelPath = resolveKpsFontPath(rawPath, startKeyboard.path);
        if (cssRelPath === null) {
          return {
            ok: false as const,
            warn: `css path '${rawPath}' resolves outside release/ tree — skipped`,
          };
        }
        const cssUrl = `${proxyBase}/${cssRelPath}`;
        const r = await getText(cssUrl, fetchImpl);
        if (!r.ok || r.text === undefined) {
          const detail = r.networkError
            ? `network error: ${r.networkError}`
            : `HTTP ${r.status}`;
          return {
            ok: false as const,
            warn: `css '${cssRelPath}' not fetched (${detail}) — skipped`,
          };
        }
        return { ok: true as const, cssRelPath, cssText: r.text };
      }),
    );

    for (const cr of cssFetchResults) {
      if (!cr.ok) {
        warnings.push(cr.warn);
        continue;
      }
      // Keyed like the rest of the keyboard's source, so the scaffolder can
      // rename keyboard-local stylesheets. Welcome/help CSS remains fetch-only
      // documentation input and is retained in startDocCssTexts instead.
      const vfsPath = releasePathToVfsKey(cr.cssRelPath, startKeyboard.path);
      if (!/^source\/(welcome|help)\//i.test(vfsPath)) {
        vfs.set(vfsPath, cr.cssText);
        filesLoaded.push(vfsPath);
      }
      stylesheets.push({
        vfsPath,
        cssRelPath: cr.cssRelPath,
        cssText: cr.cssText,
      });
    }
  } else {
    const detail = kpsResp.networkError
      ? `network error: ${kpsResp.networkError}`
      : `HTTP ${kpsResp.status}`;
    warnings.push(`.kps not found at ${kpsUrl} (${detail}); no fonts loaded`);
  }

  // Step 5: optional .kpj.
  const kpjUrl = `${baseUrl}/${startKeyboard.id}.kpj`;
  const kpjResp = await getText(kpjUrl, fetchImpl);
  let options: Required<CompilerOptions> = DEFAULT_OPTIONS;
  if (kpjResp.ok && kpjResp.text !== undefined) {
    options = parseKpjFlags(kpjResp.text);
    const kpjVfsPath = `${startKeyboard.id}.kpj`;
    vfs.set(kpjVfsPath, kpjResp.text);
    filesLoaded.push(kpjVfsPath);
  } else {
    const detail = kpjResp.networkError
      ? `network error: ${kpjResp.networkError}`
      : `HTTP ${kpjResp.status}`;
    warnings.push(`.kpj not found at ${kpjUrl} (${detail}); defaults applied`);
  }

  // The KMW .js is produced by `CompilerService.compile()` running
  // @keymanapp/kmc-kmn's full pipeline in-browser — no need to fetch a
  // prebuilt stand-in. (Removed once kmw-compiler integration landed.)
  // spec 064 FR-011: the base's LICENSE.md, for copyright accumulation. Absence
  // is non-fatal and NOT a warning — ~545 of 554 legacy keyboards have none, and
  // a missing license file is a normal condition the caller decides about.
  let startLicenseText: string | undefined;
  const licenseResp = await getText(`${baseUrl}/LICENSE.md`, fetchImpl);
  if (licenseResp.ok && licenseResp.text !== undefined) {
    startLicenseText = licenseResp.text;
  }

  // spec 061 FR-013: the base's own welcome page / help.php, for merge purposes
  // at render time only — not written into the VFS (see startWelcomeHtmText
  // doc comment). Absence is non-fatal and NOT a warning, same tolerance as
  // startLicenseText: most bases have no help page at all.
  //
  // spec 080 R3: the welcome page is resolved through the three-step probe
  // (descriptor-named → folder → flat) and, on the folder convention, its
  // sibling images come along too.
  const welcome = await resolveStartWelcome(baseUrl, kpsText, fetchImpl);
  const startWelcomeHtmText = welcome.text;
  const startWelcomeConvention = welcome.convention;
  const startWelcomeImages = welcome.images;
  warnings.push(...welcome.warnings);

  let startHelpPhpText: string | undefined;
  const helpPhpResp = await getText(`${baseUrl}/source/help/${startKeyboard.id}.php`, fetchImpl);
  if (helpPhpResp.ok && helpPhpResp.text !== undefined) {
    startHelpPhpText = helpPhpResp.text;
  }

  // Issue #2139 (criterion 11.8): the stylesheets the base's welcome / help
  // pages use — see the result field's doc for why the check needs them.
  // Absence is non-fatal and NOT a warning, same tolerance as the pages.
  const startDocCssTexts: StartDocCssText[] = [];
  for (const cssPath of docStylesheetPaths({
    welcomeText: startWelcomeHtmText,
    welcomeConvention: startWelcomeConvention,
    helpText: startHelpPhpText,
  })) {
    const cssResp = await getText(`${baseUrl}/${cssPath}`, fetchImpl);
    if (cssResp.ok && cssResp.text !== undefined) startDocCssTexts.push({ path: cssPath, text: cssResp.text });
  }

  // spec 080 FR-006: the base's README.md / HISTORY.md, for inheritance at
  // render time (README prose) and preservation below the new entry (HISTORY,
  // criterion 3.4). Root-level like LICENSE.md; absence is silent.
  let startReadmeMdText: string | undefined;
  const readmeResp = await getText(`${baseUrl}/README.md`, fetchImpl);
  if (readmeResp.ok && readmeResp.text !== undefined) {
    startReadmeMdText = readmeResp.text;
  }
  let startHistoryMdText: string | undefined;
  const historyResp = await getText(`${baseUrl}/HISTORY.md`, fetchImpl);
  if (historyResp.ok && historyResp.text !== undefined) {
    startHistoryMdText = historyResp.text;
  }

  return {
    options,
    filesLoaded,
    warnings,
    fonts,
    ...(packageFonts !== undefined ? { packageFonts } : {}),
    stylesheets,
    ...(startLicenseText !== undefined ? { startLicenseText } : {}),
    ...(startWelcomeHtmText !== undefined ? { startWelcomeHtmText } : {}),
    ...(startHelpPhpText !== undefined ? { startHelpPhpText } : {}),
    startWelcomeConvention,
    ...(startWelcomeImages.length > 0 ? { startWelcomeImages } : {}),
    ...(startReadmeMdText !== undefined ? { startReadmeMdText } : {}),
    ...(startHistoryMdText !== undefined ? { startHistoryMdText } : {}),
    ...(startDocCssTexts.length > 0 ? { startDocCssTexts } : {}),
  };
}

// ---------------------------------------------------------------------------
// Welcome-page resolution (spec 080 US2, research R3)
// ---------------------------------------------------------------------------

/** The `.kps` `<Options><WelcomeFile>` value, or undefined when absent/blank. */
function parseKpsWelcomeFile(kpsText: string): string | undefined {
  const m = /<WelcomeFile(?:\s[^>]*)?>([^<]*)<\/WelcomeFile\s*>/i.exec(kpsText);
  const value = m?.[1]?.trim() ?? "";
  return value !== "" ? value : undefined;
}

/**
 * True when a `source/`-relative reference climbs out of its folder anywhere
 * (`../x`, `welcome/../../x`). The welcome-folder fetches below reject these
 * BEFORE building a URL — the same traversal safety net `resolveKpsFontPath`
 * applies with its `release/` prefix check, applied to both image loops so a
 * `.kps` entry or an `<img src>` cannot fetch outside the keyboard's folder.
 */
/**
 * The base's packaged fonts as a {@link PackageFontSet}.
 *
 * Walks the `.kps` `<Files>` in order: each font already fetched is listed
 * under the VFS key it was written to, and every other member that sits in the
 * same folder as a fetched font — when that folder is outside the keyboard's
 * own tree — is fetched as a companion (licence, FONTLOG, README; criterion 9).
 * A companion that cannot be fetched is skipped with a warning. A selected
 * OSK/display font that `<Files>` omits is still listed, after the rest.
 */
async function collectPackageFonts(args: {
  kpsText: string;
  kbPath: string;
  fetchedFontVfsPaths: ReadonlyMap<string, string>;
  refs: { oskFont: string | undefined; displayFont: string | undefined };
  proxyBase: string;
  fetchImpl: FetchFn;
  vfs: VirtualFS;
  warnings: string[];
  filesLoaded: string[];
}): Promise<PackageFontSet | undefined> {
  const { kpsText, kbPath, fetchedFontVfsPaths, refs, proxyBase, fetchImpl, vfs, warnings, filesLoaded } = args;
  if (fetchedFontVfsPaths.size === 0) return undefined;

  const ownTree = `${kbPath}/`;
  const fontDirs = new Set<string>();
  for (const rawPath of fetchedFontVfsPaths.keys()) {
    const releasePath = resolveKpsFontPath(rawPath, kbPath);
    if (releasePath !== null && !releasePath.startsWith(ownTree)) fontDirs.add(pathUtils.dirname(releasePath));
  }

  const files: string[] = [];
  const listed = new Set<string>();
  const list = (vfsPath: string): void => {
    if (listed.has(vfsPath)) return;
    listed.add(vfsPath);
    files.push(vfsPath);
  };

  for (const { name, fileType } of parseKpsFiles(kpsText)) {
    const fetched = fetchedFontVfsPaths.get(name);
    if (fetched !== undefined) {
      list(fetched);
      continue;
    }
    if (fileType === ".ttf" || fileType === ".otf" || fileType === ".css") continue;
    const releasePath = resolveKpsFontPath(name, kbPath);
    if (releasePath === null || !fontDirs.has(pathUtils.dirname(releasePath))) continue;
    const vfsPath = releasePathToVfsKey(releasePath, kbPath);
    if (listed.has(vfsPath)) continue;
    const r = await getBytes(`${proxyBase}/${releasePath}`, fetchImpl);
    if (!r.ok || r.bytes === undefined) {
      const detail = r.networkError ? `network error: ${r.networkError}` : `HTTP ${r.status}`;
      warnings.push(`font companion '${releasePath}' not fetched (${detail}) — skipped`);
      continue;
    }
    vfs.set(vfsPath, r.bytes, true);
    filesLoaded.push(vfsPath);
    list(vfsPath);
  }

  const oskFont = refs.oskFont !== undefined ? fetchedFontVfsPaths.get(refs.oskFont) : undefined;
  const displayFont = refs.displayFont !== undefined ? fetchedFontVfsPaths.get(refs.displayFont) : undefined;
  if (oskFont !== undefined) list(oskFont);
  if (displayFont !== undefined) list(displayFont);

  return {
    files,
    ...(oskFont !== undefined ? { oskFont } : {}),
    ...(displayFont !== undefined ? { displayFont } : {}),
  };
}

function hasTraversal(rel: string): boolean {
  return rel.split("/").includes("..");
}

const WELCOME_FOLDER_PREFIX = "welcome/";
const FOLDER_WELCOME_PAGE = "welcome/welcome.htm";
const FLAT_WELCOME_PAGE = "welcome.htm";

/**
 * Extensions carried as welcome images (#2305). The copy track carries
 * images only and no prose (spec 080 R9 / FR-007, spec 102 FR-032), so a
 * `welcome\…` `<Files>` entry that is not an image — the per-layout `.htm`
 * sub-pages and `kb.css` a keyboard like sil_cameroon_qwerty lists there —
 * is not a welcome image: carrying it ships it in the copy's `.kps` and the
 * generated welcome page renders it as a broken `<img>`.
 */
const WELCOME_IMAGE_EXTENSIONS: ReadonlySet<string> = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "svg",
  "webp",
  "bmp",
  "ico",
  "avif",
]);

/** True when `rel` names an image file, by extension (case-insensitive). */
function isWelcomeImagePath(rel: string): boolean {
  const m = /\.([a-z0-9]+)$/i.exec(rel);
  return m !== null && WELCOME_IMAGE_EXTENSIONS.has(m[1]!.toLowerCase());
}

interface ResolvedStartWelcome {
  text: string | undefined;
  convention: WelcomeConvention;
  images: WelcomeFolderImage[];
  warnings: string[];
}

const LINK_TAG_RE = /<link\b[^>]*>/gi;
const HREF_ATTR_RE = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')/i;

/**
 * The repo paths (`source/…`) of the stylesheets a base's welcome / help
 * pages use, in page order (welcome first, then help), deduped (issue
 * #2139). Per page, the candidates are every relative `.css` href its
 * `<link>` tags name, resolved against the page's own folder, plus the
 * conventional `kb.css` in that folder — a page may rely on the help
 * site's `header.php` for the link instead of carrying it in its own
 * text. Absolute, scheme-qualified, and `..`-escaping hrefs never count:
 * only files inside the page's folder can govern it.
 */
function docStylesheetPaths(args: {
  welcomeText: string | undefined;
  welcomeConvention: WelcomeConvention;
  helpText: string | undefined;
}): string[] {
  const pages: Array<{ text: string | undefined; dir: string }> = [
    {
      text: args.welcomeText,
      dir:
        args.welcomeConvention === "folder"
          ? "source/welcome/"
          : args.welcomeConvention === "flat"
            ? "source/"
            : "",
    },
    { text: args.helpText, dir: "source/help/" },
  ];
  const paths: string[] = [];
  const seen = new Set<string>();
  const add = (path: string) => {
    if (!seen.has(path)) {
      seen.add(path);
      paths.push(path);
    }
  };
  for (const { text, dir } of pages) {
    if (text === undefined || dir === "") continue;
    for (const tag of text.matchAll(LINK_TAG_RE)) {
      const m = HREF_ATTR_RE.exec(tag[0]);
      const href = m?.[1] ?? m?.[2];
      if (href === undefined) continue;
      const clean = href.trim().replace(/^\.\//, "");
      if (!/\.css$/i.test(clean)) continue;
      if (/^[a-z][a-z0-9+.-]*:/i.test(clean) || clean.startsWith("/") || clean.split("/").includes("..")) continue;
      add(`${dir}${clean}`);
    }
    add(`${dir}kb.css`);
  }
  return paths;
}

/**
 * Locate the base's welcome page and, on the folder convention, its images.
 *
 * Order (research R3, spec assumption): the descriptor-named page first, then
 * `source/welcome/welcome.htm`, then the flat `source/welcome.htm`. Two
 * refinements keep the spec's edge cases honest:
 *
 *   - `folder` WINS when both conventions exist. A descriptor that declares
 *     the flat name is therefore not taken at its word before the folder page
 *     has been probed — otherwise a base carrying both would resolve flat and
 *     the projection would drop the folder's images.
 *   - A declared name that 404s degrades to the next probe (ghost descriptor
 *     entry), never to a failure.
 *
 * Images are the `welcome\…` `<Files>` entries other than the page, fetched as
 * bytes — image files only (#2305, see {@link WELCOME_IMAGE_EXTENSIONS}): the
 * same folder listing also names prose sub-pages and stylesheets, which the
 * copy track does not carry. Each miss is skipped and recorded — a listed
 * file the base does not ship is the base's defect, and the output must
 * still build.
 */
async function resolveStartWelcome(
  baseUrl: string,
  kpsText: string | undefined,
  fetchImpl: FetchFn,
): Promise<ResolvedStartWelcome> {
  const warnings: string[] = [];
  const declaredRaw = kpsText !== undefined ? parseKpsWelcomeFile(kpsText) : undefined;
  const declared = declaredRaw !== undefined ? kpsRefToPosix(declaredRaw) : undefined;
  const declaredIsFolder = declared !== undefined && declared.startsWith(WELCOME_FOLDER_PREFIX);

  let text: string | undefined;
  let convention: WelcomeConvention = "absent";
  let pagePath: string | undefined;

  const probe = async (relPath: string): Promise<boolean> => {
    const resp = await getText(`${baseUrl}/source/${relPath}`, fetchImpl);
    if (resp.ok && resp.text !== undefined) {
      text = resp.text;
      pagePath = relPath;
      return true;
    }
    return false;
  };

  // 1. Descriptor-named page, when it names a folder-convention file.
  if (declaredIsFolder && (await probe(declared))) {
    convention = "folder";
  } else if (await probe(FOLDER_WELCOME_PAGE)) {
    // 2. The folder convention (corpus majority) — also the "folder wins" branch
    //    for a descriptor that declared the flat name.
    convention = "folder";
  } else if (
    // 3. The flat convention: the declared flat name first (it may not be
    //    literally `welcome.htm`), then the conventional flat name.
    (declared !== undefined && !declaredIsFolder && declared !== FLAT_WELCOME_PAGE && (await probe(declared))) ||
    (await probe(FLAT_WELCOME_PAGE))
  ) {
    convention = "flat";
  }

  // Folder images: every `welcome\…` <Files> entry other than the page itself
  // that names an image file (#2305), in `.kps` order (deterministic, and
  // the order the corpus descriptor uses). Non-image entries (`.htm`
  // sub-pages, `kb.css`) are skipped silently — they are not missing
  // images, just not images.
  const images: WelcomeFolderImage[] = [];
  const seen = new Set<string>();
  if (convention === "folder" && kpsText !== undefined) {
    for (const { name } of parseKpsFiles(kpsText)) {
      const rel = kpsRefToPosix(name);
      if (!rel.startsWith(WELCOME_FOLDER_PREFIX) || hasTraversal(rel)) continue;
      if (rel === pagePath) continue;
      if (!isWelcomeImagePath(rel)) continue;
      const key = rel.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const r = await getBytes(`${baseUrl}/source/${rel}`, fetchImpl);
      if (r.ok && r.bytes !== undefined) {
        images.push({ path: rel, bytes: r.bytes });
      } else {
        const detail = r.networkError ? `network error: ${r.networkError}` : `HTTP ${r.status}`;
        warnings.push(`welcome image ${rel} listed in the .kps was not found (${detail}); skipped`);
      }
    }
  }

  // Then the images the PAGE references that the `.kps` never listed. The
  // corpus sweep (utilities/welcome-sweep) found 43 of 725 folder-convention
  // bases in this state — `<img src="mobile_default.png">` beside the page with
  // no `<File>` entry — and a `.kps`-only fetch would ship those pages with
  // broken references. Silent on a miss: the projection names images the page
  // references but nothing carried (its `missingInheritedImages` edge case), so
  // reporting a 404 here would say the same thing twice.
  if (convention === "folder" && text !== undefined) {
    for (const ref of extractWelcomeImageRefs(text)) {
      if (hasTraversal(ref)) continue;
      const rel = ref.toLowerCase().startsWith(WELCOME_FOLDER_PREFIX) ? ref : `${WELCOME_FOLDER_PREFIX}${ref}`;
      const key = rel.toLowerCase();
      if (rel === pagePath || seen.has(key)) continue;
      seen.add(key);
      const r = await getBytes(`${baseUrl}/source/${rel}`, fetchImpl);
      if (r.ok && r.bytes !== undefined) images.push({ path: rel, bytes: r.bytes });
    }
  }

  return { text, convention, images, warnings };
}
