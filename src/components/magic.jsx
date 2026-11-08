/* ============================================================
   MAGIC UI EFFECTS
   ============================================================
   Ports of a few Magic UI components (https://magicui.design, MIT licence):
   NumberTicker, BlurFade, BorderBeam, MagicCard, ShimmerButton, DotPattern.

   The originals are Tailwind + `motion/react` components. This portal has
   neither: React is a UMD global (see CLAUDE.md, "React is not bundled") and
   every style is inline. So these are rewritten to the portal's own rules —
   no new dependencies, inline styles, and the keyframes plus the rules that
   need a selector live in index.html under "MAGIC UI", prefixed `mu-`. Only
   the props the portal actually uses are kept.

   Motion is decoration, never information. Every component shows its final
   state on the first render, and stands down under prefers-reduced-motion
   (index.html switches the CSS animations off; NumberTicker checks itself).
   ============================================================ */

import { theme } from "../constants.js";

const { useEffect, useLayoutEffect, useRef, useId } = React;

const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

// userSelect:none keeps this copy out of a text selection, so copying a stat
// gives "14", not "1414" (the visible digits are the other copy). Safari
// only honours the -webkit- form.
const srOnly = {
  position:"absolute", width:1, height:1, padding:0, margin:-1,
  overflow:"hidden", clip:"rect(0 0 0 0)", whiteSpace:"nowrap", border:0,
  userSelect:"none", WebkitUserSelect:"none"
};

// Decimal places a stat is shown with: as many as the value has, at most 2.
// Approved overtime is a sum of hours like 3.5, which must not read as 4.
export const decimalsOf = v =>
  Number.isInteger(v) ? 0 : Math.min(2, (String(v).split(".")[1] || "").length);

export const formatTicker = (n, decimals = 0) =>
  n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

/* NumberTicker — counts up from 0 to `value` the first time it scrolls into
   view; later changes (an approval, a realtime sync) just show the new value.
   Anything that is not a finite number (e.g. "12h") is rendered as-is.

   The animated digits are aria-hidden and the real value sits beside them,
   so a screen reader never announces the intermediate counts. The count
   writes to the nodeValue of the text node React rendered, never replacing
   it, so React's own updates to that text keep landing on screen. */
export function NumberTicker({ value }) {
  const ref = useRef(null);
  const played = useRef(false);
  const animate = typeof value === "number" && Number.isFinite(value) && value !== 0;
  const decimals = animate ? decimalsOf(value) : 0;

  // Before the first paint, wind the digits back to 0 so the final number
  // never flashes ahead of the count.
  useLayoutEffect(() => {
    if (animate && !played.current && !reducedMotion()) {
      ref.current.firstChild.nodeValue = formatTicker(0, decimals);
    }
  }, [animate, decimals]);

  useEffect(() => {
    if (!animate || reducedMotion()) return undefined;
    const text = ref.current.firstChild;
    if (played.current) {
      // Already counted once: a new value just shows. Written here as well as
      // by React, because a frame of an interrupted count may have landed
      // after React's commit.
      text.nodeValue = formatTicker(value, decimals);
      return undefined;
    }
    text.nodeValue = formatTicker(0, decimals); // value changed before the first view
    let raf = 0;
    const run = () => {
      played.current = true;
      const t0 = performance.now();
      const step = now => {
        const t = Math.min(1, (now - t0) / 1200);
        text.nodeValue = formatTicker(value * (1 - Math.pow(2, -10 * t)), decimals); // ease-out
        if (t < 1) raf = requestAnimationFrame(step);
        else text.nodeValue = formatTicker(value, decimals);
      };
      raf = requestAnimationFrame(step);
    };
    const io = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) { io.disconnect(); run(); }
    });
    io.observe(ref.current);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [animate, value, decimals]);

  if (!animate) return <span>{value}</span>;
  const final = formatTicker(value, decimals);
  return (
    <span style={{ position:"relative" }}>
      <span ref={ref} aria-hidden="true">{final}</span>
      <span style={srOnly}>{final}</span>
    </span>
  );
}

/* BlurFade — content arrives blurred and slightly raised, then settles.
   Pure CSS (.mu-blur-fade); `delay` staggers a column of cards. */
export const BlurFade = ({ children, delay = 0 }) => (
  <div className="mu-blur-fade" style={{ "--mu-bf-delay": `${0.04 + delay}s` }}>{children}</div>
);

/* BorderBeam — a short gradient travelling round the parent's border. The
   parent must be positioned and rounded; the beam inherits the radius. */
export const BorderBeam = ({ size, duration, colorFrom, colorTo, borderWidth = 1 }) => (
  <div aria-hidden="true" className="mu-beam-frame" style={{ "--mu-bw": `${borderWidth}px` }}>
    <div className="mu-beam" style={{
      "--mu-size": `${size}px`, "--mu-from": colorFrom, "--mu-to": colorTo, "--mu-dur": `${duration}s`,
    }} />
  </div>
);

/* MagicCard — a spotlight that follows the pointer, and a border that lights
   up around it. The pointer position goes straight into CSS custom
   properties, so moving the mouse never re-renders.

   The border glow is painted across the whole card, under the fill. So a
   translucent `background` (theme.card is 4% white) sits on an opaque `base`
   layer — the page colour it was designed against — and keeps the colour
   it always rendered as, instead of letting the glow show through. */
export function MagicCard({ children, background, base = theme.bg, borderColor, gradientSize = 200, gradientColor, gradientFrom, gradientTo, style = {}, onClick }) {
  const ref = useRef(null);
  // The card's position, read once per hover rather than on every
  // pointermove (each read forces a layout). A scroll while hovering moves
  // the card under the pointer, so it drops the cached value.
  const rect = useRef(null);
  const dropRect = useRef(() => { rect.current = null; }).current;
  useEffect(() => () => window.removeEventListener("scroll", dropRect, true), [dropRect]);

  const setPos = (x, y) => {
    ref.current.style.setProperty("--mu-mx", `${x}px`);
    ref.current.style.setProperty("--mu-my", `${y}px`);
  };
  const enter = () => {
    rect.current = null;
    window.addEventListener("scroll", dropRect, { capture:true, passive:true });
  };
  const move = e => {
    const r = rect.current || (rect.current = ref.current.getBoundingClientRect());
    setPos(e.clientX - r.left, e.clientY - r.top);
  };
  const leave = () => {
    window.removeEventListener("scroll", dropRect, true);
    setPos(-gradientSize, -gradientSize);
  };
  // Padding goes on the inner layer so its box matches the original card's
  // padding box — SC2's absolutely positioned corner icon lands where it did.
  const { padding, ...outerStyle } = style;
  return (
    <div
      ref={ref}
      className="mu-magic"
      onPointerEnter={enter}
      onPointerMove={move}
      onPointerLeave={leave}
      onClick={onClick}
      style={{
        "--mu-mx": `${-gradientSize}px`, "--mu-my": `${-gradientSize}px`,
        "--mu-gs": `${gradientSize}px`, "--mu-gc": gradientColor,
        position:"relative", isolation:"isolate", overflow:"hidden",
        border:"1px solid transparent",
        background:
          `linear-gradient(${background}, ${background}) padding-box, ` +
          `linear-gradient(${base}, ${base}) padding-box, ` +
          `radial-gradient(var(--mu-gs) circle at var(--mu-mx) var(--mu-my), ${gradientFrom}, ${gradientTo}, ${borderColor} 100%) border-box`,
        ...outerStyle,
      }}
    >
      <div className="mu-magic-spot" aria-hidden="true" />
      <div style={{ position:"relative", zIndex:1, flex:"1 1 auto", padding,
        display:"flex", flexDirection:"column", justifyContent:"inherit" }}>
        {children}
      </div>
    </div>
  );
}

/* ShimmerButton — a light sweeping round the edge of a real <button>.
   Other props (type, disabled, aria-*) pass straight through; `type`
   defaults to "button" for the same reason Bt's does (uiPrimitives.jsx). */
export const ShimmerButton = ({ children, background, shimmerColor, borderRadius, style, type = "button", ...props }) => (
  <button
    type={type}
    className="mu-shimmer"
    style={{ "--mu-bg": background, "--mu-shimmer-color": shimmerColor, "--mu-radius": borderRadius, ...style }}
    {...props}
  >
    <span className="mu-shimmer-sparks" aria-hidden="true">
      <span className="mu-shimmer-slide"><span className="mu-shimmer-spin" /></span>
    </span>
    <span style={{ position:"relative", zIndex:1 }}>{children}</span>
    <span className="mu-shimmer-highlight" aria-hidden="true" />
    <span className="mu-shimmer-backdrop" aria-hidden="true" />
  </button>
);

/* DotPattern — a dot grid filling its positioned parent, faded at the
   edges. One SVG <pattern>, so it costs the same at any screen size. */
export function DotPattern({ spacing, radius, color }) {
  const id = `mu-dots-${useId().replace(/:/g, "")}`;
  const mask = "radial-gradient(ellipse at center, #000 30%, transparent 75%)";
  return (
    <svg aria-hidden="true" focusable="false" style={{
      position:"absolute", inset:0, width:"100%", height:"100%", pointerEvents:"none",
      WebkitMaskImage: mask, maskImage: mask,
    }}>
      <defs>
        <pattern id={id} width={spacing} height={spacing} patternUnits="userSpaceOnUse">
          <circle cx={radius} cy={radius} r={radius} fill={color} />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  );
}
