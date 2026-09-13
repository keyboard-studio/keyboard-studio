// patch — write the author's identity into the package descriptor, GENERATING the
// descriptor when there is none (spec 059 T004, contracts/package-descriptor.md).
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
//
// THE ONE SANCTIONED `<Options>` / `<Files>` WRITE: THE WELCOME-PATH MIGRATION
//
// This module otherwise leaves `<Options>`, `<Files>`, `<System>` and `<Version>`
// exactly as it finds them. The single exception is spec 076 FR-002: a produced
// package MUST ship its welcome page at `source/welcome/welcome.htm` and MUST NOT
// ship a flat `source/welcome.htm`, so a pre-076 descriptor (the copy track's
// scaffolded stub, or an imported one) that still references the flat name is
// migrated here — `<WelcomeFile>` and the `<File><Name>` are rewritten to the
// folder form, and the welcome-folder files the projection writes beside the
// page (inherited images, generated charts) are appended when missing. Every
// rewrite is reported through `warnings`, never done silently. Nothing else in
// those blocks is touched; do not widen this exception without a spec decision.

import type { VirtualFS } from "@keyboard-studio/contracts";
import {
  buildKpsContent,
  buildLanguageElement,
  buildLanguagesBlock,
  effectiveDisplayName,
  normaliseWelcomeFolderFiles,
  welcomeFolderKpsRef,
  WELCOME_PAGE_KPS_REF,
  type PackageDescriptorIdentity,
} from "./build.js";
import { escapeHtml } from "../shared/escapeHtml.js";
import { kpsRefToPosix } from "../base-browser/kps-parser.js";

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
 * Mutates `vfs` in place. Writes the identity elements named in the contract
 * (§2) plus `<WebSite>` (spec 061 FR-012) and touches nothing else: `<Files>`,
 * `<System>`, `<Options>`, and `<Version>` are left as they stand — with the
 * ONE exception of the welcome-path migration (spec 076 FR-002; see the module
 * header), which rewrites a flat `welcome.htm` reference to the folder form
 * and appends missing welcome-folder entries, reporting each rewrite. The
 * `<Version>` element stays owned by the adapt path's existing bump patch and
 * by `<FollowKeyboardVersion/>`, so FR-008's agreement between descriptor and
 * source is not disturbed here.
 *
 * @param kmnText the emitted `.kmn`, read only when GENERATING (the `<Files>` list
 *   must mirror what this build produces, so it is derived from the final source).
 * @param welcomeFolderFiles the files the projection ships in `source/welcome/`
 *   beside the page, as bare names (see `buildKpsContent`). Listed on generate;
 *   appended when missing on patch.
 */
export function applyIdentityToKps(
  vfs: VirtualFS,
  keyboardId: string,
  identity: PackageDescriptorIdentity,
  kmnText: string,
  version?: string,
  welcomeFolderFiles: readonly string[] = [],
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
      vfs.set(
        path,
        buildKpsContent(keyboardId, identity, kmnText, version, welcomeFolderFiles),
        false,
      );
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
  // spec 076 FR-002: the welcome-path migration — the module's one sanctioned
  // write into <Options> / <Files>. Reported rewrite by rewrite.
  const migrated = migrateWelcomePaths(result.text, welcomeFolderFiles);
  for (const rewrite of migrated.rewrites) {
    warnings.push(`[package-descriptor] migrated welcome path in ${path}: ${rewrite}`);
  }
  if (migrated.unlisted.length > 0) {
    warnings.push(
      `[package-descriptor] could not list welcome-folder files in ${path} (no <Files> block): ${migrated.unlisted.join(", ")}`,
    );
  }
  const text = migrated.text;
  if (text !== entry.content) {
    try {
      vfs.set(path, text, false);
    } catch (err: unknown) {
      warnings.push(`[package-descriptor] could not write identity into ${path}: ${reasonOf(err)}`);
    }
  }
  return { warnings, generated: false };
}

/** A `.kps` member reference as a lowercase POSIX path, for comparison only. */
function memberKey(name: string): string {
  return kpsRefToPosix(name).toLowerCase();
}

const WELCOME_PAGE_KEY = memberKey(WELCOME_PAGE_KPS_REF);

/**
 * The welcome-path migration (spec 076 FR-002). Pure.
 *
 *   - `<Options><WelcomeFile>` naming anything outside the `welcome\` folder —
 *     including a blank element — is rewritten to `welcome\welcome.htm`.
 *   - A `<Files><File><Name>` of the flat `welcome.htm` is rewritten likewise.
 *   - Each `welcomeFolderFiles` name not already listed is appended as
 *     `welcome\<name>` — the projection writes those files, and a `.kmp` only
 *     carries what the descriptor lists.
 *
 * Returns the (possibly unchanged) text, one human-readable line per rewrite,
 * and the names it could not list because the descriptor has no `<Files>`
 * block to append to (inventing one would be a bigger guess than reporting).
 */
function migrateWelcomePaths(
  text: string,
  welcomeFolderFiles: readonly string[],
): { text: string; rewrites: string[]; unlisted: string[] } {
  const rewrites: string[] = [];
  let out = text;

  out = out.replace(
    /(<WelcomeFile\s*>)([^<]*)(<\/WelcomeFile\s*>)/i,
    (m, open: string, value: string, close: string) => {
      const key = memberKey(value);
      if (key.startsWith("welcome/")) return m;
      // A BLANK <WelcomeFile></WelcomeFile> is rewritten too: the projection
      // ships the page unconditionally, so leaving the element empty would
      // orphan it (declared nowhere, installed nowhere).
      rewrites.push(`<WelcomeFile> ${value.trim() === "" ? "(blank)" : value.trim()} -> ${WELCOME_PAGE_KPS_REF}`);
      return `${open}${WELCOME_PAGE_KPS_REF}${close}`;
    },
  );

  const wanted = normaliseWelcomeFolderFiles(welcomeFolderFiles);
  const filesRe = /(<Files\s*>)([\s\S]*?)(<\/Files\s*>)/i;
  if (!filesRe.test(out)) {
    return { text: out, rewrites, unlisted: wanted };
  }

  out = out.replace(filesRe, (_m, open: string, body: string, close: string) => {
    const listed = new Set<string>();
    let patched = body.replace(/<File\s*>[\s\S]*?<\/File\s*>/gi, (block) => {
      const nameMatch = /(<Name\s*>)([^<]*)(<\/Name\s*>)/i.exec(block);
      if (nameMatch === null) return block;
      const key = memberKey(nameMatch[2] ?? "");
      if (key === "welcome.htm") {
        rewrites.push(`<File> ${(nameMatch[2] ?? "").trim()} -> ${WELCOME_PAGE_KPS_REF}`);
        listed.add(WELCOME_PAGE_KEY);
        return block.replace(nameMatch[0], `${nameMatch[1]}${WELCOME_PAGE_KPS_REF}${nameMatch[3]}`);
      }
      if (key.startsWith("welcome/")) listed.add(key);
      return block;
    });

    // Only the flat page reference is REWRITTEN; a descriptor that lists no
    // welcome page at all is left that way (its author chose not to package
    // one, and inventing the entry would be a bigger guess than this module
    // makes anywhere else). Folder files are appended regardless — they are
    // written next to the page by the projection, and an unlisted file is
    // silently dropped from the `.kmp`.
    const additions: string[] = [];
    for (const name of wanted) {
      const ref = welcomeFolderKpsRef(name);
      if (listed.has(memberKey(ref))) continue;
      additions.push(ref);
    }
    if (additions.length === 0) return `${open}${patched}${close}`;

    const entries = additions.map((ref) => {
      rewrites.push(`appended <File> ${ref}`);
      const dot = ref.lastIndexOf(".");
      const ext = dot >= 0 ? ref.slice(dot).toLowerCase() : "";
      return `    <File>\n      <Name>${escapeHtml(ref)}</Name>\n      <FileType>${escapeHtml(ext)}</FileType>\n    </File>`;
    });
    // Same entry shape and indentation `buildKpsContent` emits, appended after
    // the last existing entry and before the block's own closing indentation.
    patched = `${patched.replace(/\s*$/, "\n")}${entries.join("\n")}\n  `;
    return `${open}${patched}${close}`;
  });

  return { text: out, rewrites, unlisted: [] };
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
      patched = patchWebSite(patched, identity.websiteUrl);
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
 * `<Info>`'s `<WebSite>` element (spec 061 FR-012), inserted immediately after
 * `<Description>` — the same placement `buildKpsContent`'s generate path
 * uses. A blank/absent `websiteUrl` REMOVES any existing element rather than
 * leaving a stale one: clearing the Phase F answer must not leave a dead link
 * in a package the author re-produces (FR-010/SC-004).
 */
function patchWebSite(body: string, websiteUrl: string | undefined): string {
  const existing = /<WebSite\b[^>]*>[\s\S]*?<\/WebSite\s*>/i;
  const url = websiteUrl?.trim() ?? "";

  if (url === "") {
    return body.replace(existing, "");
  }

  const escapedUrl = escapeHtml(url);
  const element = `<WebSite URL="${escapedUrl}">${escapedUrl}</WebSite>`;
  if (existing.test(body)) {
    return body.replace(existing, element);
  }
  if (/<\/Description\s*>/i.test(body)) {
    return body.replace(/<\/Description\s*>/i, (m) => `${m}\n    ${element}`);
  }
  // No <Description> anchor either (unusual) — append rather than drop it.
  return `${body}\n    ${element}`;
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
