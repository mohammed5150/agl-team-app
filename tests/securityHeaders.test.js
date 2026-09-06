import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// The browser is the boundary these headers defend, and the host only sends
// them if _headers says so (Cloudflare Pages and Netlify both read that file
// from the publish directory). These assertions pin the guarantees, so an
// edit that drops one fails the suite instead of quietly shipping the hole
// back — the same reason tests/onboardingMigration.test.js pins the SQL.

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const headersFile = readFileSync(join(ROOT, "_headers"), "utf8");
const html = readFileSync(join(ROOT, "index.html"), "utf8");

/** Value of a header from the _headers /* rule ("  Name: value" lines). */
function header(name) {
  const m = headersFile.match(new RegExp(`^\\s+${name}:\\s*(.*)$`, "m"));
  return m ? m[1].trim() : null;
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

describe("_headers applies headers to every response", () => {
  it("declares a rule scoped to /*", () => {
    // The rule line itself is unindented; header lines under it are indented.
    expect(headersFile).toMatch(/^\/\*$/m);
  });

  it("ships inside the publish directory", () => {
    // Both hosts read _headers from the deployed output, not the repo root,
    // so build.js must copy it into dist/ or no header is ever sent.
    const build = readFileSync(join(ROOT, "build.js"), "utf8");
    expect(build).toMatch(/"_headers"/);
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
    // else — see src/weather.js and the note in _headers.
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
