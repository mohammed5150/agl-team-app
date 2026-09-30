// Render tests for the leave and overtime pages — the first suite that
// mounts these components. They pin the WORKFLOW-VISIBLE differences that
// the shared markup in requestShared.jsx must never blur:
//
//   leave    — two-stage: TL acts on `pending`, MGR on `tl_approved`
//   overtime — team-lead-terminal: only a TL acts, only on `pending`,
//              and a manager has no pending queue at all
//
// Rendering uses react-dom/server against the real `react` dependency (the
// same version pinned for vendor/), with the UMD-style global that the
// bundle provides supplied here by hand.
import { describe, test, expect } from "vitest";

globalThis.React = (await import("react")).default;
const { renderToStaticMarkup } = await import("react-dom/server");
const { LvFm, LvCd, LvPg, ApPg } = await import("../src/components/LeavePage.jsx");
const { OtFm, OtCd, OtPg } = await import("../src/components/OvertimePage.jsx");

const emp = { id:"E1", role:"employee", name:"A", annualLeave:30, usedAnnual:5, sickLeave:15, usedSick:1, compOff:2 };
const tl  = { id:"T1", role:"teamlead" };
const mgr = { id:"M1", role:"manager" };
const noop = () => {};

const lr = (status, empId = "E1") => ({
  id:"LR-1", empId, empName:"Test Name", section:"AGL 12hrs", type:"Annual Leave",
  startDate:"2026-10-01", endDate:"2026-10-03", days:3, reason:"family",
  status, tlComment: status !== "pending" ? "ok by TL" : "", mgrComment: status === "approved" ? "ok by MGR" : "",
});
const ot = (status, empId = "E1") => ({
  id:"OT-1", empId, empName:"Test Name", section:"AGL 12hrs",
  workDate:"2026-10-01", hours:3.5, reason:"fault attend",
  status, tlComment: status !== "pending" ? "ok by TL" : "",
});

const html = el => renderToStaticMarkup(el);
const card = (Cd, req, user) => html(<Cd req={req} role={user.role} viewerId={user.id} onAct={noop} />);

describe("leave card — two-stage approval gating", () => {
  test("team lead can act on pending, and only on pending", () => {
    expect(card(LvCd, lr("pending"), tl)).toContain("Take Action");
    for (const s of ["tl_approved", "approved", "rejected", "withdrawn"]) {
      expect(card(LvCd, lr(s), tl)).not.toContain("Take Action");
    }
  });
  test("manager can act on tl_approved, and only on tl_approved", () => {
    expect(card(LvCd, lr("tl_approved"), mgr)).toContain("Take Action");
    for (const s of ["pending", "approved", "rejected", "withdrawn"]) {
      expect(card(LvCd, lr(s), mgr)).not.toContain("Take Action");
    }
  });
  test("only the requester may withdraw, and only while pending", () => {
    expect(card(LvCd, lr("pending"), emp)).toContain("Withdraw");
    expect(card(LvCd, lr("pending"), { ...emp, id:"E2" })).not.toContain("Withdraw");
    expect(card(LvCd, lr("tl_approved"), emp)).not.toContain("Withdraw");
  });
  test("shows both TL and MGR comments when present", () => {
    const h = card(LvCd, lr("approved"), emp);
    expect(h).toContain("ok by TL");
    expect(h).toContain("ok by MGR");
    expect(h).toContain("MGR:");
  });
});

describe("overtime card — team-lead-terminal gating", () => {
  test("team lead can act on pending only", () => {
    expect(card(OtCd, ot("pending"), tl)).toContain("Take Action");
    for (const s of ["approved", "rejected", "withdrawn"]) {
      expect(card(OtCd, ot(s), tl)).not.toContain("Take Action");
    }
  });
  test("a manager NEVER gets action controls, in any status", () => {
    for (const s of ["pending", "approved", "rejected", "withdrawn"]) {
      expect(card(OtCd, ot(s), mgr)).not.toContain("Take Action");
    }
  });
  test("card shows the hours, and only a TL comment line", () => {
    const h = card(OtCd, ot("approved"), emp);
    expect(h).toContain("3.5h");
    expect(h).toContain("TL:");
    expect(h).not.toContain("MGR:");
  });
});

describe("page tab structure per role", () => {
  const lvPage = u => html(<LvPg user={u} leaveRequests={[lr("pending"), lr("tl_approved", "E9")]} onSub={noop} onAct={noop} />);
  const otPage = u => html(<OtPg user={u} overtimeRequests={[ot("pending"), ot("approved", "E9")]} leaveRequests={[]} onSub={noop} onAct={noop} />);

  test("employee sees My tab and balances; no Pending queue", () => {
    const h = lvPage(emp);
    expect(h).toContain("My (");
    expect(h).not.toContain("Pending (");
    expect(h).toContain("Annual Left");
  });
  test("leave: both TL and MGR get a Pending queue (their own stage)", () => {
    expect(lvPage(tl)).toContain("Pending (1)");     // the `pending` request
    expect(lvPage(mgr)).toContain("Pending (1)");    // the `tl_approved` request
  });
  test("overtime: TL gets a Pending queue, manager does not", () => {
    expect(otPage(tl)).toContain("Pending (1)");
    const h = otPage(mgr);
    expect(h).not.toContain("Pending (");
    expect(h).toContain("read-only");
  });
  test("approvals page filters by the viewer's stage", () => {
    expect(html(<ApPg user={tl} leaveRequests={[lr("pending"), lr("tl_approved")]} onAct={noop} />)).toContain("1 Pending");
    expect(html(<ApPg user={mgr} leaveRequests={[lr("pending"), lr("tl_approved")]} onAct={noop} />)).toContain("1 Pending");
  });
});

describe("forms render their fields", () => {
  test("leave form: type/dates/reason and remaining balance", () => {
    const h = html(<LvFm onSub={noop} onCan={noop} user={emp} leaveRequests={[]} />);
    expect(h).toContain("Apply for Leave");
    for (const label of ["TYPE", "START", "END", "REASON"]) expect(h).toContain(label);
    expect(h).toContain("25 days of annual leave remaining");
  });
  test("overtime form: work date/hours/reason", () => {
    const h = html(<OtFm onSub={noop} onCan={noop} user={emp} overtimeRequests={[]} leaveRequests={[]} />);
    expect(h).toContain("Claim Overtime");
    for (const label of ["WORK DATE", "HOURS", "REASON"]) expect(h).toContain(label);
  });
});
