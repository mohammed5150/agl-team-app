import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// The browser is the boundary these headers defend, and a host only sends them
// if its own config says so. These assertions pin the guarantees, so an edit
// that drops one fails the suite instead of quietly shipping the hole back —
// the same reason tests/onboardingMigration.test.js pins the SQL.
//
// The policy now lives in three places, one per way the site can be served:
//
//   index.html   <meta http-equiv> — a locally opened file, or any host that
//                sends no headers at all
//   netlify.toml the real header on Netlify
//   _headers     the real header on Cloudflare Pages
//
// Three hand-maintained copies is only survivable because the last describe
// block below refuses to let any two of them disagree.

const ROOT  = join(dirname(fileURLToPath(import.meta.url)), "..");
const toml  = readFileSync(join(ROOT, "netlify.toml"), "utf8");
const html  = readFileSync(join(ROOT, "index.html"), "utf8");
const pages = readFileSync(join(ROOT, "_headers"), "utf8");

/** Value of a header from the netlify.toml [headers.values] block. */
function header(name) {
  const m = toml.match(new RegExp(`^\\s*${name}\\s*=\\s*"([^"]*)"`, "m"));
  return m ? m[1] : null;
}

/**
 * Value of a header from the Cloudflare `_headers` file.
 *
 * Split on the FIRST colon only: a CSP is full of them (`https://…`), and
 * splitting on every one would truncate the policy to `default-src 'self'`
 * and make these tests pass against a broken file.
 */
function pagesHeader(name) {
  for (const line of pages.split("\n")) {
    if (/^\s*#/.test(line)) continue;          // comment
    const m = line.match(/^\s+([A-Za-z0-9-]+):\s*(.*)$/);
    if (m && m[1].toLowerCase() === name.toLowerCase()) return m[2].trim();
  }
  return null;
}

/** "a 'self'; b 'none'" -> Map { a => "'self'", b => "'none'" } */
function directives(policy) {
  const out = new Map();
  for (const part of (policy || "").split(";")) {
    const t = part.trim();
    if (!t) continue;
    const sp = t.indexOf(" ");
    if (sp === -1) out.set(t.toLowerCase(), "");
    else out.set(t.slice(0, sp).toLowerCase(), t.slice(sp + 1).trim());
  }
  return out;
}

const headerCsp = header("Content-Security-Policy");
// The content attribute is full of single quotes ('self', 'none'), so the
// delimiter has to be matched explicitly rather than with a ["'] class.
const metaCsp = (html.match(
  /<meta\s+http-equiv=(["'])Content-Security-Policy\1\s+content="([^"]*)"/i,
) || [])[2];

describe("netlify.toml applies headers to every response", () => {
  it("declares a headers block scoped to /*", () => {
    expect(toml).toMatch(/\[\[headers\]\]/);
    expect(toml).toMatch(/for\s*=\s*"\/\*"/);
  });

  it("does not override the build settings held in the Netlify UI", () => {
    expect(toml).not.toMatch(/^\s*\[build\]/m);
  });
});

describe("clickjacking protection actually reaches the browser", () => {
  // The defect this file was added for: frame-ancestors is ignored by the
  // spec when it arrives in a <meta> tag, so index.html alone never had it.
  it("sends frame-ancestors as a real HTTP header", () => {
    expect(directives(headerCsp).get("frame-ancestors")).toBe("'self'");
  });

  it("also sends X-Frame-Options, agreeing with frame-ancestors", () => {
    expect(header("X-Frame-Options")).toBe("SAMEORIGIN");
  });
});

describe("the header policy and the meta policy cannot drift apart", () => {
  // A browser given both enforces the INTERSECTION. A directive tightened in
  // one and not the other breaks the app with no useful error.
  it("keeps the meta tag in place as the fallback policy", () => {
    expect(metaCsp).toBeTruthy();
  });

  it("agrees on every directive the two policies share", () => {
    const h = directives(headerCsp);
    const m = directives(metaCsp);
    for (const [name, value] of m) {
      if (h.has(name)) expect(`${name}: ${h.get(name)}`).toBe(`${name}: ${value}`);
    }
  });

  it("still allows the Supabase REST and realtime origins", () => {
    const connect = directives(headerCsp).get("connect-src");
    expect(connect).toContain("https://*.supabase.co");
    expect(connect).toContain("wss://*.supabase.co");
  });

  it("allows those origins and NOTHING else", () => {
    // connect-src is the list of places this app may send data. Asserting the
    // whole set, rather than that the expected entries are somewhere in it,
    // is what makes a future addition a deliberate edit to this line instead
    // of a host that slipped in unremarked.
    //
    // api.open-meteo.com is the dashboard weather card. It is read-only and
    // unauthenticated, and receives a latitude and a longitude and nothing
    // else — see src/weather.js and the note in netlify.toml.
    const connect = directives(headerCsp).get("connect-src");
    expect(new Set(connect.split(/\s+/).filter(Boolean))).toEqual(new Set([
      "'self'",
      "https://*.supabase.co",
      "wss://*.supabase.co",
      "https://api.open-meteo.com",
    ]));
  });

  it("keeps scripts same-origin — every vendor library is self-hosted", () => {
    expect(directives(headerCsp).get("script-src")).toBe("'self'");
    expect(directives(headerCsp).get("object-src")).toBe("'none'");
  });
});

describe("the remaining hardening headers are present", () => {
  it("sends nosniff", () => {
    expect(header("X-Content-Type-Options")).toBe("nosniff");
  });

  it("does not leak the route hash to other origins", () => {
    expect(header("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
  });

  it("denies device permissions the portal never asks for", () => {
    const pp = header("Permissions-Policy") || "";
    for (const feature of ["camera", "microphone", "geolocation"]) {
      expect(pp).toContain(`${feature}=()`);
    }
  });

  it("pins HTTPS for a year without submitting to the preload list", () => {
    const hsts = header("Strict-Transport-Security") || "";
    expect(hsts).toMatch(/max-age=31536000/);
    expect(hsts).not.toContain("preload");
  });
});

describe("Cloudflare Pages is served the same policy as Netlify", () => {
  // Netlify reads netlify.toml from the repo root. Cloudflare Pages reads a
  // `_headers` file from the root of the PUBLISHED directory, which build.js
  // copies in. Shipping both means changing host is a DNS change rather than a
  // code change — but only while the two say the same thing.

  const SHARED = [
    "Content-Security-Policy",
    "X-Frame-Options",
    "X-Content-Type-Options",
    "Referrer-Policy",
    "Permissions-Policy",
    "Strict-Transport-Security",
  ];

  it("applies its rules to every path", () => {
    expect(pages).toMatch(/^\/\*\s*$/m);
  });

  it("carries every header netlify.toml does, with identical values", () => {
    for (const name of SHARED) {
      expect(`${name}: ${pagesHeader(name)}`).toBe(`${name}: ${header(name)}`);
    }
  });

  it("agrees with the meta policy on every shared CSP directive", () => {
    const p = directives(pagesHeader("Content-Security-Policy"));
    const m = directives(metaCsp);
    for (const [name, value] of m) {
      if (p.has(name)) expect(`${name}: ${p.get(name)}`).toBe(`${name}: ${value}`);
    }
  });

  it("sends frame-ancestors as a real header here too", () => {
    // The defect the Netlify file was added for: a meta tag cannot do this.
    expect(directives(pagesHeader("Content-Security-Policy")).get("frame-ancestors")).toBe("'self'");
  });

  it("allows the same connect-src origins and nothing else", () => {
    const connect = directives(pagesHeader("Content-Security-Policy")).get("connect-src");
    expect(new Set(connect.split(/\s+/).filter(Boolean))).toEqual(new Set([
      "'self'",
      "https://*.supabase.co",
      "wss://*.supabase.co",
      "https://api.open-meteo.com",
    ]));
  });

  it("ships in the published output, or Cloudflare never sees it", () => {
    // The whole file is inert unless build.js copies it next to index.html.
    const build = readFileSync(join(ROOT, "build.js"), "utf8");
    expect(build).toMatch(/"_headers"/);
  });
});
