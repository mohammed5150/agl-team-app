import { describe, test, expect } from "vitest";
import { applyLeaveAction } from "../src/leaveWorkflow.js";

const NOW = "2026-07-11T08:00:00.000Z";

const request = (over = {}) => ({
  id: "LR-001",
  empId: "EMP-003",
  empName: "Amarnath",
  type: "Annual Leave",
  status: "pending",
  ...over,
});

describe("applyLeaveAction — team lead", () => {
  test("approve moves request to tl_approved and notifies the manager", () => {
    // Arrange
    const r = request();

    // Act
    const res = applyLeaveAction(r, "teamlead", "Faheem", "approve", "Looks fine", NOW);

    // Assert
    expect(res.updated).toMatchObject({
      status: "tl_approved",
      tlComment: "Looks fine",
      tlActionDate: NOW,
      tlName: "Faheem",
    });
    expect(res.notif).toEqual({
      to: "MGR-001",
      type: "new_request",
      message: "Amarnath's leave approved by TL",
    });
    expect(res.push.to).toBe("MGR-001");
    expect(res.push.title).toBe("Leave needs your approval");
  });

  test("reject moves request to rejected and notifies the employee", () => {
    const r = request();

    const res = applyLeaveAction(r, "teamlead", "Faheem", "reject", "Short staffed", NOW);

    expect(res.updated).toMatchObject({
      status: "rejected",
      tlComment: "Short staffed",
      tlName: "Faheem",
    });
    expect(res.notif).toEqual({
      to: "EMP-003",
      type: "rejected",
      message: "Annual Leave rejected by TL: Short staffed",
    });
    expect(res.push.to).toBe("EMP-003");
  });

  test("falls back to default comments when none given", () => {
    const approved = applyLeaveAction(request(), "teamlead", "Faheem", "approve", "", NOW);
    const rejected = applyLeaveAction(request(), "teamlead", "Faheem", "reject", "", NOW);

    expect(approved.updated.tlComment).toBe("Approved");
    expect(rejected.updated.tlComment).toBe("Rejected");
  });
});

describe("applyLeaveAction — manager", () => {
  test("approve moves request to approved and notifies the employee", () => {
    const r = request({ status: "tl_approved" });

    const res = applyLeaveAction(r, "manager", "Ragesh", "approve", "", NOW);

    expect(res.updated).toMatchObject({
      status: "approved",
      mgrComment: "Approved",
      mgrActionDate: NOW,
      mgrName: "Ragesh",
    });
    expect(res.notif).toEqual({
      to: "EMP-003",
      type: "approved",
      message: "Annual Leave APPROVED ✅",
    });
    expect(res.push.title).toBe("Leave approved");
  });

  test("reject moves request to rejected with manager comment", () => {
    const res = applyLeaveAction(request(), "manager", "Ragesh", "reject", "Peak season", NOW);

    expect(res.updated).toMatchObject({ status: "rejected", mgrComment: "Peak season" });
    expect(res.notif.type).toBe("rejected");
    expect(res.notif.message).toBe("Annual Leave rejected by Manager");
  });
});

describe("applyLeaveAction — no authority", () => {
  test("returns null when the actor is an employee", () => {
    expect(applyLeaveAction(request(), "employee", "Amarnath", "approve", "", NOW)).toBeNull();
  });

  test("returns null for an unknown role", () => {
    expect(applyLeaveAction(request(), undefined, "Nobody", "approve", "", NOW)).toBeNull();
  });
});

describe("applyLeaveAction — immutability", () => {
  test("does not mutate the original request", () => {
    const r = request();
    const frozen = Object.freeze({ ...r });

    applyLeaveAction(r, "manager", "Ragesh", "approve", "", NOW);

    expect(r).toEqual(frozen);
  });
});
