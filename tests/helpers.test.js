import { describe, test, expect } from "vitest";
import { parseCSV, nextEmpId, cH, certSt, fmtDt, daysInRange } from "../src/helpers.js";

const DAY = 864e5;
const iso = (offsetDays) => new Date(Date.now() + offsetDays * DAY).toISOString();

describe("parseCSV", () => {
  test("detects a header row and lowercases the columns", () => {
    const out = parseCSV("Email,Name\na@x.ae,Bob");

    expect(out.columns).toEqual(["email", "name"]);
    expect(out.rows).toEqual([["a@x.ae", "Bob"]]);
  });

  test("assumes default columns when no header row is present", () => {
    const out = parseCSV("a@x.ae,Bob,AGL 12hrs,Technician,employee,T1");

    expect(out.columns).toEqual(["email", "name", "section", "designation", "role", "tier"]);
    expect(out.rows).toHaveLength(1);
  });

  test("keeps commas inside quoted fields and unescapes doubled quotes", () => {
    const out = parseCSV('email,name\na@x.ae,"Smith, ""JJ"" John"');

    expect(out.rows[0]).toEqual(["a@x.ae", 'Smith, "JJ" John']);
  });

  test("switches to tab separator when the text contains tabs", () => {
    const out = parseCSV("email\tname\na@x.ae\tBob");

    expect(out.columns).toEqual(["email", "name"]);
    expect(out.rows[0]).toEqual(["a@x.ae", "Bob"]);
  });

  test("returns empty structure for empty input", () => {
    expect(parseCSV("")).toEqual({ columns: [], rows: [] });
  });
});

describe("nextEmpId", () => {
  test("starts at 001 for each role prefix", () => {
    expect(nextEmpId([], "employee")).toBe("EMP-001");
    expect(nextEmpId([], "teamlead")).toBe("TL-001");
    expect(nextEmpId([], "manager")).toBe("MGR-001");
  });

  test("increments past the highest existing id of that prefix only", () => {
    const employees = [{ id: "EMP-007" }, { id: "EMP-002" }, { id: "TL-009" }];

    expect(nextEmpId(employees, "employee")).toBe("EMP-008");
  });

  test("ignores malformed ids", () => {
    expect(nextEmpId([{ id: "EMP-x" }, { id: null }], "employee")).toBe("EMP-001");
  });
});

describe("cH (roster hour counting)", () => {
  test("uses 12h morning and night shifts for AGL 12hrs", () => {
    const roster = [{ code: "M" }, { code: "N" }, { code: "O" }, { code: "L" }];

    const out = cH(roster, "AGL 12hrs");

    expect(out).toEqual({ sc: 24, w: 24, mc: 1, nc: 1, oc: 1, lc: 1 });
  });

  test("falls back to 8h shifts for unknown sections", () => {
    const out = cH([{ code: "M" }, { code: "M" }], "Unknown Section");

    expect(out.sc).toBe(16);
    expect(out.mc).toBe(2);
  });

  test("handles a missing roster", () => {
    expect(cH(undefined, "AGL 8hrs")).toEqual({ sc: 0, w: 0, mc: 0, nc: 0, oc: 0, lc: 0 });
  });
});

describe("certSt (certificate expiry status)", () => {
  test("returns EXPIRED for past dates", () => {
    expect(certSt(iso(-5)).l).toBe("EXPIRED");
  });

  test("returns EXPIRING within the 90-day window", () => {
    expect(certSt(iso(30)).l).toBe("EXPIRING");
  });

  test("returns VALID beyond 90 days", () => {
    expect(certSt(iso(200)).l).toBe("VALID");
  });

  test("returns a dash placeholder when no expiry is set", () => {
    expect(certSt(null).l).toBe("—");
  });
});

describe("fmtDt (relative date formatting)", () => {
  test("formats minutes ago within the last hour", () => {
    expect(fmtDt(new Date(Date.now() - 30 * 60e3).toISOString())).toBe("30m ago");
  });

  test("formats hours ago within the last day", () => {
    expect(fmtDt(new Date(Date.now() - 5 * 36e5).toISOString())).toBe("5h ago");
  });

  test("formats yesterday between 24h and 48h", () => {
    expect(fmtDt(new Date(Date.now() - 30 * 36e5).toISOString())).toBe("Yesterday");
  });

  test("returns empty string for missing input", () => {
    expect(fmtDt(null)).toBe("");
  });
});

describe("daysInRange", () => {
  test("returns every date in the range inclusive of both ends", () => {
    expect(daysInRange("2026-01-30", "2026-02-02")).toEqual([
      "2026-01-30",
      "2026-01-31",
      "2026-02-01",
      "2026-02-02",
    ]);
  });

  test("returns a single day when start equals end", () => {
    expect(daysInRange("2026-07-11", "2026-07-11")).toEqual(["2026-07-11"]);
  });
});
