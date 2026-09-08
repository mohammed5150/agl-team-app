// Supabase Edge Function: slack-notify
// Receives pg_net Database Webhook payloads (INSERT/UPDATE on
// overtime_requests, leave_requests, announcements; deletions via audit_log)
// and posts a formatted message to a Slack channel via chat.postMessage
// using a bot token.
//
// Config lives in app.slack_notify_config (single row), read via the
// service-role-only RPC public.get_slack_notify_config():
//   secret           - shared secret; must match "x-webhook-secret" header
//   slack_bot_token  - Slack bot token (xoxb-...)
//   slack_channel    - target channel ID
// Nothing is exposed to clients.
//
// Auth: JWT verification is off because the caller is the database, not a
// user; the shared secret header is the auth instead.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const sb = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

type Cfg = { secret: string; slack_bot_token: string; slack_channel: string };
let cfgCache: Cfg | null = null;
let cfgFetchedAt = 0;

async function getConfig(): Promise<Cfg> {
  const now = Date.now();
  if (cfgCache && now - cfgFetchedAt < 60_000) return cfgCache;
  const { data, error } = await sb.rpc("get_slack_notify_config");
  const row = Array.isArray(data) ? data[0] : data;
  if (error || !row) throw new Error("config read failed: " + (error?.message ?? "no row"));
  cfgCache = row;
  cfgFetchedAt = now;
  return row;
}

type WebhookPayload = {
  type: "INSERT" | "UPDATE" | "DELETE";
  table: string;
  schema: string;
  record: Record<string, unknown> | null;
  old_record: Record<string, unknown> | null;
};

const s = (v: unknown) => (v == null ? "—" : String(v));

// Escape Slack mrkdwn control characters in user-supplied text.
const esc = (v: unknown) =>
  s(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function buildMessage(p: WebhookPayload): { text: string; blocks?: unknown[] } | null {
  const r = p.record ?? {};
  const o = p.old_record ?? {};

  // ---- Overtime requests -------------------------------------------------
  if (p.table === "overtime_requests") {
    if (p.type === "INSERT") {
      return line(
        ":clock3: *Overtime request submitted*",
        `*${esc(r.emp_name)}* (${esc(r.section)}) — ${esc(r.hours)} h on ${esc(r.work_date)}`,
        `Reason: ${esc(r.reason)}`,
      );
    }
    if (p.type === "UPDATE" && r.status !== o.status) {
      const icon = r.status === "approved" ? ":white_check_mark:" :
                   r.status === "rejected" ? ":x:" : ":arrows_counterclockwise:";
      return line(
        `${icon} *Overtime request ${esc(r.status)}*`,
        `*${esc(r.emp_name)}* — ${esc(r.hours)} h on ${esc(r.work_date)}`,
        r.tl_name ? `By: ${esc(r.tl_name)}${r.tl_comment ? ` — "${esc(r.tl_comment)}"` : ""}` : "",
      );
    }
    return null; // ignore non-status edits
  }

  // ---- Leave requests ----------------------------------------------------
  if (p.table === "leave_requests") {
    if (p.type === "INSERT") {
      return line(
        ":palm_tree: *Leave request submitted*",
        `*${esc(r.emp_name)}* (${esc(r.section)}) — ${esc(r.type)} leave, ${esc(r.start_date)} → ${esc(r.end_date)} (${esc(r.days)} d)`,
        `Reason: ${esc(r.reason)}`,
      );
    }
    if (p.type === "UPDATE" && r.status !== o.status) {
      const icon = r.status === "approved" ? ":white_check_mark:" :
                   r.status === "rejected" ? ":x:" : ":arrows_counterclockwise:";
      return line(
        `${icon} *Leave request ${esc(r.status)}*`,
        `*${esc(r.emp_name)}* — ${esc(r.type)} leave, ${esc(r.start_date)} → ${esc(r.end_date)}`,
      );
    }
    return null;
  }

  // ---- Announcements -----------------------------------------------------
  if (p.table === "announcements" && p.type === "INSERT") {
    const prio = r.priority === "urgent" ? ":rotating_light:" :
                 r.priority === "warning" ? ":warning:" : ":loudspeaker:";
    return line(
      `${prio} *New announcement: ${esc(r.title)}*`,
      esc(r.message),
      `Posted by ${esc(r.by_user)} · target: ${esc(r.target)}`,
    );
  }

  // ---- Audit log: deletions only (full stream would flood the channel) ---
  if (p.table === "audit_log" && p.type === "INSERT" && r.action === "delete") {
    return line(
      ":wastebasket: *Record deleted* (audit)",
      `Table: *${esc(r.table_name)}* · record ${esc(r.record_id)}`,
    );
  }

  return null;
}

function line(...parts: string[]) {
  const text = parts.filter(Boolean).join("\n");
  return { text, blocks: [{ type: "section", text: { type: "mrkdwn", text } }] };
}

// Post a message to a channel via chat.postMessage.
async function slackPost(cfg: Cfg, msg: { text: string; blocks?: unknown[] }) {
  const res = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Authorization": `Bearer ${cfg.slack_bot_token}`,
    },
    body: JSON.stringify({ channel: cfg.slack_channel, ...msg }),
  });
  const body = await res.json().catch(() => null);
  return { res, body };
}

// Ask the bot to join a public channel. Needed when it was never invited or
// was removed; requires the channels:join scope on the bot token.
async function slackJoin(cfg: Cfg) {
  const res = await fetch("https://slack.com/api/conversations.join", {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Authorization": `Bearer ${cfg.slack_bot_token}`,
    },
    body: JSON.stringify({ channel: cfg.slack_channel }),
  });
  const body = await res.json().catch(() => null);
  return { res, body };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });

  let cfg: Cfg;
  try {
    cfg = await getConfig();
  } catch (e) {
    console.error(String(e));
    return new Response("config error", { status: 500 });
  }

  if (req.headers.get("x-webhook-secret") !== cfg.secret) {
    return new Response("unauthorized", { status: 401 });
  }

  if (!cfg.slack_bot_token || !cfg.slack_channel) {
    console.warn("slack bot token / channel not configured; dropping notification");
    return new Response("not configured", { status: 200 });
  }

  let payload: WebhookPayload;
  try {
    payload = await req.json();
  } catch {
    return new Response("bad payload", { status: 400 });
  }

  const msg = buildMessage(payload);
  if (!msg) return new Response("ignored", { status: 200 });

  let { res, body } = await slackPost(cfg, msg);

  // Self-heal: if the bot isn't in the channel, join it and retry once so a
  // missing or removed invite doesn't silently drop alerts.
  if (res.ok && body && body.ok === false && body.error === "not_in_channel") {
    console.warn("bot not in channel; attempting conversations.join");
    const join = await slackJoin(cfg);
    if (join.body?.ok) {
      ({ res, body } = await slackPost(cfg, msg));
    } else {
      console.error("conversations.join failed:", join.res.status, JSON.stringify(join.body));
      return new Response("slack join error: " + (join.body?.error ?? join.res.status), { status: 502 });
    }
  }

  if (!res.ok || !body?.ok) {
    console.error("Slack post failed:", res.status, JSON.stringify(body));
    return new Response("slack error: " + (body?.error ?? res.status), { status: 502 });
  }

  return new Response("ok", { status: 200 });
});
