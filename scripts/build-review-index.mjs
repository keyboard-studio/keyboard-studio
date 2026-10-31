// build-review-index.mjs — CI indexer for the /review Health Check picker.
//
// Enumerates the four review sources and emits a static JSON index the
// studio SPA fetches:
//
//   {
//     "generatedAt": "<iso>",
///     "repos": {
//       "ks": { "owner": "keyboard-studio", "repo": "keyboards", "ref": "master",
//               "sha": "<head-sha>", "keyboards": [ ... ] },
//       "km": { ... }
//     },
//     "prs": {
//       "ks": [ { "number": 12, "title": "...", "headSha": "...", "updatedAt": "<iso>" } ],
//       "km": [ ... ]
//     }
//   }
//
// Keyboard entries: { "id", "displayName", "path", "tier" } where tier is the
// first path segment (release|experimental|legacy).
//
// Repo keyboards are enumerated from a local clone (--clone <path>); the
// display name is parsed from the .kmn's store(&NAME) header with a fallback
// to the folder id. PRs are listed via the GitHub API (public repos: no auth
// needed, but a token raises the rate limit); per-PR keyboard folders are
// resolved LIVE by the SPA from the PR's file list, so the index only pins
// PR numbers/titles/head shas.
//
// Usage:
//   node scripts/build-review-index.mjs \
//     --ks-clone ~/workspace/keyboards --km-clone ~/workspace/keyboards-upstream \
//     --out packages/studio/public/review-index.json
//
// Security: this is the only infrastructure that parses PR-adjacent bytes.
// It reads .kmn headers with a bounded regex (no XML/DOM parsing, no eval),
// never executes repo scripts, and emits data-only JSON.

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/** Bounded parse of the .kmn NAME store: store(&NAME) '...' (either quote). */
function parseDisplayName(kmnPath) {
  try {
    const buf = readFileSync(kmnPath);
    if (buf.length > 2_000_000) return undefined; // cap: header lives at the top
    const head = buf.subarray(0, 200_000).toString("utf8");
    const m = head.match(/store\(\s*&\s*name\s*\)\s*(['"])(.*?)\1/i);
    const name = m?.[2]?.trim();
    return name ? name.slice(0, 120) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Enumerate keyboards from the git tree (not the working tree: clones may be
 * sparse or blob:none). A keyboard folder is `<tier>/<group>/<id>/` holding
 * `<id>.kpj`. Display names come from the working-tree .kmn when materialized,
 * else via `git show` (fetches the blob on demand).
 */
function enumerateRepo(clonePath) {
  const out = [];
  let kpjPaths;
  try {
    const raw = execFileSync(
      "git", ["-C", clonePath, "ls-tree", "-r", "--name-only", "HEAD", "-z"],
      { maxBuffer: 256 * 1024 * 1024 },
    );
    kpjPaths = raw.toString("utf8").split("\0").filter((p) => p.endsWith(".kpj"));
  } catch (e) {
    process.stderr.write(`ls-tree failed for ${clonePath}: ${e.message}\n`);
    kpjPaths = [];
  }
  let n = 0;
  for (const kpjPath of kpjPaths) {
    const parts = kpjPath.split("/");
    if (parts.length !== 4) continue; // <tier>/<group>/<id>/<id>.kpj
    const [tier, , id] = parts;
    if (parts[3] !== `${id}.kpj`) continue;
    const folder = `${tier}/${parts[1]}/${id}`;
    let displayName;
    const wtKmn = join(clonePath, folder, "source", `${id}.kmn`);
    if (existsSync(wtKmn)) {
      displayName = parseDisplayName(wtKmn);
    } else {
      try {
        const buf = execFileSync("git",
          ["-C", clonePath, "show", `HEAD:${folder}/source/${id}.kmn`],
          { maxBuffer: 2_000_000 });
        const head = buf.subarray(0, 200_000).toString("utf8");
        const m = head.match(/store\(\s*&\s*name\s*\)\s*(['"])(.*?)\1/i);
        displayName = m?.[2]?.trim().slice(0, 120) || undefined;
      } catch {
        displayName = undefined;
      }
    }
    out.push({ id, displayName: displayName || id, path: folder, tier });
    if (++n % 250 === 0) process.stderr.write(`  …${n}/${kpjPaths.length}\r`);
  }
  process.stderr.write("\n");
  out.sort((a, b) => a.id.localeCompare(b.id));
  return out;
}

function gitHeadSha(clonePath) {
  try {
    return execFileSync("git", ["-C", clonePath, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

/** Open PRs via the GitHub API. Works anonymously for public repos. */
async function listOpenPrs(owner, repo) {
  const headers = { Accept: "application/vnd.github+json", "User-Agent": "keyboard-studio-review-indexer" };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const prs = [];
  let page = 1;
  for (;;) {
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/pulls?state=open&per_page=100&page=${page}`,
      { headers },
    );
    if (!res.ok) throw new Error(`GitHub API ${res.status} for ${owner}/${repo} pulls`);
    const batch = await res.json();
    if (!Array.isArray(batch) || batch.length === 0) break;
    for (const pr of batch) {
      prs.push({
        number: pr.number,
        title: (pr.title ?? "").slice(0, 200),
        headSha: pr.head?.sha ?? "unknown",
        updatedAt: pr.updated_at ?? null,
      });
    }
    if (batch.length < 100) break;
    page += 1;
    if (page > 10) break; // sanity cap
  }
  return prs;
}

async function main() {
  const ksClone = arg("--ks-clone");
  const kmClone = arg("--km-clone");
  const out = arg("--out") ?? join(root, "packages/studio/public/review-index.json");
  if (!ksClone || !kmClone) {
    console.error("usage: --ks-clone <path> --km-clone <path> [--out <path>]");
    process.exit(2);
  }
  const generatedAt = new Date().toISOString();
  const index = {
    generatedAt,
    repos: {
      ks: {
        owner: "keyboard-studio", repo: "keyboards", ref: "master",
        sha: gitHeadSha(ksClone), keyboards: enumerateRepo(ksClone),
      },
      km: {
        owner: "keymanapp", repo: "keyboards", ref: "master",
        sha: gitHeadSha(kmClone), keyboards: enumerateRepo(kmClone),
      },
    },
    prs: {
      ks: await listOpenPrs("keyboard-studio", "keyboards"),
      km: await listOpenPrs("keymanapp", "keyboards"),
    },
  };
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(index, null, 1) + "\n");
  const kbCount = index.repos.ks.keyboards.length + index.repos.km.keyboards.length;
  console.log(`wrote ${out}: ${kbCount} keyboards, ` +
    `${index.prs.ks.length} ks PRs, ${index.prs.km.length} km PRs`);
}

main().catch((e) => { console.error(e); process.exit(1); });
