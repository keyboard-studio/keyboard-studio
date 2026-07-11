// GET /api/submit/managed-pr-selftest — TEMPORARY Option B managed-PR diagnostic.
// Reachable at /submit/managed-pr/selftest via the vercel.json rewrite.
//
// Why this exists: POST /submit/managed-pr collapses three distinct failures —
// token-mint throw, GitHub 401/403, and network error — into one opaque
// `502 submission_unavailable`, so a misconfigured deployment can't be told
// apart from a healthy one from the outside. This endpoint reports, WITHOUT
// leaking any secret, exactly which of those is happening in THIS deployment's
// env scope: whether the key mints, which App/installation the creds resolve
// to, and whether the minted token can reach the write-target repo.
//
// Secret-safe contract: never returns the private key, the base64, or any
// minted token — only presence/length/decodes booleans, public App/repo
// identifiers, and HTTP statuses. Remove this route once managed-PR is healthy.
//
// Web-standard `{ fetch }` default export — see health.ts for why a bare
// `(req, res)` handler would hang on Vercel's Node runtime.

import {
  getInstallationToken,
  probeAppIdentity,
} from "../../utilities/oauth-backend/src/installation-token.js";
import { UPSTREAM_OWNER } from "../../utilities/oauth-backend/src/github-pipeline.js";
import { jsonResponse } from "../oauth/_shared.js";

const GH_API = "https://api.github.com";
const UPSTREAM_REPO = "keyboards";

function envTrim(name: string): string {
  return (process.env[name] ?? "").trim();
}

function shortErr(e: unknown): string {
  return (e instanceof Error ? e.message : String(e)).slice(0, 200);
}

/**
 * Exercise the exact create-tree step (pipeline step 4) — the first WRITE, and
 * where a not-installed / wrong owner 403s. Produces only a dangling tree
 * object (no ref/branch/PR), which GitHub garbage-collects. Only runs when the
 * caller passes `?write=1`.
 */
async function probeCreateTree(
  orgLogin: string,
): Promise<Record<string, unknown>> {
  let token: string | undefined;
  try {
    token = await getInstallationToken();
  } catch (e) {
    return { ok: false, stage: "mint", error: shortErr(e) };
  }
  if (token === undefined) return { ok: false, stage: "mint", error: "not_configured" };

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json",
  };
  const base = `${GH_API}/repos/${orgLogin}/${UPSTREAM_REPO}`;

  const ref = await fetch(`${base}/git/ref/heads/master`, { headers });
  if (!ref.ok) return { target: orgLogin, ok: false, stage: "read-master-ref", status: ref.status };
  const refData = (await ref.json()) as { object: { sha: string } };

  const commit = await fetch(`${base}/git/commits/${refData.object.sha}`, { headers });
  if (!commit.ok) return { target: orgLogin, ok: false, stage: "read-commit", status: commit.status };
  const baseTreeSha = ((await commit.json()) as { tree: { sha: string } }).tree.sha;

  const tree = await fetch(`${base}/git/trees`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      base_tree: baseTreeSha,
      tree: [{ path: "SELFTEST_DELETEME.txt", mode: "100644", type: "blob", content: "selftest\n" }],
    }),
  });
  return {
    target: `${orgLogin}/${UPSTREAM_REPO}`,
    ok: tree.ok,
    stage: "create-tree",
    status: tree.status,
    note:
      tree.status === 403
        ? "403 — the installation token cannot write here (App not installed on this owner, or wrong GITHUB_ORG_LOGIN). This is the 502 cause."
        : tree.ok
          ? "write OK (dangling tree object, GitHub will GC it — no branch/PR created)"
          : "unexpected non-ok status",
  };
}

export async function runManagedPRSelftest(req: Request): Promise<Response> {
  const appId = envTrim("GITHUB_APP_ID");
  const installationId = envTrim("GITHUB_APP_INSTALLATION_ID");
  const orgLogin = envTrim("GITHUB_ORG_LOGIN");
  const pkB64 = envTrim("GITHUB_APP_PRIVATE_KEY");

  let privateKeyDecodesToPem = false;
  if (pkB64 !== "") {
    try {
      const pem = Buffer.from(pkB64, "base64").toString("utf8");
      privateKeyDecodesToPem = pem.includes("-----BEGIN") && pem.includes("PRIVATE KEY-----");
    } catch {
      /* leave false */
    }
  }

  const verdict: string[] = [];

  // Parity with the real route's config gate (envManagedPRConfig → 503).
  if (appId === "" || installationId === "" || pkB64 === "" || orgLogin === "") {
    verdict.push(
      "Route would 503 (submission_not_configured): one of GITHUB_APP_ID / GITHUB_APP_INSTALLATION_ID / GITHUB_APP_PRIVATE_KEY / GITHUB_ORG_LOGIN is empty in THIS deployment's env scope.",
    );
  }
  if (pkB64 !== "" && !privateKeyDecodesToPem) {
    verdict.push(
      "GITHUB_APP_PRIVATE_KEY does not base64-decode to a PEM (likely raw PEM pasted, or base64 with embedded newlines). The mint will throw → 502.",
    );
  }

  const report: Record<string, unknown> = {
    note: "TEMPORARY managed-pr diagnostic — no secrets are returned. Remove once managed-PR is confirmed healthy in production.",
    env: {
      GITHUB_APP_ID: appId || null,
      GITHUB_APP_INSTALLATION_ID: installationId || null,
      GITHUB_ORG_LOGIN: orgLogin || null,
      GITHUB_APP_PRIVATE_KEY: {
        present: pkB64 !== "",
        base64Length: pkB64.length,
        decodesToPem: privateKeyDecodesToPem,
      },
    },
    code: {
      UPSTREAM_OWNER,
      writeTargetOwner: orgLogin || null, // forkBase = ${GITHUB_ORG_LOGIN}/keyboards
      prTargetOwner: UPSTREAM_OWNER, // upstreamBase = ${UPSTREAM_OWNER}/keyboards
      sameRepoModel: orgLogin !== "" && orgLogin === UPSTREAM_OWNER,
    },
  };

  // 1. Mint via the EXACT production code path.
  let minted = false;
  try {
    const tok = await getInstallationToken();
    minted = tok !== undefined;
    report["mint"] = { viaProductionCodePath: true, ok: minted };
    if (!minted) verdict.push("getInstallationToken() returned undefined (App not configured in this env scope).");
  } catch (e) {
    report["mint"] = { viaProductionCodePath: true, ok: false, error: shortErr(e) };
    verdict.push(
      "Token MINT THREW — THIS is the 502. Cause: the private key does not match GITHUB_APP_ID (wrong App's key), a bad installation id, or a network failure reaching api.github.com.",
    );
  }

  // 2. Which App / installation do these creds actually resolve to?
  const identity = await probeAppIdentity();
  report["identity"] = identity;
  if (identity.app !== undefined && appId !== "" && String(identity.app.id) !== appId) {
    verdict.push(
      `GITHUB_APP_ID (${appId}) does not match the App the private key belongs to (id ${identity.app.id}, slug "${identity.app.slug}"). Set GITHUB_APP_ID to the key's App.`,
    );
  }

  // 3. Can the minted token reach the write-target repo?
  if (identity.installation !== undefined && orgLogin !== "") {
    const target = `${orgLogin}/${UPSTREAM_REPO}`;
    const reachable = identity.installation.repos.includes(target);
    report["writeTargetReachable"] = { target, inInstallationRepos: reachable };
    if (!reachable) {
      verdict.push(
        `Installation token CANNOT access ${target} — the App is not installed on that owner (or GITHUB_ORG_LOGIN is wrong). The first write step would 403 → 502. Accessible repos: ${identity.installation.repos.join(", ") || "(none)"}.`,
      );
    }
  }

  // 4. Optional live write probe (?write=1) — the exact create-tree step.
  const wantWrite = new URL(req.url).searchParams.get("write") === "1";
  if (wantWrite && minted && orgLogin !== "") {
    report["writeProbe"] = await probeCreateTree(orgLogin);
  }

  if (verdict.length === 0) {
    verdict.push(
      "No misconfiguration detected: creds mint, App ID matches, and the write target is reachable. If Submit still 502s, re-run with ?write=1 to exercise the create-tree step.",
    );
  }
  report["verdict"] = verdict;

  return jsonResponse(200, report);
}

export default {
  fetch(req: Request): Promise<Response> {
    return runManagedPRSelftest(req);
  },
};
