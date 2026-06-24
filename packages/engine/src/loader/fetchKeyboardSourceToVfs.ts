// Fetch a base keyboard's source files from the keymanapp/keyboards
// release tree into the VirtualFS, ready for CompilerService.compile().
//
// Resolves `<proxyBase>/<baseKeyboard.path>/source/<id>.kmn`, parses the
// header for sibling deps (LAYOUTFILE / VISUALKEYBOARD / KMW_EMBEDJS /
// KMW_EMBEDCSS / BITMAP / KMW_HELPFILE / DISPLAYMAP / INCLUDECODES), fetches each,
// plus the optional <id>.kpj for compiler flags. Writes everything flat into the
// VFS at `source/...` (the layout CompilerService.compile() expects).

import type { BaseKeyboard, VirtualFS, KpsFontEntry, KpsStylesheetEntry } from "@keyboard-studio/contracts";
import { parseKmnHeaderStores } from "../compiler/parseKmnHeaderStores.js";
import { parseKpjFlags, type CompilerOptions } from "../compiler/parseKpjFlags.js";
import { parseKpsFonts } from "../compiler/parseKpsFonts.js";
import { parseKvksFontFamily } from "../compiler/parseKvksFontFamily.js";

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
   * Per-keyboard CSS stylesheets fetched from the keyboards tree and written
   * into the VFS. The studio injects these into the OSK iframe so the
   * keyboard's `.kmw-keyboard-<id>` rules apply to the preview. Empty when
   * no .kps was found or no `.css` <File> entries were present.
   */
  stylesheets: KpsStylesheetEntry[];
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
  const normalized = rawPath.replace(/\\/g, "/");
  // Start from <kbPath>/source (the directory the .kps lives in).
  const segments = [...kbPath.split("/"), "source"];
  for (const part of normalized.split("/")) {
    if (part === "..") {
      // Guard against underflow: only pop when there is a segment to remove.
      if (segments.length > 0) segments.pop();
    } else if (part !== "." && part !== "") {
      segments.push(part);
    }
  }
  const resolved = segments.join("/");
  if (!resolved.startsWith("release/")) return null;
  return resolved;
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
 * sibling named in a LAYOUTFILE / VISUALKEYBOARD / KMW_EMBEDJS / INCLUDECODES store).
 * Returns silently on missing optional files (BITMAP / KMW_HELPFILE / KMW_EMBEDCSS /
 * DISPLAYMAP / .kpj), adding a warning string.
 */
export async function fetchKeyboardSourceToVfs(
  baseKeyboard: BaseKeyboard,
  vfs: VirtualFS,
  opts?: FetchKeyboardSourceOptions,
): Promise<FetchKeyboardSourceResult> {
  const proxyBase = opts?.proxyBase ?? DEFAULT_PROXY;
  const fetchImpl = opts?.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const baseUrl = `${proxyBase}/${baseKeyboard.path}`;
  const filesLoaded: string[] = [];
  const warnings: string[] = [];

  // Step 1: required .kmn.
  const kmnUrl = `${baseUrl}/source/${baseKeyboard.id}.kmn`;
  const kmnResp = await getText(kmnUrl, fetchImpl);
  if (!kmnResp.ok || kmnResp.text === undefined) {
    const detail = kmnResp.networkError
      ? `network error: ${kmnResp.networkError}`
      : `HTTP ${kmnResp.status}`;
    throw new Error(
      `fetchKeyboardSourceToVfs: required .kmn not found at ${kmnUrl} (${detail})`,
    );
  }
  const kmnVfsPath = `source/${baseKeyboard.id}.kmn`;
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
            ` for keyboard '${baseKeyboard.id}'`,
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
      vfs.set(path, r.bytes);
    }
    filesLoaded.push(path);
  }

  // Step 4: optional .kps — fetch font and stylesheet references.
  // The raw .kps is NOT written to the VFS (it references compiled artifacts
  // like ../build/*.kmx that must not leak into the VFS).
  const fonts: KpsFontEntry[] = [];
  const stylesheets: KpsStylesheetEntry[] = [];
  const kpsUrl = `${baseUrl}/source/${baseKeyboard.id}.kps`;
  const kpsResp = await getText(kpsUrl, fetchImpl);
  if (kpsResp.ok && kpsResp.text !== undefined) {
    const { oskFonts, fileFonts, stylesheets: cssRefs } = parseKpsFonts(kpsResp.text);

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
    const kvksVfsPath = `source/${baseKeyboard.id}.kvks`;
    let kvksFamilyStr: string | undefined;
    const kvksEntry = vfs.get(kvksVfsPath);
    if (kvksEntry !== undefined && typeof kvksEntry.content === "string") {
      kvksFamilyStr = parseKvksFontFamily(kvksEntry.content) ?? undefined;
    }
    // Fallback: check the touch-layout's top-level "font" value.
    if (kvksFamilyStr === undefined) {
      const tlVfsPath = `source/${baseKeyboard.id}.keyman-touch-layout`;
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
        const ttfRelPath = resolveKpsFontPath(rawPath, baseKeyboard.path);
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
        return { ok: true as const, ttfRelPath, isOskFont, bytes: r.bytes };
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
      const vfsPath = fr.ttfRelPath.slice("release/".length);
      vfs.set(vfsPath, fr.bytes);
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
    }

    // Fetch each per-keyboard CSS file in parallel. These live next to the .kps
    // in source/ and may use the same `..\..\..` traversal pattern as fonts;
    // resolveKpsFontPath enforces the release/ tree boundary for both.
    const cssFetchResults = await Promise.all(
      cssRefs.map(async (rawPath) => {
        const cssRelPath = resolveKpsFontPath(rawPath, baseKeyboard.path);
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
      const vfsPath = cr.cssRelPath.slice("release/".length);
      vfs.set(vfsPath, cr.cssText);
      filesLoaded.push(vfsPath);
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
  const kpjUrl = `${baseUrl}/${baseKeyboard.id}.kpj`;
  const kpjResp = await getText(kpjUrl, fetchImpl);
  let options: Required<CompilerOptions> = DEFAULT_OPTIONS;
  if (kpjResp.ok && kpjResp.text !== undefined) {
    options = parseKpjFlags(kpjResp.text);
    const kpjVfsPath = `${baseKeyboard.id}.kpj`;
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
  return { options, filesLoaded, warnings, fonts, stylesheets };
}
