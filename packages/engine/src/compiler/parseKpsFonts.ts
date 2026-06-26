// Extract font and stylesheet references from a Keyman package specification (.kps) XML.
//
// Three categories are extracted:
//   oskFonts    — paths from <OSKFont> and <DisplayFont> elements inside a
//                 <Keyboard> block.  These are the fonts the OSK preview must
//                 load for correct glyph rendering.
//   fileFonts   — paths from <File> entries whose <FileType> is ".ttf" or
//                 ".otf".  These may overlap with oskFonts; the loader deduplicates.
//   stylesheets — paths from <File> entries whose <FileType> is ".css". These
//                 carry per-keyboard OSK styling (.kmw-keyboard-<id> rules)
//                 that bind the OSK font and paint the keys.
//
// All paths are returned raw (backslashes intact) as they appear in the XML;
// resolution against the keyboard tree is the loader's responsibility.

export interface KpsFontsResult {
  /** Raw paths from <OSKFont>/<DisplayFont>. Deduped. */
  oskFonts: string[];
  /** Raw paths from <File> with <FileType>.ttf|.otf. Deduped. */
  fileFonts: string[];
  /** Raw paths from <File> with <FileType>.css. Deduped. */
  stylesheets: string[];
}

function extractTagValues(xml: string, tag: string): string[] {
  // [^>]* tolerates optional attributes on the opening tag, matching the
  // regex style used by parseKvks for the <encoding> element.
  const re = new RegExp(`<${tag}[^>]*>([^<]*)<\\/${tag}>`, "gi");
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const val = (m[1] ?? "").trim();
    if (val.length > 0) out.push(val);
  }
  return out;
}

function dedup(arr: string[]): string[] {
  return [...new Set(arr)];
}

/**
 * Parse a .kps XML string and return font path lists.
 * Pure function — no I/O, no side effects.
 *
 * @param kpsText - Full text content of a .kps file.
 * @returns Deduped lists of raw font paths (relative to the source/ directory).
 */
export function parseKpsFonts(kpsText: string): KpsFontsResult {
  const oskFonts = dedup([
    ...extractTagValues(kpsText, "OSKFont"),
    ...extractTagValues(kpsText, "DisplayFont"),
  ]);

  // Collect <File> blocks whose <FileType> is .ttf or .otf.
  // A <File> block looks like:
  //   <File>
  //     <Name>...</Name>
  //     ...
  //     <FileType>.ttf</FileType>
  //   </File>
  const fileBlockRe = /<File\s*>([\s\S]*?)<\/File>/gi;
  const fileFonts: string[] = [];
  const stylesheets: string[] = [];
  let blockMatch: RegExpExecArray | null;
  while ((blockMatch = fileBlockRe.exec(kpsText)) !== null) {
    const block = blockMatch[1] ?? "";
    const typeMatch = /<FileType\s*>([^<]*)<\/FileType>/i.exec(block);
    if (typeMatch === null) continue;
    const fileType = (typeMatch[1] ?? "").trim().toLowerCase();
    const nameMatch = /<Name\s*>([^<]*)<\/Name>/i.exec(block);
    if (nameMatch === null) continue;
    const name = (nameMatch[1] ?? "").trim();
    if (name.length === 0) continue;
    if (fileType === ".ttf" || fileType === ".otf") {
      fileFonts.push(name);
    } else if (fileType === ".css") {
      stylesheets.push(name);
    }
  }

  return {
    oskFonts,
    fileFonts: dedup(fileFonts),
    stylesheets: dedup(stylesheets),
  };
}
