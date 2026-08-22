# Monitoring

How we find out the portal is broken without waiting for someone on shift to
mention it.

Before this, there was nothing. When the portal broke for a user, the
ErrorBoundary showed a friendly message and `console.error` went to a phone
nobody reads. If Netlify or Supabase went down, the first anyone knew was a
technician finding they could not file leave — and they would usually assume
it was their phone.

---

## 1. What is watched

| What | How | Where it alerts |
|---|---|---|
| Portal reachable | `.github/workflows/uptime.yml`, every ~15 min | Opens a GitHub issue labelled `uptime` |
| `app.js` served | Same workflow | Same |
| Supabase reachable | Same workflow (needs `SUPABASE_URL` secret) | Same |
| Front-end crashes | `src/errorReporter.js` → `client_errors` table | Manager reviews (section 3); also posts to Slack `#alerts` |
| Failed saves | Same, `kind = 'sync'` | Same |
| Who changed what | `audit_log` (see `supabase_audit_log.sql`) | Portal → Audit Trail |
| Nightly backup ran | `.github/workflows/backup.yml` | Failed workflow run |
| Nightly Notion sync ran | `.github/workflows/notion-sync.yml` | Failed workflow run |
| Leave / overtime / onboarding activity | `supabase/functions/notify-slack` | Slack `#ops` (see section 7) |

---

## 2. Uptime

`.github/workflows/uptime.yml` fetches the portal every ~15 minutes and checks
three things:

1. `GET /` returns 200 **and the page actually contains the app shell** — a
   host error page also returns 200, and would otherwise read as healthy.
2. `GET /app.js` returns 200 — without it the page loads blank.
3. `GET <supabase>/rest/v1/` answers. A **401 is a healthy response**: it means
   PostgREST is up and rejecting properly. A paused project gives 503 or
   refuses the connection.

Each check retries once before failing, because a single failed request from a
GitHub runner is far more often a network blip than an outage, and a monitor
that cries wolf every few hours is a monitor that gets muted.

On failure it opens one issue and comments on it while the outage continues,
rather than filing a new issue every 15 minutes. On recovery it comments and
closes.

**To get notified**, watch this repository with "Issues" enabled, or add a
notification rule. The workflow can only reach GitHub — it cannot page a
phone.

### The honest limitations

- GitHub's scheduler is **best-effort**. Under load a `*/15` cron can run
  30–40 minutes late. Treat this as "we will notice within the hour", not
  within 15 minutes.
- It does not run if GitHub Actions is down.
- It cannot detect "the portal loads but leave approval is broken" — only that
  the pages are served.

If any of that is not good enough, replace it with a real monitor. Better
Stack, UptimeRobot and Pingdom all have free tiers that check every minute
from several regions and can send a push notification or SMS. Point one at
`https://auh-adb-portal.netlify.app` and **delete `uptime.yml`** — two
monitors disagreeing is worse than one.

### The most likely outage, by far

On the Supabase free tier a project **pauses after 7 days of inactivity**, and
also pauses if billing lapses. A paused project means the portal loads and
then fails to sign anyone in. The uptime check catches this (Supabase stops
answering), and the recovery is one click in the Supabase dashboard:
Project Settings → Restore project. No data is lost.

---

## 3. Front-end errors

`src/errorReporter.js` files a row into `public.client_errors` for:

- uncaught exceptions (`window.onerror`)
- unhandled promise rejections
- React render crashes (via `ErrorBoundary`)
- failed saves (the "couldn't save" toast) — the most damaging fault this app
  has, because a save that silently did not land looks like success

### Reviewing them

Managers can read the table. The useful query is the grouped view, which
collapses repeats of one fault into a count:

```sql
select * from public.client_error_summary limit 30;
```

Columns worth reading first: `occurrences` (how bad), `affected_users` (is it
one person's browser or everyone), `route` (which page), `last_seen`.

For one fault in detail:

```sql
select occurred_at, emp_id, route, app_version, message, stack
from public.client_errors
where fingerprint = '...'
order by occurred_at desc
limit 20;
```

`app_version` is the git SHA of the build, so a fault can be tied to the
deploy that introduced it.

**Suggested rhythm:** check `client_error_summary` weekly, and after every
deploy. Anything with `affected_users > 1` is real.

### What is deliberately not collected

- **No third-party error service.** Sentry would be better at this. It is not
  used because the CSP is `connect-src 'self' https://*.supabase.co`, and
  adding an external origin widens the policy that stops an injected script
  exfiltrating data — from an HR portal carrying passport and Emirates ID
  numbers. Reporting into the database the app already talks to costs no new
  egress path. If a third-party service is adopted later, that trade-off is
  the thing to re-examine, not an oversight to correct.
  The one exception is the Slack alert below, and it is scoped on purpose: a
  one-line `kind + route + message` summary, posted server-side through
  `notify-slack` from the app's own Supabase project (no new client egress
  path — the browser still only ever talks to `*.supabase.co`). It never
  carries the stack trace, `emp_id`, `email`, or anything from `client_errors`
  itself; that stays manager-only in the database, as above.
- **No full URLs.** The route recorded is the app's own nav key (`leave`,
  `approvals`), because the URL hash carries employee ids.
- **No client-supplied identity.** `emp_id`, `email` and `role` are stamped
  server-side by `trg_stamp_client_error` from the JWT. A client misbehaving
  badly enough to report an error is not a client whose account claims should
  be believed.
- **Email addresses are stripped** from messages and stack traces before they
  are sent.

### Volume control

Three caps, cheapest first:

1. Each distinct fault is reported **once per page load** (client-side).
2. At most **20 reports per page load** (client-side).
3. At most **20 rows per user per minute** (`trg_stamp_client_error`), silently
   dropped — an error reporter that raises inside an error handler is a fault
   multiplier.

A React render loop can otherwise file thousands of identical rows a minute.
The first few are the diagnosis; the rest are cost.

---

## 4. Setup checklist

- [ ] Apply `supabase_monitoring.sql`
- [ ] Add repository secret `SUPABASE_URL` (enables the backend uptime check)
- [ ] Add repository secret `SUPABASE_SERVICE_ROLE_KEY` (enables nightly backups)
- [ ] Create the `uptime` label in the repository (the workflow uses it to
      find its own open issue)
- [ ] Watch the repository with Issues notifications on
- [ ] Set a calendar reminder to review `client_error_summary` weekly
- [ ] Decide whether to schedule pruning (below)
- [ ] (optional) Set Edge Function secrets `SLACK_WEBHOOK_URL` and
      `SLACK_ALERTS_WEBHOOK_URL` to enable Slack notifications (section 6)
- [ ] (optional) Set repository secrets `NOTION_TOKEN`, `NOTION_ROSTER_DB_ID`,
      `NOTION_LEAVE_DB_ID` to enable the nightly Notion sync
      (`docs/NOTION_SYNC.md`)

---

## 5. Retention

`client_errors` is operational telemetry, not a record anyone is required to
keep — unlike `audit_log`, it is safe to prune aggressively. The function is
provided but not scheduled:

```sql
select cron.schedule(
  'prune-client-errors', '30 3 * * *',
  $$select public.prune_client_errors(interval '90 days')$$
);
```

---

## 6. Slack notifications

`supabase/functions/notify-slack` posts to a Slack Incoming Webhook. It is
invoked the same way `send-push` is — fire-and-forget, from the client, after
a write already succeeded — for:

- new leave / overtime requests, and each approval or rejection
- a manager inviting a new joiner (single or bulk)
- a joiner finalizing their profile
- front-end error reports (see above) — routed to a separate channel

Two Edge Function secrets, each an Incoming Webhook URL for a Slack channel:

| Secret | Channel | If unset |
|---|---|---|
| `SLACK_WEBHOOK_URL` | Operational activity (`#ops` or similar) | No-op — the invoking call still succeeds, nothing is posted |
| `SLACK_ALERTS_WEBHOOK_URL` | Front-end errors (`#alerts` or similar) | Falls back to `SLACK_WEBHOOK_URL` |

Set them in the Supabase dashboard → Edge Functions → `notify-slack` →
Secrets. Neither secret is required — the portal works identically with
neither set, since every call site treats the notification as best-effort and
never awaits or surfaces its result to the user.

To create a webhook: Slack → a workspace admin → **Apps → Incoming Webhooks →
Add to Slack**, pick the channel, copy the URL.

---

## 7. Notion sync

See `docs/NOTION_SYNC.md`. A nightly job (`.github/workflows/notion-sync.yml`)
exports a narrow, non-sensitive roster and leave-calendar summary to Notion —
entirely separate from Slack and from `client_errors`, and off by default
until its repository secrets are set.

---

## 8. Still not covered

Named so they are decisions rather than gaps nobody noticed:

- **No performance monitoring.** Nothing measures how long a page takes to
  load. The portal is small and self-hosts its vendor scripts, so this has not
  been a problem.
- **No alert on a *failed* nightly backup** beyond the workflow run going red.
  Watch the repository, or add a notification rule for failed Actions.
- **No synthetic transaction.** Nothing logs in and files a test leave request,
  so "the portal is up but approvals are broken" would not be caught. Doing it
  properly needs a dedicated test account with a real password in a secret,
  which is its own risk — worth revisiting only if that failure actually
  happens.
- **No paging.** Everything here alerts to GitHub. Nobody is on call for this
  system, which is the right call for an internal portal, but it should be a
  stated one.
