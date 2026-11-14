/**
 * Registered language subtags (IANA registry, pinned): the FR-028 code check.
 * Pure, synchronous, no I/O.
 */

import { registeredLanguages, type RegisteredLanguage } from "./generated/registeredLanguages.js";

const bySubtag: ReadonlyMap<string, RegisteredLanguage> = new Map(
  registeredLanguages.filter((r) => !r.subtag.includes("..")).map((r) => [r.subtag, r]),
);

const privateUseRange: RegisteredLanguage | undefined = registeredLanguages.find((r) => r.scope === "private-use");

/**
 * The registry entry for a language subtag, or undefined when it is not
 * registered. Any subtag in the private-use range `qaa`..`qtz` returns the
 * range entry.
 */
export function registeredLanguage(subtag: string): RegisteredLanguage | undefined {
  const key = subtag.toLowerCase();
  const hit = bySubtag.get(key);
  if (hit !== undefined) return hit;
  if (/^q[a-t][a-z]$/.test(key)) return privateUseRange;
  return undefined;
}
