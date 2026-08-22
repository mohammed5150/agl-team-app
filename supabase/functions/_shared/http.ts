// Shared by every Edge Function in this project. Supabase deploys each
// function directory independently, but a relative import from `_shared/`
// bundles into each one at deploy time — so this stays one file to keep the
// CORS policy and response envelope in step, without functions calling each
// other over HTTP just to avoid repeating four lines.

export const cors = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

export function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
