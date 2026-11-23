// layoutFileStore -- the two precise text inserts that make a touch layout
// compile and ship: `store(&LAYOUTFILE)` in the `.kmn` and the compiled
// `.js` in the `.kps`.
//
// Shared by the Open reseed change (`openApply/touchReseed.ts`, spec 111
// T087b: creating a touch layout on a keyboard opened for update) and the
// Copy projection (`projectWorkingCopyVfs` step 4d, issue #2924: a touch
// layout built on Copy when the copied keyboard had none). One implementation,
// two call sites — the Copy fix reuses these helpers rather than duplicating
// them.
//
// A touch layout only compiles when the `.kmn` names it (`&LAYOUTFILE`) and
// only ships when the package lists the compiled `.js`, so both inserts are
// needed wherever a layout is created. Both are no-ops when there is nothing
// to add (the store already named, the `.js` already listed, desktop-only
// targets), and both leave every other line of the file untouched.

import { KMW_JS_TARGETS, parseKmn, parseTargetTokens } from "@keyboard-studio/engine";

const LAYOUTFILE_STORE = /^[ \t]*store\s*\(\s*&LAYOUTFILE\s*\)/im;

/**
 * `kmn` with `store(&LAYOUTFILE) '<name>'` added after the system store the codec's
 * emitter puts before it (VISUALKEYBOARD, else BITMAP, TARGETS, the last other
 * `&` store), in the file's own line ending. Undefined when it already names one,
 * or when no header store gives a place for it.
 */
export function withLayoutFileStore(kmn: string, layoutFile: string, keyboardId: string): string | undefined {
  if (LAYOUTFILE_STORE.test(kmn)) return undefined;
  const eol = kmn.includes("\r\n") ? "\r\n" : "\n";
  const lines = kmn.split(/(?<=\n)/);
  const isStore = (line: string, name: string | null): boolean =>
    new RegExp(`^[ \\t]*store\\s*\\(\\s*&${name ?? "[A-Za-z_]+"}\\s*\\)`, "i").test(line);
  let at = -1;
  for (const name of ["VISUALKEYBOARD", "BITMAP", "TARGETS", null]) {
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      if (isStore(lines[i]!, name)) {
        at = i;
        break;
      }
    }
    if (at >= 0) break;
  }
  if (at < 0) return undefined;
  const line = lines[at]!;
  const withEol = /\n$/.test(line) ? line : `${line}${eol}`;
  lines[at] = withEol;
  lines.splice(at + 1, 0, /\n$/.test(line) ? `store(&LAYOUTFILE) '${layoutFile}'${eol}` : `store(&LAYOUTFILE) '${layoutFile}'`);
  const out = lines.join("");
  // It must still be the same keyboard, now naming the layout.
  const parsed = parseKmn(out, keyboardId).ir;
  return parsed.stores.some((s) => s.isSystem && s.name.toUpperCase() === "LAYOUTFILE") ? out : undefined;
}

/**
 * `kps` with the compiled `.js` listed in `<Files>` when the keyboard's targets emit
 * one and the package does not list it (the layout compiles into that file; the
 * layout source itself is not a package member). Inserted after the `.kmx` entry in
 * the file's own indentation and line ending. Undefined when nothing is to be added.
 */
export function withScriptFileEntry(kps: string, kmn: string, keyboardId: string): string | undefined {
  if (!parseTargetTokens(kmn).some((t) => KMW_JS_TARGETS.has(t))) return undefined;
  if (/<Name>[^<]*\.js<\/Name>/i.test(kps) || !/<\/Files>/i.test(kps)) return undefined;
  const eol = kps.includes("\r\n") ? "\r\n" : "\n";
  const close = /^([ \t]*)<\/Files>/im.exec(kps);
  const indent = close?.[1] ?? "  ";
  const entry = [
    `${indent}  <File>`,
    `${indent}    <Name>..\\build\\${keyboardId}.js</Name>`,
    `${indent}    <Description></Description>`,
    `${indent}    <CopyLocation>0</CopyLocation>`,
    `${indent}    <FileType>.js</FileType>`,
    `${indent}  </File>`,
  ].join(eol) + eol;
  const afterKmx = /<Name>[^<]*\.kmx<\/Name>[\s\S]*?<\/File>[ \t]*\r?\n/i.exec(kps);
  if (afterKmx !== null) {
    const end = afterKmx.index + afterKmx[0].length;
    return kps.slice(0, end) + entry + kps.slice(end);
  }
  const at = close === null ? kps.search(/<\/Files>/i) : close.index;
  return kps.slice(0, at) + entry + kps.slice(at);
}
