/**
 * Zod request/response schemas for the managed PR submission endpoint.
 *
 * The backend validates everything itself and never trusts the SPA's
 * filtering: POST /submit/managed-pr is anonymous, so the SPA cannot be a
 * security boundary. The validated body then drives the full GitHub Git Data
 * API pipeline using the org service-account token (never exposed to the
 * browser).
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// POST /submit/managed-pr — request body
// ---------------------------------------------------------------------------

// Matches a valid base64 string, including the empty string (an empty binary
// file is legal). Mirrors the encoding produced by bytesToBase64() in
// packages/engine/src/output/github.ts.
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

/**
 * Whether a Git tree path is safe to write with the org's privileged token.
 *
 * The path must be a relative POSIX path with no traversal (`..`), absolute,
 * backslash, empty, or `.git` segments. Unicode file names are allowed; only
 * the structurally dangerous segments are rejected. Directory confinement to
 * the submitting keyboard's directory is enforced separately by the
 * ManagedPRBodySchema refine below.
 *
 * Exported so github-pipeline.ts can assert the same invariant as defense in
 * depth (security audit run-1:
 * managed-pr:unvalidated-tree-path-privileged-write).
 */
export function isSafeTreePath(p: string): boolean {
  if (p.length === 0 || p.length > 512) return false;
  if (p.startsWith("/") || p.includes("\\")) return false;
  for (const seg of p.split("/")) {
    if (seg === "" || seg === "." || seg === ".." || seg === ".git") return false;
  }
  return true;
}

/** Rejects CR/LF so a value cannot inject forged commit trailers
 *  (security audit run-1: managed-pr:commit-trailer-injection-displayname). */
const noLineBreaks = (field: string) =>
  z.string().refine((s) => !/[\r\n]/.test(s), {
    message: `${field} must not contain line breaks`,
  });

// One entry in sourceFiles. Text entries (the default) carry `content` as-is;
// binary source entries (e.g. welcome-folder images, spec 080) are flagged
// `encoding: "base64"` and validated as base64 so github-pipeline.ts can
// upload them as Git blobs instead of inlining them as tree content. The
// 1 MiB cap applies to the (already-larger) encoded string, so it still
// bounds request size — see MANAGED_PR_BODY_LIMIT in server.ts.
const SourceFileSchema = z
  .object({
    path: z.string().min(1).max(512).refine(isSafeTreePath, {
      message:
        "path must be a safe relative repo path (no traversal, absolute, backslash, or .git segments)",
    }),
    content: z.string().max(1_048_576),
    encoding: z.literal("base64").optional(),
  })
  .refine((f) => f.encoding !== "base64" || BASE64_PATTERN.test(f.content), {
    message: "content must be valid base64 when encoding is \"base64\"",
    path: ["content"],
  });

export const ManagedPRBodySchema = z.object({
  attribution: z.object({
    displayName: z.string().min(1).max(120).and(noLineBreaks("displayName")),
    email: z.string().email().max(254),
  }),
  keyboardId: z.string().min(1).max(80).regex(/^[a-z0-9_]+$/),
  prTitle: z.string().min(1).max(200).and(noLineBreaks("prTitle")),
  prBody: z.string().min(1).max(65536),
  importAttribution: z.string().max(4096).optional(),
  sourceFiles: z.array(SourceFileSchema).min(1).max(50),
}).refine(
  (b) => {
    // The engine emits paths under release/<letter>/<keyboardId>/ (see
    // packages/engine/src/output/managed-pr.ts); confine the privileged
    // write to exactly that directory.
    const prefix = `release/${b.keyboardId.charAt(0)}/${b.keyboardId}/`;
    return b.sourceFiles.every((f) => f.path.startsWith(prefix));
  },
  {
    message: "sourceFiles paths must be confined to release/<letter>/<keyboardId>/",
    path: ["sourceFiles"],
  },
);

export type ManagedPRBody = z.infer<typeof ManagedPRBodySchema>;

// ---------------------------------------------------------------------------
// POST /submit/managed-pr — 200 response
// ---------------------------------------------------------------------------

/**
 * Successful response shape returned to the SPA.
 * Also used as documentation for what the engine programmer should expect.
 */
export const ManagedPRResponseSchema = z.object({
  prUrl: z.string().url(),
  commitSha: z.string().min(1),
});

export type ManagedPRResponse = z.infer<typeof ManagedPRResponseSchema>;
