import { describe, test, expect } from "vitest";
import { formatLeaveEvent, formatOvertimeEvent } from "../src/slackNotify.js";

const leave = (over = {}) => ({
  empName: "Amarnath",
  type: "Annual Leave",
  startDate: "2026-07-10",
  endDate: "2026-07-14",
  days: 5,
  status: "pending",
  ...over,
});

const ot = (over = {}) => ({
  empName: "Amarnath",
  hours: 3,
  workDate: "2026-07-10",
  status: "pending",
  ...over,
});

describe("formatLeaveEvent", () => {
  test("submitted → info with request details", () => {
    const m = formatLeaveEvent("submitted", leave());
    expect(m.level).toBe("info");
    expect(m.title).toBe("New leave request");
    expect(m.text).toContain("Amarnath");
    expect(m.text).toContain("Annual Leave");
    expect(m.text).toContain("5d");
    expect(m.text).toContain("2026-07-10");
    expect(m.text).toContain("2026-07-14");
  });

  test("approved → success", () => {
    const m = formatLeaveEvent("approved", leave({ status: "approved" }));
    expect(m.level).toBe("success");
    expect(m.title).toBe("Leave approved");
    expect(m.text).toContain("Amarnath");
    expect(m.text).toContain("approved");
  });

  test("rejected → warn", () => {
    const m = formatLeaveEvent("rejected", leave({ status: "rejected" }));
    expect(m.level).toBe("warn");
    expect(m.title).toBe("Leave rejected");
    expect(m.text).toContain("Amarnath");
    expect(m.text).toContain("rejected");
  });

  test("unknown kind defaults to submitted/info", () => {
    expect(formatLeaveEvent("whatever", leave()).level).toBe("info");
  });

  test("missing optional fields do not throw", () => {
    expect(() => formatLeaveEvent("submitted", {})).not.toThrow();
    const m = formatLeaveEvent("submitted", {});
    expect(m.level).toBe("info");
    expect(typeof m.text).toBe("string");
  });

  test("called with no record argument does not throw", () => {
    expect(() => formatLeaveEvent("approved")).not.toThrow();
  });
});

describe("formatOvertimeEvent", () => {
  test("submitted → info with hours and date", () => {
    const m = formatOvertimeEvent("submitted", ot());
    expect(m.level).toBe("info");
    expect(m.title).toBe("New overtime request");
    expect(m.text).toContain("Amarnath");
    expect(m.text).toContain("3h");
    expect(m.text).toContain("2026-07-10");
  });

  test("approved → success", () => {
    const m = formatOvertimeEvent("approved", ot({ status: "approved" }));
    expect(m.level).toBe("success");
    expect(m.title).toBe("Overtime approved");
    expect(m.text).toContain("Amarnath");
    expect(m.text).toContain("approved");
  });

  test("rejected → warn", () => {
    const m = formatOvertimeEvent("rejected", ot({ status: "rejected" }));
    expect(m.level).toBe("warn");
    expect(m.title).toBe("Overtime rejected");
    expect(m.text).toContain("Amarnath");
    expect(m.text).toContain("rejected");
  });

  test("missing optional fields do not throw", () => {
    expect(() => formatOvertimeEvent("submitted", {})).not.toThrow();
    expect(() => formatOvertimeEvent("approved")).not.toThrow();
    const m = formatOvertimeEvent("submitted", {});
    expect(m.level).toBe("info");
    expect(typeof m.text).toBe("string");
  });
});
