import { describe, it, expect } from "vitest";
import {
  applyOvertimeAction,
  newOvertimeRecipients,
  approvedHours,
  awaitingAction,
  countsAsWorked,
  OT_STATUSES,
  OT_TERMINAL_STATUSES,
} from "../src/overtimeWorkflow.js";

const NOW = "2026-08-08T10:00:00.000Z";

const req = (over = {}) => ({
  id: "OT-001", empId: "EMP-001", empName: "Amarnath Munderi", section: "AGL 12hrs",
  workDate: "2026-08-01", hours: 4, reason: "Runway light replacement",
  status: "pending", appliedOn: "2026-08-02T08:00:00.000Z",
  tlComment: "", tlActionDate: "", tlName: "", compOffDays: 0,
  ...over,
});

const EMP = { id: "EMP-001", role: "employee", name: "Amarnath Munderi" };
const TL  = { id: "TL-001",  role: "teamlead", name: "Mohammed Faheem" };
const MGR = { id: "MGR-001", role: "manager",  name: "Ragesh Menon" };

describe("status vocabulary", () => {
  it("has no tl_approved stage — overtime is team-lead-terminal", () => {
    expect(OT_STATUSES).toEqual(["pending", "approved", "rejected", "withdrawn"]);
    expect(OT_STATUSES).not.toContain("tl_approved");
  });

  it("treats everything but pending as terminal", () => {
    expect(OT_TERMINAL_STATUSES).toEqual(["approved", "rejected", "withdrawn"]);
    expect(awaitingAction("pending")).toBe(true);
    for (const s of OT_TERMINAL_STATUSES) expect(awaitingAction(s)).toBe(false);
  });

  it("counts only approved overtime as worked", () => {
    expect(countsAsWorked("approved")).toBe(true);
    expect(countsAsWorked("pending")).toBe(false);
    expect(countsAsWorked("rejected")).toBe(false);
    expect(countsAsWorked("withdrawn")).toBe(false);
  });
});

describe("team lead approval — the final stage", () => {
  it("approves a pending request outright, with no manager stage", () => {
    const res = applyOvertimeAction(req(), TL, "approve", "Verified", NOW);
    expect(res.updated.status).toBe("approved");
    expect(res.updated.tlName).toBe("Mohammed Faheem");
    expect(res.updated.tlComment).toBe("Verified");
    expect(res.updated.tlActionDate).toBe(NOW);
    // Nothing is routed onward to a manager.
    expect(res.notifs.map(n => n.to)).toEqual(["EMP-001"]);
    expect(res.notifs[0].type).toBe("approved");
  });

  it("defaults the comment when the team lead leaves it blank", () => {
    expect(applyOvertimeAction(req(), TL, "approve", "", NOW).updated.tlComment).toBe("Approved");
    expect(applyOvertimeAction(req(), TL, "reject", "", NOW).updated.tlComment).toBe("Rejected");
  });

  it("rejects a pending request and notifies the requester", () => {
    const res = applyOvertimeAction(req(), TL, "reject", "Not authorised", NOW);
    expect(res.updated.status).toBe("rejected");
    expect(res.notifs[0].type).toBe("rejected");
    expect(res.pushes[0].to).toBe("EMP-001");
  });

  it("emits one push per notification", () => {
    const res = applyOvertimeAction(req(), TL, "approve", "ok", NOW);
    expect(res.pushes).toHaveLength(res.notifs.length);
  });

  it("does not mutate the input request", () => {
    const r = req();
    applyOvertimeAction(r, TL, "approve", "ok", NOW);
    expect(r.status).toBe("pending");
    expect(r.tlName).toBe("");
  });
});

describe("managers have no authority over overtime", () => {
  it("refuses a manager approval", () => {
    expect(applyOvertimeAction(req(), MGR, "approve", "", NOW)).toBeNull();
  });

  it("refuses a manager rejection", () => {
    expect(applyOvertimeAction(req(), MGR, "reject", "", NOW)).toBeNull();
  });

  it("refuses a manager acting on an already-approved request", () => {
    expect(applyOvertimeAction(req({ status: "approved" }), MGR, "reject", "", NOW)).toBeNull();
  });

  it("does not notify managers about a new request", () => {
    const employees = [EMP, TL, MGR];
    expect(newOvertimeRecipients(employees)).toEqual(["TL-001"]);
  });
});

describe("employees cannot approve", () => {
  it("refuses an employee approving their own request", () => {
    expect(applyOvertimeAction(req(), EMP, "approve", "", NOW)).toBeNull();
  });

  it("refuses an employee approving someone else's", () => {
    const other = { id: "EMP-002", role: "employee", name: "Subash Chouhan" };
    expect(applyOvertimeAction(req(), other, "approve", "", NOW)).toBeNull();
  });
});

describe("withdrawal", () => {
  it("lets the requester withdraw while pending", () => {
    const res = applyOvertimeAction(req(), EMP, "withdraw", "", NOW);
    expect(res.updated.status).toBe("withdrawn");
    expect(res.notifs).toEqual([]);
    expect(res.pushes).toEqual([]);
  });

  it("refuses withdrawal by anyone else", () => {
    expect(applyOvertimeAction(req(), TL, "withdraw", "", NOW)).toBeNull();
    expect(applyOvertimeAction(req(), MGR, "withdraw", "", NOW)).toBeNull();
  });

  it("refuses withdrawal once no longer pending", () => {
    for (const status of OT_TERMINAL_STATUSES) {
      expect(applyOvertimeAction(req({ status }), EMP, "withdraw", "", NOW)).toBeNull();
    }
  });
});

describe("terminal requests are immutable", () => {
  it("refuses a team lead re-acting on any terminal status", () => {
    for (const status of OT_TERMINAL_STATUSES) {
      expect(applyOvertimeAction(req({ status }), TL, "approve", "", NOW)).toBeNull();
      expect(applyOvertimeAction(req({ status }), TL, "reject", "", NOW)).toBeNull();
    }
  });

  it("cannot revive a withdrawn request", () => {
    expect(applyOvertimeAction(req({ status: "withdrawn" }), TL, "approve", "", NOW)).toBeNull();
  });
});

describe("unknown actions", () => {
  it("returns null rather than guessing", () => {
    expect(applyOvertimeAction(req(), TL, "escalate", "", NOW)).toBeNull();
    expect(applyOvertimeAction(req(), TL, "", "", NOW)).toBeNull();
  });
});

describe("approvedHours", () => {
  const rows = [
    req({ id: "OT-1", empId: "EMP-001", hours: 4,   status: "approved" }),
    req({ id: "OT-2", empId: "EMP-001", hours: 2.5, status: "approved" }),
    req({ id: "OT-3", empId: "EMP-001", hours: 8,   status: "pending" }),
    req({ id: "OT-4", empId: "EMP-001", hours: 8,   status: "rejected" }),
    req({ id: "OT-5", empId: "EMP-002", hours: 5,   status: "approved" }),
  ];

  it("sums only that employee's approved hours", () => {
    expect(approvedHours(rows, "EMP-001")).toBe(6.5);
    expect(approvedHours(rows, "EMP-002")).toBe(5);
  });

  it("returns 0 for someone with nothing approved", () => {
    expect(approvedHours(rows, "EMP-999")).toBe(0);
    expect(approvedHours([], "EMP-001")).toBe(0);
  });
});

describe("newOvertimeRecipients", () => {
  it("returns every team lead", () => {
    const tl2 = { id: "TL-002", role: "teamlead", name: "Second TL" };
    expect(newOvertimeRecipients([EMP, TL, tl2, MGR])).toEqual(["TL-001", "TL-002"]);
  });

  it("returns an empty list when no team lead exists", () => {
    expect(newOvertimeRecipients([EMP, MGR])).toEqual([]);
  });
});
