import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  fingerprint, reportError, setRoute, installErrorReporting, resetReporter,
} from "../src/errorReporter.js";

/** Supabase double capturing every insert. */
function fakeClient(rows = [], { error = null } = {}) {
  return {
    rows,
    from(table) {
      return {
        insert(row) {
          rows.push({ table, row });
          return Promise.resolve({ error });
        },
      };
    },
  };
}

let consoleError, consoleWarn;

beforeEach(() => {
  resetReporter();
  consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  consoleError.mockRestore();
  consoleWarn.mockRestore();
  resetReporter();
});

describe("fingerprinting a fault", () => {
  it("gives the same id to the same fault", () => {
    const a = fingerprint("error", "boom", "Error\n    at f (http://x/app.js:1:2)");
    const b = fingerprint("error", "boom", "Error\n    at f (http://x/app.js:1:2)");
    expect(a).toBe(b);
  });

  it("survives a redeploy, where line numbers and the origin move", () => {
    // Otherwise every deploy looks like a brand new fault and the count that
    // tells you how bad it is resets to one.
    const a = fingerprint("error", "boom", "Error\n    at f (https://portal.test/app.js:1:2)");
    const b = fingerprint("error", "boom", "Error\n    at f (https://other.test/app.js:900:41)");
    expect(a).toBe(b);
  });

  it("separates two faults that share a generic message", () => {
    // "Cannot read properties of undefined" is the message for a hundred
    // different bugs; the top frame is what tells them apart.
    const a = fingerprint("error", "Cannot read properties of undefined", "at renderLeave");
    const b = fingerprint("error", "Cannot read properties of undefined", "at renderTeam");
    expect(a).not.toBe(b);
  });

  it("separates faults by kind", () => {
    expect(fingerprint("error", "boom", "at f")).not.toBe(fingerprint("render", "boom", "at f"));
  });

  it("produces a short stable hex id whatever the input", () => {
    for (const args of [["error", "", ""], ["error", "x".repeat(5000), null], ["render", "a", undefined]]) {
      expect(fingerprint(...args)).toMatch(/^[0-9a-f]{8}$/);
    }
  });
});

describe("filing a report", () => {
  it("writes to client_errors", () => {
    const rows = [];
    installErrorReporting(fakeClient(rows));
    reportError({ kind: "render", message: "boom", stack: "at f", component: "LeavePage" });
    expect(rows).toHaveLength(1);
    expect(rows[0].table).toBe("client_errors");
    expect(rows[0].row).toMatchObject({
      kind: "render", message: "boom", component: "LeavePage",
    });
  });

  it("never sends the reporter's identity — the database stamps it", () => {
    // Sending it would be both redundant and forgeable: a client misbehaving
    // enough to report an error is not one whose account claims to believe.
    const rows = [];
    installErrorReporting(fakeClient(rows));
    reportError({ kind: "error", message: "boom" });
    expect(rows[0].row).not.toHaveProperty("emp_id");
    expect(rows[0].row).not.toHaveProperty("email");
    expect(rows[0].row).not.toHaveProperty("role");
  });

  it("records the app's nav key, never a URL", () => {
    // The URL hash carries employee ids.
    const rows = [];
    installErrorReporting(fakeClient(rows));
    setRoute("approvals");
    reportError({ kind: "error", message: "boom" });
    expect(rows[0].row.route).toBe("approvals");
  });

  it("strips email addresses out of messages and stacks", () => {
    const rows = [];
    installErrorReporting(fakeClient(rows));
    reportError({
      kind: "error",
      message: "failed for nisar.ahmed@adbsafegate.com",
      stack: "at load (bv4haris@gmail.com)",
    });
    expect(rows[0].row.message).toBe("failed for [email]");
    expect(rows[0].row.stack).toContain("[email]");
    expect(JSON.stringify(rows[0].row)).not.toContain("@adbsafegate.com");
  });

  it("falls back to a known kind rather than writing one the CHECK refuses", () => {
    const rows = [];
    installErrorReporting(fakeClient(rows));
    reportError({ kind: "nonsense", message: "boom" });
    expect(rows[0].row.kind).toBe("error");
  });

  it("always leaves a console trace, even with no client attached", () => {
    reportError({ kind: "error", message: "boom" });
    expect(consoleError).toHaveBeenCalled();
  });
});

describe("volume control", () => {
  it("reports one fault once per page load", () => {
    const rows = [];
    installErrorReporting(fakeClient(rows));
    for (let i = 0; i < 50; i++) {
      reportError({ kind: "error", message: "same", stack: "at f" });
    }
    expect(rows).toHaveLength(1);
  });

  it("still reports genuinely different faults", () => {
    const rows = [];
    installErrorReporting(fakeClient(rows));
    reportError({ kind: "error", message: "one", stack: "at a" });
    reportError({ kind: "error", message: "two", stack: "at b" });
    expect(rows).toHaveLength(2);
  });

  it("caps the total for one page load", () => {
    const rows = [];
    installErrorReporting(fakeClient(rows));
    for (let i = 0; i < 100; i++) {
      reportError({ kind: "error", message: `distinct ${i}`, stack: `at f${i}` });
    }
    expect(rows.length).toBeLessThanOrEqual(20);
  });
});

describe("reporting can never make a fault worse", () => {
  it("does not throw when the insert rejects", () => {
    const throwing = { from() { return { insert() { throw new Error("network"); } }; } };
    installErrorReporting(throwing);
    expect(() => reportError({ kind: "error", message: "boom" })).not.toThrow();
  });

  it("does not throw when the insert returns an error", async () => {
    installErrorReporting(fakeClient([], { error: { message: "RLS refused" } }));
    expect(() => reportError({ kind: "error", message: "boom" })).not.toThrow();
    await Promise.resolve();
  });

  it("does not throw when the client is missing entirely", () => {
    installErrorReporting(null);
    expect(() => reportError({ kind: "error", message: "boom" })).not.toThrow();
  });

  it("does not throw on a malformed report", () => {
    installErrorReporting(fakeClient());
    for (const bad of [null, undefined, {}, { message: null }, { stack: 42 }]) {
      expect(() => reportError(bad)).not.toThrow();
    }
  });

  it("returns a promise the caller is never made to await", () => {
    installErrorReporting(fakeClient());
    expect(reportError({ kind: "error", message: "boom" })).toBeUndefined();
  });
});

describe("global handlers", () => {
  /** Minimal EventTarget double. */
  function fakeTarget() {
    const listeners = {};
    return {
      listeners,
      addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
      removeEventListener(type, fn) {
        listeners[type] = (listeners[type] || []).filter(f => f !== fn);
      },
      emit(type, event) { (listeners[type] || []).forEach(f => f(event)); },
    };
  }

  it("catches uncaught exceptions", () => {
    const rows = [];
    const target = fakeTarget();
    installErrorReporting(fakeClient(rows), { target });
    target.emit("error", { message: "kaboom", error: { stack: "at f" } });
    expect(rows).toHaveLength(1);
    expect(rows[0].row).toMatchObject({ kind: "error", message: "kaboom" });
  });

  it("catches unhandled promise rejections", () => {
    const rows = [];
    const target = fakeTarget();
    installErrorReporting(fakeClient(rows), { target });
    target.emit("unhandledrejection", { reason: new Error("no such table") });
    expect(rows).toHaveLength(1);
    expect(rows[0].row).toMatchObject({
      kind: "unhandled_rejection", message: "no such table",
    });
  });

  it("copes with a rejection whose reason is not an Error", () => {
    const rows = [];
    const target = fakeTarget();
    installErrorReporting(fakeClient(rows), { target });
    expect(() => target.emit("unhandledrejection", { reason: "just a string" })).not.toThrow();
    expect(rows[0].row.message).toBe("just a string");
  });

  it("detaches cleanly", () => {
    const target = fakeTarget();
    const teardown = installErrorReporting(fakeClient(), { target });
    teardown();
    expect(target.listeners.error).toEqual([]);
    expect(target.listeners.unhandledrejection).toEqual([]);
  });

  it("installs only once, so a re-render does not double-report", () => {
    const rows = [];
    const target = fakeTarget();
    installErrorReporting(fakeClient(rows), { target });
    installErrorReporting(fakeClient(rows), { target });
    expect(target.listeners.error).toHaveLength(1);
  });

  it("is a no-op without a target, so it is safe outside a browser", () => {
    expect(() => installErrorReporting(fakeClient(), { target: null })).not.toThrow();
  });
});
