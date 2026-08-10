import { describe, it, expect } from "vitest";
import {
  isValidDate, today, daysBetween, inclusiveDays, rangesOverlap,
  activeLeaveFor, findLeaveOverlaps, remainingBalance, validateLeaveRequest,
  activeOvertimeFor, claimedHoursOn, validateOvertimeRequest,
  canTransitionLeave, canTransitionOvertime,
  isValidLeaveStatus, isValidOvertimeStatus,
  isTerminalLeaveStatus, isTerminalOvertimeStatus,
  LEAVE_STATUSES, OVERTIME_STATUSES,
  MAX_LEAVE_DAYS, MAX_OT_HOURS, MAX_OT_HOURS_PER_DAY, MAX_OT_BACKDATE_DAYS,
} from "../src/validation.js";

// Fixed clock, so nothing here depends on when the suite runs.
const NOW = new Date("2026-08-10T09:00:00Z");
const T = "2026-08-10";

const EMP = {
  id: "EMP-001", name: "Amarnath",
  annualLeave: 30, usedAnnual: 4,
  sickLeave: 15, usedSick: 0,
  compOff: 2,
};

const leave = (over) => ({
  id: "LR-001", empId: "EMP-001", type: "Annual Leave",
  startDate: "2026-08-12", endDate: "2026-08-16", days: 5,
  reason: "Family", status: "pending", ...over,
});

const goodLeave = {
  type: "Annual Leave", startDate: "2026-09-01", endDate: "2026-09-05",
  days: 5, reason: "Family visit",
};

const goodOt = { workDate: "2026-08-09", hours: 4, reason: "Runway 13 lamp change" };

describe("date helpers", () => {
  it("accepts real dates and rejects impossible ones", () => {
    expect(isValidDate("2026-08-10")).toBe(true);
    expect(isValidDate("2026-02-29")).toBe(false); // 2026 is not a leap year
    expect(isValidDate("2026-13-01")).toBe(false);
    expect(isValidDate("2026-8-1")).toBe(false);
    expect(isValidDate("")).toBe(false);
    expect(isValidDate(null)).toBe(false);
  });

  it("counts whole days between dates", () => {
    expect(daysBetween("2026-08-10", "2026-08-12")).toBe(2);
    expect(daysBetween("2026-08-12", "2026-08-10")).toBe(-2);
  });

  it("counts an inclusive range the way the form does", () => {
    expect(inclusiveDays("2026-08-10", "2026-08-10")).toBe(1);
    expect(inclusiveDays("2026-08-10", "2026-08-14")).toBe(5);
  });

  it("spots overlapping ranges, touching at the edges", () => {
    expect(rangesOverlap("2026-08-01", "2026-08-05", "2026-08-05", "2026-08-09")).toBe(true);
    expect(rangesOverlap("2026-08-01", "2026-08-05", "2026-08-06", "2026-08-09")).toBe(false);
    // Full containment, both directions.
    expect(rangesOverlap("2026-08-01", "2026-08-30", "2026-08-10", "2026-08-11")).toBe(true);
    expect(rangesOverlap("2026-08-10", "2026-08-11", "2026-08-01", "2026-08-30")).toBe(true);
  });

  it("reports today in the same format the forms use", () => {
    expect(today(NOW)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("which existing leave occupies the calendar", () => {
  const requests = [
    leave({ id: "LR-001", status: "pending" }),
    leave({ id: "LR-002", status: "approved" }),
    leave({ id: "LR-003", status: "tl_approved" }),
    leave({ id: "LR-004", status: "rejected" }),
    leave({ id: "LR-005", status: "withdrawn" }),
    leave({ id: "LR-006", empId: "EMP-002" }),
  ];

  it("counts pending, tl_approved and approved, for this employee only", () => {
    const ids = activeLeaveFor(requests, "EMP-001").map(r => r.id);
    expect(ids).toEqual(["LR-001", "LR-002", "LR-003"]);
  });

  it("frees the dates once a request is rejected or withdrawn", () => {
    const ids = activeLeaveFor(requests, "EMP-001").map(r => r.id);
    expect(ids).not.toContain("LR-004");
    expect(ids).not.toContain("LR-005");
  });

  it("ignores the request being edited", () => {
    const ids = activeLeaveFor(requests, "EMP-001", "LR-001").map(r => r.id);
    expect(ids).toEqual(["LR-002", "LR-003"]);
  });
});

describe("a leave request cannot overlap another", () => {
  // The check the portal was missing entirely: two overlapping bookings
  // produce a roster that reports as correct and cannot be staffed.
  const existing = [leave({ id: "LR-001", startDate: "2026-08-12", endDate: "2026-08-16" })];

  it.each([
    ["identical",        "2026-08-12", "2026-08-16"],
    ["starting inside",  "2026-08-14", "2026-08-20"],
    ["ending inside",    "2026-08-08", "2026-08-13"],
    ["fully containing", "2026-08-01", "2026-08-30"],
    ["fully contained",  "2026-08-13", "2026-08-14"],
    ["touching start",   "2026-08-08", "2026-08-12"],
    ["touching end",     "2026-08-16", "2026-08-20"],
  ])("refuses a request %s an existing one", (_label, startDate, endDate) => {
    const r = validateLeaveRequest(
      { ...goodLeave, startDate, endDate, days: inclusiveDays(startDate, endDate) },
      { employee: EMP, requests: existing, now: NOW }
    );
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toContain("LR-001");
  });

  it.each([
    ["the day before", "2026-08-05", "2026-08-11"],
    ["the day after",  "2026-08-17", "2026-08-20"],
  ])("allows a request ending %s", (_label, startDate, endDate) => {
    const r = validateLeaveRequest(
      { ...goodLeave, startDate, endDate, days: inclusiveDays(startDate, endDate) },
      { employee: EMP, requests: existing, now: NOW }
    );
    expect(r.ok).toBe(true);
  });

  it("does not clash with another employee's leave", () => {
    const others = [leave({ id: "LR-009", empId: "EMP-002", startDate: "2026-09-01", endDate: "2026-09-05" })];
    const r = validateLeaveRequest(goodLeave, { employee: EMP, requests: others, now: NOW });
    expect(r.ok).toBe(true);
  });

  it("names the count when several clash", () => {
    const many = [
      leave({ id: "LR-001", startDate: "2026-09-01", endDate: "2026-09-02" }),
      leave({ id: "LR-002", startDate: "2026-09-04", endDate: "2026-09-05" }),
    ];
    const r = validateLeaveRequest(goodLeave, { employee: EMP, requests: many, now: NOW });
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/overlaps 2 existing requests/);
  });

  it("lets a request be edited without clashing with itself", () => {
    const self = [leave({ id: "LR-100", startDate: "2026-09-01", endDate: "2026-09-05" })];
    const r = validateLeaveRequest(goodLeave,
      { employee: EMP, requests: self, now: NOW, exceptId: "LR-100" });
    expect(r.ok).toBe(true);
  });

  it("exposes the clashing requests for the UI to name", () => {
    const clashes = findLeaveOverlaps(existing, "EMP-001", "2026-08-14", "2026-08-20");
    expect(clashes.map(c => c.id)).toEqual(["LR-001"]);
  });
});

describe("leave field validation", () => {
  it("accepts a well-formed request", () => {
    const r = validateLeaveRequest(goodLeave, { employee: EMP, requests: [], now: NOW });
    expect(r).toMatchObject({ ok: true, errors: [] });
  });

  it("requires a known leave type", () => {
    const r = validateLeaveRequest({ ...goodLeave, type: "Sabbatical" },
      { employee: EMP, now: NOW });
    expect(r.errors).toContain("Choose a leave type");
  });

  it("requires both dates", () => {
    expect(validateLeaveRequest({ ...goodLeave, endDate: "" }, { employee: EMP, now: NOW }).ok)
      .toBe(false);
  });

  it("refuses an end date before the start", () => {
    const r = validateLeaveRequest(
      { ...goodLeave, startDate: "2026-09-05", endDate: "2026-09-01" },
      { employee: EMP, now: NOW });
    expect(r.errors).toContain("The end date cannot be before the start date");
  });

  it("refuses a day count that disagrees with the dates", () => {
    // `days` drives the balance arithmetic downstream, so a mismatch is not
    // cosmetic.
    const r = validateLeaveRequest({ ...goodLeave, days: 99 }, { employee: EMP, now: NOW });
    expect(r.errors).toContain("The number of days does not match the dates");
  });

  it("caps the span of one request", () => {
    const start = "2026-09-01";
    const end = "2027-01-01";
    const r = validateLeaveRequest(
      { ...goodLeave, startDate: start, endDate: end, days: inclusiveDays(start, end) },
      { employee: EMP, now: NOW });
    expect(r.errors.join(" ")).toContain(String(MAX_LEAVE_DAYS));
  });

  it("requires a reason and caps its length", () => {
    expect(validateLeaveRequest({ ...goodLeave, reason: "  " }, { employee: EMP, now: NOW }).errors)
      .toContain("Give a reason");
    expect(validateLeaveRequest({ ...goodLeave, reason: "x".repeat(1001) },
      { employee: EMP, now: NOW }).ok).toBe(false);
  });

  it("refuses a request dated far in the past", () => {
    const r = validateLeaveRequest(
      { ...goodLeave, startDate: "2026-01-01", endDate: "2026-01-05" },
      { employee: EMP, now: NOW });
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/days ago/);
  });

  it("refuses a request more than a year ahead", () => {
    const r = validateLeaveRequest(
      { ...goodLeave, startDate: "2028-01-01", endDate: "2028-01-05" },
      { employee: EMP, now: NOW });
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/more than a year/);
  });

  it("warns about a modest backdate rather than refusing it", () => {
    const r = validateLeaveRequest(
      { ...goodLeave, startDate: "2026-08-03", endDate: "2026-08-05", days: 3 },
      { employee: EMP, requests: [], now: NOW });
    expect(r.ok).toBe(true);
    expect(r.warnings.join(" ")).toMatch(/backdated/);
  });

  it("does not flag backdated sick leave, which is normal", () => {
    const r = validateLeaveRequest(
      { type: "Sick Leave", startDate: "2026-08-03", endDate: "2026-08-05", days: 3, reason: "Flu" },
      { employee: EMP, requests: [], now: NOW });
    expect(r.warnings.join(" ")).not.toMatch(/backdated/);
  });
});

describe("leave balance", () => {
  it("reports what is left for each counted type", () => {
    expect(remainingBalance(EMP, "Annual Leave")).toBe(26);
    expect(remainingBalance(EMP, "Sick Leave")).toBe(15);
    expect(remainingBalance(EMP, "Comp-Off")).toBe(2);
  });

  it("reports null for a type with no counted balance", () => {
    expect(remainingBalance(EMP, "Unpaid Leave")).toBeNull();
    expect(remainingBalance(EMP, "Emergency Leave")).toBeNull();
  });

  it("warns but does not refuse when the balance is exceeded", () => {
    // Management may still approve the time as unpaid; refusing outright
    // would push that conversation off the system.
    const thin = { ...EMP, annualLeave: 30, usedAnnual: 28 };
    const r = validateLeaveRequest(goodLeave, { employee: thin, requests: [], now: NOW });
    expect(r.ok).toBe(true);
    expect(r.warnings.join(" ")).toMatch(/2 of annual leave left/);
  });

  it("warns when a request nearly exhausts the balance", () => {
    const thin = { ...EMP, annualLeave: 30, usedAnnual: 24 };
    const r = validateLeaveRequest(goodLeave, { employee: thin, requests: [], now: NOW });
    expect(r.ok).toBe(true);
    expect(r.warnings.join(" ")).toMatch(/leaves 1 days of annual leave/);
  });

  it("says nothing about balance when the request is already invalid", () => {
    const r = validateLeaveRequest({ ...goodLeave, reason: "" }, { employee: EMP, now: NOW });
    expect(r.warnings.join(" ")).not.toMatch(/annual leave/);
  });
});

describe("overtime claimed on one day", () => {
  const requests = [
    { id: "OT-001", empId: "EMP-001", workDate: "2026-08-09", hours: 4, status: "approved" },
    { id: "OT-002", empId: "EMP-001", workDate: "2026-08-09", hours: 2, status: "pending" },
    { id: "OT-003", empId: "EMP-001", workDate: "2026-08-09", hours: 5, status: "rejected" },
    { id: "OT-004", empId: "EMP-001", workDate: "2026-08-09", hours: 5, status: "withdrawn" },
    { id: "OT-005", empId: "EMP-002", workDate: "2026-08-09", hours: 8, status: "approved" },
  ];

  it("counts pending and approved, for this employee only", () => {
    expect(claimedHoursOn(requests, "EMP-001", "2026-08-09")).toBe(6);
  });

  it("frees the hours once a claim is rejected or withdrawn", () => {
    const ids = activeOvertimeFor(requests, "EMP-001").map(r => r.id);
    expect(ids).toEqual(["OT-001", "OT-002"]);
  });

  it("ignores the claim being edited", () => {
    expect(claimedHoursOn(requests, "EMP-001", "2026-08-09", "OT-001")).toBe(2);
  });
});

describe("overtime validation", () => {
  it("accepts a well-formed claim", () => {
    const r = validateOvertimeRequest(goodOt, { employee: EMP, requests: [], now: NOW });
    expect(r).toMatchObject({ ok: true, errors: [] });
  });

  it("refuses a future work date", () => {
    const r = validateOvertimeRequest({ ...goodOt, workDate: "2026-08-20" },
      { employee: EMP, now: NOW });
    expect(r.errors).toContain("The work date cannot be in the future");
  });

  it("accepts a claim for today", () => {
    const r = validateOvertimeRequest({ ...goodOt, workDate: T },
      { employee: EMP, requests: [], now: NOW });
    expect(r.ok).toBe(true);
  });

  it("refuses a claim older than the backdate window", () => {
    const r = validateOvertimeRequest({ ...goodOt, workDate: "2026-01-01" },
      { employee: EMP, now: NOW });
    expect(r.errors.join(" ")).toContain(String(MAX_OT_BACKDATE_DAYS));
  });

  it("caps a single claim", () => {
    const r = validateOvertimeRequest({ ...goodOt, hours: 13 }, { employee: EMP, now: NOW });
    expect(r.errors.join(" ")).toContain(String(MAX_OT_HOURS));
  });

  it("requires half-hour steps, matching the form and payroll", () => {
    expect(validateOvertimeRequest({ ...goodOt, hours: 3.5 },
      { employee: EMP, requests: [], now: NOW }).ok).toBe(true);
    expect(validateOvertimeRequest({ ...goodOt, hours: 3.25 },
      { employee: EMP, now: NOW }).errors.join(" ")).toMatch(/half-hour/);
  });

  it("refuses zero, negative and missing hours", () => {
    for (const hours of [0, -2, "", null, undefined, "abc"]) {
      expect(validateOvertimeRequest({ ...goodOt, hours }, { employee: EMP, now: NOW }).ok)
        .toBe(false);
    }
  });

  it("requires a description of the work", () => {
    expect(validateOvertimeRequest({ ...goodOt, reason: " " }, { employee: EMP, now: NOW }).errors)
      .toContain("Say what the work was");
  });

  describe("the same day cannot be claimed twice over", () => {
    const existing = [
      { id: "OT-001", empId: "EMP-001", workDate: "2026-08-09", hours: 10, status: "approved" },
    ];

    it("refuses a claim that would push the day past the daily limit", () => {
      const r = validateOvertimeRequest({ ...goodOt, hours: 4 },
        { employee: EMP, requests: existing, now: NOW });
      expect(r.ok).toBe(false);
      expect(r.errors.join(" ")).toContain(String(MAX_OT_HOURS_PER_DAY));
    });

    it("allows a second claim that stays within the limit, with a warning", () => {
      const r = validateOvertimeRequest({ ...goodOt, hours: 2 },
        { employee: EMP, requests: existing, now: NOW });
      expect(r.ok).toBe(true);
      expect(r.warnings.join(" ")).toMatch(/already claimed 10h/);
    });

    it("does not count another employee's claims against this one", () => {
      const theirs = [{ id: "OT-9", empId: "EMP-002", workDate: "2026-08-09", hours: 12, status: "approved" }];
      expect(validateOvertimeRequest(goodOt, { employee: EMP, requests: theirs, now: NOW }).ok)
        .toBe(true);
    });
  });

  it("warns when the claim falls on a day the person was on leave", () => {
    // Not impossible — a call-out during leave happens — but far more often
    // it is the wrong date.
    const onLeave = [leave({ id: "LR-020", startDate: "2026-08-08", endDate: "2026-08-11", status: "approved" })];
    const r = validateOvertimeRequest(goodOt,
      { employee: EMP, requests: [], leaveRequests: onLeave, now: NOW });
    expect(r.ok).toBe(true);
    expect(r.warnings.join(" ")).toMatch(/on leave on 2026-08-09 \(LR-020\)/);
  });

  it("does not warn when the overlapping leave was withdrawn", () => {
    const withdrawn = [leave({ id: "LR-021", startDate: "2026-08-08", endDate: "2026-08-11", status: "withdrawn" })];
    const r = validateOvertimeRequest(goodOt,
      { employee: EMP, requests: [], leaveRequests: withdrawn, now: NOW });
    expect(r.warnings.join(" ")).not.toMatch(/on leave/);
  });
});

describe("status transitions", () => {
  it("knows the statuses each workflow uses", () => {
    expect(LEAVE_STATUSES).toContain("tl_approved");
    // Overtime is team-lead-terminal, so it has no manager stage.
    expect(OVERTIME_STATUSES).not.toContain("tl_approved");
  });

  it("validates a status string", () => {
    expect(isValidLeaveStatus("tl_approved")).toBe(true);
    expect(isValidLeaveStatus("in_review")).toBe(false);
    expect(isValidOvertimeStatus("tl_approved")).toBe(false);
  });

  it("allows the two-stage leave path and nothing else", () => {
    expect(canTransitionLeave("pending", "tl_approved")).toBe(true);
    expect(canTransitionLeave("tl_approved", "approved")).toBe(true);
    // Skipping the team lead is exactly what the RLS policies refuse.
    expect(canTransitionLeave("pending", "approved")).toBe(false);
  });

  it("refuses reopening a finished request", () => {
    for (const from of ["approved", "rejected", "withdrawn"]) {
      for (const to of LEAVE_STATUSES) {
        expect(canTransitionLeave(from, to)).toBe(false);
      }
    }
  });

  it("takes overtime straight from pending to a decision", () => {
    expect(canTransitionOvertime("pending", "approved")).toBe(true);
    expect(canTransitionOvertime("pending", "rejected")).toBe(true);
    expect(canTransitionOvertime("approved", "rejected")).toBe(false);
  });

  it("identifies terminal statuses", () => {
    expect(isTerminalLeaveStatus("approved")).toBe(true);
    expect(isTerminalLeaveStatus("tl_approved")).toBe(false);
    expect(isTerminalOvertimeStatus("approved")).toBe(true);
    expect(isTerminalOvertimeStatus("pending")).toBe(false);
  });

  it("refuses an unknown status rather than throwing", () => {
    expect(canTransitionLeave("nonsense", "approved")).toBe(false);
    expect(canTransitionOvertime(undefined, "approved")).toBe(false);
  });
});

describe("validators tolerate missing context", () => {
  it("does not throw without an employee or request list", () => {
    expect(() => validateLeaveRequest(goodLeave, {})).not.toThrow();
    expect(() => validateOvertimeRequest(goodOt, {})).not.toThrow();
    expect(() => validateLeaveRequest(null, {})).not.toThrow();
    expect(() => validateOvertimeRequest(undefined, {})).not.toThrow();
  });

  it("still refuses an empty form", () => {
    expect(validateLeaveRequest({}, {}).ok).toBe(false);
    expect(validateOvertimeRequest({}, {}).ok).toBe(false);
  });
});
