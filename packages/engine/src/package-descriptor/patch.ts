// patch — write the author's identity into the package descriptor, GENERATING the
// descriptor when there is none (spec 057 T004, contracts/package-descriptor.md).
//
// WHY PATCH-OR-GENERATE, AND NOT TWO FUNCTIONS
//
// The two authoring tracks arrive here in different states. The copy track has a
// descriptor already — the scaffolder wrote one at instantiation, declaring the
// BASE keyboard's language. The adapt track has none at all: the loader
// deliberately refuses to fetch the base's raw `.kps` because it references
// compiled `../build/*.kmx` artifacts this build does not produce. Two entry
// points would let the tracks drift again, which is the whole defect (FR-005), so
// there is one: it patches what it finds and generates what it does not.
//
// NEVER THROWS
//
// An absent or unreadable descriptor reports through `warnings` and returns. The
// pre-057 adapt path had a `<Version>` regex patch that silently no-opped when
// the file was missing, and "silently" is what made the missing descriptor
// invisible for as long as it was (FR-006, contrast E-6). A failure that names
// itself is the requirement; an exception that aborts the projection is not the
// alternative being asked for.

import type { VirtualFS } from "@keyboard-studio/contracts";
import {
  buildKpsContent,
  buildLanguageElement,
  buildLanguagesBlock,
  effectiveDisplayName,
  type PackageDescriptorIdentity,
} from "./build.js";
import { escapeHtml } from "../shared/escapeHtml.js";

export interface ApplyIdentityToKpsResult {
  /**
   * Operator-facing diagnostics, bracketed and emoji-free (house convention).
   * Empty when the descriptor was patched cleanly.
   */
  warnings: string[];
  /** True when no descriptor existed and one was built from scratch. */
  generated: boolean;
}

/**
 * The first `<Keyboards> … <Keyboard> … </Keyboard>` element.
 *
 * Anchored on `<Keyboards>` for the same reason `serializeWorkingCopy`'s
 * `<Version>` patch is: a `.kps` can carry a `<Name>` under `<Info>` and a
 * `<Version>` under `<System>`, and an unanchored pattern would reach the wrong
 * one. Only the FIRST `<Keyboard>` is touched — a multi-keyboard package is not
 * something this feature authors, and rewriting every entry's language would be
 * a guess about keyboards the author never named.
 */
const KEYBOARD_ELEMENT_RE = /(<Keyboards>[\s\S]*?<Keyboard>)([\s\S]*?)(<\/Keyboard>)/;

/** The `<Info>` block, whose `<Name>` / `<Description>` carry attributes. */
const INFO_ELEMENT_RE = /(<Info>)([\s\S]*?)(<\/Info>)/;

/**
 * Write the author's identity into `source/<keyboardId>.kps`.
 *
 * Mutates `vfs` in place. Writes exactly the four identity elements named in the
 * contract (§2) and touches nothing else: `<Files>`, `<System>`, `<Options>`, and
 * `<Version>` are left as they stand. In particular the `<Version>` element stays
 * owned by the adapt path's existing bump patch and by `<FollowKeyboardVersion/>`,
 * so FR-008's agreement between descriptor and source is not disturbed here.
 *
 * @param kmnText the emitted `.kmn`, read only when GENERATING (the `<Files>` list
 *   must mirror what this build produces, so it is derived from the final source).
 */
export function applyIdentityToKps(
  vfs: VirtualFS,
  keyboardId: string,
  identity: PackageDescriptorIdentity,
  kmnText: string,
  version?: string,
): ApplyIdentityToKpsResult {
  const path = `source/${keyboardId}.kps`;
  const warnings: string[] = [];

  let entry: ReturnType<VirtualFS["get"]>;
  try {
    entry = vfs.get(path);
  } catch (err: unknown) {
    warnings.push(`[package-descriptor] could not write identity into ${path}: ${reasonOf(err)}`);
    return { warnings, generated: false };
  }

  // No descriptor at all — the adapt track (research D-09). Generate rather than
  // fetch: the `<Files>` list then derives from what THIS build emits, the same
  // guarantee the copy track has.
  if (entry === undefined) {
    try {
      vfs.set(path, buildKpsContent(keyboardId, identity, kmnText, version), false);
    } catch (err: unknown) {
      warnings.push(`[package-descriptor] could not write identity into ${path}: ${reasonOf(err)}`);
      return { warnings, generated: false };
    }
    warnings.push(
      `[package-descriptor] generated a package descriptor for ${keyboardId} (none was present)`,
    );
    return { warnings, generated: true };
  }

  // Present but not text. The VirtualFS contract ties `isBinary` to content shape;
  // this does not trust that at a distance, and either way there is no XML to
  // patch. Reported, not overwritten — clobbering an entry this module cannot read
  // would destroy whatever it actually holds.
  if (typeof entry.content !== "string") {
    warnings.push(
      `[package-descriptor] could not write identity into ${path}: descriptor is not text`,
    );
    return { warnings, generated: false };
  }

  const result = patchKpsIdentity(entry.content, identity, keyboardId);
  if (result.unwritable.length > 0) {
    warnings.push(
      `[package-descriptor] could not write identity into ${path}: ${result.unwritable.join("; ")}`,
    );
  }
  if (result.text !== entry.content) {
    try {
      vfs.set(path, result.text, false);
    } catch (err: unknown) {
      warnings.push(`[package-descriptor] could not write identity into ${path}: ${reasonOf(err)}`);
    }
  }
  return { warnings, generated: false };
}

/**
 * Rewrite an existing descriptor's identity elements.
 *
 * Pure: returns new text plus the list of elements it could not reach. A
 * descriptor missing an anchor is reported rather than reshaped — inventing a
 * `<Keyboards>` block inside someone else's package layout is a bigger guess than
 * saying the write did not happen.
 */
function patchKpsIdentity(
  text: string,
  identity: PackageDescriptorIdentity,
  keyboardId: string,
): { text: string; unwritable: string[] } {
  const unwritable: string[] = [];
  // The SAME fallback the generate path applies. Skipping the write for a blank name
  // would leave the scaffolded stub's name in place — which on the copy track is the
  // BASE keyboard's name, shipped silently. That is the defect this feature closes,
  // just for the display name instead of the language tag (FR-003).
  const displayName = effectiveDisplayName(identity, keyboardId);
  const escapedName = escapeHtml(displayName);
  const escapedDescription = escapeHtml(`${displayName} keyboard, generated by Keyboard Studio.`);

  let out = text;

  // <Info><Name URL="…">, <Info><Description URL="…"> — attributes on the open
  // tag are preserved; only the element text is replaced (FR-003).
  if (INFO_ELEMENT_RE.test(out)) {
    out = out.replace(INFO_ELEMENT_RE, (_m, open: string, body: string, close: string) => {
      let patched = replaceElementText(body, "Name", escapedName);
      patched = replaceElementText(patched, "Description", escapedDescription);
      return `${open}${patched}${close}`;
    });
  } else {
    unwritable.push("no <Info> block");
  }

  // <Keyboards><Keyboard>: the keyboard's own <Name> (FR-003) and the <Languages>
  // block (FR-001/FR-002). The language block is replaced TOTALLY, never appended
  // to: a descriptor that declared the base's `fr` must not end up declaring both
  // that and the author's tag (SC-002).
  if (KEYBOARD_ELEMENT_RE.test(out)) {
    out = out.replace(KEYBOARD_ELEMENT_RE, (_m, open: string, body: string, close: string) => {
      let patched = replaceElementText(body, "Name", escapedName);
      const languageElement = buildLanguageElement(identity);
      if (/<Languages\s*>[\s\S]*?<\/Languages\s*>/.test(patched)) {
        patched = patched.replace(
          /(<Languages\s*>)([\s\S]*?)(<\/Languages\s*>)/,
          (_lm, lOpen: string, inner: string, lClose: string) =>
            `${lOpen}${indentOfFirstChild(inner)}${languageElement}${trailingWhitespaceOf(inner)}${lClose}`,
        );
      } else if (/<Languages\s*\/>/.test(patched)) {
        // Self-closing empty block — an imported descriptor that declares no
        // language at all. Expand it rather than leaving the author's tag out.
        patched = patched.replace(/<Languages\s*\/>/, `<Languages>${languageElement}</Languages>`);
      } else {
        // No language block at all: append one before </Keyboard>.
        patched = `${patched.replace(/\s*$/, "\n")}${buildLanguagesBlock(identity)}    `;
      }
      return `${open}${patched}${close}`;
    });
  } else {
    unwritable.push("no <Keyboards><Keyboard> block");
  }

  return { text: out, unwritable };
}

/**
 * Replace the text of the FIRST `<tag …>text</tag>` in `body`, preserving the
 * open tag's attributes. A self-closing or absent element is left alone: this
 * helper rewrites what is there and never conjures an element into existence.
 */
function replaceElementText(body: string, tag: string, escapedText: string): string {
  const re = new RegExp(`(<${tag}(?:\\s[^>]*)?>)([^<]*)(<\\/${tag}\\s*>)`);
  return body.replace(re, (_m, open: string, _old: string, close: string) => `${open}${escapedText}${close}`);
}

/**
 * The leading whitespace before the original block's first child, so a patched
 * descriptor keeps the indentation style of the file it came from rather than
 * adopting this module's.
 */
function indentOfFirstChild(inner: string): string {
  const match = /^[ \t\r\n]*/.exec(inner);
  return match !== null && match[0] !== "" ? match[0] : "\n        ";
}

/** The original block's trailing whitespace, preserved for the same reason. */
function trailingWhitespaceOf(inner: string): string {
  const match = /[ \t\r\n]*$/.exec(inner);
  return match !== null && match[0] !== "" ? match[0] : "\n      ";
}

function reasonOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
