// GET /api/oauth/health — liveness probe. Reachable at /oauth/health via the
// vercel.json rewrite. No credentials, no body.
export default function handler(_req: Request): Response {
  return new Response(JSON.stringify({ status: "ok" }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
