# Slack alerts (`send-slack` Edge Function)

The portal can post a short alert to a Slack channel whenever a leave or
overtime request is submitted or reaches a final decision. It is the second
Edge Function in the project, alongside `send-push`.

It is **optional and fail-safe**: if the webhook secret is not configured the
function returns `{ skipped: true }` with HTTP 200 and the app carries on
normally. Nothing breaks if you never set it up.

## 1. Create a Slack Incoming Webhook

1. In Slack, create (or pick) the channel that should receive alerts — e.g.
   `#agl-portal-alerts`.
2. Go to <https://api.slack.com/apps> → **Create New App** → *From scratch*
   (or reuse an existing app for the workspace).
3. Open **Incoming Webhooks**, toggle it **On**, then **Add New Webhook to
   Workspace** and select `#agl-portal-alerts`.
4. Copy the generated webhook URL. It looks like:

   ```
   https://hooks.slack.com/services/<WORKSPACE_ID>/<CHANNEL_ID>/<WEBHOOK_TOKEN>
   ```

Treat this URL as a secret — anyone holding it can post to the channel.

## 2. Set the secret

Via the Supabase CLI:

```bash
supabase secrets set SLACK_WEBHOOK_URL="https://hooks.slack.com/services/<WORKSPACE_ID>/<CHANNEL_ID>/<WEBHOOK_TOKEN>"
```

Or via the dashboard: **Edge Functions → Secrets → Add new secret**, name
`SLACK_WEBHOOK_URL`, value = the webhook URL.

## 3. Deploy the function

```bash
supabase functions deploy send-slack
```

## 4. No-op behaviour

If `SLACK_WEBHOOK_URL` is unset, `send-slack` returns
`{ ok: false, skipped: true, note: "SLACK_WEBHOOK_URL not configured" }` with
HTTP 200 — it never throws or 500s. This lets the app call it safely before an
operator finishes setup. On a successful post it returns `{ ok: true }`; a
Slack-side error returns `{ ok: false, status, body }` with HTTP 502.

## 5. Which portal events post to Slack

Exactly one Slack message is emitted per user-facing event (never one per
manager recipient):

| Event | Level | Posted when |
| --- | --- | --- |
| Leave submitted | info ℹ️ | An employee/TL submits a new leave request |
| Leave approved | success ✅ | A manager gives final approval (`approved`) |
| Leave rejected | warn ⚠️ | A TL or manager rejects the request |
| Overtime submitted | info ℹ️ | An employee submits a new overtime request |
| Overtime approved | success ✅ | A team lead approves the overtime |
| Overtime rejected | warn ⚠️ | A team lead rejects the overtime |

The intermediate leave state `tl_approved` (team-lead approved, awaiting the
manager) deliberately does **not** post, to keep the channel quiet. Message
text is built by the pure formatter in [`src/slackNotify.js`](../src/slackNotify.js).
