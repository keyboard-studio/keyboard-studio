// Fetch a base keyboard's source files from the keymanapp/keyboards
// release tree into the VirtualFS, ready for CompilerService.compile().
//
// Resolves `<proxyBase>/<baseKeyboard.path>/source/<id>.kmn`, parses the
// header for sibling deps (LAYOUTFILE / VISUALKEYBOARD / KMW_EMBEDJS /
// BITMAP / KMW_HELPFILE), fetches each, plus the optional <id>.kpj for
// compiler flags. Writes everything flat into the VFS at `source/...`
// (the layout CompilerService.compile() expects).

import type { BaseKeyboard, VirtualFS } from "@keyboard-studio/contracts";
import { parseKmnHeaderStores } from "../compiler/parseKmnHeaderStores.js";
import { parseKpjFlags, type CompilerOptions } from "../compiler/parseKpjFlags.js";

export interface FetchKeyboardSourceOptions {
  /** Default `/kbd-proxy` — Vite proxies it to raw.githubusercontent.com. */
  proxyBase?: string;
  /** Override `globalThis.fetch` (used in tests with a mock). */
  fetchImpl?: typeof fetch;
}

export interface FetchKeyboardSourceResult {
  /** CompilerOptions derived from the .kpj (or defaults if .kpj absent). */
  options: Required<CompilerOptions>;
  /** VFS paths actually populated by this fetch. */
  filesLoaded: string[];
  /** Non-fatal issues (missing optional siblings, .kpj 404). */
  warnings: string[];
}

const DEFAULT_PROXY = "/kbd-proxy";
const DEFAULT_OPTIONS: Required<CompilerOptions> = {
  compilerWarningsAsErrors: false,
  warnDeprecatedCode: true,
};

async function getText(
  url: string,
  fetchImpl: typeof fetch,
): Promise<{ ok: boolean; status: number; text?: string; networkError?: string }> {
  let r: Response;
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
  fetchImpl: typeof fetch,
): Promise<{ ok: boolean; status: number; bytes?: Uint8Array; networkError?: string }> {
  let r: Response;
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
 * sibling named in a LAYOUTFILE / VISUALKEYBOARD / KMW_EMBEDJS store).
 * Returns silently on missing optional files (BITMAP / KMW_HELPFILE / .kpj),
 * adding a warning string.
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
            `&${r.store.storeName} '${r.store.path}' not found at ${r.url} (${detail})`,
        );
      }
      warnings.push(
        `optional sibling &${r.store.storeName} '${r.store.path}' missing (${detail})`,
      );
      continue;
    }
    const path = `source/${r.store.path}`;
    // Text vs binary: kmcmplib's text inputs are .kmn / .keyman-touch-layout / .kvks
    // (XML) / .js (KMW_EMBEDJS) / .htm. Binary: .ico / fonts.
    const isText =
      /\.(kmn|keyman-touch-layout|kvks|js|htm|html|txt|xml)$/i.test(r.store.path);
    if (isText) {
      vfs.set(path, new TextDecoder().decode(r.bytes));
    } else {
      vfs.set(path, r.bytes);
    }
    filesLoaded.push(path);
  }

  // Step 4: optional .kpj.
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
  return { options, filesLoaded, warnings };
}
