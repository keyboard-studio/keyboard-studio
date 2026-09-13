/**
 * Zod request/response schemas for the managed PR submission endpoint.
 *
 * The SPA posts pre-filtered source files and attribution; the backend
 * runs the full GitHub Git Data API pipeline using the org service-account
 * token (never exposed to the browser).
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// POST /submit/managed-pr — request body
// ---------------------------------------------------------------------------

// Matches a valid base64 string, including the empty string (an empty binary
// file is legal). Mirrors the encoding produced by bytesToBase64() in
// packages/engine/src/output/github.ts.
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

// One entry in sourceFiles. Text entries (the default) carry `content` as-is;
// binary source entries (e.g. welcome-folder images, spec 076) are flagged
// `encoding: "base64"` and validated as base64 so github-pipeline.ts can
// upload them as Git blobs instead of inlining them as tree content. The
// 1 MiB cap applies to the (already-larger) encoded string, so it still
// bounds request size — see MANAGED_PR_BODY_LIMIT in server.ts.
const SourceFileSchema = z
  .object({
    path: z.string().min(1).max(512),
    content: z.string().max(1_048_576),
    encoding: z.literal("base64").optional(),
  })
  .refine((f) => f.encoding !== "base64" || BASE64_PATTERN.test(f.content), {
    message: "content must be valid base64 when encoding is \"base64\"",
    path: ["content"],
  });

export const ManagedPRBodySchema = z.object({
  attribution: z.object({
    displayName: z.string().min(1).max(120),
    email: z.string().email().max(254),
  }),
  keyboardId: z.string().min(1).max(80).regex(/^[a-z0-9_]+$/),
  prTitle: z.string().min(1).max(200),
  prBody: z.string().min(1).max(65536),
  importAttribution: z.string().max(4096).optional(),
  sourceFiles: z.array(SourceFileSchema).min(1).max(50),
});

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
