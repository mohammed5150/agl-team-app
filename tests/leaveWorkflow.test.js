import { describe, test, expect } from "vitest";
import { applyLeaveAction, newRequestRecipients, countsAsOnLeave, TERMINAL_LEAVE_STATUSES } from "../src/leaveWorkflow.js";

const NOW = "2026-07-11T08:00:00.000Z";
const TL = { id: "TL-001", role: "teamlead", name: "Faheem" };
const MGR = { id: "MGR-001", role: "manager", name: "Ragesh" };
const EMP = { id: "EMP-003", role: "employee", name: "Amarnath" };
const MANAGER_IDS = ["MGR-001", "MGR-002"];

const request = (over = {}) => ({
  id: "LR-001",
  empId: "EMP-003",
  empName: "Amarnath",
  type: "Annual Leave",
  status: "pending",
  ...over,
});

describe("countsAsOnLeave — calendar/overlap predicate", () => {
  test("active statuses count as on leave", () => {
    for (const s of ["pending", "tl_approved", "approved"]) {
      expect(countsAsOnLeave(s)).toBe(true);
    }
  });
  test("terminal statuses do NOT count as on leave", () => {
    for (const s of TERMINAL_LEAVE_STATUSES) {
      expect(countsAsOnLeave(s)).toBe(false);
    }
    // regression: a withdrawn request must not show on the calendar
    expect(countsAsOnLeave("withdrawn")).toBe(false);
    expect(countsAsOnLeave("rejected")).toBe(false);
  });
});

describe("applyLeaveAction — team lead", () => {
  test("approve moves request to tl_approved and notifies every manager", () => {
    // Arrange
    const r = request();

    // Act
    const res = applyLeaveAction(r, TL, "approve", "Looks fine", NOW, MANAGER_IDS);

    // Assert
    expect(res.updated).toMatchObject({
      status: "tl_approved",
      tlComment: "Looks fine",
      tlActionDate: NOW,
      tlName: "Faheem",
    });
    expect(res.notifs).toEqual([
      { to: "MGR-001", type: "new_request", message: "Amarnath's leave approved by TL" },
      { to: "MGR-002", type: "new_request", message: "Amarnath's leave approved by TL" },
    ]);
    expect(res.pushes.map(p => p.to)).toEqual(["MGR-001", "MGR-002"]);
    expect(res.pushes[0].title).toBe("Leave needs your approval");
  });

  test("reject moves request to rejected and notifies the employee", () => {
    const res = applyLeaveAction(request(), TL, "reject", "Short staffed", NOW, MANAGER_IDS);

    expect(res.updated).toMatchObject({
      status: "rejected",
      tlComment: "Short staffed",
      tlName: "Faheem",
    });
    expect(res.notifs).toEqual([
      { to: "EMP-003", type: "rejected", message: "Annual Leave rejected by TL: Short staffed" },
    ]);
    expect(res.pushes[0].to).toBe("EMP-003");
  });

  test("falls back to default comments when none given", () => {
    const approved = applyLeaveAction(request(), TL, "approve", "", NOW, MANAGER_IDS);
    const rejected = applyLeaveAction(request(), TL, "reject", "", NOW, MANAGER_IDS);

    expect(approved.updated.tlComment).toBe("Approved");
    expect(rejected.updated.tlComment).toBe("Rejected");
  });
});

describe("applyLeaveAction — manager", () => {
  test("approve moves request to approved and notifies the employee", () => {
    const res = applyLeaveAction(request({ status: "tl_approved" }), MGR, "approve", "", NOW, MANAGER_IDS);

    expect(res.updated).toMatchObject({
      status: "approved",
      mgrComment: "Approved",
      mgrActionDate: NOW,
      mgrName: "Ragesh",
    });
    expect(res.notifs).toEqual([
      { to: "EMP-003", type: "approved", message: "Annual Leave APPROVED ✅" },
    ]);
    expect(res.pushes[0].title).toBe("Leave approved");
  });

  test("reject moves request to rejected with manager comment", () => {
    const res = applyLeaveAction(request({ status: "tl_approved" }), MGR, "reject", "Peak season", NOW, MANAGER_IDS);

    expect(res.updated).toMatchObject({ status: "rejected", mgrComment: "Peak season" });
    expect(res.notifs[0].message).toBe("Annual Leave rejected by Manager");
  });

  test("a manager cannot act on a request still awaiting the team lead", () => {
    // Mirrors the lr_update_mgr RLS policy and the UI's own gating (LvCd only
    // offers manager action controls once status is 'tl_approved'): the
    // manager is the SECOND stage, not a bypass of the first.
    expect(applyLeaveAction(request(), MGR, "approve", "", NOW, MANAGER_IDS)).toBeNull();
    expect(applyLeaveAction(request(), MGR, "reject", "", NOW, MANAGER_IDS)).toBeNull();
  });
});

describe("applyLeaveAction — withdraw", () => {
  test("requester can withdraw their own pending request silently", () => {
    const res = applyLeaveAction(request(), EMP, "withdraw", "", NOW, MANAGER_IDS);

    expect(res.updated.status).toBe("withdrawn");
    expect(res.notifs).toEqual([]);
    expect(res.pushes).toEqual([]);
  });

  test("cannot withdraw someone else's request", () => {
    const other = { id: "EMP-099", role: "employee", name: "Other" };

    expect(applyLeaveAction(request(), other, "withdraw", "", NOW, MANAGER_IDS)).toBeNull();
  });

  test("cannot withdraw once the request is no longer pending", () => {
    expect(applyLeaveAction(request({ status: "approved" }), EMP, "withdraw", "", NOW, MANAGER_IDS)).toBeNull();
    expect(applyLeaveAction(request({ status: "tl_approved" }), EMP, "withdraw", "", NOW, MANAGER_IDS)).toBeNull();
  });
});

describe("applyLeaveAction — no authority", () => {
  test("returns null when an employee tries to approve", () => {
    expect(applyLeaveAction(request(), EMP, "approve", "", NOW, MANAGER_IDS)).toBeNull();
  });

  test("returns null for an unknown role", () => {
    const nobody = { id: "X", role: undefined, name: "Nobody" };

    expect(applyLeaveAction(request(), nobody, "approve", "", NOW, MANAGER_IDS)).toBeNull();
  });
});

describe("applyLeaveAction — immutability", () => {
  test("does not mutate the original request", () => {
    const r = request();
    const frozen = Object.freeze({ ...r });

    applyLeaveAction(r, MGR, "approve", "", NOW, MANAGER_IDS);

    expect(r).toEqual(frozen);
  });
});

describe("newRequestRecipients", () => {
  const employees = [
    { id: "EMP-001", role: "employee" },
    { id: "TL-001", role: "teamlead" },
    { id: "TL-002", role: "teamlead" },
    { id: "MGR-001", role: "manager" },
  ];

  test("employee requests go to every team lead", () => {
    expect(newRequestRecipients("employee", employees)).toEqual(["TL-001", "TL-002"]);
  });

  test("team lead requests skip straight to the managers", () => {
    expect(newRequestRecipients("teamlead", employees)).toEqual(["MGR-001"]);
  });

  test("returns empty when nobody holds the target role", () => {
    expect(newRequestRecipients("employee", [{ id: "MGR-001", role: "manager" }])).toEqual([]);
  });
});
