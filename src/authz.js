// Central role and permission predicates.
//
// WHY THIS MODULE EXISTS
// Role checks were spelled out inline wherever they were needed —
// `role !== "employee"`, `role === "manager"`, `isStaff`, `iM`, `iMgr`, `isTL`
// — and passed down as booleans. That meant a permission question had as many
// answers as it had call sites, and adding a role (or an admin tier) would
// have meant finding every one of them. Every check now names the CAPABILITY,
// not the role, so the mapping from role to capability lives here alone.
//
// WHAT THIS IS NOT
// The security boundary is the database: RLS policies plus the SECURITY
// DEFINER guard triggers in supabase_rls_policies.sql,
// supabase_rls_hardening.sql, supabase_team_onboarding.sql and
// supabase_audit_log.sql. This module decides what the UI offers. A user who
// defeats it gains nothing, because the write is refused server-side. Keep the
// two in step: every predicate below names the policy or trigger that backs it.

export const ROLES = ["employee", "teamlead", "manager"];

/** Ranking, so "at least a team lead" is expressible without listing roles. */
const RANK = { employee: 0, teamlead: 1, manager: 2 };

const roleOf = actor => (typeof actor === "string" ? actor : actor?.role) || "";

export function isValidRole(role) {
  return ROLES.includes(role);
}

export function isEmployee(actor) { return roleOf(actor) === "employee"; }
export function isTeamLead(actor) { return roleOf(actor) === "teamlead"; }
export function isManager(actor)  { return roleOf(actor) === "manager"; }

/** Team lead or manager. Mirrors public.is_staff() in the database. */
export function isStaff(actor) {
  return RANK[roleOf(actor)] >= RANK.teamlead;
}

/** True when the actor holds at least the given role. */
export function atLeast(actor, role) {
  const a = RANK[roleOf(actor)];
  const b = RANK[role];
  return Number.isInteger(a) && Number.isInteger(b) && a >= b;
}

// ---------------------------------------------------------------
// Capabilities. Each names the server-side rule that really enforces it.
// ---------------------------------------------------------------

/** See the whole roster rather than only yourself. RLS: emp_select_all. */
export const canViewTeam = isStaff;

/** Open another employee's full profile. RLS: emp_select_all. */
export const canViewOthersProfile = isStaff;

/** Edit management-controlled fields on any row. RLS: emp_update_staff. */
export const canEditEmployeeRecord = isStaff;

/** Create roster rows / invites. RLS: emp_insert_manager. */
export const canInviteEmployee = isManager;

/** Change role, tier, id or email. Trigger: guard_employee_privileges. */
export const canChangeRoleOrTier = isManager;

/** Set band / airport / supplier. Trigger: guard_employee_grading. */
export const canEditGrading = isManager;

/** Reopen a finalized profile. Trigger: guard_employee_profile_lock rule 0. */
export const canUnlockProfile = isManager;

/** Deactivate / offboard someone. RLS: emp_update_staff + emp_delete_manager. */
export const canOffboardEmployee = isManager;

/** Record ratings, warnings and leave balances. Trigger: guard_employee_privileges. */
export const canRateEmployee = isStaff;

/** Set the salary/capability tier inside a rating. Trigger: guard_employee_privileges. */
export const canSetRatingTier = isManager;

/** First-stage leave approval. RLS: lr_update_tl. */
export const canApproveLeaveStageOne = isTeamLead;

/** Final leave approval. RLS: lr_update_mgr. */
export const canApproveLeaveFinal = isManager;

/**
 * Overtime is team-lead-terminal: the team lead is the final approver and a
 * manager never acts on one. See src/overtimeWorkflow.js and the deliberate
 * absence of a manager UPDATE policy on overtime_requests.
 */
export const canApproveOvertime = isTeamLead;

/** Post an announcement. RLS: ann_insert_staff. */
export const canPostAnnouncement = isStaff;

/** Delete an announcement. RLS: ann_delete_mgr. */
export const canDeleteAnnouncement = isManager;

/** Read the audit log. RLS: audit_select_manager. */
export const canViewAuditLog = isManager;

/** Trigger a password reset email for another user. */
export const canResetOthersPassword = isManager;

/** Edit the working-hours roster. RLS: emp_update_staff. */
export const canEditRoster = isStaff;

// ---------------------------------------------------------------
// Row-scoped checks — these need the target, not just the actor.
// ---------------------------------------------------------------

/** May this actor act on this leave request at its current stage? */
export function canActOnLeave(actor, request) {
  if (!actor || !request) return false;
  if (request.empId === actor.id && request.status === "pending") return true; // withdraw
  if (isTeamLead(actor)) return request.status === "pending";
  if (isManager(actor))  return request.status === "tl_approved";
  return false;
}

/** May this actor act on this overtime request at its current stage? */
export function canActOnOvertime(actor, request) {
  if (!actor || !request) return false;
  if (request.empId === actor.id && request.status === "pending") return true; // withdraw
  return isTeamLead(actor) && request.status === "pending";
}

/**
 * May this actor see this request at all? Mirrors the lr_select / ot_select
 * policies: your own, or anything if you are staff.
 */
export function canViewRequest(actor, request) {
  if (!actor || !request) return false;
  return request.empId === actor.id || isStaff(actor);
}

/** Human label + colour key for a role, so the badge is spelled once. */
export function roleBadge(actor) {
  const role = roleOf(actor);
  if (role === "manager")  return { label: "Manager",     tone: "manager" };
  if (role === "teamlead") return { label: "Team Leader", tone: "teamlead" };
  return { label: "Employee", tone: "employee" };
}
