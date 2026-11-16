import { parseKpsLanguages } from "@keyboard-studio/engine";

/** The language list a `.kps` text declares, in the identity's shape. */
export function languagesFromKps(kpsText: string): { tag: string; name?: string }[] {
  return parseKpsLanguages(kpsText).map(({ tag, name }) => (name === undefined ? { tag } : { tag, name }));
}
