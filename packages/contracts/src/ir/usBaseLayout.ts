/**
 * US-QWERTY base layout: virtual-key name to the character it produces.
 * Keys are `"K_A"` (unshifted) and `"S+K_A"` (shifted).
 */

const entries: Array<[string, string]> = [];

function add(key: string, plain: string, shifted: string): void {
  entries.push([key, plain], [`S+${key}`, shifted]);
}

for (const c of "ABCDEFGHIJKLMNOPQRSTUVWXYZ") {
  add(`K_${c}`, c.toLowerCase(), c);
}
const DIGITS: ReadonlyArray<readonly [string, string]> = [
  ["1", "!"], ["2", "@"], ["3", "#"], ["4", "$"], ["5", "%"],
  ["6", "^"], ["7", "&"], ["8", "*"], ["9", "("], ["0", ")"],
];
for (const [d, s] of DIGITS) add(`K_${d}`, d, s);

add("K_BKQUOTE", "`", "~");
add("K_HYPHEN", "-", "_");
add("K_EQUAL", "=", "+");
add("K_LBRKT", "[", "{");
add("K_RBRKT", "]", "}");
add("K_BKSLASH", "\\", "|");
add("K_COLON", ";", ":");
add("K_QUOTE", "'", '"');
add("K_COMMA", ",", "<");
add("K_PERIOD", ".", ">");
add("K_SLASH", "/", "?");
entries.push(["K_SPACE", " "], ["S+K_SPACE", " "]);

export const US_BASE_LAYOUT: ReadonlyMap<string, string> = new Map(entries);
