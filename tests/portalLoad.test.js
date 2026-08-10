import { describe, it, expect } from "vitest";
import {
  classifyPortalLoad,
  findEmployeeByEmail,
  degradedTables,
  degradedMessage,
  notRegisteredMessage,
  LOAD_FAILED_MESSAGE,
} from "../src/portalLoad.js";

const ROSTER = [
  { id: "ADB-001", email: "amarnath.munderi@adbsafegate.com", name: "Amarnath" },
  { id: "ADB-3001", email: "ragesh.menon@adbsafegate.com", name: "Ragesh" },
];

const ok = data => ({ data, error: null });
const failed = msg => ({ data: null, error: { message: msg } });

describe("findEmployeeByEmail", () => {
  it("matches regardless of case", () => {
    expect(findEmployeeByEmail(ROSTER, "AMARNATH.MUNDERI@ADBSAFEGATE.COM")?.id).toBe("ADB-001");
  });

  it("tolerates surrounding whitespace on either side", () => {
    expect(findEmployeeByEmail(ROSTER, "  ragesh.menon@adbsafegate.com  ")?.id).toBe("ADB-3001");
    expect(findEmployeeByEmail(
      [{ id: "X", email: " spaced@adbsafegate.com " }], "spaced@adbsafegate.com",
    )?.id).toBe("X");
  });

  it("returns null rather than a stray match for an empty address", () => {
    expect(findEmployeeByEmail(ROSTER, "")).toBeNull();
    expect(findEmployeeByEmail(ROSTER, null)).toBeNull();
    expect(findEmployeeByEmail([{ id: "X" }], "")).toBeNull();
  });
});

describe("classifyPortalLoad — a failed read is never a verdict on the user", () => {
  // The defect: a failed select returns no rows, no rows meant "no employee
  // record", and the whole team was told they were not registered and signed
  // out. Each of these inputs used to reach that message.

  it("reports a load failure when the employees select errored", () => {
    const v = classifyPortalLoad({
      employeesResult: failed("JWT expired"),
      authEmail: "amarnath.munderi@adbsafegate.com",
    });
    expect(v.status).toBe("load-failed");
    expect(v.message).toBe(LOAD_FAILED_MESSAGE);
    expect(v.me).toBeNull();
  });

  it("reports a load failure when the roster came back empty", () => {
    // RLS filtering everything away is a system fault: a signed-in user
    // implies at least their own row exists.
    const v = classifyPortalLoad({
      employeesResult: ok([]),
      authEmail: "amarnath.munderi@adbsafegate.com",
    });
    expect(v.status).toBe("load-failed");
  });

  it("reports a load failure when data is absent without an error", () => {
    for (const bad of [undefined, null, {}, { data: null, error: null }, { data: "nope", error: null }]) {
      const v = classifyPortalLoad({
        employeesResult: bad,
        authEmail: "amarnath.munderi@adbsafegate.com",
      });
      expect(v.status).toBe("load-failed");
    }
  });

  it("never blames the user's account in the load-failure message", () => {
    expect(LOAD_FAILED_MESSAGE).not.toMatch(/not registered|contact your admin/i);
    expect(LOAD_FAILED_MESSAGE).toMatch(/not a problem with your account/i);
  });
});

describe("classifyPortalLoad — the genuine cases still work", () => {
  it("returns the employee when the roster loaded and contains them", () => {
    const v = classifyPortalLoad({
      employeesResult: ok(ROSTER),
      authEmail: "Ragesh.Menon@adbsafegate.com",
    });
    expect(v.status).toBe("ok");
    expect(v.me.id).toBe("ADB-3001");
    expect(v.message).toBe("");
  });

  it("still says not-registered when the roster genuinely lacks the address", () => {
    const v = classifyPortalLoad({
      employeesResult: ok(ROSTER),
      authEmail: "stranger@example.com",
    });
    expect(v.status).toBe("not-registered");
    expect(v.message).toBe(notRegisteredMessage("stranger@example.com"));
    expect(v.message).toMatch(/contact your admin/i);
  });
});

describe("partial loads are surfaced rather than shown as empty pages", () => {
  it("names only the tables that actually failed", () => {
    expect(degradedTables({
      leave: failed("timeout"),
      overtime: ok([]),
      announcements: ok([]),
      notifications: failed("timeout"),
    })).toEqual(["leave requests", "notifications"]);
  });

  it("is empty when everything arrived, and when nothing was passed", () => {
    expect(degradedTables({ leave: ok([]), overtime: ok([]) })).toEqual([]);
    expect(degradedTables(undefined)).toEqual([]);
  });

  it("a partial load still opens the portal", () => {
    const v = classifyPortalLoad({
      employeesResult: ok(ROSTER),
      authEmail: "amarnath.munderi@adbsafegate.com",
      secondary: { leave: failed("timeout") },
    });
    expect(v.status).toBe("ok");
    expect(v.degraded).toEqual(["leave requests"]);
  });

  it("reads as a sentence for one, two and three failures", () => {
    expect(degradedMessage([])).toBe("");
    expect(degradedMessage(["leave requests"])).toMatch(/\(leave requests\)/);
    expect(degradedMessage(["leave requests", "notifications"]))
      .toMatch(/\(leave requests and notifications\)/);
    expect(degradedMessage(["a", "b", "c"])).toMatch(/\(a, b and c\)/);
  });
});
