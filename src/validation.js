// Request validation — leave and overtime.
//
// WHY THIS MODULE EXISTS
// The two submit forms each carried a handful of inline checks and between
// them missed the ones that matter for a roster: nothing stopped an employee
// booking two overlapping leave requests, claiming the same overtime twice, or
// applying for more annual leave than they had left. Those all produce a
// roster the portal reports as correct and the airfield cannot staff, and they
// are the kind of thing nobody notices until payroll.
//
// Rules are stated once here and applied by both the UI and, where they can be
// expressed relationally, the database (supabase_validation.sql). The database
// is the boundary; this module is what lets the form say what is wrong before
// the round trip, and in the same words.
//
// SHAPE
// Every validator returns { ok, errors, warnings }:
//   errors   — refuse the submission
//   warnings — allow it, but tell the user (e.g. exceeding a leave balance,
//              which management may still choose to approve as unpaid)

import { LEAVE_TYPES } from "./constants.js";
import { countsAsOnLeave } from "./leaveWorkflow.js";
import { OT_TERMINAL_STATUSES } from "./overtimeWorkflow.js";

// ---------------------------------------------------------------
// Bounds. Named so the messages and the SQL constraints agree.
// ---------------------------------------------------------------

export const MAX_LEAVE_DAYS = 90;
/** How far back a leave request may be dated. Sick leave is often after the fact. */
export const MAX_LEAVE_BACKDATE_DAYS = 90;
/** How far ahead. A year is generous; beyond that it is a planning artefact. */
export const MAX_LEAVE_FUTURE_DAYS = 365;

export const MIN_OT_HOURS = 0.5;
export const MAX_OT_HOURS = 12;
/** A calendar day cannot contain more than this much overtime in total. */
export const MAX_OT_HOURS_PER_DAY = 12;
export const MAX_OT_BACKDATE_DAYS = 60;

/** Leave types drawn against a counted balance, and the fields holding it. */
export const BALANCE_FIELDS = {
  "Annual Leave": { total: "annualLeave", used: "usedAnnual", label: "annual leave" },
  "Sick Leave":   { total: "sickLeave",   used: "usedSick",   label: "sick leave" },
  "Comp-Off":     { total: "compOff",     used: null,         label: "comp-off" },
};

// ---------------------------------------------------------------
// Date helpers. Everything is a plain YYYY-MM-DD string; comparing those
// lexicographically is correct and sidesteps timezone drift entirely, which
// is why nothing here converts to a Date except to count days.
// ---------------------------------------------------------------

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDate(s) {
  if (typeof s !== "string" || !DATE_RE.test(s)) return false;
  const d = new Date(s + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) return false;
  // Rejects 2026-02-31, which Date would otherwise roll into March.
  return d.toISOString().slice(0, 10) === s;
}

/** Today as YYYY-MM-DD, injectable so tests are not clock-dependent. */
export function today(now = new Date()) {
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000)
    .toISOString().slice(0, 10);
}

/** Whole days from a to b (negative when b is before a). */
export function daysBetween(a, b) {
  const ms = new Date(b + "T00:00:00Z") - new Date(a + "T00:00:00Z");
  return Math.round(ms / 864e5);
}

/** Inclusive day count of a range, the same arithmetic the form shows. */
export function inclusiveDays(start, end) {
  return daysBetween(start, end) + 1;
}

/** Do two inclusive date ranges share any day? */
export function rangesOverlap(aStart, aEnd, bStart, bEnd) {
  return aStart <= bEnd && bStart <= aEnd;
}

// ---------------------------------------------------------------
// Leave
// ---------------------------------------------------------------

/**
 * Leave requests by this employee that still occupy the calendar — pending or
 * approved, not rejected or withdrawn. `exceptId` lets an edit ignore itself.
 */
export function activeLeaveFor(requests, empId, exceptId = null) {
  return (requests || []).filter(r =>
    r.empId === empId
    && r.id !== exceptId
    && countsAsOnLeave(r.status)
    && isValidDate(r.startDate)
    && isValidDate(r.endDate)
  );
}

/** Existing requests that clash with the proposed range. */
export function findLeaveOverlaps(requests, empId, startDate, endDate, exceptId = null) {
  if (!isValidDate(startDate) || !isValidDate(endDate)) return [];
  return activeLeaveFor(requests, empId, exceptId)
    .filter(r => rangesOverlap(startDate, endDate, r.startDate, r.endDate));
}

/** Days of a balance still available. Null when the type is not counted. */
export function remainingBalance(employee, type) {
  const f = BALANCE_FIELDS[type];
  if (!f || !employee) return null;
  const total = Number(employee[f.total]) || 0;
  const used  = f.used ? (Number(employee[f.used]) || 0) : 0;
  return total - used;
}

/**
 * Validate a leave request before it is submitted.
 *
 * @param {object} form      { type, startDate, endDate, days, reason }
 * @param {object} ctx       { employee, requests, now, exceptId }
 */
export function validateLeaveRequest(form, ctx = {}) {
  const errors = [];
  const warnings = [];
  const { employee, requests = [], now = new Date(), exceptId = null } = ctx;
  const t = today(now);

  const type = form?.type;
  const start = form?.startDate;
  const end = form?.endDate;
  const reason = (form?.reason || "").trim();

  if (!type || !LEAVE_TYPES.includes(type)) {
    errors.push("Choose a leave type");
  }
  if (!start || !end) {
    errors.push("Enter both a start and an end date");
  } else if (!isValidDate(start) || !isValidDate(end)) {
    errors.push("Enter valid dates");
  } else {
    if (end < start) {
      errors.push("The end date cannot be before the start date");
    } else {
      const span = inclusiveDays(start, end);
      if (span > MAX_LEAVE_DAYS) {
        errors.push(`A single request cannot cover more than ${MAX_LEAVE_DAYS} days`);
      }
      // The form computes `days` itself; if it disagrees with the dates,
      // something has been edited out from under it and the balance
      // arithmetic downstream would be wrong.
      if (form.days != null && Number(form.days) !== span) {
        errors.push("The number of days does not match the dates");
      }

      const backdated = daysBetween(start, t);
      if (backdated > MAX_LEAVE_BACKDATE_DAYS) {
        errors.push(`This starts more than ${MAX_LEAVE_BACKDATE_DAYS} days ago — ask your manager to record it`);
      }
      const ahead = daysBetween(t, start);
      if (ahead > MAX_LEAVE_FUTURE_DAYS) {
        errors.push(`This starts more than a year from now`);
      }
      if (backdated > 0 && type !== "Sick Leave" && type !== "Emergency Leave") {
        warnings.push("This request is backdated");
      }

      // The check the portal was missing entirely.
      const clashes = findLeaveOverlaps(requests, employee?.id, start, end, exceptId);
      if (clashes.length) {
        const c = clashes[0];
        errors.push(
          clashes.length === 1
            ? `This overlaps ${c.id} (${c.type}, ${c.startDate} to ${c.endDate})`
            : `This overlaps ${clashes.length} existing requests, including ${c.id}`
        );
      }
    }
  }

  if (!reason) {
    errors.push("Give a reason");
  } else if (reason.length > 1000) {
    errors.push("Keep the reason under 1000 characters");
  }

  // Balance is a warning, not an error: management may still approve the time
  // as unpaid, and refusing it outright would push that conversation off the
  // system entirely.
  if (employee && errors.length === 0) {
    const remaining = remainingBalance(employee, type);
    if (remaining !== null) {
      const span = inclusiveDays(start, end);
      const label = BALANCE_FIELDS[type].label;
      if (span > remaining) {
        warnings.push(
          `This is ${span} days but you have ${Math.max(0, remaining)} of ${label} left`
          + " — it may be approved as unpaid"
        );
      } else if (remaining - span <= 2) {
        warnings.push(`This leaves ${remaining - span} days of ${label}`);
      }
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}

// ---------------------------------------------------------------
// Overtime
// ---------------------------------------------------------------

/** Overtime claims by this employee that still count — pending or approved. */
export function activeOvertimeFor(requests, empId, exceptId = null) {
  return (requests || []).filter(r =>
    r.empId === empId
    && r.id !== exceptId
    // A rejected or withdrawn claim frees the hours again; only 'approved'
    // and 'pending' occupy the day. OT_TERMINAL_STATUSES includes 'approved',
    // so it cannot be used directly here.
    && (r.status === "pending" || r.status === "approved")
  );
}

/** Hours already claimed for one date. */
export function claimedHoursOn(requests, empId, workDate, exceptId = null) {
  return activeOvertimeFor(requests, empId, exceptId)
    .filter(r => r.workDate === workDate)
    .reduce((sum, r) => sum + (Number(r.hours) || 0), 0);
}

/**
 * Validate an overtime claim.
 *
 * @param {object} form  { workDate, hours, reason }
 * @param {object} ctx   { employee, requests, leaveRequests, now, exceptId }
 */
export function validateOvertimeRequest(form, ctx = {}) {
  const errors = [];
  const warnings = [];
  const {
    employee, requests = [], leaveRequests = [],
    now = new Date(), exceptId = null,
  } = ctx;
  const t = today(now);

  const workDate = form?.workDate;
  const hours = Number(form?.hours);
  const reason = (form?.reason || "").trim();

  if (!workDate) {
    errors.push("Enter the date the work was done");
  } else if (!isValidDate(workDate)) {
    errors.push("Enter a valid work date");
  } else {
    if (workDate > t) {
      errors.push("The work date cannot be in the future");
    }
    const age = daysBetween(workDate, t);
    if (age > MAX_OT_BACKDATE_DAYS) {
      errors.push(`This is more than ${MAX_OT_BACKDATE_DAYS} days ago — ask your team lead to record it`);
    }
  }

  if (!form?.hours && form?.hours !== 0) {
    errors.push("Enter the hours worked");
  } else if (!Number.isFinite(hours) || hours <= 0) {
    errors.push("Enter the hours worked");
  } else {
    if (hours > MAX_OT_HOURS) {
      errors.push(`A single claim cannot exceed ${MAX_OT_HOURS} hours`);
    }
    if (hours < MIN_OT_HOURS) {
      errors.push(`Claims are in half hours, from ${MIN_OT_HOURS} upwards`);
    }
    // Half-hour granularity, matching the form's step and the payroll unit.
    if (Math.round(hours * 2) !== hours * 2) {
      errors.push("Enter hours in half-hour steps (e.g. 3.5)");
    }
  }

  if (!reason) {
    errors.push("Say what the work was");
  } else if (reason.length > 1000) {
    errors.push("Keep the description under 1000 characters");
  }

  // Duplicate and total-hours checks — the ones that were missing.
  if (employee && isValidDate(workDate) && Number.isFinite(hours) && hours > 0) {
    const already = claimedHoursOn(requests, employee.id, workDate, exceptId);
    if (already > 0) {
      const total = already + hours;
      if (total > MAX_OT_HOURS_PER_DAY) {
        errors.push(
          `You have already claimed ${already}h on ${workDate};`
          + ` ${total}h would exceed the ${MAX_OT_HOURS_PER_DAY}h daily limit`
        );
      } else {
        warnings.push(`You have already claimed ${already}h on ${workDate} — this adds ${hours}h more`);
      }
    }

    // Overtime on a day the person was on approved leave is not impossible
    // (a call-out during leave happens) but it is worth saying out loud,
    // because far more often it is the wrong date.
    const onLeave = activeLeaveFor(leaveRequests, employee.id)
      .find(r => rangesOverlap(workDate, workDate, r.startDate, r.endDate));
    if (onLeave) {
      warnings.push(`You were on leave on ${workDate} (${onLeave.id}) — check the date`);
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}

// ---------------------------------------------------------------
// Status integrity
// ---------------------------------------------------------------

export const LEAVE_STATUSES = ["pending", "tl_approved", "approved", "rejected", "withdrawn"];
export const OVERTIME_STATUSES = ["pending", "approved", "rejected", "withdrawn"];

/**
 * Which statuses a leave request may legally move to from where it is.
 * Mirrors the lr_update_* RLS policies; anything not listed is refused by the
 * database, so the UI must not offer it.
 */
export const LEAVE_TRANSITIONS = {
  pending:     ["tl_approved", "rejected", "withdrawn"],
  tl_approved: ["approved", "rejected"],
  approved:    [],
  rejected:    [],
  withdrawn:   [],
};

export const OVERTIME_TRANSITIONS = {
  pending:   ["approved", "rejected", "withdrawn"],
  approved:  [],
  rejected:  [],
  withdrawn: [],
};

export function isValidLeaveStatus(s) { return LEAVE_STATUSES.includes(s); }
export function isValidOvertimeStatus(s) { return OVERTIME_STATUSES.includes(s); }

export function canTransitionLeave(from, to) {
  return (LEAVE_TRANSITIONS[from] || []).includes(to);
}

export function canTransitionOvertime(from, to) {
  return (OVERTIME_TRANSITIONS[from] || []).includes(to);
}

/** True once a request can never change again. */
export function isTerminalLeaveStatus(s) {
  return isValidLeaveStatus(s) && (LEAVE_TRANSITIONS[s] || []).length === 0;
}

export function isTerminalOvertimeStatus(s) {
  return OT_TERMINAL_STATUSES.includes(s);
}
