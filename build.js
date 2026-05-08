// Single-step build for Netlify or local dev.
// Bundles app.jsx -> dist/app.js, copies static assets to dist/.
// Cross-platform (works on Windows local + Linux CI).

const fs   = require("fs");
const path = require("path");
const esb  = require("esbuild");

const ROOT = __dirname;
const DIST = path.join(ROOT, "dist");

const STATIC_ASSETS = [
  "index.html",
  "manifest.json",
  "sw.js",
  "icon-192.png",
  "icon-512.png",
  "apple-touch-icon.png",
  "favicon.png",
];

const showDemoLogin =
  process.env.SHOW_DEMO_LOGIN !== "0" &&
  process.env.SHOW_DEMO_LOGIN !== "false";

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
  define:      { __SHOW_DEMO__: JSON.stringify(!!showDemoLogin) },
});

// 4. Done
const out = fs.readdirSync(DIST).map(f => {
  const s = fs.statSync(path.join(DIST, f));
  return `  ${f.padEnd(24)} ${String(s.size).padStart(8)} bytes`;
}).join("\n");
console.log("[build] dist contents:\n" + out);
