// Render tests for the Magic UI ports in src/components/magic.jsx.
//
// Motion here is decoration only, so what is pinned is the static contract:
// every component's FIRST render already carries the real content. That is
// what react-dom/server sees, what a reduced-motion user sees, and what is on
// screen if an effect never runs. Same harness as requestPages.test.jsx: the
// real `react` dependency, exposed as the UMD-style global the bundle uses.
import { describe, test, expect } from "vitest";

globalThis.React = (await import("react")).default;
const { renderToStaticMarkup } = await import("react-dom/server");
const { NumberTicker, BlurFade, BorderBeam, MagicCard, ShimmerButton, DotPattern, formatTicker, decimalsOf } =
  await import("../src/components/magic.jsx");
const { SC2 } = await import("../src/uiPrimitives.jsx");
const { Tile } = await import("../src/components/charts.jsx");

const html = el => renderToStaticMarkup(el);

describe("NumberTicker", () => {
  test("renders the final value, not the start value", () => {
    const out = html(<NumberTicker value={42} />);
    expect(out).toContain(">42<");
    expect(out).not.toContain(">0<");
  });

  test("screen readers get one copy of the value; the animated digits are hidden", () => {
    const out = html(<NumberTicker value={1234} />);
    expect(out.match(/1,234/g)).toHaveLength(2);
    expect(out).toContain('aria-hidden="true"');
  });

  test("non-numeric values pass through untouched", () => {
    expect(html(<NumberTicker value="12h" />)).toBe("<span>12h</span>");
    expect(html(<NumberTicker value={NaN} />)).toBe("<span>NaN</span>");
  });

  test("zero is shown as-is (nothing to count up to)", () => {
    expect(html(<NumberTicker value={0} />)).toBe("<span>0</span>");
  });

  test("formats whole numbers with thousands separators", () => {
    expect(formatTicker(1500)).toBe("1,500");
  });

  // Approved overtime is a sum of hours such as 3.5. Rounding it to 4 would
  // misreport the hours on the Overtime page.
  test("fractional stats keep their decimals", () => {
    expect(html(<NumberTicker value={3.5} />)).toContain(">3.5<");
    expect(html(<NumberTicker value={7.25} />)).toContain(">7.25<");
    expect(html(<NumberTicker value={3.5} />)).not.toContain(">4<");
  });

  test("decimal places follow the value, capped at 2", () => {
    expect(decimalsOf(12)).toBe(0);
    expect(decimalsOf(3.5)).toBe(1);
    expect(decimalsOf(0.1 + 0.2)).toBe(2);
    expect(formatTicker(0, 1)).toBe("0.0");
  });

  test("the screen-reader copy is excluded from text selection", () => {
    expect(html(<NumberTicker value={14} />)).toContain("user-select:none");
  });
});

describe("ShimmerButton", () => {
  test("defaults to type=button, like Bt, so it never submits a form by accident", () => {
    expect(html(<ShimmerButton>Go</ShimmerButton>)).toContain('type="button"');
  });

  test("passes type, disabled and aria props through to the real button", () => {
    const out = html(<ShimmerButton type="submit" disabled aria-label="Sign in">Sign In</ShimmerButton>);
    expect(out).toMatch(/^<button[^>]*type="submit"/);
    expect(out).toContain("disabled");
    expect(out).toContain('aria-label="Sign in"');
    expect(out).toContain("Sign In");
  });
});

describe("decorative layers stay out of the accessibility tree", () => {
  test("BorderBeam, DotPattern and the MagicCard spotlight are aria-hidden", () => {
    expect(html(<BorderBeam size={50} duration={6} colorFrom="#fff" colorTo="#000" />)).toMatch(/^<div aria-hidden="true"/);
    expect(html(<DotPattern spacing={16} radius={1} color="#fff" />)).toMatch(/^<svg aria-hidden="true"/);
    expect(html(<MagicCard background="#000">x</MagicCard>)).toContain('class="mu-magic-spot" aria-hidden="true"');
  });

  test("DotPattern's pattern id is a valid url(#…) reference", () => {
    const out = html(<DotPattern spacing={16} radius={1} color="#fff" />);
    const id = out.match(/<pattern id="([^"]+)"/)[1];
    expect(id).not.toContain(":");
    expect(out).toContain(`url(#${id})`);
  });
});

describe("content survives the wrappers", () => {
  test("BlurFade renders its children and carries its timing as custom properties", () => {
    const out = html(<BlurFade delay={0.1}><p>hello</p></BlurFade>);
    expect(out).toContain("<p>hello</p>");
    expect(out).toContain("--mu-bf-delay:0.14s");
  });

  test("a translucent SC2 fill is laid over the opaque page colour", () => {
    const sc = html(<SC2 label="Total" value={1} color="#38bdf8" />);
    expect(sc).toContain("rgba(255,255,255,0.04)");
    expect(sc).toContain("linear-gradient(#0b1a2b, #0b1a2b) padding-box");
  });

  test("SC2 and Tile still show label, value and sub", () => {
    const sc = html(<SC2 label="Expiring" value={3} color="#f5a623" sub="next 90 days" />);
    expect(sc).toContain("Expiring");
    expect(sc).toContain(">3<");
    expect(sc).toContain("next 90 days");
    const tile = html(<Tile bg="#b9a8f2" label="Approvals" value={5} sub="awaiting your review" />);
    expect(tile).toContain("Approvals");
    expect(tile).toContain(">5<");
    expect(tile).toContain("awaiting your review");
  });
});
