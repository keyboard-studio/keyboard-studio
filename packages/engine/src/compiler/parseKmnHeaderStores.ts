// Discover sibling-file dependencies declared in a .kmn header.
// Scans the pre-`begin` block for system store(&NAME) 'path' directives
// that name files kmcmplib needs to read at compile time.
//
// Per km-keyman (#39 cycle 3): five names matter for the source-on-the-fly
// compile path: LAYOUTFILE, VISUALKEYBOARD, BITMAP, KMW_EMBEDJS, KMW_HELPFILE.
// DISPLAYMAP added: PUA-font JSON sidecars (e.g. KbdArab.json) referenced via
// relative paths that traverse into release/shared/; kmc warns (not errors) if
// absent, but the compile fails for PUA-mapped keyboards when it cannot resolve.
// KMW_EMBEDCSS added: the visual-keyboard CSS the KMW compiler embeds into the
// .js (kmw-compiler reads it via loadFile, then `TextDecoder().decode(data)` —
// when the sibling is absent loadFile returns null and that decode throws a
// confusing TypeError, so the styling is silently dropped from the OSK preview).

export interface KmnHeaderStore {
  /** Store name without the leading '&', uppercased (e.g. "LAYOUTFILE"). */
  storeName: string;
  /** Path value (single-quoted in KMN) relative to source/. */
  path: string;
  /** kmcmplib will fail compile if this store is named but the file is missing. */
  required: boolean;
}

const SYSTEM_STORES: Record<string, boolean> = {
  LAYOUTFILE: true,
  VISUALKEYBOARD: true,
  BITMAP: false,
  KMW_EMBEDJS: true,
  KMW_EMBEDCSS: false,
  KMW_HELPFILE: false,
  DISPLAYMAP: false,
};

/**
 * Extract the system-store path references from the header of a .kmn file.
 * The header ends at the first `begin` keyword (case-insensitive). Stores
 * declared after `begin` are ignored.
 */
export function parseKmnHeaderStores(kmnText: string): KmnHeaderStore[] {
  const beginMatch = /^\s*begin\s/im.exec(kmnText);
  const header = beginMatch !== null ? kmnText.slice(0, beginMatch.index) : kmnText;

  const re = /^\s*store\s*\(\s*&([A-Z_][A-Z0-9_]*)\s*\)\s*(?:'([^']*)'|"([^"]*)")/gim;
  const out: KmnHeaderStore[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(header)) !== null) {
    const storeName = (m[1] ?? "").toUpperCase();
    const path = (m[2] ?? m[3] ?? "");
    if (path.length === 0) continue;
    if (!(storeName in SYSTEM_STORES)) continue;
    out.push({ storeName, path, required: SYSTEM_STORES[storeName] ?? false });
  }
  return out;
}
