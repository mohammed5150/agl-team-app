// Post-build gate. Runs in CI (`npm run ci`) and should run before any deploy.
//
// A production bundle is a public document: anyone can fetch /app.js from the
// Netlify URL without signing in. Two categories of thing must therefore never
// survive into it, and both HAVE been in it at some point:
//
//   1. The seeded demo roster — names, mobile numbers, passport and Emirates ID
//      numbers for the whole team (compiled out by __SHOW_DEMO__).
//   2. The approved Team Mail ID list — 35 addresses, most of them team
//      members' personal Gmail accounts (compiled out by
//      __EMBED_TEAM_DIRECTORY__).
//
// Both are stripped by an esbuild define, and a define is exactly the kind of
// thing that gets flipped for a debugging session and forgotten. So this
// script does not trust the flag: it reads the built file and fails on the
// DATA. A refactor that reintroduces the leak by another route fails here too.
//
// Escape hatch: ALLOW_DEMO_BUNDLE=1 for a deliberate demo build. It is loud on
// purpose — there is no reason to set it in CI or in a deploy.

const fs   = require("fs");
const path = require("path");

const ROOT   = path.join(__dirname, "..");
const APP_JS = path.join(ROOT, "dist", "app.js");

const allowDemo =
  process.env.ALLOW_DEMO_BUNDLE === "1" || process.env.ALLOW_DEMO_BUNDLE === "true";

const failures = [];

// --- 1. The bundle exists and looks like a real build --------------------

if (!fs.existsSync(APP_JS)) {
  console.error("[verify-dist] dist/app.js missing; run npm run build");
  process.exit(1);
}

const source = fs.readFileSync(APP_JS, "utf8");
const { size } = fs.statSync(APP_JS);

if (size < 8000) {
  failures.push(`dist/app.js is only ${size} bytes — the build did not produce a real bundle`);
}

// --- 2. No email addresses ------------------------------------------------
// The portal has no legitimate reason to hard-code ANY address: every address
// it handles arrives from the database or from what the user types. So the
// rule is a flat zero rather than a blocklist of the ones we happen to know
// about, which is what makes it hold for addresses added later.

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

// Invented placeholders in form hints and the bulk-import CSV example. Each is
// a fictitious name, so none identifies anyone. Keep this list short: an entry
// here is a standing exemption, and the whole value of the check is that it
// defaults to refusing. Never add a real person's address.
const ALLOWED_EMAILS = new Set([
  "your.name@adbsafegate.com",           // LoginPage email field placeholder
  "someone@adbsafegate.com",             // TeamPage invite field placeholder
  "john.doe@adbsafegate.com",            // TeamPage CSV example row
  "jane.smith@gmail.com",                // TeamPage CSV example row
]);

const emails = [...new Set(source.match(EMAIL_RE) || [])]
  .filter(e => !ALLOWED_EMAILS.has(e.toLowerCase()));

if (emails.length) {
  failures.push(
    `dist/app.js embeds ${emails.length} email address(es) — a production bundle is public.\n`
    + `         ${emails.slice(0, 10).join("\n         ")}`
    + (emails.length > 10 ? `\n         …and ${emails.length - 10} more` : "")
    + "\n         Expected __EMBED_TEAM_DIRECTORY__=false (see build.js)."
  );
}

// --- 3. No seeded roster PII ---------------------------------------------
// Shapes, not values: an employee number, an Emirates ID and a UAE mobile all
// have a fixed format, so this catches seed data regardless of whose it is.

const PII_PATTERNS = [
  { label: "employee numbers (ADB-nnn)",  re: /\bADB-\d{3}\b/g },
  { label: "Emirates ID numbers",         re: /\b784-\d{4}-\d{7}-\d\b/g },
  { label: "UAE mobile numbers",          re: /\+971\s?5\d\s?\d{7}\b/g },
];

for (const { label, re } of PII_PATTERNS) {
  const hits = [...new Set(source.match(re) || [])];
  if (hits.length) {
    failures.push(
      `dist/app.js embeds ${hits.length} ${label} — seeded roster data reached the bundle.\n`
      + `         e.g. ${hits.slice(0, 3).join(", ")}\n`
      + "         Expected __SHOW_DEMO__=false (see build.js)."
    );
  }
}

// --- 4. Demo mode is off --------------------------------------------------

if (source.includes("DEV: PREFILL EMAIL")) {
  failures.push(
    "dist/app.js still contains the demo login panel — SHOW_DEMO_LOGIN was set for this build."
  );
}

// --- 5. Static assets the deploy needs -----------------------------------

for (const asset of ["index.html", "manifest.json", "sw.js", "vendor"]) {
  if (!fs.existsSync(path.join(ROOT, "dist", asset))) {
    failures.push(`dist/${asset} is missing`);
  }
}

// --- Report ---------------------------------------------------------------

if (failures.length) {
  const demoOnly = failures.every(f =>
    f.includes("__EMBED_TEAM_DIRECTORY__")
    || f.includes("__SHOW_DEMO__")
    || f.includes("demo login panel"));

  for (const f of failures) console.error("[verify-dist] FAIL: " + f);

  if (demoOnly && allowDemo) {
    console.warn(
      "\n[verify-dist] ALLOW_DEMO_BUNDLE is set — treating the above as an\n"
      + "              intentional demo build. NEVER deploy this bundle publicly:\n"
      + "              it carries real staff contact details and document numbers.\n"
    );
    process.exit(0);
  }
  console.error(
    "\n[verify-dist] Build refused. A production bundle is served publicly and\n"
    + "              must carry no personal data. Rebuild with `npm run build`\n"
    + "              (no SHOW_DEMO_LOGIN), or set ALLOW_DEMO_BUNDLE=1 if you are\n"
    + "              deliberately producing a local demo build.\n"
  );
  process.exit(1);
}

console.log(`[verify-dist] ok — app.js ${size} bytes, no embedded addresses or roster PII`);
