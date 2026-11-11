// Minimal parser for CLDR legacy (43.1) keyboard XML — issue #2599.
//
// The format is the old LDML keyboard format (TR35 v43.1): a `<keyboard>`
// holding `<keyMap>` blocks (each a `modifiers` alternative set), `<map>`
// entries keyed by ISO position, and `<transforms type="simple">` dead-key
// sequences. Only that subset is parsed; anything else (flicks, hardwareMap,
// display names beyond `<name>`) is out of scope and ignored.
//
// Deliberately dependency-free and regex-based, in the style of the engine's
// `kps-parser.ts`: these files are small, regular, and machine-generated, and
// pulling in a DOM parser for them would add a dependency for one importer.
// XML comments are stripped first (they contain quotes and backticks that
// would otherwise confuse attribute matching).

/** One `<map iso="…" to="…" …/>` entry inside a `<keyMap>`. */
export interface CldrLegacyMap {
  iso: string;
  to: string;
  /** Space-separated long-press list, when present. */
  longPress?: string;
  /** Space-separated multi-tap list, when present. */
  multitap?: string;
  /** `transform="no"`: this key's output must not feed dead-key transforms. */
  transformNo?: boolean;
}

/** One `<keyMap modifiers="…">…</keyMap>` block. */
export interface CldrLegacyKeyMap {
  /** Raw `modifiers` attribute; undefined is the base layer. */
  modifiers?: string;
  maps: CldrLegacyMap[];
}

/** One `<transform from="…" to="…"/>` inside `<transforms type="simple">`. */
export interface CldrLegacyTransform {
  from: string;
  to: string;
}

/** A parsed legacy CLDR keyboard file. */
export interface CldrLegacyKeyboard {
  /** `locale` attribute, e.g. `de-t-k0-windows`. */
  locale: string;
  /** `<name value="…"/>`, e.g. `German`. */
  name?: string;
  /** `<version platform="…"/>`, e.g. `10` (Windows) or `4.4` (Android). */
  platform?: string;
  keyMaps: CldrLegacyKeyMap[];
  /** `type="simple"` transforms only. */
  transforms: CldrLegacyTransform[];
  /** `type` values seen on `<transforms>` blocks other than `simple`. */
  skippedTransformTypes: string[];
}

/** Decode XML entities, numeric character references, and `\u{…}` escapes. */
export function decodeCldrValue(raw: string): string {
  return raw
    .replace(/\\u\{([0-9a-fA-F]+)\}/g, (_m, hex: string) =>
      String.fromCodePoint(parseInt(hex, 16)),
    )
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, hex: string) =>
      String.fromCodePoint(parseInt(hex, 16)),
    )
    .replace(/&#([0-9]+);/g, (_m, dec: string) =>
      String.fromCodePoint(parseInt(dec, 10)),
    )
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/** Parse one attribute list (`name="value" …`) into a record. */
function parseAttrs(text: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const m of text.matchAll(/([\w-]+)\s*=\s*"([^"]*)"/g)) {
    attrs[m[1] as string] = decodeCldrValue(m[2] as string);
  }
  return attrs;
}

/**
 * Parse a CLDR legacy keyboard XML document.
 *
 * @throws {Error} when the document has no `<keyboard locale>` or no keyMap.
 */
export function parseCldrLegacyKeyboard(xml: string): CldrLegacyKeyboard {
  // Comments may contain quotes/backticks; strip them before attribute scans.
  const noComments = xml.replace(/<!--[\s\S]*?-->/g, "");
  const noDoctype = noComments.replace(/<!DOCTYPE[^>]*>/g, "");

  const keyboardTag = /<keyboard\b([^>]*)>/.exec(noDoctype);
  if (keyboardTag === null) {
    throw new Error("CLDR legacy keyboard: missing <keyboard> element");
  }
  const keyboardAttrs = parseAttrs(keyboardTag[1] as string);
  const locale = keyboardAttrs["locale"];
  if (locale === undefined || locale === "") {
    throw new Error("CLDR legacy keyboard: missing locale attribute");
  }

  const versionTag = /<version\b([^>]*?)\/>/.exec(noDoctype);
  const platform =
    versionTag === null
      ? undefined
      : parseAttrs(versionTag[1] as string)["platform"];

  const nameTag = /<names>[\s\S]*?<name\b([^>]*?)\/>/.exec(noDoctype);
  const name =
    nameTag === null
      ? undefined
      : parseAttrs(nameTag[1] as string)["value"];

  const keyMaps: CldrLegacyKeyMap[] = [];
  for (const block of noDoctype.matchAll(
    /<keyMap\b([^>]*)>([\s\S]*?)<\/keyMap>/g,
  )) {
    const attrs = parseAttrs(block[1] as string);
    const maps: CldrLegacyMap[] = [];
    for (const mapTag of (block[2] as string).matchAll(/<map\b([^>]*?)\/>/g)) {
      const mapAttrs = parseAttrs(mapTag[1] as string);
      const iso = mapAttrs["iso"];
      const to = mapAttrs["to"];
      if (iso === undefined || to === undefined) continue;
      maps.push({
        iso,
        to,
        ...(mapAttrs["longPress"] !== undefined
          ? { longPress: mapAttrs["longPress"] }
          : {}),
        ...(mapAttrs["multitap"] !== undefined
          ? { multitap: mapAttrs["multitap"] }
          : {}),
        ...(mapAttrs["transform"] === "no" ? { transformNo: true } : {}),
      });
    }
    keyMaps.push({
      ...(attrs["modifiers"] !== undefined
        ? { modifiers: attrs["modifiers"] }
        : {}),
      maps,
    });
  }
  if (keyMaps.length === 0) {
    throw new Error(
      `CLDR legacy keyboard ${locale}: no <keyMap> blocks found`,
    );
  }

  const transforms: CldrLegacyTransform[] = [];
  const skippedTransformTypes: string[] = [];
  for (const block of noDoctype.matchAll(
    /<transforms\b([^>]*)>([\s\S]*?)<\/transforms>/g,
  )) {
    const attrs = parseAttrs(block[1] as string);
    if (attrs["type"] !== "simple") {
      skippedTransformTypes.push(attrs["type"] ?? "(missing)");
      continue;
    }
    for (const t of (block[2] as string).matchAll(
      /<transform\b([^>]*?)\/>/g,
    )) {
      const tAttrs = parseAttrs(t[1] as string);
      const from = tAttrs["from"];
      const to = tAttrs["to"];
      if (from === undefined || to === undefined) continue;
      transforms.push({ from, to });
    }
  }

  return {
    locale,
    ...(name !== undefined ? { name } : {}),
    ...(platform !== undefined ? { platform } : {}),
    keyMaps,
    transforms,
    skippedTransformTypes,
  };
}
