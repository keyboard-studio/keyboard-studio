import type {
  ScaffolderService,
  ScaffoldOptions,
  RoutingGroup,
} from "@keyboard-studio/contracts";
import type { BaseKeyboard, VirtualFS, VirtualFSEntry } from "@keyboard-studio/contracts";
import { fetchKeyboardSourceToVfs } from "../loader/fetchKeyboardSourceToVfs.js";

export interface ScaffolderServiceOptions {
  proxyBase?: string;
  fetchImpl?: typeof fetch;
}

const INVALID_ID_CHARS = /[-\s(),[\]]/;

function makeVirtualFS(): VirtualFS {
  const store = new Map<string, VirtualFSEntry>();
  return {
    get(path: string): VirtualFSEntry | undefined {
      return store.get(path);
    },
    set(path: string, content: Uint8Array | string, isBinary = false): VirtualFSEntry | undefined {
      const prev = store.get(path);
      store.set(path, { path, content, isBinary });
      return prev;
    },
    delete(path: string): boolean {
      return store.delete(path);
    },
    list(prefix?: string): string[] {
      const keys = [...store.keys()];
      if (prefix === undefined) return keys;
      return keys.filter((k) => k.startsWith(prefix));
    },
    entries(prefix?: string): VirtualFSEntry[] {
      const all = [...store.values()];
      if (prefix === undefined) return all;
      return all.filter((e) => e.path.startsWith(prefix));
    },
  };
}

function validateKeyboardId(id: string): string | null {
  if (id.length === 0) return "keyboard id cannot be empty";
  if (id.length > 255) return "keyboard id is longer than 255 characters";
  if (INVALID_ID_CHARS.test(id)) {
    return "keyboard id contains a disallowed character (spaces, parens, brackets, commas, control chars are not allowed)";
  }
  return null;
}

function detectGroup(base: BaseKeyboard): RoutingGroup {
  if (base.script !== "Latn") return "non-roman";
  const id = base.id.toLowerCase();
  if (id.includes("azerty") || id.startsWith("fre_") || id.startsWith("french_") || id.startsWith("fr_")) {
    return "azerty";
  }
  return "qwerty-qwertz";
}

function applyKmnTransforms(
  content: string,
  group: RoutingGroup,
  displayName: string
): string {
  const year = new Date().getFullYear();

  const hasCaps = content.split("\n").some((line) => line.includes("[CAPS"));
  let result = content;

  if (hasCaps) {
    result = result.replace(/NCAPS /g, "");
    result = result
      .split("\n")
      .filter((line) => !line.includes("[CAPS"))
      .join("\n");

    const lines = result.split("\n");
    const noExistingCasedKeys = !lines.some((l) => l.includes("store(&CasedKeys)"));
    if (noExistingCasedKeys && group !== "non-roman") {
      const casedKeysValue =
        group === "azerty"
          ? "[K_A]..[K_Z] [K_0]..[K_9] [K_HYPHEN] [K_EQUAL] [K_LBRKT] [K_RBRKT] [K_BKSLASH] [K_QUOTE] [K_COMMA] [K_PERIOD] [K_SLASH] [K_COLON]"
          : "[K_A]..[K_Z]";
      const versionIdx = lines.findIndex((l) => l.includes("&KEYBOARDVERSION"));
      if (versionIdx !== -1) {
        lines.splice(versionIdx + 1, 0, `store(&CasedKeys) ${casedKeysValue}`);
      }
      result = lines.join("\n");
    } else {
      result = lines.join("\n");
    }
  }

  result = result
    .split("\n")
    .map((line) => {
      if (/^\s*store\s*\(\s*&NAME\s*\)/i.test(line)) {
        return `store(&NAME) '${displayName}'`;
      }
      if (/^\s*store\s*\(\s*&COPYRIGHT\s*\)/i.test(line)) {
        return `store(&COPYRIGHT) 'Copyright © ${year} ${displayName}'`;
      }
      if (/^\s*store\s*\(\s*&VERSION\s*\)/i.test(line)) {
        return `store(&VERSION) '1.0'`;
      }
      if (/^\s*store\s*\(\s*&KEYBOARDVERSION\s*\)/i.test(line)) {
        return `store(&KEYBOARDVERSION) '1.0'`;
      }
      return line;
    })
    .join("\n");

  return result;
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

  for (const device of ["tablet", "phone"] as const) {
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
          if (![1, 2, 8, 9, 10].includes(sp ?? -1) && key.nextlayer == null) {
            key.nextlayer = "default";
          }
        }
      }
    }
  }

  vfs.set(path, JSON.stringify(data, null, 2));
}

function generateStubs(vfs: VirtualFS, keyboardId: string, displayName: string): void {
  const year = new Date().getFullYear();
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");

  const stubs: Array<{ path: string; content: string | Uint8Array; isBinary?: boolean }> = [
    {
      path: `source/${keyboardId}.kmn`,
      content: `store(&NAME) '${displayName}'\nstore(&VERSION) '1.0'\nstore(&KEYBOARDVERSION) '1.0'\nstore(&TARGETS) 'any'\nbegin Unicode > use(main)\ngroup(main) using keys\n`,
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
      content: `<html><body><p>Welcome to ${displayName}</p></body></html>`,
    },
    {
      path: `source/readme.htm`,
      content: `<html><body><p>${displayName} keyboard</p></body></html>`,
    },
    {
      path: `source/help/${keyboardId}.php`,
      content: `<?php /* ${displayName} help */ ?>`,
    },
    {
      path: `LICENSE.md`,
      content: `Copyright © ${year} ${displayName}\n\nMIT License\n`,
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
      return validateKeyboardId(id);
    },

    async scaffold(
      base: BaseKeyboard,
      keyboardId: string,
      displayName: string,
      scaffoldOpts?: ScaffoldOptions
    ): Promise<VirtualFS> {
      const idError = validateKeyboardId(keyboardId);
      if (idError !== null) {
        return Promise.reject(new Error(`invalid keyboardId: ${idError}`));
      }

      const group: RoutingGroup = scaffoldOpts?.group ?? detectGroup(base);
      const vfs = makeVirtualFS();

      try {
        const loaderOpts = {
          ...(proxyBase !== undefined ? { proxyBase } : {}),
          ...(fetchImpl !== undefined ? { fetchImpl } : {}),
        };
        await fetchKeyboardSourceToVfs(base, vfs, loaderOpts);
      } catch {
        // Fall through with empty VFS; stubs will be generated below
      }

      const kmnVfsPath = vfs.list("source/").find((p) => p.endsWith(".kmn"));
      const actualBaseId = kmnVfsPath != null
        ? kmnVfsPath.replace(/^source\//, "").replace(/\.kmn$/, "")
        : base.id;

      const kmnEntry = vfs.get(`source/${actualBaseId}.kmn`);
      if (kmnEntry !== undefined && typeof kmnEntry.content === "string") {
        const transformed = applyKmnTransforms(kmnEntry.content, group, displayName);
        vfs.set(`source/${actualBaseId}.kmn`, transformed);
      }

      renameFilesInVfs(vfs, actualBaseId, keyboardId);
      applyTouchLayoutCleanup(vfs, keyboardId);
      generateStubs(vfs, keyboardId, displayName);

      return vfs;
    },

    async listTemplates(): Promise<string[]> {
      return ["qwerty-qwertz", "azerty", "non-roman"];
    },
  };
}
