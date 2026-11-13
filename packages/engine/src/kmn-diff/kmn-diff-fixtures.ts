// Shared fixtures for the kmn-diff tests: small keyboards, one with comments and an opaque fragment.

import type { KeyboardIR } from "@keyboard-studio/contracts";
import { parse } from "../codec/parse.js";

export const BASE_KMN = `store(&VERSION) '10.0'
store(&NAME) 'diff-test'
store(&COPYRIGHT) '(c) test'
store(&TARGETS) 'any'
begin Unicode > use(main)

group(main) using keys

+ [K_A] > 'a'
+ [K_B] > 'b'
c a leading comment
+ [K_C] > 'c'
+ [K_D] > 'd'
+ [K_E] > 'e'
match > use(tail)

group(tail)

'z' > 'Z'
`;

/** A keyboard with a user store and an opaque fragment (a descending-range store) inside the main group. */
export const RAW_KMN = `store(&VERSION) '10.0'
store(&NAME) 'diff-raw'
store(&TARGETS) 'any'
begin Unicode > use(main)

group(main) using keys

store(base) 'abc'
store(more) U+0063 .. U+0061
+ [K_A] > 'a'
+ [K_B] > 'b'
+ [K_C] > 'c'
`;

export function parseText(text: string, id = "diff-test"): KeyboardIR {
  return parse(text, id).ir;
}

/** Replace one line of `text` (exact match), failing loudly when it is absent. */
export function editLine(text: string, from: string, to: string): string {
  if (!text.includes(from)) throw new Error(`fixture: no line ${from}`);
  return text.replace(from, to);
}
