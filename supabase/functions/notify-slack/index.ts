// Supabase Edge Function: notify-slack
// Posts a message to a Slack Incoming Webhook. Called by the client (signed-in
// users only) when a leave/overtime request is submitted or actioned, a new
// joiner is invited, a profile is finalized, or a front-end error is reported —
// mirroring how send-push is invoked for web push.
//
// Two channels are supported so operational chatter and error alerts don't
// share a room:
//   "ops"    - leave/overtime/onboarding activity (default)
//   "alerts" - front-end error reports (see src/errorReporter.js)
//
// Required secrets (set via supabase dashboard → Edge Functions → Secrets):
//   SLACK_WEBHOOK_URL         - Incoming Webhook URL for the "ops" channel
//   SLACK_ALERTS_WEBHOOK_URL  - Incoming Webhook URL for the "alerts" channel
//                                (optional; falls back to SLACK_WEBHOOK_URL)
//
// If neither secret is configured this is a silent no-op (200, sent: false) —
// Slack is a convenience notification, not something a request should fail
// over, exactly like send-push swallowing a dead subscription.

const SLACK_WEBHOOK_URL        = Deno.env.get("SLACK_WEBHOOK_URL") || "";
const SLACK_ALERTS_WEBHOOK_URL = Deno.env.get("SLACK_ALERTS_WEBHOOK_URL") || SLACK_WEBHOOK_URL;

const cors = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function webhookFor(channel: string): string {
  return channel === "alerts" ? SLACK_ALERTS_WEBHOOK_URL : SLACK_WEBHOOK_URL;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") {
    return json({ error: "method not allowed" }, 405);
  }

  try {
    const { text, channel } = await req.json();
    if (!text || typeof text !== "string") return json({ error: "missing 'text'" }, 400);

    const webhook = webhookFor(channel);
    if (!webhook) {
      return json({ sent: false, note: "no Slack webhook configured" });
    }

    // Slack's own limit is 40,000 chars; this is a message, not a payload.
    const payload = { text: text.slice(0, 3000) };

    const res = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error("[notify-slack]", res.status, body.slice(0, 300));
      return json({ sent: false, error: `slack responded ${res.status}` }, 502);
    }

    return json({ sent: true });
  } catch (e: any) {
    console.error("[notify-slack] fatal:", e);
    return json({ error: e.message || String(e) }, 500);
  }
});

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
