// @vitest-environment happy-dom
//
// NumberTicker's behaviour after mount: the parts magic.test.jsx cannot reach,
// because react-dom/server never runs effects. Every write to the visible
// digits' text node is recorded, so a frame that flashes the final value
// early, or a count that restarts from 0, shows up in the log.
//
// IntersectionObserver and requestAnimationFrame are replaced by fakes the
// test drives by hand: scrolling into view and each frame happen exactly when
// the test says so.
import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";

globalThis.React = (await import("react")).default;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { createRoot } = await import("react-dom/client");
const { act } = await import("react-dom/test-utils");
const { NumberTicker } = await import("../src/components/magic.jsx");

let observers, frames, root, host;

class FakeIO {
  constructor(cb) { this.cb = cb; this.live = true; observers.push(this); }
  observe() {}
  disconnect() { this.live = false; }
}
const scrollIntoView = () => act(() => {
  observers.filter(o => o.live).forEach(o => o.cb([{ isIntersecting: true }]));
});
const frameAt = ms => act(() => {
  const due = frames.splice(0);
  due.forEach(f => f(ms));
});

const digits = () => host.querySelector('[aria-hidden="true"]');
const srCopy = () => host.querySelector('[aria-hidden="true"] + span').textContent;

// Log every value written to the visible digits, by React or by the count.
function recordWrites() {
  const text = digits().firstChild;
  let proto = Object.getPrototypeOf(text);
  while (!Object.getOwnPropertyDescriptor(proto, "nodeValue")) proto = Object.getPrototypeOf(proto);
  const desc = Object.getOwnPropertyDescriptor(proto, "nodeValue");
  const log = [];
  Object.defineProperty(text, "nodeValue", {
    configurable: true,
    get() { return desc.get.call(this); },
    set(v) { log.push(v); desc.set.call(this, v); },
  });
  return log;
}

const render = value => act(() => root.render(<NumberTicker value={value} />));

beforeEach(() => {
  observers = [];
  frames = [];
  vi.stubGlobal("IntersectionObserver", FakeIO);
  vi.stubGlobal("requestAnimationFrame", f => frames.push(f));
  vi.stubGlobal("cancelAnimationFrame", () => { frames.length = 0; });
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  vi.spyOn(performance, "now").mockReturnValue(0);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("NumberTicker in the browser", () => {
  test("waits at 0 until it is scrolled into view, then counts up to the value", () => {
    render(42);
    expect(digits().textContent).toBe("0");
    expect(srCopy()).toBe("42"); // screen readers get the real value throughout

    scrollIntoView();
    frameAt(600);
    const mid = Number(digits().textContent);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(42);

    frameAt(1200);
    expect(digits().textContent).toBe("42");
    expect(frames).toHaveLength(0); // the count has stopped
  });

  test("a value that changes before the first view still starts from 0", () => {
    render(42);
    const log = recordWrites();
    render(50);
    expect(digits().textContent).toBe("0");
    expect(log.at(-1)).toBe("0");

    scrollIntoView();
    frameAt(1200);
    expect(digits().textContent).toBe("50");
  });

  test("after the first count, a new value shows directly: no restart, no flash of 0", () => {
    render(42);
    scrollIntoView();
    frameAt(1200);

    const log = recordWrites();
    const observersBefore = observers.length;
    render(42.5); // also changes the decimal places, which re-runs the layout effect
    expect(digits().textContent).toBe("42.5");
    expect(log).not.toContain("0");
    expect(log).not.toContain("0.0");
    expect(observers).toHaveLength(observersBefore); // nothing waiting to count again
    expect(frames).toHaveLength(0);
  });
});
