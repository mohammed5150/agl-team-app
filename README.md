# ADB SAFEGATE — AGL Maintenance Team Portal

PWA for the Abu Dhabi Airports AGL maintenance team. React (UMD via CDN) +
Supabase, bundled with esbuild.

## Local development

```bash
npm install
npm run build      # one-shot build
# OR
npm run dev        # esbuild --watch on app.jsx (rebuilds app.js on save)
npm start          # serves dist/ on http://localhost:8080
```

## Deploy

This repo is connected to Netlify continuous deploy. Every push to `main`
triggers `npm run build` and publishes the `dist/` folder.

- Production: https://auh-adb-portal.netlify.app

## Project structure

```
app.jsx               main app (single file, ~3700 lines)
index.html            shell + CSP + initial styles
manifest.json         PWA manifest
sw.js                 service worker (network-first for HTML/JS, cache-first for icons)
build.js              cross-platform build script (used by `npm run build`)
icon-*.png            PWA icons (generated from PHOTO-2026-04-27-21-41-51.jpg.jpeg)
supabase_*.sql        database migrations (apply in numerical / dependency order)
```

## Database migrations (apply in this order on a fresh Supabase project)

1. `supabase_schema.sql` — base tables
2. `supabase_overtime.sql` — overtime requests table
3. `supabase_phase5.sql` — TL/MGR seed
4. `supabase_rating.sql` — rating + profile_finalized columns
5. `supabase_notifications.sql` — notifications rebuild
6. `supabase_rls_policies.sql` — proper RLS (replaces permissive policies)
7. `supabase_tier.sql` — capability tier (T1-T4) + manager-only triggers

## Roles

- `manager` — full read/write, edits tier, creates invites
- `teamlead` — sees all employees + tiers, approves leave first stage
- `employee` — own profile, own leave requests, own notifications

## Onboarding flow

1. Manager opens Team page → **+ Invite Employee** (or **📋 Bulk Import (CSV)**)
2. Employee gets a placeholder row keyed by their email
3. Employee opens the portal URL → enters their email + chosen password
4. Supabase signs them up, sends a confirmation email via Resend
5. They click the link, log in, fill out their profile, click **Finalize**
