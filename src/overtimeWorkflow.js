// Pure overtime-approval state machine, mirroring leaveWorkflow.js.
//
// Unlike leave, overtime is TEAM-LEAD-TERMINAL: the team lead is the final
// approver and there is no manager stage, so there is no 'tl_approved'
// status. A manager may view and delete overtime requests but never acts on
// one — the database enforces this by giving managers no UPDATE policy on
// overtime_requests (see supabase_overtime_bands.sql).
//
//   applyOvertimeAction(request, actor, action, comment, now)
//     actor  — { id, role, name } of the person acting
//
// Returns null when the actor has no authority over the request; otherwise
// { updated, notifs, pushes }.

export const OT_STATUSES = ["pending", "approved", "rejected", "withdrawn"];

// Terminal statuses — no longer awaiting anyone's action.
export const OT_TERMINAL_STATUSES = ["approved", "rejected", "withdrawn"];

// True when a request still needs a team lead to act on it.
export function awaitingAction(status) {
  return status === "pending";
}

// Overtime hours only count once a team lead has approved them.
export function countsAsWorked(status) {
  return status === "approved";
}

// Total approved overtime hours for one employee.
export function approvedHours(requests, empId) {
  return requests
    .filter(r => r.empId === empId && countsAsWorked(r.status))
    .reduce((sum, r) => sum + (Number(r.hours) || 0), 0);
}

export function applyOvertimeAction(r, actor, action, comment, now) {
  // Requester withdraws their own request while it is still pending.
  if (action === "withdraw") {
    if (actor.id !== r.empId || r.status !== "pending") return null;
    return { updated: { ...r, status: "withdrawn" }, notifs: [], pushes: [] };
  }

  // Only a team lead approves or rejects, and only while pending.
  if (actor.role !== "teamlead") return null;
  if (r.status !== "pending") return null;

  if (action === "approve") {
    const m = `Overtime ${r.hours}h on ${r.workDate} APPROVED ✅`;
    return {
      updated: {
        ...r, status: "approved",
        tlComment: comment || "Approved", tlActionDate: now, tlName: actor.name,
      },
      notifs: [{ to: r.empId, type: "approved", message: m }],
      pushes: [{ to: r.empId, title: "Overtime approved", body: m }],
    };
  }

  if (action === "reject") {
    const m = `Overtime ${r.hours}h on ${r.workDate} rejected: ${comment || "Rejected"}`;
    return {
      updated: {
        ...r, status: "rejected",
        tlComment: comment || "Rejected", tlActionDate: now, tlName: actor.name,
      },
      notifs: [{ to: r.empId, type: "rejected", message: m }],
      pushes: [{ to: r.empId, title: "Overtime rejected", body: m }],
    };
  }

  return null;
}

// Who should be notified about a NEW overtime request: team leads only.
// Managers are deliberately not notified — they have no approval role here.
export function newOvertimeRecipients(employees) {
  return employees.filter(e => e.role === "teamlead").map(e => e.id);
}
