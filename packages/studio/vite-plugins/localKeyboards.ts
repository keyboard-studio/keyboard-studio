// [SCAFFOLD] Dev-only Vite plugin — exposes the sibling keymanapp/keyboards
// clone directly via the dev server. Not used in production builds.
//
// Two endpoints:
//   GET /local-kbd-api/list
//     -> JSON BaseKeyboard[]; one entry per <vendor>/<id> directory that
//        contains source/<id>.kmn.
//   /local-kbd-proxy/<release-tree-path>
//     -> serves the file at <repoRoot>/<release-tree-path>.
//
// The scan parses each keyboard's source/<id>.kmn header for
// store(&NAME) and store(&VERSION). Script defaults to "Latn"; full
// detection requires reading .kpj BaseLanguage — tracked as a follow-up.

import type { Plugin } from "vite";
import * as fs from "node:fs";
import * as path from "node:path";
import type { BaseKeyboard } from "@keyboard-studio/contracts";

export interface LocalKeyboardsOptions {
  /** Absolute path to the keymanapp/keyboards clone root. */
  keyboardsRepoRoot: string;
}

const STORE_NAME_RE = /^\s*store\s*\(\s*&NAME\s*\)\s*'([^']*)'/im;
const STORE_VERSION_RE = /^\s*store\s*\(\s*&VERSION\s*\)\s*'([^']*)'/im;

// Match each `<Language ID="bcp47-tag">` occurrence anywhere in the .kps text.
// In the current .kps schema the ONLY `<Language ID=...>` elements live in the
// single <Keyboard><Languages> block, and Keyman Developer always serializes
// `ID` as the first attribute — so this unscoped scan is exact in practice. If a
// future schema adds a `<Language ID=...>` elsewhere (e.g. an <Info>/<Files>
// block), constrain this to the <Languages>...</Languages> span first.
const KPS_LANGUAGE_ID_RE = /<Language\s+ID="([^"]+)"/g;

/**
 * Extract BCP47 language tags from a keyboard's `.kps` package file.
 * Reads the `<Languages><Language ID="...">` block via a regex scan.
 * Returns an empty array when the file is absent, unreadable, or has no
 * `<Languages>` block — the caller continues with script-match ranking.
 */
function parseKpsLanguages(kpsPath: string): string[] {
  if (!fs.existsSync(kpsPath)) return [];
  let xml: string;
  try {
    xml = fs.readFileSync(kpsPath, "utf8");
  } catch {
    return [];
  }
  const ids: string[] = [];
  let m: RegExpExecArray | null;
  KPS_LANGUAGE_ID_RE.lastIndex = 0;
  while ((m = KPS_LANGUAGE_ID_RE.exec(xml)) !== null) {
    if (m[1] !== undefined && m[1].length > 0) ids.push(m[1]);
  }
  return ids;
}

function parseKmnMetadata(kmnPath: string): { name: string; version: string } {
  try {
    const fd = fs.openSync(kmnPath, "r");
    const buf = Buffer.alloc(4096);
    const n = fs.readSync(fd, buf, 0, 4096, 0);
    fs.closeSync(fd);
    const head = buf.slice(0, n).toString("utf8");
    const nameMatch = STORE_NAME_RE.exec(head);
    const versionMatch = STORE_VERSION_RE.exec(head);
    return {
      name: nameMatch?.[1] ?? "",
      version: versionMatch?.[1] ?? "1.0",
    };
  } catch {
    return { name: "", version: "1.0" };
  }
}

function scan(keyboardsRepoRoot: string): BaseKeyboard[] {
  const releaseDir = path.join(keyboardsRepoRoot, "release");
  if (!fs.existsSync(releaseDir)) return [];
  const out: BaseKeyboard[] = [];
  for (const vendor of fs.readdirSync(releaseDir)) {
    const vendorDir = path.join(releaseDir, vendor);
    let stat: fs.Stats;
    try {
      stat = fs.statSync(vendorDir);
    } catch {
      continue;
    }
    if (!stat.isDirectory()) continue;
    let kbDirs: string[];
    try {
      kbDirs = fs.readdirSync(vendorDir);
    } catch {
      continue;
    }
    for (const id of kbDirs) {
      const kbDir = path.join(vendorDir, id);
      try {
        if (!fs.statSync(kbDir).isDirectory()) continue;
      } catch {
        continue;
      }
      const kmnPath = path.join(kbDir, "source", `${id}.kmn`);
      if (!fs.existsSync(kmnPath)) continue;
      const meta = parseKmnMetadata(kmnPath);
      const kpsPath = path.join(kbDir, "source", `${id}.kps`);
      const languages = parseKpsLanguages(kpsPath);
      const entry: BaseKeyboard = {
        id,
        path: `release/${vendor}/${id}`,
        // [SCAFFOLD] script hardcoded to "Latn" — derive from .kpj
        // BaseLanguage once that parsing lands.
        script: "Latn",
        targets: ["windows", "macosx", "linux", "web"],
        displayName: meta.name !== "" ? meta.name : id,
        version: meta.version,
        sourceUrl: `https://github.com/keymanapp/keyboards/tree/master/release/${vendor}/${id}`,
      };
      if (languages.length > 0) entry.languages = languages;
      out.push(entry);
    }
  }
  out.sort((a, b) => a.id.localeCompare(b.id));
  return out;
}

export function localKeyboardsPlugin(opts: LocalKeyboardsOptions): Plugin {
  let catalogCache: BaseKeyboard[] | null = null;
  return {
    name: "local-keyboards",
    configureServer(server) {
      const root = opts.keyboardsRepoRoot;
      const exists = fs.existsSync(root);
      if (!exists) {
        // eslint-disable-next-line no-console
        console.warn(
          `[local-keyboards] repo root ${root} not found — endpoints will return 404`,
        );
      }

      server.middlewares.use("/local-kbd-api/list", (_req, res) => {
        if (!exists) {
          res.statusCode = 404;
          res.setHeader("content-type", "application/json");
          res.end(
            JSON.stringify({
              error: `keyboards repo not found at ${root}`,
            }),
          );
          return;
        }
        if (catalogCache === null) {
          catalogCache = scan(root);
          // eslint-disable-next-line no-console
          console.info(
            `[local-keyboards] scanned ${catalogCache.length} keyboards from ${root}`,
          );
        }
        res.setHeader("content-type", "application/json");
        res.setHeader("cache-control", "no-cache");
        res.end(JSON.stringify(catalogCache));
      });

      server.middlewares.use("/local-kbd-proxy", (req, res) => {
        const url = (req.url ?? "").split("?")[0] ?? "";
        if (url === "" || url === "/") {
          res.statusCode = 400;
          res.end("local-kbd-proxy: bare path");
          return;
        }
        const decoded = decodeURIComponent(url);
        const fsPath = path.normalize(path.join(root, decoded));
        // Path-traversal guard. Append a trailing separator so a sibling
        // directory whose name shares the root's prefix (e.g. `<root>-evil`)
        // cannot pass the check, while still allowing the root itself.
        const normalizedRoot = path.normalize(root);
        const rootWithSep = normalizedRoot.endsWith(path.sep)
          ? normalizedRoot
          : normalizedRoot + path.sep;
        if (fsPath !== normalizedRoot && !fsPath.startsWith(rootWithSep)) {
          res.statusCode = 403;
          res.end("forbidden");
          return;
        }
        if (!fs.existsSync(fsPath)) {
          res.statusCode = 404;
          res.end(`not found: ${decoded}`);
          return;
        }
        let s: fs.Stats;
        try {
          s = fs.statSync(fsPath);
        } catch (e) {
          res.statusCode = 500;
          res.end(String(e));
          return;
        }
        if (!s.isFile()) {
          // A directory (or other non-file) at this path. Respond explicitly
          // rather than calling next() — handing the request to Vite's middleware
          // chain can leave it without a terminal handler, hanging the fetch and
          // freezing the preview on "Loading keyboard source...".
          res.statusCode = 404;
          res.end(`not a file: ${decoded}`);
          return;
        }
        const ext = path.extname(fsPath).toLowerCase();
        const mime =
          ext === ".kmn" || ext === ".keyman-touch-layout" ||
          ext === ".kvks" || ext === ".kpj" || ext === ".xml" ||
          ext === ".txt" || ext === ".js" || ext === ".html" ||
          ext === ".htm"
            ? "text/plain; charset=utf-8"
            : "application/octet-stream";
        res.setHeader("content-type", mime);
        res.setHeader("cache-control", "no-cache");
        fs.createReadStream(fsPath).pipe(res);
      });
    },
  };
}
