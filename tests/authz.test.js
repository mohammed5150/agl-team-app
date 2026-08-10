import { describe, it, expect } from "vitest";
import * as authz from "../src/authz.js";
import {
  ROLES, isEmployee, isTeamLead, isManager, isStaff, atLeast, isValidRole,
  canInviteEmployee, canChangeRoleOrTier, canSetRatingTier, canRateEmployee,
  canApproveLeaveStageOne, canApproveLeaveFinal, canApproveOvertime,
  canViewAuditLog, canDeleteAnnouncement, canPostAnnouncement,
  canUnlockProfile, canOffboardEmployee, canResetOthersPassword,
  canActOnLeave, canActOnOvertime, canViewRequest, roleBadge,
} from "../src/authz.js";

const EMP = { id: "EMP-001", role: "employee", name: "Emp" };
const TL  = { id: "TL-001",  role: "teamlead", name: "Lead" };
const MGR = { id: "MGR-001", role: "manager",  name: "Mgr" };
const ALL = [EMP, TL, MGR];

describe("role identification", () => {
  it("names the three roles the schema uses", () => {
    expect(ROLES).toEqual(["employee", "teamlead", "manager"]);
  });

  it("identifies each role", () => {
    expect([isEmployee(EMP), isTeamLead(EMP), isManager(EMP)]).toEqual([true, false, false]);
    expect([isEmployee(TL),  isTeamLead(TL),  isManager(TL)]).toEqual([false, true, false]);
    expect([isEmployee(MGR), isTeamLead(MGR), isManager(MGR)]).toEqual([false, false, true]);
  });

  it("accepts a bare role string as well as an actor object", () => {
    expect(isManager("manager")).toBe(true);
    expect(isStaff("teamlead")).toBe(true);
  });

  it("treats team lead and manager as staff, and nobody else", () => {
    expect([isStaff(EMP), isStaff(TL), isStaff(MGR)]).toEqual([false, true, true]);
  });

  it("ranks roles so 'at least' is expressible", () => {
    expect(atLeast(MGR, "teamlead")).toBe(true);
    expect(atLeast(TL, "manager")).toBe(false);
    expect(atLeast(TL, "teamlead")).toBe(true);
  });

  it("validates a role string", () => {
    expect(isValidRole("manager")).toBe(true);
    expect(isValidRole("admin")).toBe(false);
  });
});

describe("an unknown or missing actor is never granted anything", () => {
  const nobodies = [null, undefined, {}, { role: "" }, { role: "admin" }, { role: "root" }];

  it.each(nobodies)("refuses every capability for %j", actor => {
    const caps = Object.entries(authz)
      .filter(([name, v]) => name.startsWith("can") && typeof v === "function" && v.length <= 1);
    for (const [name, fn] of caps) {
      expect(fn(actor), `${name} should refuse ${JSON.stringify(actor)}`).toBe(false);
    }
  });

  it("does not rank an unknown role above employee", () => {
    expect(atLeast({ role: "admin" }, "employee")).toBe(false);
    expect(isStaff({ role: "admin" })).toBe(false);
  });
});

describe("manager-only capabilities", () => {
  const managerOnly = {
    canInviteEmployee, canChangeRoleOrTier, canSetRatingTier,
    canApproveLeaveFinal, canViewAuditLog, canDeleteAnnouncement,
    canUnlockProfile, canOffboardEmployee, canResetOthersPassword,
  };

  it.each(Object.entries(managerOnly))("%s admits only the manager", (_name, fn) => {
    expect(ALL.map(fn)).toEqual([false, false, true]);
  });
});

describe("staff capabilities", () => {
  it.each([["canRateEmployee", canRateEmployee], ["canPostAnnouncement", canPostAnnouncement]])(
    "%s admits team lead and manager", (_name, fn) => {
      expect(ALL.map(fn)).toEqual([false, true, true]);
    });
});

describe("team-lead-only approval stages", () => {
  it("gives first-stage leave approval to the team lead alone", () => {
    expect(ALL.map(canApproveLeaveStageOne)).toEqual([false, true, false]);
  });

  it("gives overtime approval to the team lead alone — a manager never acts on one", () => {
    // Mirrors overtimeWorkflow.js and the deliberate absence of a manager
    // UPDATE policy on overtime_requests.
    expect(ALL.map(canApproveOvertime)).toEqual([false, true, false]);
  });
});

describe("acting on a leave request depends on its stage", () => {
  const pending    = { empId: "EMP-001", status: "pending" };
  const tlApproved = { empId: "EMP-001", status: "tl_approved" };
  const approved   = { empId: "EMP-001", status: "approved" };

  it("lets the requester withdraw only while pending", () => {
    expect(canActOnLeave(EMP, pending)).toBe(true);
    expect(canActOnLeave(EMP, tlApproved)).toBe(false);
    expect(canActOnLeave(EMP, approved)).toBe(false);
  });

  it("lets a team lead act only on a pending request", () => {
    expect(canActOnLeave(TL, pending)).toBe(true);
    expect(canActOnLeave(TL, tlApproved)).toBe(false);
  });

  it("lets a manager act only once the team lead has", () => {
    expect(canActOnLeave(MGR, pending)).toBe(false);
    expect(canActOnLeave(MGR, tlApproved)).toBe(true);
  });

  it("lets nobody act on a finished request", () => {
    for (const a of ALL) expect(canActOnLeave(a, approved)).toBe(false);
    for (const a of ALL) expect(canActOnLeave(a, { empId: "EMP-001", status: "withdrawn" })).toBe(false);
  });

  it("does not let another employee act on someone else's request", () => {
    expect(canActOnLeave({ id: "EMP-002", role: "employee" }, pending)).toBe(false);
  });

  it("refuses a missing actor or request", () => {
    expect(canActOnLeave(null, pending)).toBe(false);
    expect(canActOnLeave(EMP, null)).toBe(false);
  });
});

describe("acting on an overtime request", () => {
  const pending  = { empId: "EMP-001", status: "pending" };
  const approved = { empId: "EMP-001", status: "approved" };

  it("lets the requester withdraw while pending", () => {
    expect(canActOnOvertime(EMP, pending)).toBe(true);
  });

  it("lets the team lead decide, and stops there", () => {
    expect(canActOnOvertime(TL, pending)).toBe(true);
    expect(canActOnOvertime(MGR, pending)).toBe(false);
  });

  it("lets nobody reopen a decided request", () => {
    for (const a of ALL) expect(canActOnOvertime(a, approved)).toBe(false);
  });
});

describe("seeing a request", () => {
  const mine     = { empId: "EMP-001", status: "pending" };
  const somebody = { empId: "EMP-999", status: "pending" };

  it("shows an employee their own and nobody else's", () => {
    expect(canViewRequest(EMP, mine)).toBe(true);
    expect(canViewRequest(EMP, somebody)).toBe(false);
  });

  it("shows staff everything", () => {
    expect(canViewRequest(TL, somebody)).toBe(true);
    expect(canViewRequest(MGR, somebody)).toBe(true);
  });
});

describe("role badge", () => {
  it("labels each role", () => {
    expect(ALL.map(roleBadge)).toEqual([
      { label: "Employee",    tone: "employee" },
      { label: "Team Leader", tone: "teamlead" },
      { label: "Manager",     tone: "manager" },
    ]);
  });

  it("falls back to Employee for an unknown role rather than throwing", () => {
    expect(roleBadge({ role: "nonsense" })).toEqual({ label: "Employee", tone: "employee" });
  });
});
