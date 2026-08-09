// Team member onboarding — pure logic, extracted so the rules are unit-testable
// and so the UI and the database migration derive from one field list.
//
// The authoritative copy of these rules lives in the database
// (supabase_team_onboarding.sql, guard_employee_profile_lock). Anything here is
// a convenience for the UI; it is NOT the security boundary.

// Fields an employee may complete or correct on their own row, before they
// finalize. Every one already exists on the employees table.
export const EMPLOYEE_EDITABLE_FIELDS = [
  "name",
  "nationality",
  "mobile",
  "dob",
  "maritalStatus",
  "address",
  "emergencyName",
  "emergencyContact",
  "passportNo",
  "passportExpiry",
  "visaExpiry",
  "eidNo",
  "eidExpiry",
];

// Management-controlled. An employee may never change these on any row,
// including their own — enforced by database triggers, not just the UI.
export const MANAGEMENT_FIELDS = [
  "id", "email", "role", "tier", "band", "airport", "supplier",
  "designation", "section", "empNo", "shift",
  "annualLeave", "usedAnnual", "sickLeave", "usedSick", "compOff",
  "rating", "warnings", "achievements", "actions", "training", "roster",
  "profileFinalized",
];

// Must be filled before a profile can be finalized. Deliberately narrow: these
// are the details the portal genuinely needs and that only the employee can
// supply. Document numbers are collected but not required to finalize, since a
// new joiner may not hold them yet.
export const REQUIRED_FIELDS = [
  "name",
  "mobile",
  "dob",
  "address",
  "emergencyName",
  "emergencyContact",
];

export const FIELD_LABELS = {
  name: "Full name",
  nationality: "Nationality",
  mobile: "Mobile number",
  dob: "Date of birth",
  maritalStatus: "Marital status",
  address: "Address",
  emergencyName: "Emergency contact name",
  emergencyContact: "Emergency contact number",
  passportNo: "Passport number",
  passportExpiry: "Passport expiry",
  visaExpiry: "Visa expiry",
  eidNo: "Emirates ID number",
  eidExpiry: "Emirates ID expiry",
};

export const PROFILE_STATUS = {
  INCOMPLETE: "incomplete",
  READY: "ready",
  FINALIZED: "finalized",
};

export const PROFILE_STATUS_LABELS = {
  [PROFILE_STATUS.INCOMPLETE]: "Profile Incomplete",
  [PROFILE_STATUS.READY]: "Profile Complete – Ready to Finalize",
  [PROFILE_STATUS.FINALIZED]: "Profile Finalized",
};

const isBlank = v =>
  v === null || v === undefined || (typeof v === "string" && v.trim() === "");

/** Required fields the employee has not filled in yet. */
export function missingRequired(emp) {
  if (!emp) return [...REQUIRED_FIELDS];
  return REQUIRED_FIELDS.filter(f => isBlank(emp[f]));
}

/** True once every required field carries a value. */
export function isProfileComplete(emp) {
  return missingRequired(emp).length === 0;
}

/** incomplete | ready | finalized */
export function profileStatus(emp) {
  if (emp?.profileFinalized) return PROFILE_STATUS.FINALIZED;
  return isProfileComplete(emp) ? PROFILE_STATUS.READY : PROFILE_STATUS.INCOMPLETE;
}

/** 0-100, across required fields only, so the bar reaches 100 when finalizable. */
export function completionPercent(emp) {
  const total = REQUIRED_FIELDS.length;
  const done = total - missingRequired(emp).length;
  return Math.round((done / total) * 100);
}

/**
 * Does this user still need the onboarding flow?
 * True while they hold an initial password, or their profile is unfinalized.
 * Staff (team lead / manager) are onboarded the same way as everyone else.
 */
export function needsOnboarding(emp) {
  if (!emp) return false;
  return !!emp.initialPassword || !emp.profileFinalized;
}

/**
 * Strip a candidate update down to the fields an employee is allowed to change,
 * and refuse it outright once the profile is finalized.
 *
 * Mirrors guard_employee_profile_lock in the database. The database is the
 * boundary; this keeps the client from sending writes that would be rejected.
 */
export function sanitizeEmployeeEdit(current, patch) {
  if (!current || !patch) return {};
  if (current.profileFinalized) return {};
  const out = {};
  for (const f of EMPLOYEE_EDITABLE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(patch, f)) out[f] = patch[f];
  }
  return out;
}

/**
 * Can this actor edit that employee's profile fields?
 *  - staff (teamlead/manager) may always edit, including after finalization
 *  - an employee may edit only their own row, and only before finalizing
 */
export function canEditProfile(actor, target) {
  if (!actor || !target) return false;
  if (actor.role === "manager" || actor.role === "teamlead") return true;
  if (actor.id !== target.id) return false;
  return !target.profileFinalized;
}

/** Only a manager may reopen a finalized profile. Never the employee. */
export function canUnlockProfile(actor, target) {
  if (!actor || !target) return false;
  if (!target.profileFinalized) return false;
  return actor.role === "manager";
}

/** An employee finalizes their own completed profile; staff may finalize too. */
export function canFinalizeProfile(actor, target) {
  if (!actor || !target) return false;
  if (target.profileFinalized) return false;
  if (!isProfileComplete(target)) return false;
  if (actor.role === "manager" || actor.role === "teamlead") return true;
  return actor.id === target.id;
}

export const FINALIZE_CONFIRM_MESSAGE =
  "Once you finalize your profile, your submitted information will be locked. " +
  "Future changes will require Manager/Admin approval.";

/**
 * Normalised login ID. Team Mail IDs are compared case-insensitively (the
 * database uses a unique index on lower(email)) but stored verbatim — one of
 * the real IDs is "Bv4haris@gmail.com".
 */
export function normalizeLoginId(email) {
  return (email || "").trim().toLowerCase();
}

/** Is this email already used as a login ID by some other employee? */
export function isEmailTaken(employees, email, exceptId = null) {
  const target = normalizeLoginId(email);
  if (!target) return false;
  return (employees || []).some(
    e => e.id !== exceptId && normalizeLoginId(e.email) === target
  );
}
