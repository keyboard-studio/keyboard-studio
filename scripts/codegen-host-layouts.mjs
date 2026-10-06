#!/usr/bin/env node
/**
 * Derives the reference host-layout tables behind the studio's host-leak
 * demonstration (spec 076 FR-023; `packages/studio/src/lib/referenceHostLayouts.ts`)
 * from the Keyman "basic" keyboards in the sibling keyboards corpus.
 *
 * The basic keyboards (`release/basic/basic_kbd*`) reproduce the Windows OS
 * layouts rule by rule — `+ [SHIFT RALT K_X] > U+....`, `dk()` for a deadkey —
 * so they are the local ground truth for what a typist's Windows machine
 * produces on each key. Deriving the tables from them replaces hand curation,
 * which drifted (invented AltGr cells, deadkeys recorded as literals). Mac and
 * Linux layouts often carry more AltGr characters than Windows; these tables
 * describe Windows only.
 *
 * Only the four modifier states the basic keyboards use are read: none,
 * SHIFT, RALT, SHIFT+RALT. Rules with other modifiers (Ctrl, Caps) and rules
 * with a context before `+` (deadkey follow-ups) are ignored. An output that
 * is neither `U+XXXX...` nor `dk(...)` fails loudly, so a format change in the
 * corpus surfaces instead of silently producing a wrong cell.
 *
 * Usage:
 *   node scripts/codegen-host-layouts.mjs [--keyboards <path-to-keyboards-checkout>]
 *
 * The keyboards checkout defaults to the sibling `../keyboards` (the same path
 * CI places the pinned corpus at). The output is COMMITTED — Vercel builds have
 * no corpus — so this script is not in the prebuild chain. Re-run it after a
 * corpus bump that touches one of the source keyboards; the studio test
 * `referenceHostLayouts.codegen.test.ts` fails when the committed file no
 * longer matches the corpus.
 *
 * Output:
 *   packages/studio/src/lib/generated/hostLayouts.generated.json
 */

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..");

export const OUTPUT_PATH = join(
  REPO_ROOT, "packages", "studio", "src", "lib", "generated", "hostLayouts.generated.json",
);

/** Reference host id -> basic keyboard id. Host ids are persisted; never renumber. */
export const HOST_KEYBOARDS = {
  us: "basic_kbdus",
  "us-intl": "basic_kbdusx",
  azerty: "basic_kbdfr",
  qwertz: "basic_kbdgr",
  uk: "basic_kbduk",
};

export const DEADKEY = "deadkey";

const LAYER_BY_MODS = {
  "": "base",
  SHIFT: "shift",
  RALT: "altgr",
  "RALT SHIFT": "shiftAltgr",
};

const RULE_RE = /^\s*\+\s*\[([^\]]*)\]\s*>\s*(.*?)\s*$/;

/** Strip a trailing ` c comment` from a rule's output. */
function stripComment(out) {
  const m = /(^|\s)c\s.*$/i.exec(out);
  return (m ? out.slice(0, m.index) : out).trim();
}

/** Parse a rule output into a cell: a produced string or the DEADKEY sentinel. */
export function parseOutput(raw, where) {
  const out = stripComment(raw);
  if (/^(dk|deadkey)\s*\([^)]*\)$/i.test(out)) return DEADKEY;
  const parts = out.split(/\s+/);
  if (parts.length > 0 && parts.every((p) => /^U\+[0-9a-f]{4,6}$/i.test(p))) {
    return parts.map((p) => String.fromCodePoint(parseInt(p.slice(2), 16))).join("");
  }
  throw new Error(`${where}: unsupported rule output "${raw}" (expected U+XXXX or dk())`);
}

/**
 * Parse one basic keyboard's source into layer tables. Keys are upper-cased
 * Keyman virtual-key ids (`K_OE2`, not `K_oE2`); the lookup normalizes the
 * same way. The first rule for a key+layer wins, as in Keyman.
 */
export function parseBasicKeyboard(kmnText, keyboardId) {
  const layers = { base: {}, shift: {}, altgr: {}, shiftAltgr: {} };
  const lines = kmnText.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const m = RULE_RE.exec(lines[i]);
    if (!m) continue;
    const tokens = m[1].trim().split(/\s+/);
    const key = tokens.pop();
    if (key === undefined || !/^K_/i.test(key)) continue;
    const mods = tokens.map((t) => t.toUpperCase()).sort().join(" ");
    const layer = LAYER_BY_MODS[mods];
    if (layer === undefined) continue;
    const id = key.toUpperCase();
    if (id in layers[layer]) continue;
    layers[layer][id] = parseOutput(m[2], `${keyboardId}.kmn:${i + 1}`);
  }
  return layers;
}

function sortObject(obj) {
  return Object.fromEntries(Object.keys(obj).sort().map((k) => [k, obj[k]]));
}

/** Build the generated document from a keyboards checkout. Pure apart from reads. */
export function buildHostLayouts(keyboardsDir) {
  const files = {};
  const hosts = {};
  for (const [host, kb] of Object.entries(HOST_KEYBOARDS)) {
    const path = join(keyboardsDir, "release", "basic", kb, "source", `${kb}.kmn`);
    if (!existsSync(path)) throw new Error(`missing source keyboard: ${path}`);
    // Hash the LF-normalized text, not the raw bytes: the keyboards corpus
    // carries no .gitattributes, so a core.autocrlf=true Windows checkout has
    // CRLF working files while CI (Linux) has LF. The blob content is the
    // provenance being pinned; the checkout's line endings are not.
    const text = readFileSync(path, "utf8").replace(/\r\n/g, "\n");
    files[kb] = createHash("sha256").update(text, "utf8").digest("hex");
    const layers = parseBasicKeyboard(text, kb);
    hosts[host] = {
      keyboard: kb,
      base: sortObject(layers.base),
      shift: sortObject(layers.shift),
      altgr: sortObject(layers.altgr),
      shiftAltgr: sortObject(layers.shiftAltgr),
    };
  }
  return { files, hosts };
}

function corpusCommit(keyboardsDir) {
  try {
    return execFileSync("git", ["-C", keyboardsDir, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

/** Serialize with one cell per line so a corrected cell is a one-line diff. */
export function serialize(doc) {
  return `${JSON.stringify(doc, null, 2)}\n`;
}

function main(argv) {
  const flag = argv.indexOf("--keyboards");
  const keyboardsDir = resolve(flag !== -1 ? argv[flag + 1] : join(REPO_ROOT, "..", "keyboards"));
  const built = buildHostLayouts(keyboardsDir);
  const doc = {
    $comment:
      "GENERATED by scripts/codegen-host-layouts.mjs from the Keyman basic keyboards. Do not edit; re-run the script.",
    source: { repo: "keyboard-studio/keyboards", commit: corpusCommit(keyboardsDir), files: built.files },
    hosts: built.hosts,
  };
  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, serialize(doc));
  const cells = Object.values(built.hosts).reduce(
    (n, h) => n + ["base", "shift", "altgr", "shiftAltgr"].reduce((m, l) => m + Object.keys(h[l]).length, 0),
    0,
  );
  console.log(`[OK] codegen-host-layouts: ${Object.keys(built.hosts).length} hosts, ${cells} cells -> ${OUTPUT_PATH}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2));
}
