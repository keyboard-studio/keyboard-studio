// fileTree — the /review folder-tree model.
//
// A read-only inventory snapshot of the judged keyboard's file layout:
// every required file (2026-11-02 ruling) with its placement status,
// known-optional files (.kpj.user, build/), and everything else neutral.
// The ReviewReport renders this above the criteria list; clicking a
// required file scrolls to its criterion row.

export type FileTreeStatus =
  | "ok"
  | "missing"
  | "misplaced"
  | "optional"
  | "other";

export interface FileTreeNode {
  /** Display name: the file or folder basename. */
  name: string;
  /** Full VFS path (canonical path for a missing file). */
  path: string;
  status: FileTreeStatus;
  /** Mouseover text summarizing the issue, if any. */
  detail: string;
  /** Criterion row id for click-to-jump; set only on required files. */
  criterionId?: string;
  children?: FileTreeNode[];
}

interface RequiredFileSpec {
  criterionId: string;
  /** Display label; <id> is replaced with the keyboard id. */
  label: string;
  /** Matches a lowercased VFS path. */
  match: (lowerPath: string) => boolean;
  /** Canonical directories: "" for the keyboard root, else the folder. */
  canonicalDirs: string[];
  /** Canonical full path for the missing-file placeholder. */
  canonicalPath: (keyboardId: string) => string;
}

const REQUIRED_FILES: RequiredFileSpec[] = [
  {
    criterionId: "5.0-readme-md-exists",
    label: "README.md",
    match: (p) => p.endsWith("/readme.md") || p === "readme.md",
    canonicalDirs: [""],
    canonicalPath: () => "README.md",
  },
  {
    criterionId: "3.1b-history-file-exists",
    label: "HISTORY.md",
    match: (p) =>
      p.endsWith("/history.md") ||
      p === "history.md" ||
      p.endsWith("/history.txt") ||
      p === "history.txt",
    canonicalDirs: [""],
    canonicalPath: () => "HISTORY.md",
  },
  {
    criterionId: "4.0-license-md-exists",
    label: "LICENSE.md",
    match: (p) => p.endsWith("/license.md") || p === "license.md",
    canonicalDirs: [""],
    canonicalPath: () => "LICENSE.md",
  },
  {
    criterionId: "1.14-kpj-file-exists",
    label: "<id>.kpj",
    match: (p) => p.endsWith(".kpj") && !p.endsWith(".kpj.user"),
    canonicalDirs: [""],
    canonicalPath: (id) => `${id}.kpj`,
  },
  {
    criterionId: "8.0-kps-file-exists",
    label: "<id>.kps",
    match: (p) => p.endsWith(".kps"),
    canonicalDirs: ["source"],
    canonicalPath: (id) => `source/${id}.kps`,
  },
  {
    criterionId: "6.3b-welcome-htm-exists",
    label: "welcome.htm",
    match: (p) => p.endsWith("/welcome.htm") || p === "welcome.htm",
    canonicalDirs: ["source", "source/welcome"],
    canonicalPath: () => "source/welcome.htm",
  },
  {
    criterionId: "6.1b-readme-htm-exists",
    label: "readme.htm",
    match: (p) => p === "source/readme.htm",
    canonicalDirs: ["source"],
    canonicalPath: () => "source/readme.htm",
  },
  {
    criterionId: "11.1b-php-exists-with-header",
    label: "<id>.php",
    match: (p) => p.endsWith(".php"),
    canonicalDirs: ["source"],
    canonicalPath: (id) => `source/${id}.php`,
  },
  {
    criterionId: "18.0-touch-layout-exists",
    label: "<id>.keyman-touch-layout",
    match: (p) => p.endsWith(".keyman-touch-layout"),
    canonicalDirs: ["source"],
    canonicalPath: (id) => `source/${id}.keyman-touch-layout`,
  },
  {
    criterionId: "7.0-kvks-file-exists",
    label: "<id>.kvks",
    match: (p) => p.endsWith(".kvks"),
    canonicalDirs: ["source"],
    canonicalPath: (id) => `source/${id}.kvks`,
  },
  {
    criterionId: "7.0-ico-file-exists",
    label: "<id>.ico",
    match: (p) => p.endsWith(".ico"),
    canonicalDirs: ["source"],
    canonicalPath: (id) => `source/${id}.ico`,
  },
];

/** Known-optional paths: present is fine, absent is fine — yellow, never red. */
function isOptional(lowerPath: string): boolean {
  return (
    lowerPath.endsWith(".kpj.user") ||
    lowerPath === "build" ||
    lowerPath.startsWith("build/")
  );
}

function dirOf(path: string): string {
  const i = path.lastIndexOf("/");
  return i < 0 ? "" : path.slice(0, i);
}

function baseOf(path: string): string {
  const i = path.lastIndexOf("/");
  return i < 0 ? path : path.slice(i + 1);
}

/**
 * Build the folder tree for a judged keyboard VFS.
 * Pure function of the VFS path list — no parsing.
 */
export function buildFileTree(
  paths: readonly string[],
  keyboardId: string,
): FileTreeNode[] {
  const lowered = new Map<string, string>();
  for (const p of paths) lowered.set(p.toLowerCase(), p);

  // Folder nodes, keyed by dir path ("": root).
  const folders = new Map<string, FileTreeNode>();
  const root: FileTreeNode = {
    name: keyboardId,
    path: "",
    status: "other",
    detail: "The keyboard folder as published.",
    children: [],
  };
  folders.set("", root);

  function folderNode(dir: string): FileTreeNode {
    const existing = folders.get(dir);
    if (existing) return existing;
    const parent = folderNode(dirOf(dir));
    const isBuild = dir === "build" || dir.startsWith("build/");
    const node: FileTreeNode = {
      name: baseOf(dir),
      path: dir,
      status: isBuild ? "optional" : "other",
      detail: isBuild
        ? "Build output — not required, not a problem. Not defended against."
        : "",
      children: [],
    };
    parent.children!.push(node);
    folders.set(dir, node);
    return node;
  }

  const claimed = new Set<string>(); // lowercased paths already placed

  // Required files first: ok / misplaced / missing.
  for (const spec of REQUIRED_FILES) {
    const hits = [...lowered.entries()].filter(([l]) => spec.match(l));
    const label = spec.label.replace("<id>", keyboardId);
    for (const [, original] of hits) claimed.add(original.toLowerCase());
    if (hits.length === 0) {
      const canonical = spec.canonicalPath(keyboardId);
      folderNode(dirOf(canonical)).children!.push({
        name: label,
        path: canonical,
        status: "missing",
        detail: `Missing — reported by ${spec.criterionId}.`,
        criterionId: spec.criterionId,
      });
      continue;
    }
    const inPlace = hits.find(([l]) => spec.canonicalDirs.includes(dirOf(l)));
    if (inPlace) {
      folderNode(dirOf(inPlace[1])).children!.push({
        name: baseOf(inPlace[1]),
        path: inPlace[1],
        status: "ok",
        detail: `Present at ${inPlace[1]}.`,
        criterionId: spec.criterionId,
      });
    } else {
      const actual = hits[0]![1];
      const where =
        spec.canonicalDirs.length === 1 && spec.canonicalDirs[0] === ""
          ? "the keyboard root"
          : spec.canonicalDirs.map((d) => `${d}/`).join(" or ");
      folderNode(dirOf(actual)).children!.push({
        name: baseOf(actual),
        path: actual,
        status: "misplaced",
        detail: `Found at ${actual} — expected in ${where}.`,
        criterionId: spec.criterionId,
      });
    }
    // Extra copies beyond the first are listed neutrally.
    for (const [, original] of hits.slice(1)) {
      folderNode(dirOf(original)).children!.push({
        name: baseOf(original),
        path: original,
        status: "other",
        detail: "An extra copy of a required file.",
      });
    }
  }

  // Optional + other files.
  for (const [l, original] of lowered) {
    if (claimed.has(l)) continue;
    const node: FileTreeNode = isOptional(l)
      ? {
          name: baseOf(original),
          path: original,
          status: "optional",
          detail:
            "Optional file — not required, not a problem. Not defended against.",
        }
      : {
          name: baseOf(original),
          path: original,
          status: "other",
          detail: "",
        };
    folderNode(dirOf(original)).children!.push(node);
  }

  // Sort: folders first, then files; required/optional before other.
  const rank = (s: FileTreeStatus): number =>
    s === "missing" || s === "misplaced"
      ? 0
      : s === "ok"
        ? 1
        : s === "optional"
          ? 2
          : 3;
  function sort(node: FileTreeNode): void {
    if (!node.children) return;
    node.children.sort((a, b) => {
      const af = a.children ? 0 : 1;
      const bf = b.children ? 0 : 1;
      if (af !== bf) return af - bf;
      const r = rank(a.status) - rank(b.status);
      if (r !== 0) return r;
      return a.name.localeCompare(b.name);
    });
    for (const c of node.children) sort(c);
  }
  sort(root);
  return [root];
}
