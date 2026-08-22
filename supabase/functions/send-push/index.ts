// Supabase Edge Function: send-push
// Sends a Web Push notification to all devices registered for a given user_id.
// Called by the client (signed-in users only) when a leave request is submitted
// or its status changes.
//
// Auth, CORS and client creation are handled by @supabase/server:
// `withSupabase({ auth: "user" })` verifies the caller's JWT against the
// project JWKS before the handler runs, answers OPTIONS preflights, and
// provides `ctx.supabaseAdmin` (secret-key client, bypasses RLS) for the
// subscription lookup. SUPABASE_URL, the secret key and the JWKS are all
// auto-injected by the platform.
//
// Required secrets (set via supabase dashboard → Edge Functions → Secrets):
//   VAPID_PUBLIC_KEY   - public half of the VAPID keypair (also embedded in client)
//   VAPID_PRIVATE_KEY  - private half (NEVER expose to clients)
//   VAPID_SUBJECT      - "mailto:..." or "https://..." for the keypair owner

import { withSupabase } from "npm:@supabase/server@1";
import webpush from "npm:web-push@3.6.7";

// Minimal schema covering only what this function touches. Regenerate with
// `supabase gen types typescript` if more tables are ever needed here.
type Database = {
  public: {
    Tables: {
      push_subscriptions: {
        Row: {
          id: string;
          user_id: string;
          endpoint: string;
          p256dh: string;
          auth: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
  };
};

const VAPID_PUBLIC  = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") || "mailto:noreply@example.com";

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

export default {
  fetch: withSupabase<Database>({ auth: "user" }, async (req, ctx) => {
    if (req.method !== "POST") {
      return json({ error: "method not allowed" }, 405);
    }

    try {
      const { to, title, body, url } = await req.json();
      if (!to || !title) return json({ error: "missing 'to' or 'title'" }, 400);

      const { data: subs, error } = await ctx.supabaseAdmin
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
            await ctx.supabaseAdmin.from("push_subscriptions").delete().eq("id", s.id);
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
  }),
};

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
