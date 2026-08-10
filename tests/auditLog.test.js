import { describe, it, expect } from "vitest";
import {
  columnLabel, tableLabel, formatValue, describeChanges, summarize,
  actorName, filterEntries, auditFromDb, toCsv, REDACTED, AUDIT_FILTERS,
} from "../src/auditLog.js";

const EMPLOYEES = [
  { id: "EMP-001", name: "Amarnath M" },
  { id: "TL-001",  name: "Faheem" },
  { id: "MGR-001", name: "Ragesh" },
];

const approval = {
  id: 1,
  occurredAt: "2026-08-01T09:00:00Z",
  table_name: "leave_requests",
  record_id: "LR-005",
  action: "update",
  changed_cols: ["status", "mgr_comment", "mgr_name"],
  old_values: { status: "tl_approved", mgr_comment: "", mgr_name: "" },
  new_values: { status: "approved", mgr_comment: "Fine", mgr_name: "Ragesh" },
  actor_emp_id: "MGR-001",
  actor_email: "ragesh.menon@adbsafegate.com",
  actor_role: "manager",
  actor_context: "authenticated",
  reason: "",
};

const roleChange = {
  id: 2,
  occurredAt: "2026-08-02T10:00:00Z",
  table_name: "employees",
  record_id: "EMP-001",
  action: "update",
  changed_cols: ["role", "tier"],
  old_values: { role: "employee", tier: "T2" },
  new_values: { role: "teamlead", tier: "T3" },
  actor_emp_id: "MGR-001",
  actor_email: "ragesh.menon@adbsafegate.com",
  actor_role: "manager",
  actor_context: "authenticated",
  reason: "Promotion approved 2026-08",
};

const balanceChange = {
  id: 3, occurredAt: "2026-08-03T10:00:00Z",
  table_name: "employees", record_id: "EMP-001", action: "update",
  changed_cols: ["used_annual"],
  old_values: { used_annual: 4 }, new_values: { used_annual: 9 },
  actor_emp_id: "TL-001", actor_email: "mohammed.faheem@adbsafegate.com",
  actor_role: "teamlead", actor_context: "authenticated", reason: "",
};

const redactedChange = {
  id: 4, occurredAt: "2026-08-04T10:00:00Z",
  table_name: "employees", record_id: "EMP-001", action: "update",
  changed_cols: ["passport_no", "name"],
  old_values: { passport_no: REDACTED, name: "Amar M" },
  new_values: { passport_no: REDACTED, name: "Amarnath M" },
  actor_emp_id: "EMP-001", actor_email: "amarnath.munderi@adbsafegate.com",
  actor_role: "employee", actor_context: "authenticated", reason: "",
};

const ALL = [approval, roleChange, balanceChange, redactedChange];

describe("labels", () => {
  it("names the columns a manager is asked about", () => {
    expect(columnLabel("tier")).toBe("Capability tier");
    expect(columnLabel("used_annual")).toBe("Annual leave used");
    expect(columnLabel("mgr_comment")).toBe("Manager comment");
  });

  it("makes an unknown column readable rather than showing raw snake_case", () => {
    expect(columnLabel("some_new_column")).toBe("Some new column");
  });

  it("names each audited table", () => {
    expect(tableLabel("leave_requests")).toBe("Leave request");
    expect(tableLabel("overtime_requests")).toBe("Overtime request");
    expect(tableLabel("employees")).toBe("Employee");
  });
});

describe("formatting a stored value", () => {
  it("shows an em dash for absent values", () => {
    for (const v of [null, undefined, ""]) expect(formatValue(v)).toBe("—");
  });

  it("never prints a redacted value, even by accident", () => {
    expect(formatValue(REDACTED)).toBe("•••");
  });

  it("summarises collections rather than dumping them", () => {
    expect(formatValue([1, 2, 3])).toBe("3 items");
    expect(formatValue([1])).toBe("1 item");
    expect(formatValue({ a: 1, b: 2 })).toBe("2 fields");
  });

  it("reads booleans as words", () => {
    expect(formatValue(true)).toBe("Yes");
    expect(formatValue(false)).toBe("No");
  });
});

describe("describing what changed", () => {
  it("translates status codes into the labels the rest of the UI uses", () => {
    const rows = describeChanges(approval);
    const status = rows.find(r => r.column === "status");
    expect(status.from).toBe("Pending MGR");
    expect(status.to).toBe("Approved");
  });

  it("uses the overtime labels for an overtime request", () => {
    // Overtime is team-lead-terminal, so 'pending' means pending TL and there
    // is no tl_approved stage — the two tables must not share one label map.
    const ot = {
      ...approval, table_name: "overtime_requests", record_id: "OT-003",
      changed_cols: ["status"],
      old_values: { status: "pending" }, new_values: { status: "approved" },
    };
    const rows = describeChanges(ot);
    expect(rows[0].from).toBe("Pending TL");
    expect(rows[0].to).toBe("Approved");
  });

  it("puts status first, then privileged fields, then the rest", () => {
    const rows = describeChanges(approval);
    expect(rows[0].column).toBe("status");
  });

  it("flags a redacted field so the UI can mark it", () => {
    const rows = describeChanges(redactedChange);
    const passport = rows.find(r => r.column === "passport_no");
    expect(passport.redacted).toBe(true);
    expect(passport.from).toBe("•••");
    expect(passport.to).toBe("•••");
  });

  it("does not flag an ordinary field as redacted", () => {
    const rows = describeChanges(redactedChange);
    expect(rows.find(r => r.column === "name").redacted).toBe(false);
  });

  it("returns nothing for a missing entry rather than throwing", () => {
    expect(describeChanges(null)).toEqual([]);
    expect(describeChanges({})).toEqual([]);
  });
});

describe("the one-line summary", () => {
  it("leads with the approval when a status moved", () => {
    expect(summarize(approval)).toBe("LR-005 → Approved");
  });

  it("names the field when a single field changed", () => {
    expect(summarize(balanceChange, "Amarnath M"))
      .toBe("Amarnath M: Annual leave used changed");
  });

  it("names both when two changed", () => {
    expect(summarize(roleChange, "Amarnath M"))
      .toBe("Amarnath M: Role and Capability tier changed");
  });

  it("counts them when there are more", () => {
    const many = { ...roleChange, changed_cols: ["role", "tier", "band", "section"] };
    expect(summarize(many, "Amarnath M")).toBe("Amarnath M: 4 fields changed");
  });

  it("describes creates and deletes plainly", () => {
    expect(summarize({ ...roleChange, action: "insert" })).toBe("Created employee EMP-001");
    expect(summarize({ ...roleChange, action: "delete" })).toBe("Deleted employee EMP-001");
  });
});

describe("naming the actor", () => {
  it("prefers the roster name over the raw email", () => {
    expect(actorName(approval, EMPLOYEES)).toBe("Ragesh");
  });

  it("falls back to the email when the actor is not on the roster", () => {
    expect(actorName({ ...approval, actor_emp_id: "GONE-1" }, EMPLOYEES))
      .toBe("ragesh.menon@adbsafegate.com");
  });

  it("distinguishes a backend write from a person", () => {
    expect(actorName({ ...approval, actor_context: "service_role" }, EMPLOYEES))
      .toBe("System (backend)");
  });

  it("distinguishes a manual SQL-editor change from a person", () => {
    // These matter most in an investigation: a change with no end user behind
    // it must not be attributed to whoever happens to share the email.
    expect(actorName({ ...approval, actor_context: "sql_editor" }, EMPLOYEES))
      .toBe("Administrator (SQL editor)");
  });

  it("says Unknown rather than throwing on a missing entry", () => {
    expect(actorName(null)).toBe("Unknown");
  });
});

describe("filtering", () => {
  it("shows everything by default", () => {
    expect(filterEntries(ALL, { filter: "all" })).toHaveLength(4);
  });

  it("shows only status transitions under Approvals", () => {
    const r = filterEntries(ALL, { filter: "approvals" });
    expect(r).toEqual([approval]);
  });

  it("excludes a leave row that changed something other than status", () => {
    const commentOnly = {
      ...approval, id: 9, changed_cols: ["reason"],
      old_values: { reason: "a" }, new_values: { reason: "b" },
    };
    expect(filterEntries([commentOnly], { filter: "approvals" })).toEqual([]);
  });

  it("shows role and pay changes under Role & pay", () => {
    expect(filterEntries(ALL, { filter: "privileged" })).toEqual([roleChange]);
  });

  it("shows balance edits under Leave balances", () => {
    expect(filterEntries(ALL, { filter: "balances" })).toEqual([balanceChange]);
  });

  it("names a filter for every key the UI offers", () => {
    for (const f of AUDIT_FILTERS) {
      expect(() => filterEntries(ALL, { filter: f.key })).not.toThrow();
    }
  });

  it("searches the record, the actor and the field names", () => {
    expect(filterEntries(ALL, { query: "LR-005" })).toEqual([approval]);
    expect(filterEntries(ALL, { query: "ragesh", employees: EMPLOYEES }))
      .toEqual([approval, roleChange]);
    expect(filterEntries(ALL, { query: "capability tier" })).toEqual([roleChange]);
  });

  it("searches the reason, so a documented change can be found by its note", () => {
    expect(filterEntries(ALL, { query: "promotion" })).toEqual([roleChange]);
  });

  it("is case-insensitive and ignores surrounding whitespace", () => {
    expect(filterEntries(ALL, { query: "  lr-005 " })).toEqual([approval]);
  });

  it("combines a filter with a query", () => {
    expect(filterEntries(ALL, { filter: "privileged", query: "LR-005" })).toEqual([]);
  });

  it("handles a missing list rather than throwing", () => {
    expect(filterEntries(null, {})).toEqual([]);
    expect(filterEntries(undefined)).toEqual([]);
  });
});

describe("mapping a database row", () => {
  it("fills in the empty cases so the UI never sees null collections", () => {
    const r = auditFromDb({
      id: 7, occurred_at: "2026-08-01T00:00:00Z", txid: 42,
      table_name: "employees", record_id: "EMP-001", action: "insert",
      changed_cols: null, old_values: null, new_values: null,
      actor_emp_id: null, actor_email: null, actor_role: null,
      actor_context: "service_role", reason: null,
    });
    expect(r.changed_cols).toEqual([]);
    expect(r.old_values).toEqual({});
    expect(r.new_values).toEqual({});
    expect(r.reason).toBe("");
    expect(r.occurredAt).toBe("2026-08-01T00:00:00Z");
  });
});

describe("CSV export", () => {
  it("writes a header and one row per entry", () => {
    const lines = toCsv([approval], EMPLOYEES).split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("Timestamp");
    expect(lines[1]).toContain("LR-005");
    expect(lines[1]).toContain("Ragesh");
  });

  it("escapes embedded quotes rather than breaking the row", () => {
    const quoted = { ...approval, reason: 'He said "no"' };
    expect(toCsv([quoted])).toContain('"He said ""no"""');
  });

  it("neutralises a value a spreadsheet would run as a formula", () => {
    // An audited value is attacker-influenced text (a leave reason, a name).
    // Opening the export must not execute it.
    const evil = { ...approval, reason: "=cmd|'/c calc'!A1" };
    expect(toCsv([evil])).toContain(`"'=cmd`);
  });

  it("never exports a redacted value", () => {
    const csv = toCsv([redactedChange], EMPLOYEES);
    expect(csv).not.toContain("passport");
    expect(csv).toContain("•••");
  });

  it("produces just a header for an empty list", () => {
    expect(toCsv([]).split("\n")).toHaveLength(1);
    expect(toCsv(null).split("\n")).toHaveLength(1);
  });
});
