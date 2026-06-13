import type {
  ScaffolderService,
  ScaffoldOptions,
  ScaffoldResult,
  RoutingGroup,
} from "@keyboard-studio/contracts";
import type { BaseKeyboard, VirtualFS } from "@keyboard-studio/contracts";
import {
  createVirtualFS,
  validateKeyboardId as contractsValidateKeyboardId,
} from "@keyboard-studio/contracts";
import { fetchKeyboardSourceToVfs, type FetchFn } from "../loader/fetchKeyboardSourceToVfs.js";
import { parse } from "../codec/parse.js";
import { emit } from "../codec/emit.js";
import { scaffoldIR } from "./scaffold-ir.js";

export { scaffoldIR } from "./scaffold-ir.js";
export type { ScaffoldIROptions, ScaffoldIRIdentity } from "./scaffold-ir.js";

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

// In KMN, single-quoted strings have no escape sequence; U+2019 is the typographic equivalent.
function kmnStringEscape(s: string): string {
  return s.replace(/'/g, "’");
}

// Defuse PHP block-comment terminator '*/' for stub generation.
function phpCommentEscape(s: string): string {
  return s.replace(/\*\//g, "* /");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function detectGroup(base: BaseKeyboard): RoutingGroup {
  if (base.script !== "Latn") return "non-roman";
  const id = base.id.toLowerCase();
  if (id.includes("azerty") || id.startsWith("fre_") || id.startsWith("french_") || id.startsWith("fr_")) {
    return "azerty";
  }
  return "qwerty-qwertz";
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
      content: `store(&NAME) '${kmnStringEscape(displayName)}'\nstore(&VERSION) '14.0'\nstore(&KEYBOARDVERSION) '1.0'\nstore(&TARGETS) 'any'\nbegin Unicode > use(main)\ngroup(main) using keys\n`,
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
        const ir = scaffoldOpts?.ir ?? parse(kmnEntry.content, actualBaseId).ir;
        scaffoldIR(ir, {
          identity: { keyboardId, displayName },
          group,
        });
        vfs.set(`source/${actualBaseId}.kmn`, emit(ir));
      } else if (scaffoldOpts?.ir !== undefined) {
        // No base .kmn was fetched but caller supplied a pre-parsed IR — use it.
        const ir = scaffoldOpts.ir;
        scaffoldIR(ir, {
          identity: { keyboardId, displayName },
          group,
        });
        vfs.set(`source/${actualBaseId}.kmn`, emit(ir));
      }

      renameFilesInVfs(vfs, actualBaseId, keyboardId);
      applyTouchLayoutCleanup(vfs, keyboardId);
      generateStubs(vfs, keyboardId, displayName);

      return { vfs, warnings };
    },

    async listTemplates(): Promise<string[]> {
      return ["qwerty-qwertz", "azerty", "non-roman"];
    },
  };
}
