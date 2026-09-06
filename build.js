// Single-step build for Cloudflare Pages, Netlify, or local dev.
// Bundles app.jsx -> dist/app.js, copies static assets to dist/.
// Cross-platform (works on Windows local + Linux CI).

const fs   = require("fs");
const path = require("path");
const esb  = require("esbuild");

const ROOT = __dirname;
const DIST = path.join(ROOT, "dist");

const STATIC_ASSETS = [
  // Security headers — Cloudflare Pages and Netlify both read _headers from
  // the publish directory, so it must ship inside dist/ to take effect.
  "_headers",
  "index.html",
  // Cloudflare Pages reads response headers from a `_headers` file at the root
  // of the published directory, so it has to be copied in like any other
  // asset. Netlify takes the same headers from netlify.toml in the repo root
  // and ignores this file; shipping both is what lets either host serve the
  // site. Harmless on Netlify — it is served as a static file nobody requests.
  "_headers",
  "manifest.json",
  "sw.js",
  "icon-192.png",
  "icon-512.png",
  "apple-touch-icon.png",
  "favicon.png",
];

// Demo mode ships the demo login accounts AND the seeded team roster in the
// bundle, so production builds must opt IN explicitly (SHOW_DEMO_LOGIN=1).
const showDemoLogin =
  process.env.SHOW_DEMO_LOGIN === "1" ||
  process.env.SHOW_DEMO_LOGIN === "true";

// The approved Team Mail ID list is personal data — mostly private Gmail
// addresses — and a bundle is public. It rides along with demo mode so a
// production build never carries it; the login form asks the
// is_approved_team_login RPC instead, and the auth.users trigger is the real
// gate either way. scripts/verify-dist.js fails the build if an address leaks.
const embedTeamDirectory = showDemoLogin;

// Build identifier carried into error reports. Cloudflare Pages exposes
// CF_PAGES_COMMIT_SHA and Netlify exposes COMMIT_REF; locally, fall back to
// the short git SHA, then to "dev".
const appVersion = (() => {
  const fromEnv = process.env.CF_PAGES_COMMIT_SHA || process.env.COMMIT_REF || process.env.GITHUB_SHA;
  if (fromEnv) return fromEnv.slice(0, 8);
  try {
    return require("child_process")
      .execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] })
      .toString().trim();
  } catch {
    return "dev";
  }
})();

// 1. Wipe dist
fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });

// 2. Copy static assets
for (const a of STATIC_ASSETS) {
  const sp = path.join(ROOT, a);
  if (!fs.existsSync(sp)) {
    console.warn("[build] missing static asset:", a);
    continue;
  }
  fs.copyFileSync(sp, path.join(DIST, a));
}

// 2b. Copy self-hosted vendor scripts (React, ReactDOM, supabase-js UMD
// builds pinned via package-lock — no CDN dependency in production).
const VENDOR = path.join(ROOT, "vendor");
fs.mkdirSync(path.join(DIST, "vendor"), { recursive: true });
for (const f of fs.readdirSync(VENDOR)) {
  fs.copyFileSync(path.join(VENDOR, f), path.join(DIST, "vendor", f));
}

// 3. Bundle the React app (React + ReactDOM are globals from index.html CDN)
esb.buildSync({
  entryPoints: [path.join(ROOT, "app.jsx")],
  bundle:      true,
  minify:      true,
  outfile:     path.join(DIST, "app.js"),
  loader:      { ".jsx": "jsx" },
  logLevel:    "info",
  jsx:         "transform",
  jsxFactory:  "React.createElement",
  jsxFragment: "React.Fragment",
  define:      {
    __SHOW_DEMO__:             JSON.stringify(!!showDemoLogin),
    __EMBED_TEAM_DIRECTORY__:  JSON.stringify(!!embedTeamDirectory),
    // Stamped into every error report, so a fault can be tied to the build it
    // came from. See appVersion above for the env vars each host sets.
    __APP_VERSION__:           JSON.stringify(appVersion),
  },
});

// 4. Done
const out = fs.readdirSync(DIST).map(f => {
  const s = fs.statSync(path.join(DIST, f));
  return `  ${f.padEnd(24)} ${String(s.size).padStart(8)} bytes`;
}).join("\n");
console.log("[build] dist contents:\n" + out);
