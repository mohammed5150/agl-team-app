// Pure leave-approval state machine, extracted from App.leaveAction so the
// business rules are unit-testable. Returns null when the actor's role has
// no authority over the request; otherwise returns the updated request plus
// the notification and push message to emit.

export function applyLeaveAction(r, role, actorName, action, comment, now) {
  if (role === "teamlead") {
    if (action === "approve") {
      const m = `${r.empName}'s leave approved by TL`;
      return {
        updated: { ...r, status: "tl_approved", tlComment: comment || "Approved", tlActionDate: now, tlName: actorName },
        notif: { to: "MGR-001", type: "new_request", message: m },
        push: { to: "MGR-001", title: "Leave needs your approval", body: m },
      };
    }
    const m = `${r.type} rejected by TL: ${comment || "Rejected"}`;
    return {
      updated: { ...r, status: "rejected", tlComment: comment || "Rejected", tlActionDate: now, tlName: actorName },
      notif: { to: r.empId, type: "rejected", message: m },
      push: { to: r.empId, title: "Leave rejected", body: m },
    };
  }
  if (role === "manager") {
    if (action === "approve") {
      const m = `${r.type} APPROVED ✅`;
      return {
        updated: { ...r, status: "approved", mgrComment: comment || "Approved", mgrActionDate: now, mgrName: actorName },
        notif: { to: r.empId, type: "approved", message: m },
        push: { to: r.empId, title: "Leave approved", body: m },
      };
    }
    const m = `${r.type} rejected by Manager`;
    return {
      updated: { ...r, status: "rejected", mgrComment: comment || "Rejected", mgrActionDate: now, mgrName: actorName },
      notif: { to: r.empId, type: "rejected", message: m },
      push: { to: r.empId, title: "Leave rejected", body: m },
    };
  }
  return null;
}
