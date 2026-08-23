// Pure leave-approval state machine, extracted from App.leaveAction so the
// business rules are unit-testable.
//
//   applyLeaveAction(request, actor, action, comment, now, managerIds)
//     actor      — { id, role, name } of the person acting
//     managerIds — employee ids of all managers (recipients of TL approvals)
//
// Returns null when the actor has no authority over the request; otherwise
// { updated, notifs, pushes } where notifs/pushes are arrays (one entry per
// recipient) for the caller to emit.

// Terminal statuses — a request in one of these is no longer active and must
// not count as the person being on leave (calendars, overlap counts, etc.).
export const TERMINAL_LEAVE_STATUSES = ["rejected", "withdrawn"];

// True when a request should be treated as an active/planned absence.
export function countsAsOnLeave(status) {
  return !TERMINAL_LEAVE_STATUSES.includes(status);
}

export function applyLeaveAction(r, actor, action, comment, now, managerIds = []) {
  // Requester withdraws their own request while it is still pending
  if (action === "withdraw") {
    if (actor.id !== r.empId || r.status !== "pending") return null;
    return { updated: { ...r, status: "withdrawn" }, notifs: [], pushes: [] };
  }

  if (actor.role === "teamlead") {
    // Only a still-pending request is the team lead's to decide. Without this,
    // a client whose local copy of the request is stale (a second team lead's
    // tab that has not yet received the realtime update) can locally replay
    // 'approve'/'reject' on a request another team lead already resolved,
    // overwriting the UI with a decision that never really happened until the
    // RLS-guarded write is rejected out from under it. Mirrors
    // overtimeWorkflow.js's applyOvertimeAction and the lr_update_tl policy.
    if (r.status !== "pending") return null;
    if (action === "approve") {
      const m = `${r.empName}'s leave approved by TL`;
      return {
        updated: { ...r, status: "tl_approved", tlComment: comment || "Approved", tlActionDate: now, tlName: actor.name },
        notifs: managerIds.map(id => ({ to: id, type: "new_request", message: m })),
        pushes: managerIds.map(id => ({ to: id, title: "Leave needs your approval", body: m })),
      };
    }
    const m = `${r.type} rejected by TL: ${comment || "Rejected"}`;
    return {
      updated: { ...r, status: "rejected", tlComment: comment || "Rejected", tlActionDate: now, tlName: actor.name },
      notifs: [{ to: r.empId, type: "rejected", message: m }],
      pushes: [{ to: r.empId, title: "Leave rejected", body: m }],
    };
  }
  if (actor.role === "manager") {
    // Mirrors lr_update_mgr: a manager may only decide a request the team
    // lead has already passed up. Without this check, a stale client (open on
    // a request that is now 'approved' or 'rejected') could locally replay a
    // decision on top of one that already happened.
    if (r.status !== "tl_approved") return null;
    if (action === "approve") {
      const m = `${r.type} APPROVED ✅`;
      return {
        updated: { ...r, status: "approved", mgrComment: comment || "Approved", mgrActionDate: now, mgrName: actor.name },
        notifs: [{ to: r.empId, type: "approved", message: m }],
        pushes: [{ to: r.empId, title: "Leave approved", body: m }],
      };
    }
    const m = `${r.type} rejected by Manager`;
    return {
      updated: { ...r, status: "rejected", mgrComment: comment || "Rejected", mgrActionDate: now, mgrName: actor.name },
      notifs: [{ to: r.empId, type: "rejected", message: m }],
      pushes: [{ to: r.empId, title: "Leave rejected", body: m }],
    };
  }
  return null;
}

// Who should be notified about a NEW leave request: team leads normally,
// managers when the requester is themselves a team lead.
export function newRequestRecipients(requesterRole, employees) {
  const wantRole = requesterRole === "teamlead" ? "manager" : "teamlead";
  return employees.filter(e => e.role === wantRole).map(e => e.id);
}
