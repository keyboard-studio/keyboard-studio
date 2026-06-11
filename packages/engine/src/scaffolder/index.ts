import type {
  ScaffolderService,
  ScaffoldOptions,
  ScaffoldResult,
  RoutingGroup,
  KeyboardIR,
} from "@keyboard-studio/contracts";
import type { BaseKeyboard, VirtualFS } from "@keyboard-studio/contracts";
import {
  createVirtualFS,
  validateKeyboardId as contractsValidateKeyboardId,
} from "@keyboard-studio/contracts";
import { fetchKeyboardSourceToVfs, type FetchFn } from "../loader/fetchKeyboardSourceToVfs.js";
import { parse, emit } from "../codec/index.js";
import { mutateStripNcaps } from "./mutations/ncaps.js";
import { mutateDeleteCapsRules } from "./mutations/caps-rules.js";
import { mutateInsertCasedKeys } from "./mutations/cased-keys.js";
import { mutateIdentity } from "./mutations/identity.js";

export interface ScaffolderServiceOptions {
  proxyBase?: string;
  fetchImpl?: FetchFn;
}

// Replace C0/C1 control chars (incl. newlines, nulls) with spaces, then collapse and trim.
function sanitizeDisplayName(raw: string): string {
  return raw
    .replace(/[\x00-\x1F\x7F-\x9F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

import { kmnStringEscape } from "./kmn-utils.js";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// '*/' ends a PHP block comment; insert a space to defuse it.
function phpCommentEscape(s: string): string {
  return s.replace(/\*\//g, "* /");
}

function detectGroup(base: BaseKeyboard): RoutingGroup {
  if (base.script !== "Latn") return "non-roman";
  const id = base.id.toLowerCase();
  if (id.includes("azerty") || id.startsWith("fre_") || id.startsWith("french_") || id.startsWith("fr_")) {
    return "azerty";
  }
  return "qwerty-qwertz";
}

/**
 * Apply the four IR-level .kmn cleanup mutations and identity propagation to
 * produce a scaffolded KeyboardIR.
 *
 * Composition order:
 *   1. Detect whether the IR has any CAPS rules (the gate for caps-cleanup).
 *   2. If hasCaps: strip NCAPS modifiers, delete CAPS rules, insert &CasedKeys.
 *   3. Always: propagate identity (NAME, COPYRIGHT, VERSION, KEYBOARDVERSION, header).
 *
 * @param ir          Base keyboard IR (not mutated in-place — all mutations are pure).
 * @param keyboardId  New keyboard identifier.
 * @param displayName Sanitized display name (apostrophes will be escaped inside mutateIdentity).
 * @param opts        { group } routing variant.
 */
export function scaffoldIR(
  ir: KeyboardIR,
  keyboardId: string,
  displayName: string,
  opts: { group: RoutingGroup }
): KeyboardIR {
  const { group } = opts;

  const hasCaps =
    // Check typed group rules
    ir.groups.some((g) =>
      g.rules.some((r) =>
        r.context.some(
          (e) =>
            e.kind === "vkey" &&
            (e.modifiers.includes("CAPS") || /^CAPS\b/.test(e.name))
        )
      )
    ) ||
    // Also check raw fragments (rules placed before `begin` in source end up
    // as RawKmnFragments; we still need to detect CAPS there).
    ir.raw.some((frag) => frag.sourceText.includes("[CAPS"));

  let out = ir;
  if (hasCaps) {
    out = mutateStripNcaps(out);
    out = mutateDeleteCapsRules(out);
    // Rules placed before `begin` in the source end up as RawKmnFragments (the
    // parser's unknown-pre-begin path). Apply the same CAPS cleanup to raw
    // fragments so the emitted text is also clean.
    const filteredRaw = out.raw
      .filter((frag) => !frag.sourceText.includes("[CAPS"))
      .map((frag) => ({ ...frag, sourceText: frag.sourceText.replace(/NCAPS /g, "") }));
    if (filteredRaw.length !== out.raw.length || filteredRaw.some((f, i) => f.sourceText !== out.raw[i]?.sourceText)) {
      out = { ...out, raw: filteredRaw };
    }
    out = mutateInsertCasedKeys(out, group);
  }
  out = mutateIdentity(out, keyboardId, displayName);
  return out;
}

function renameFilesInVfs(vfs: VirtualFS, baseId: string, keyboardId: string): void {
  const extensions = [".kmn", ".kps", ".kvks", ".keyman-touch-layout", ".ico"];
  for (const ext of extensions) {
    const oldPath = `source/${baseId}${ext}`;
    const entry = vfs.get(oldPath);
    if (entry !== undefined) {
      vfs.delete(oldPath);
      const newPath = `source/${keyboardId}${ext}`;
      let content = entry.content;
      if (!entry.isBinary && typeof content === "string") {
        if (ext === ".kps" || ext === ".kvks") {
          content = content.replaceAll(baseId, keyboardId);
        }
      }
      vfs.set(newPath, content, entry.isBinary);
    }
  }

  const oldHelp = `source/help/${baseId}.php`;
  const helpEntry = vfs.get(oldHelp);
  if (helpEntry !== undefined) {
    vfs.delete(oldHelp);
    vfs.set(`source/help/${keyboardId}.php`, helpEntry.content, helpEntry.isBinary);
  }
}

/**
 * Touch-layout cleanup remains a JSON/VFS op, not a KeyboardIR mutation,
 * because the codec's parseTouchLayout is parse-only and lossy (drops `sp`,
 * needed here) and there is no emitTouchLayout.
 * TODO(touch-layout): convert to an IR-native mutation once the codec gains a lossless
 * touch-layout emitter (parseTouchLayout currently drops sp and there is no emitTouchLayout).
 */
function applyTouchLayoutCleanup(vfs: VirtualFS, keyboardId: string): void {
  const path = `source/${keyboardId}.keyman-touch-layout`;
  const entry = vfs.get(path);
  if (entry === undefined || typeof entry.content !== "string") return;

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(entry.content) as Record<string, unknown>;
  } catch {
    return;
  }

  delete (data as Record<string, unknown>)["phone"];

  for (const device of ["tablet"] as const) {
    const deviceData = data[device] as { layer?: Array<Record<string, unknown>> } | undefined;
    if (deviceData?.layer == null) continue;
    const layers = deviceData.layer;

    const shiftLayer = layers.find((l) => l["id"] === "shift");
    const capsLayer = layers.find((l) => l["id"] === "caps");
    if (shiftLayer !== undefined && capsLayer === undefined) {
      const cloned = JSON.parse(JSON.stringify(shiftLayer)) as Record<string, unknown>;
      cloned["id"] = "caps";
      layers.push(cloned);
    }

    const rightaltShiftLayer = layers.find((l) => l["id"] === "rightalt-shift");
    const rightaltCapsLayer = layers.find((l) => l["id"] === "rightalt-caps");
    if (rightaltShiftLayer !== undefined && rightaltCapsLayer === undefined) {
      const cloned = JSON.parse(JSON.stringify(rightaltShiftLayer)) as Record<string, unknown>;
      cloned["id"] = "rightalt-caps";
      layers.push(cloned);
    }

    for (const layer of layers) {
      const layerId = layer["id"] as string | undefined;
      if (layerId === "default" || (layerId != null && layerId.includes("caps"))) continue;
      const rows = layer["row"] as Array<{ key?: Array<{ sp?: number; nextlayer?: string | null }> }> | undefined;
      if (rows == null) continue;
      for (const row of rows) {
        if (row.key == null) continue;
        for (const key of row.key) {
          const sp = key.sp;
          // sp codes that must NOT get nextlayer defaulted:
          // 1=special, 2=specialActive, 3=customSpecial, 4=customSpecialActive (frame/modifier keys),
          // 8=deadkey, 9=blank, 10=spacer. Only sp=0/absent (normal char key) should default.
          if (![1, 2, 3, 4, 8, 9, 10].includes(sp ?? -1) && key.nextlayer == null) {
            key.nextlayer = "default";
          }
        }
      }
    }
  }

  vfs.set(path, JSON.stringify(data, null, 2));
}

function generateStubs(vfs: VirtualFS, keyboardId: string, displayName: string): void {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");

  const stubs: Array<{ path: string; content: string | Uint8Array; isBinary?: boolean }> = [
    {
      path: `source/${keyboardId}.kmn`,
      content: `store(&NAME) '${kmnStringEscape(displayName)}'\nstore(&VERSION) '1.0'\nstore(&KEYBOARDVERSION) '1.0'\nstore(&TARGETS) 'any'\nbegin Unicode > use(main)\ngroup(main) using keys\n`,
    },
    {
      path: `source/${keyboardId}.kps`,
      content: `<Package><Info/><Files/></Package>`,
    },
    {
      path: `source/${keyboardId}.kvks`,
      content: `<KeyboardVisualKeyboard/>`,
    },
    {
      path: `source/${keyboardId}.keyman-touch-layout`,
      content: `{"tablet":{"layer":[{"id":"default","row":[]}]}}`,
    },
    {
      path: `source/${keyboardId}.ico`,
      content: new Uint8Array(0),
      isBinary: true,
    },
    {
      path: `source/welcome.htm`,
      content: `<html><body><p>Welcome to ${escapeHtml(displayName)}</p></body></html>`,
    },
    {
      path: `source/readme.htm`,
      content: `<html><body><p>${escapeHtml(displayName)} keyboard</p></body></html>`,
    },
    {
      path: `source/help/${keyboardId}.php`,
      content: `<?php /* ${phpCommentEscape(displayName)} help */ ?>`,
    },
    {
      path: `LICENSE.md`,
      content: `Copyright © ${yyyy} ${displayName}\n\nMIT License\n`,
    },
    {
      path: `HISTORY.md`,
      content: `## 1.0 (${yyyy}-${mm}-${dd})\n* Initial release.\n`,
    },
    {
      path: `README.md`,
      content: `# ${displayName}\n`,
    },
    {
      path: `tests/${keyboardId}_tests.kmn`,
      content: `c ${displayName} tests\n`,
    },
  ];

  for (const stub of stubs) {
    if (vfs.get(stub.path) === undefined) {
      vfs.set(stub.path, stub.content, stub.isBinary ?? false);
    }
  }
}

export function createScaffolderService(opts?: ScaffolderServiceOptions): ScaffolderService {
  const proxyBase = opts?.proxyBase;
  const fetchImpl = opts?.fetchImpl;

  return {
    validateKeyboardId(id: string): string | null {
      return contractsValidateKeyboardId(id);
    },

    async scaffold(
      base: BaseKeyboard,
      keyboardId: string,
      displayName: string,
      scaffoldOpts?: ScaffoldOptions
    ): Promise<ScaffoldResult> {
      const idError = contractsValidateKeyboardId(keyboardId);
      if (idError !== null) {
        return Promise.reject(new Error(`invalid keyboardId: ${idError}`));
      }

      displayName = sanitizeDisplayName(displayName);
      const group: RoutingGroup = scaffoldOpts?.group ?? detectGroup(base);
      const vfs = createVirtualFS();
      const warnings: string[] = [];

      try {
        const loaderOpts = {
          ...(proxyBase !== undefined ? { proxyBase } : {}),
          ...(fetchImpl !== undefined ? { fetchImpl } : {}),
        };
        await fetchKeyboardSourceToVfs(base, vfs, loaderOpts);
      } catch (err) {
        // fetchKeyboardSourceToVfs throws when the required .kmn is unreachable
        // (network error, 404, or offline). Fall through to stub-only output and
        // surface the failure so callers can inform the user.
        warnings.push(
          `base keyboard source unavailable — stub-only output (${err instanceof Error ? err.message : String(err)})`
        );
      }

      const kmnVfsPath = vfs.list("source/").find((p) => p.endsWith(".kmn"));
      const actualBaseId = kmnVfsPath != null
        ? kmnVfsPath.replace(/^source\//, "").replace(/\.kmn$/, "")
        : base.id;

      const kmnEntry = vfs.get(`source/${actualBaseId}.kmn`);
      if (kmnEntry !== undefined && typeof kmnEntry.content === "string") {
        try {
          // Use a pre-parsed IR if the caller supplied one, otherwise parse
          // the .kmn text fetched into the VFS.
          const ir = scaffoldOpts?.ir ?? parse(kmnEntry.content, actualBaseId).ir;
          const outIr = scaffoldIR(ir, keyboardId, displayName, { group });
          const kmn = emit(outIr);
          // renameFilesInVfs below handles the .kmn rename too; setting explicitly
          // here is effectively redundant (rename will overwrite) but makes the
          // post-emit state consistent immediately — left intentionally.
          vfs.set(`source/${actualBaseId}.kmn`, kmn);
        } catch {
          // If parse/emit fails (malformed base .kmn), leave the raw text in the VFS
          // so the rename + stub path can still produce a usable result.
        }
      }

      renameFilesInVfs(vfs, actualBaseId, keyboardId);
      // Touch-layout cleanup remains a JSON/VFS op (see applyTouchLayoutCleanup JSDoc).
      applyTouchLayoutCleanup(vfs, keyboardId);
      generateStubs(vfs, keyboardId, displayName);

      return { vfs, warnings };
    },

    async listTemplates(): Promise<string[]> {
      return ["qwerty-qwertz", "azerty", "non-roman"];
    },
  };
}
