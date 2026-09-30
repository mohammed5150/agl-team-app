# API

The portal has **no custom backend server**. Its entire API surface is
Supabase — PostgREST over tables and views, a handful of Postgres RPCs, GoTrue
auth, and two Edge Functions — plus one external weather API. Everything the
client calls goes through the single client created in
`src/supabasePortal.js`.

Every request is made with the **publishable (anon) key**; what a caller can
actually read or write is decided by RLS and the guard triggers
(`docs/DATABASE.md`, `docs/SECURITY.md`). The URL, publishable key and VAPID
public key are committed on purpose — all three are public by design. The
service-role key lives only in GitHub secrets (backup/uptime workflows) and
must never enter the bundle.

---

## 1. Client setup

```js
import { supa } from "./src/supabasePortal.js";
```

`supa` is created from the UMD `window.supabase` global (`vendor/`), so it is
`null` outside a browser — every module using it must tolerate that (the unit
tests run in Node).

## 2. Auth (GoTrue)

Used in `src/authFlows.js` / `app.jsx`:

| Call | Used for |
|---|---|
| `supa.auth.signUp` | First sign-in of an invited joiner (blocked at the DB for unapproved Team Mail IDs) |
| `supa.auth.signInWithPassword` | Login |
| `supa.auth.signOut` | Logout |
| `supa.auth.getSession` / `onAuthStateChange` | Session restore and reactive auth state |
| `supa.auth.resetPasswordForEmail` | "Forgot your password?" (requires the Site/Redirect URLs set in the dashboard — `docs/SECURITY.md` §6) |
| `supa.auth.updateUser` | Setting a new password after the reset link |

## 3. Data (PostgREST)

Tables and views the client reads/writes, all subject to RLS:

| Relation | Access from the client |
|---|---|
| `employees` | Roster load and profile saves (self-or-staff). Saves go through `diffFieldsById` so only changed columns are written — a full-row upsert would spuriously touch `email` and fire its immutability trigger. |
| `employee_directory` | Read-only colleague list for non-staff. |
| `leave_requests` | Insert own; TL/MGR update status per the pinned two-stage workflow. |
| `overtime_requests` | Insert own; TL updates status (team-lead-terminal — no manager stage). |
| `announcements` | Read all; staff write. |
| `notifications` | Read own, mark `read`; creation is scoped by policy. |
| `push_subscriptions` | Upsert/delete own subscription (`onConflict: "endpoint"`). |
| `audit_log` | Manager read (capped at 500 rows in the UI). Never written by the client — only by `SECURITY DEFINER` triggers. |
| `client_errors` | Insert-only from `src/errorReporter.js`, stamped with `__APP_VERSION__`. |

Row shapes are translated by the `*ToDb`/`*FromDb` mappers in
`src/supabasePortal.js`; never hand-write snake_case columns in a component.

## 4. RPCs

| RPC | Purpose |
|---|---|
| `is_approved_team_login(email)` | Pre-check during invite/sign-up |
| `approve_team_login(email)` | Manager approves a Team Mail ID from the invite form (no SQL access needed) |
| `set_employment_status(...)` | Offboarding — deactivates, never deletes |

`list_team_logins`, `revoke_team_login` and `record_profile_unlock` exist
server-side for the same flows; grants are explicit
(`supabase_grant_hardening.sql`), so a new RPC must state its own.

## 5. Edge Functions

Invoked via `supa.functions.invoke(...)`, fire-and-forget (failures are logged
and never block the UI action that triggered them):

| Function | Payload | Purpose |
|---|---|---|
| `send-push` | `{ to, title, body, url }` | Web-push to an employee's registered subscriptions (VAPID; public key in `supabasePortal.js`) |
| `send-slack` | `{ text, title, level }` | Posts leave/overtime alerts to Slack; safely no-ops until `SLACK_WEBHOOK_URL` is configured (`docs/SLACK.md`) |

## 6. Web push

`subscribePush(empId)` in `src/supabasePortal.js` handles permission,
subscribes the service worker's `PushManager` with the VAPID public key, and
upserts the endpoint into `push_subscriptions`; `unsubscribePush()` reverses
both. Feature-detection is `pushSupported` — never assume the APIs exist
(iOS installs vary).

## 7. External APIs

| API | Where | Notes |
|---|---|---|
| Open-Meteo `api.open-meteo.com/v1/forecast` | `src/weather.js` | Dashboard weather. No key, no PII sent. Its origin must stay in the `connect-src` of **both** CSPs (`index.html` meta and `netlify.toml` header — they must agree, `tests/securityHeaders.test.js` enforces it). |

## 8. Adding a new endpoint

1. Prefer a table + RLS policy, or an RPC, over a new Edge Function.
2. Write the migration (see `docs/DATABASE.md` §5) with policies for
   `authenticated` and explicit grants.
3. Add mappers if a table, and the client call in `src/` (pure, testable).
4. If it needs a new external origin, add it to both CSPs together.
5. `npm run ci` must pass; if the endpoint matters for go-live, extend
   `scripts/preflight.mjs` to probe it from outside.
