// Supabase Edge Function: send-push
// Sends a Web Push notification to all devices registered for a given user_id.
// Called by the client (signed-in users only) when a leave request is submitted
// or its status changes.
//
// Required secrets (set via supabase dashboard → Edge Functions → Secrets):
//   VAPID_PUBLIC_KEY   - public half of the VAPID keypair (also embedded in client)
//   VAPID_PRIVATE_KEY  - private half (NEVER expose to clients)
//   VAPID_SUBJECT      - "mailto:..." or "https://..." for the keypair owner
//
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are auto-injected by the platform.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { json, cors } from "../_shared/http.ts";
import { configureVapid, sendToSubscriptions } from "../_shared/webpush.ts";

const SUPABASE_URL  = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PUBLIC  = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") || "mailto:noreply@example.com";

configureVapid(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") {
    return json({ error: "method not allowed" }, 405);
  }

  try {
    const { to, title, body, url } = await req.json();
    if (!to || !title) return json({ error: "missing 'to' or 'title'" }, 400);

    const sb = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: subs, error } = await sb
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("user_id", to);

    if (error) throw error;
    if (!subs?.length) return json({ sent: 0, removed: 0, total: 0, note: "no subscriptions" });

    const payload = JSON.stringify({
      title,
      body: body || "",
      url:  url  || "/",
      icon: "/icon-192.png",
      tag:  `adb-${to}-${Date.now()}`,
    });

    const { sent, failed, removed } = await sendToSubscriptions(sb, subs, payload);
    return json({ sent, failed, removed, total: subs.length });
  } catch (e: any) {
    console.error("[send-push] fatal:", e);
    return json({ error: e.message || String(e) }, 500);
  }
});
