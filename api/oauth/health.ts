// GET /api/oauth/health — liveness probe. Reachable at /oauth/health via the
// vercel.json rewrite. No credentials, no body.
//
// Uses the Web-standard `{ fetch }` default export (not a bare
// `export default function (req, res)`): Vercel treats a bare default function
// as the legacy Node (req, res) handler and waits for res.end(), so returning a
// Response instead leaves the request hanging until timeout. The `{ fetch }`
// object form is the documented signature for returning a Web Response.
export default {
  fetch(_req: Request): Response {
    return new Response(JSON.stringify({ status: "ok" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  },
};
