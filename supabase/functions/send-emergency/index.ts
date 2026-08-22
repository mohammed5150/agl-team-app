// Supabase Edge Function: send-emergency
// Manager- or team-lead-triggered emergency broadcast: pushes to every device registered
// on the portal, and posts to Slack's "emergency" channel — the two things
// the client cannot safely or efficiently do itself (push needs every
// subscription across every employee, which push_subscriptions' RLS scopes
// to "your own"; Slack needs a server-held webhook URL).
//
// The in-app notification row (visible in NotifPanel without push
// permission) is NOT written here — app.jsx's addAnn() already writes one
// per targeted employee under RLS for every announcement, emergency or not,
// so this function only adds the two channels an announcement doesn't reach.
//
// AUTHORIZATION
// Unlike send-push and notify-slack (any signed-in user, trusted because the
// call sites that invoke them are themselves gated), this fans out to
// EVERY employee at once — the blast radius of a false or malicious
// "emergency" justifies a real server-side check, not just a hidden button.
// The caller's JWT (forwarded automatically by supabase-js) is verified
// against Supabase Auth, then their role is looked up with the service-role
// key (bypassing RLS, safe because identity was already verified) and
// refused unless it is 'manager' or 'teamlead'. This is the same "never
// trust the client's claim" rule the RLS policies and guard triggers apply
// everywhere else in this app — just enforced in Deno instead of Postgres,
// because this endpoint has no table row of its own for a trigger to guard.
//
// Required secrets: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
// (all auto-injected), VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT
// (same as send-push — reused, not duplicated), and notify-slack's
// SLACK_EMERGENCY_WEBHOOK_URL (this function calls notify-slack over HTTP
// for the Slack leg, rather than posting to the webhook directly, so the
// webhook URL and the channel-fallback rule stay defined in one place).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { json, cors } from "../_shared/http.ts";
import { configureVapid, sendToSubscriptions } from "../_shared/webpush.ts";

const SUPABASE_URL  = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY      = Deno.env.get("SUPABASE_ANON_KEY")!;
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
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader) return json({ error: "unauthorized" }, 401);

    // Verify identity: this checks the JWT's signature against Supabase
    // Auth. Anyone can SAY they're a manager in a request body; only Auth
    // can say who they actually signed in as.
    const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await callerClient.auth.getUser();
    if (authErr || !user?.email) return json({ error: "unauthorized" }, 401);

    const sb = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Role lookup bypasses RLS via the service-role key — safe here because
    // identity was already verified above; this is not trusting the client.
    const { data: caller } = await sb
      .from("employees")
      .select("role")
      .ilike("email", user.email)
      .maybeSingle();
    if (caller?.role !== "manager" && caller?.role !== "teamlead") {
      return json({ error: "forbidden — managers and team leads only" }, 403);
    }

    const { title, body } = await req.json();
    if (!title || !body) return json({ error: "missing 'title' or 'body'" }, 400);

    const { data: subs, error: subsErr } = await sb
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth");
    if (subsErr) throw subsErr;

    const payload = JSON.stringify({
      title: `🚨 ${title}`,
      body,
      url: "/",
      icon: "/icon-192.png",
      tag: `adb-emergency-${Date.now()}`,
    });
    const push = subs?.length
      ? await sendToSubscriptions(sb, subs, payload)
      : { sent: 0, failed: 0, removed: 0 };

    // Slack leg goes through notify-slack rather than posting to the webhook
    // directly — see the header comment. A failed Slack post never fails the
    // push fan-out that already happened above.
    let slackSent = false;
    try {
      const slackRes = await fetch(`${SUPABASE_URL}/functions/v1/notify-slack`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_ROLE}` },
        body: JSON.stringify({ channel: "emergency", text: `🚨 EMERGENCY — ${title}\n${body}` }),
      });
      const slackJson = await slackRes.json().catch(() => ({}));
      slackSent = !!slackJson?.sent;
    } catch (e) {
      console.error("[send-emergency] slack leg failed:", e);
    }

    return json({
      ok: true,
      push: { sent: push.sent, failed: push.failed, removed: push.removed, total: subs?.length || 0 },
      slackSent,
    });
  } catch (e: any) {
    console.error("[send-emergency] fatal:", e);
    return json({ error: e.message || String(e) }, 500);
  }
});
