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
import webpush from "npm:web-push@3.6.7";

const SUPABASE_URL  = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PUBLIC  = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") || "mailto:noreply@example.com";

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

const cors = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

    let sent = 0, failed = 0;
    const removed: string[] = [];

    await Promise.all(subs.map(async (s) => {
      const subscription = {
        endpoint: s.endpoint,
        keys: { p256dh: s.p256dh, auth: s.auth },
      };
      try {
        await webpush.sendNotification(subscription, payload);
        sent++;
      } catch (e: any) {
        const code = e?.statusCode;
        if (code === 404 || code === 410) {
          await sb.from("push_subscriptions").delete().eq("id", s.id);
          removed.push(s.id);
        } else {
          failed++;
          console.error("[send-push]", code, e?.body || e?.message);
        }
      }
    }));

    return json({ sent, failed, removed: removed.length, total: subs.length });
  } catch (e: any) {
    console.error("[send-push] fatal:", e);
    return json({ error: e.message || String(e) }, 500);
  }
});

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
