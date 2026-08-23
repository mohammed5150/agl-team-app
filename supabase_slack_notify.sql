-- =============================================================================
-- Slack alert pipeline (#agl-portal-alerts)  —  reference / reproduction DDL
-- Supabase project: adb-agl-portal (ref vzipsbecmirbkrbrpcdt)
-- =============================================================================
--
-- END-TO-END PIPELINE
-- -------------------
--   1. A row is inserted/updated in one of the watched public tables
--      (overtime_requests, leave_requests, announcements) or a delete is
--      recorded in public.audit_log.
--   2. An AFTER-row trigger fires app.notify_slack() (SECURITY DEFINER).
--   3. app.notify_slack() reads app.slack_notify_config (function_url + secret)
--      and does a pg_net net.http_post() to the slack-notify Edge Function,
--      passing the standard Database-Webhook JSON body (type/table/schema/
--      record/old_record) and an x-webhook-secret header.
--   4. The Edge Function (supabase/functions/slack-notify/index.ts) validates
--      the shared secret, reads the bot token + channel via the
--      public.get_slack_notify_config() RPC, formats a message, and posts to
--      Slack chat.postMessage. If Slack replies not_in_channel, the function
--      self-heals: it calls conversations.join for the channel and retries the
--      post once (requires the channels:join bot scope).
--
-- The Edge Function source of truth lives at:
--      supabase/functions/slack-notify/index.ts
--
-- SECRETS: The actual secret, slack_bot_token, slack_channel, function_url and
-- slack_webhook_url VALUES are configured in the Supabase dashboard and are
-- intentionally NOT in source control. This file documents STRUCTURE only.
-- =============================================================================

create schema if not exists app;

-- -----------------------------------------------------------------------------
-- Config table: a single-row ("singleton") table. The id column is a boolean
-- whose only allowed value is true, so at most one row can ever exist.
-- All value columns hold live secrets configured in the dashboard — never
-- populate them from source control.
-- -----------------------------------------------------------------------------
create table if not exists app.slack_notify_config (
  id                boolean not null primary key default true,
  function_url      text    not null,  -- URL of the slack-notify Edge Function
  secret            text    not null,  -- shared secret, sent as x-webhook-secret
  slack_webhook_url text    not null,  -- legacy incoming-webhook URL (unused by bot path)
  slack_bot_token   text    not null,  -- Slack bot token (xoxb-...)
  slack_channel     text    not null,  -- target channel ID (public channel, starts with 'C')
  constraint slack_notify_config_singleton check (id = true)
);

-- =============================================================================
-- Functions (verbatim, as returned by pg_get_functiondef on production)
-- =============================================================================

-- Trigger function: posts the webhook payload to the Edge Function via pg_net.
CREATE OR REPLACE FUNCTION app.notify_slack()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  cfg record;
begin
  select function_url, secret into cfg from app.slack_notify_config where id;

  perform net.http_post(
    url     := cfg.function_url,
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-webhook-secret', cfg.secret
               ),
    body    := jsonb_build_object(
                 'type',       tg_op,
                 'table',      tg_table_name,
                 'schema',     tg_table_schema,
                 'record',     case when tg_op = 'DELETE' then null else to_jsonb(new) end,
                 'old_record', case when tg_op = 'INSERT' then null else to_jsonb(old) end
               ),
    timeout_milliseconds := 5000
  );
  return coalesce(new, old);
end;
$function$
;

-- Service-role-only RPC: returns the bot token / channel / secret to the Edge
-- Function. SECURITY DEFINER so the anon/authenticated roles never touch the
-- underlying config table.
CREATE OR REPLACE FUNCTION public.get_slack_notify_config()
 RETURNS TABLE(secret text, slack_bot_token text, slack_channel text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select secret, slack_bot_token, slack_channel from app.slack_notify_config where id;
$function$
;

-- =============================================================================
-- Triggers (one per watched table)
-- =============================================================================

drop trigger if exists slack_overtime on public.overtime_requests;
create trigger slack_overtime
  after insert or update on public.overtime_requests
  for each row execute function app.notify_slack();

drop trigger if exists slack_leave on public.leave_requests;
create trigger slack_leave
  after insert or update on public.leave_requests
  for each row execute function app.notify_slack();

drop trigger if exists slack_announcements on public.announcements;
create trigger slack_announcements
  after insert on public.announcements
  for each row execute function app.notify_slack();

drop trigger if exists slack_audit_deletes on public.audit_log;
create trigger slack_audit_deletes
  after insert on public.audit_log
  for each row execute function app.notify_slack();
