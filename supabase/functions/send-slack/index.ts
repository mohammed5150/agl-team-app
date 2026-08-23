// Supabase Edge Function: send-slack
// Posts an alert to a Slack channel via an Incoming Webhook. Called by the
// client when a leave/overtime request is submitted or reaches a terminal
// approval state, so the team channel gets one concise message per event.
//
// Required secret (set via supabase dashboard → Edge Functions → Secrets):
//   SLACK_WEBHOOK_URL  - the Incoming Webhook URL, e.g.
//                        https://hooks.slack.com/services/<WORKSPACE_ID>/<CHANNEL_ID>/<WEBHOOK_TOKEN>
//   Also settable from the CLI:
//     supabase secrets set SLACK_WEBHOOK_URL="https://hooks.slack.com/services/..."
//
// If the secret is NOT configured the function no-ops with a 200 and
// { skipped: true } so the app can call it safely before setup is complete —
// it never throws or 500s for missing config.

const SLACK_WEBHOOK_URL = Deno.env.get("SLACK_WEBHOOK_URL");

const cors = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Emoji per severity level, prefixed to the Slack message.
const LEVEL_EMOJI: Record<string, string> = {
  info:    "ℹ️",
  success: "✅",
  warn:    "⚠️",
  urgent:  "🚨",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") {
    return json({ error: "method not allowed" }, 405);
  }

  try {
    // Missing config is not an error: no-op so callers stay safe pre-setup.
    if (!SLACK_WEBHOOK_URL) {
      return json({ ok: false, skipped: true, note: "SLACK_WEBHOOK_URL not configured" }, 200);
    }

    const { text, title, level } = await req.json();
    if (!text) return json({ error: "missing 'text'" }, 400);

    const lvl = LEVEL_EMOJI[level] ? level : "info";
    const emoji = LEVEL_EMOJI[lvl];

    // Block Kit payload: an emoji + optional bold title header line, then the
    // message body. Top-level `text` is the notification/fallback string.
    const headline = title ? `${emoji} *${title}*` : emoji;
    const payload = {
      text: `${emoji} ${title ? `${title}: ` : ""}${text}`,
      blocks: [
        {
          type: "section",
          text: { type: "mrkdwn", text: headline },
        },
        {
          type: "section",
          text: { type: "mrkdwn", text },
        },
      ],
    };

    const res = await fetch(SLACK_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    // Slack returns the literal "ok" (200) on success, or a non-2xx with an
    // error string (e.g. "invalid_payload", "no_service").
    const body = await res.text();
    if (!res.ok) {
      console.error("[send-slack]", res.status, body);
      return json({ ok: false, status: res.status, body }, 502);
    }

    return json({ ok: true });
  } catch (e) {
    console.error("[send-slack] fatal:", e);
    return json({ error: "internal error" }, 500);
  }
});

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
