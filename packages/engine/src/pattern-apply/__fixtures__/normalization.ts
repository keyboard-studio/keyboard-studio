import type { KeyboardIR } from "@keyboard-studio/contracts";
import { parse } from "../../codec/parse.js";

/** Small keyboard whose outputs have NFC/NFD alternates (a-acute precomposed, e + acute decomposed). */
export const ALTERNATES_KMN = `store(&VERSION) '10.0'
store(&NAME) 'Normalization Fixture'

begin Unicode > use(main)

group(main) using keys

+ [K_A] > U+00E1
+ [K_E] > U+0065 U+0301
+ [K_O] > U+00F3
`;

export const NO_ALTERNATES_KMN = `store(&VERSION) '10.0'
store(&NAME) 'No Alternates'

begin Unicode > use(main)

group(main) using keys

+ [K_A] > 'x'
`;

export function parseFixture(kmn: string): KeyboardIR {
  return parse(kmn, "fixture").ir;
}
