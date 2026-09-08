// Does the built app actually RUN?
//
// WHY THIS EXISTS
// The portal shipped a crash that killed it on every render, for every user:
//
//   ReferenceError: Cannot access 'loadAudit' before initialization
//
// and every single gate we had said the build was fine. eslint passed. 663
// unit tests passed. The bundle built, verify-dist approved it, Netlify
// deployed it "ready", and uptime.yml went on reporting the site healthy —
// because it checks that index.html contains id="root" and that app.js returns
// 200, and BOTH OF THOSE WERE TRUE the whole time. The shell was served, the
// bundle was served, and the application inside it was dead on arrival.
//
// Nothing we had could have caught it, because the fault does not exist until
// a browser evaluates the bundle. The tests import modules out of src/; not one
// of them mounts App. So this is the missing gate, and it is deliberately the
// dumbest possible version of it: serve dist/, open it in a real browser, and
// insist that something rendered and nothing threw.
//
// It is not a UI test and must never grow into one — no sign-in, no backend, no
// asserting on copy that a designer will reword. It answers one question, the
// one nobody was asking: does the app come up at all?
//
// Usage:
//   node scripts/smoke.mjs                     the local build (expects dist/)
//   node scripts/smoke.mjs --url https://…     a deployed site (uptime.yml)
//
// The --url mode exists because uptime.yml had the SAME blind spot in
// production: it checks that index.html contains id="root" and that app.js
// returns 200, so it reported the portal healthy for as long as the crash was
// live. Both modes share the assertions below deliberately — two definitions of
// "the app came up" would drift, and the one that drifts is the one watching
// production.
//
// Needs a Chromium. In CI the workflow installs one and a missing browser is a
// hard failure. Locally it skips with instructions rather than blocking a
// commit on a 150MB download nobody asked for.

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "dist");
const IS_CI = process.env.CI === "true" || process.env.CI === "1";

const urlFlag = process.argv.indexOf("--url");
const TARGET_URL = urlFlag !== -1 ? process.argv[urlFlag + 1] : null;
if (urlFlag !== -1 && !/^https?:\/\//.test(TARGET_URL || "")) {
  console.error("[smoke] --url needs an http(s) URL");
  process.exit(1);
}

const fail = msg => { console.error("[smoke] FAIL — " + msg); process.exitCode = 1; };

if (!TARGET_URL && !fs.existsSync(path.join(DIST, "app.js"))) {
  console.error("[smoke] dist/app.js is missing; run `npm run build` first.");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Browser
// ---------------------------------------------------------------------------

let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  const msg = "playwright is not installed. Run `npm ci`.";
  if (IS_CI) { console.error("[smoke] " + msg); process.exit(1); }
  console.warn("[smoke] SKIPPED — " + msg);
  process.exit(0);
}

async function launch() {
  try {
    return await chromium.launch();
  } catch (e) {
    // Some environments ship a browser outside playwright's own store, or a
    // store revision that doesn't match the pinned playwright (Claude Code web
    // symlinks its Chromium at /opt/pw-browsers/chromium for exactly this case).
    const candidates = [process.env.SMOKE_CHROMIUM_PATH, "/opt/pw-browsers/chromium"];
    for (const path of candidates) {
      if (path && fs.existsSync(path)) {
        return chromium.launch({ executablePath: path });
      }
    }
    throw e;
  }
}

let browser;
try {
  browser = await launch();
} catch (e) {
  const msg = "no Chromium available (" + (e?.message || e).toString().split("\n")[0]
    + "). Install one with `npx playwright install chromium`.";
  if (IS_CI) {
    // In CI a missing browser means this gate silently stopped running, which
    // is how the portal shipped broken in the first place. Never pass quietly.
    console.error("[smoke] " + msg);
    process.exit(1);
  }
  console.warn("[smoke] SKIPPED — " + msg);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Static server, serving the REAL production headers
// ---------------------------------------------------------------------------

// Read the CSP out of _headers rather than restating it, so the smoke test
// exercises whatever policy is actually deployed. A policy tightened into
// blocking the app's own scripts should fail here, not in front of the team.
// (Only for the local server — a deployed site sends its own.)
const CSP = TARGET_URL ? null : ((fs.readFileSync(path.join(ROOT, "_headers"), "utf8")
  .match(/^\s+Content-Security-Policy:\s*(.*)$/m) || [])[1] || "").trim() || null;
if (!TARGET_URL && !CSP) fail("could not read Content-Security-Policy out of _headers");

const MIME = {
  ".html": "text/html", ".js": "text/javascript", ".json": "application/json",
  ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml",
  ".ico": "image/x-icon", ".webmanifest": "application/manifest+json",
};

function serve({ omit = [] } = {}) {
  const server = http.createServer((req, res) => {
    const rel = req.url.split("?")[0] === "/" ? "/index.html" : req.url.split("?")[0];
    if (omit.includes(rel)) { res.writeHead(404); return res.end("not found"); }
    const file = path.join(DIST, decodeURIComponent(rel));
    if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404); return res.end("not found");
    }
    if (CSP) res.setHeader("Content-Security-Policy", CSP);
    res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(resolve => server.listen(0, "127.0.0.1", () => resolve(server)));
}

/**
 * Open the app in the browser and collect everything that went wrong.
 * Serves dist/ locally, unless `url` points at a deployed site.
 */
async function load({ omit = [], url = null, hash = "" } = {}) {
  const server = url ? null : await serve({ omit });
  const target = url || `http://127.0.0.1:${server.address().port}/`;
  const page = await browser.newPage();
  const pageErrors = [];
  const missing = [];
  page.on("pageerror", e => pageErrors.push(e.message));
  page.on("requestfailed", r => missing.push(r.url()));
  page.on("response", r => { if (r.status() >= 400) missing.push(`${r.status()} ${r.url()}`); });
  await page.goto(target + (hash || ""), { waitUntil: "load" });
  if (url) {
    // Against a live site the app first asks Supabase whether there is a
    // stored session, and a cold backend can take a few seconds. Wait for the
    // app to settle into a real screen rather than timing it — a slow start is
    // not an outage, and calling one would get this monitor muted.
    // globalThis.document, not the bare global: this callback is serialised
    // and run in the PAGE, but this file is linted as Node.
    await page.waitForFunction(() => {
      const r = globalThis.document.getElementById("root");
      if (!r) return false;
      if (r.querySelector(".boot")) return false;      // still the static shell
      return r.innerText.trim().length > 0;
    }, null, { timeout: 25000 }).catch(() => {});
  } else {
    // The app mounts from a `defer`red script and then runs an effect or two.
    // Half a second is far more than it needs and keeps this gate quick.
    await page.waitForTimeout(500);
  }
  const text = (await page.locator("#root").innerText().catch(() => "")).replace(/\s+/g, " ").trim();
  const bootFallbackStillShowing = await page.locator("#root .boot").count() > 0;
  // Reached through the element rather than the bare global: this callback is
  // serialised and run in the PAGE, where getComputedStyle exists — but this
  // file is linted as Node, where it does not.
  const stuckDelay = await page.locator(".boot-stuck").first()
    .evaluate(el => el.ownerDocument.defaultView.getComputedStyle(el).animationDelay)
    .catch(() => null);
  // Any button inside a form that would submit it. Bt used to render these by
  // omission, which double-fired the primary action — see src/uiPrimitives.jsx.
  const submitButtonsInForms = await page.evaluate(() =>
    [...globalThis.document.querySelectorAll("form button")]
      .filter(b => (b.getAttribute("type") || "submit") === "submit")
      .map(b => b.textContent.trim().slice(0, 40))
  ).catch(() => []);
  await page.close();
  if (server) await new Promise(r => server.close(r));
  return { text, pageErrors, missing, bootFallbackStillShowing, stuckDelay, submitButtonsInForms };
}

// ---------------------------------------------------------------------------
// The app must actually come up. Shared by both modes on purpose.
// ---------------------------------------------------------------------------

function assertAppCameUp(r) {
  // THE ASSERTION THAT WOULD HAVE CAUGHT THE OUTAGE. Any uncaught exception
  // during evaluation or render lands here.
  if (r.pageErrors.length) fail("the app threw on load: " + r.pageErrors[0]);

  if (r.missing.length) fail("assets failed to load: " + r.missing.slice(0, 3).join(", "));

  // React replaces #root's children when it mounts. Still seeing the static
  // fallback means it never did.
  if (r.bootFallbackStillShowing) fail("React never mounted — the boot fallback is still on screen");

  if (!r.text) fail("#root rendered nothing — a blank page");

  // The ErrorBoundary rendering IS the failure mode we shipped: the page looks
  // alive, so "did anything render" alone would have passed.
  if (/Something went wrong/i.test(r.text)) {
    fail("the ErrorBoundary rendered instead of the app: " + r.text.slice(0, 160));
  }

  // Signed out is the only state reachable without credentials, so the sign-in
  // form is what a healthy boot looks like.
  if (!/Sign In/i.test(r.text)) {
    fail("expected the sign-in screen; got: " + r.text.slice(0, 160));
  }
}

// ---------------------------------------------------------------------------
// URL mode — watch a DEPLOYED site (uptime.yml)
// ---------------------------------------------------------------------------

if (TARGET_URL) {
  const r = await load({ url: TARGET_URL });
  assertAppCameUp(r);
  await browser.close();
  if (process.exitCode) {
    console.error(`[smoke] ${TARGET_URL} is serving a portal that does not run.`);
  } else {
    console.log(`[smoke] ok — ${TARGET_URL} mounted, no errors, sign-in screen rendered`);
  }
  process.exit(process.exitCode || 0);
}

// ---------------------------------------------------------------------------
// 1. The healthy build must actually come up
// ---------------------------------------------------------------------------

{
  assertAppCameUp(await load());
  if (!process.exitCode) console.log("[smoke] ok — app mounted, no errors, sign-in screen rendered");
}

// ---------------------------------------------------------------------------
// 2. The password-reset link must land on the reset screen
// ---------------------------------------------------------------------------
// This is the screen someone reaches when they are ALREADY locked out, so it
// is the worst one to have broken — and it is only reachable with a recovery
// token in the URL, which means no ordinary page load ever exercises it. It
// was reported as "the emailed link opens 'Something went wrong'": the same
// render crash, but nothing here would have told us the reset path had also
// stopped working.

{
  const r = await load({
    hash: "#access_token=eyJfake.fake.fake&expires_in=3600&refresh_token=fake"
        + "&token_type=bearer&type=recovery",
  });

  if (/Something went wrong/i.test(r.text)) {
    fail("the reset link lands on the ErrorBoundary: " + r.text.slice(0, 160));
  } else if (!/new password/i.test(r.text)) {
    fail("the reset link did not reach the reset screen; got: " + r.text.slice(0, 160));
  }

  // A submit-type button in this form makes the primary action fire twice —
  // once from onClick, once from onSubmit — which sent the password update
  // twice and could report "should be different from the old password" for a
  // reset that had just succeeded.
  if (r.submitButtonsInForms.length) {
    fail("buttons in the reset form would submit it: " + r.submitButtonsInForms.join(", "));
  }

  if (!process.exitCode) console.log("[smoke] ok — the reset link reaches the set-a-new-password screen");
}

// ---------------------------------------------------------------------------
// 3. A broken deploy must SAY so, not go blank
// ---------------------------------------------------------------------------
// index.html is published without its bundle (a wrong publish directory, a
// failed upload). The CSP forbids inline script, so the fallback is CSS-only
// and easy to break silently — which would put us back to a blank dark screen
// and "it isn't opening" with nothing to go on.

{
  const r = await load({ omit: ["/app.js"] });

  if (!r.bootFallbackStillShowing) {
    fail("with app.js missing, #root lost its fallback — the page would be blank");
  }
  if (!/could not start/i.test(r.text)) {
    fail("the boot fallback does not explain the failure; got: " + r.text.slice(0, 160));
  }
  // The message is revealed on a delay so a merely-slow load does not accuse
  // the deploy of being broken. If the delay is gone, every slow start shows
  // an error; if the animation is gone, nothing ever shows.
  if (r.stuckDelay !== "10s") {
    fail(`boot fallback reveal delay is "${r.stuckDelay}", expected "10s"`);
  }

  if (!process.exitCode) console.log("[smoke] ok — a missing bundle reports itself instead of going blank");
}

await browser.close();

if (process.exitCode) {
  console.error("[smoke] the built app does not run. Do not deploy this.");
} else {
  console.log("[smoke] passed");
}
