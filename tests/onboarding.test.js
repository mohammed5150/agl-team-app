import { describe, it, expect } from "vitest";
import {
  EMPLOYEE_EDITABLE_FIELDS, MANAGEMENT_FIELDS, REQUIRED_FIELDS,
  PROFILE_STATUS,
  missingRequired, isProfileComplete, profileStatus, completionPercent,
  needsOnboarding, sanitizeEmployeeEdit,
  canEditProfile, canUnlockProfile, canFinalizeProfile,
} from "../src/onboarding.js";
import { empToDb, empFromDb } from "../src/supabasePortal.js";

// A fully completed, not-yet-finalized employee.
const emp = (over = {}) => ({
  id: "EMP-001",
  email: "amarnath.munderi@adbsafegate.com",
  name: "Amarnath Munderi",
  role: "employee",
  section: "AGL 12hrs",
  designation: "AGL Technician",
  empNo: "ADB-001",
  tier: "", band: null, airport: "ZIA", supplier: null,
  nationality: "Indian",
  mobile: "+971 50 111 2222",
  dob: "1990-01-15",
  maritalStatus: "Single",
  address: "Abu Dhabi, UAE",
  emergencyName: "Next of kin",
  emergencyContact: "+971 50 000 0000",
  passportNo: "", passportExpiry: "", visaExpiry: "", eidNo: "", eidExpiry: "",
  initialPassword: false,
  profileFinalized: false,
  annualLeave: 30, usedAnnual: 0,
  ...over,
});

const TL  = { id: "TL-001",  role: "teamlead", name: "Mohammed Faheem" };
const MGR = { id: "MGR-001", role: "manager",  name: "Ragesh Menon" };

describe("team mail ID is the login ID", () => {
  it("keeps the team email verbatim through the db round-trip", () => {
    const e = emp({ email: "muhammed.farhan.ext@adbsafegate.com" });
    const row = empToDb(e);
    expect(row.email).toBe("muhammed.farhan.ext@adbsafegate.com");
    expect(empFromDb(row).email).toBe("muhammed.farhan.ext@adbsafegate.com");
  });

  it("accepts non-corporate team mail IDs unchanged", () => {
    for (const mail of ["jjijosebastian311@gmail.com", "Bv4haris@gmail.com"]) {
      expect(empToDb(emp({ email: mail })).email).toBe(mail);
    }
  });

  it("never invents a separate username field", () => {
    const row = empToDb(emp());
    expect(row).not.toHaveProperty("username");
    expect(row).not.toHaveProperty("user_id");
  });

  it("email is not employee-editable", () => {
    expect(EMPLOYEE_EDITABLE_FIELDS).not.toContain("email");
    expect(MANAGEMENT_FIELDS).toContain("email");
  });
});

describe("no plaintext password is ever persisted", () => {
  it("empToDb emits no password-shaped column", () => {
    const row = empToDb(emp({ password: "Hunter2!", initialPassword: true }));
    const keys = Object.keys(row);
    // The only password-related column is the boolean onboarding flag.
    // (passport_* are document fields, not credentials.)
    expect(keys.filter(k => /password/i.test(k))).toEqual(["initial_password"]);
    expect(row.initial_password).toBe(true);
    // The supplied plaintext never reaches the row.
    expect(JSON.stringify(row)).not.toContain("Hunter2!");
  });

  it("empFromDb exposes no password value", () => {
    const out = empFromDb({ id: "EMP-001", initial_password: true, password: "leaked" });
    expect(out).not.toHaveProperty("password");
    expect(out.initialPassword).toBe(true);
  });
});

describe("profile completion state", () => {
  it("reports incomplete while required fields are blank", () => {
    const e = emp({ mobile: "", address: "   " });
    expect(missingRequired(e).sort()).toEqual(["address", "mobile"]);
    expect(isProfileComplete(e)).toBe(false);
    expect(profileStatus(e)).toBe(PROFILE_STATUS.INCOMPLETE);
  });

  it("reports ready once every required field is filled", () => {
    expect(isProfileComplete(emp())).toBe(true);
    expect(profileStatus(emp())).toBe(PROFILE_STATUS.READY);
  });

  it("reports finalized regardless of completeness", () => {
    expect(profileStatus(emp({ profileFinalized: true, mobile: "" })))
      .toBe(PROFILE_STATUS.FINALIZED);
  });

  it("treats whitespace and null as missing", () => {
    expect(missingRequired(emp({ dob: null, name: "  " })).sort()).toEqual(["dob", "name"]);
  });

  it("scales completion from 0 to 100", () => {
    const blank = {};
    for (const f of REQUIRED_FIELDS) blank[f] = "";
    expect(completionPercent(emp(blank))).toBe(0);
    expect(completionPercent(emp())).toBe(100);
  });
});

describe("first-time users are routed into onboarding", () => {
  it("routes a user holding an initial password", () => {
    expect(needsOnboarding(emp({ initialPassword: true }))).toBe(true);
  });

  it("routes a user whose profile is not finalized", () => {
    expect(needsOnboarding(emp({ initialPassword: false, profileFinalized: false }))).toBe(true);
  });

  it("stops routing once finalized with a personal password", () => {
    expect(needsOnboarding(emp({ initialPassword: false, profileFinalized: true }))).toBe(false);
  });

  it("routes staff through the same flow", () => {
    expect(needsOnboarding({ ...emp(), role: "manager", profileFinalized: false })).toBe(true);
  });
});

describe("employees may edit only allowed fields, only before finalizing", () => {
  it("keeps every editable field", () => {
    const patch = {};
    for (const f of EMPLOYEE_EDITABLE_FIELDS) patch[f] = "x";
    expect(Object.keys(sanitizeEmployeeEdit(emp(), patch)).sort())
      .toEqual([...EMPLOYEE_EDITABLE_FIELDS].sort());
  });

  it("drops role", () => {
    expect(sanitizeEmployeeEdit(emp(), { mobile: "+971 1", role: "manager" }))
      .toEqual({ mobile: "+971 1" });
  });

  it("drops tier", () => {
    expect(sanitizeEmployeeEdit(emp(), { tier: "T4" })).toEqual({});
  });

  it("drops band, airport and supplier", () => {
    expect(sanitizeEmployeeEdit(emp(), { band: "A", airport: "AAN", supplier: "EVC" }))
      .toEqual({});
  });

  it("drops designation, section, empNo and shift", () => {
    expect(sanitizeEmployeeEdit(emp(), {
      designation: "AGL Supervisor", section: "Systems", empNo: "ADB-999", shift: "12hr",
    })).toEqual({});
  });

  it("drops leave balances, rating and warnings", () => {
    expect(sanitizeEmployeeEdit(emp(), {
      annualLeave: 99, usedAnnual: 0, rating: { tier: "A" }, warnings: [],
    })).toEqual({});
  });

  it("drops profileFinalized — finalizing is a separate action", () => {
    expect(sanitizeEmployeeEdit(emp(), { profileFinalized: true })).toEqual({});
  });

  it("refuses every edit once the profile is finalized", () => {
    expect(sanitizeEmployeeEdit(emp({ profileFinalized: true }), { mobile: "+971 9" }))
      .toEqual({});
  });

  it("every management field is rejected", () => {
    const patch = {};
    for (const f of MANAGEMENT_FIELDS) patch[f] = "tampered";
    expect(sanitizeEmployeeEdit(emp(), patch)).toEqual({});
  });
});

describe("who may edit a profile", () => {
  it("lets an employee edit their own unfinalized profile", () => {
    const e = emp();
    expect(canEditProfile(e, e)).toBe(true);
  });

  it("stops an employee editing their own finalized profile", () => {
    const e = emp({ profileFinalized: true });
    expect(canEditProfile(e, e)).toBe(false);
  });

  it("stops an employee editing someone else's profile", () => {
    expect(canEditProfile(emp(), emp({ id: "EMP-002" }))).toBe(false);
  });

  it("lets a manager correct a finalized profile", () => {
    expect(canEditProfile(MGR, emp({ profileFinalized: true }))).toBe(true);
  });

  it("lets a team lead correct a finalized profile", () => {
    expect(canEditProfile(TL, emp({ profileFinalized: true }))).toBe(true);
  });
});

describe("finalization is one-way for an employee", () => {
  it("lets an employee finalize their own completed profile", () => {
    const e = emp();
    expect(canFinalizeProfile(e, e)).toBe(true);
  });

  it("blocks finalizing while required fields are missing", () => {
    const e = emp({ mobile: "" });
    expect(canFinalizeProfile(e, e)).toBe(false);
  });

  it("blocks finalizing someone else's profile as an employee", () => {
    expect(canFinalizeProfile(emp(), emp({ id: "EMP-002" }))).toBe(false);
  });

  it("blocks re-finalizing an already finalized profile", () => {
    const e = emp({ profileFinalized: true });
    expect(canFinalizeProfile(e, e)).toBe(false);
  });

  it("does not let an employee unlock their own profile", () => {
    const e = emp({ profileFinalized: true });
    expect(canUnlockProfile(e, e)).toBe(false);
  });

  it("does not let a team lead unlock a profile", () => {
    expect(canUnlockProfile(TL, emp({ profileFinalized: true }))).toBe(false);
  });

  it("lets a manager unlock a finalized profile", () => {
    expect(canUnlockProfile(MGR, emp({ profileFinalized: true }))).toBe(true);
  });

  it("has nothing to unlock when the profile is not finalized", () => {
    expect(canUnlockProfile(MGR, emp())).toBe(false);
  });
});

describe("field lists stay disjoint", () => {
  it("no field is both employee-editable and management-controlled", () => {
    const overlap = EMPLOYEE_EDITABLE_FIELDS.filter(f => MANAGEMENT_FIELDS.includes(f));
    expect(overlap).toEqual([]);
  });

  it("every required field is employee-editable", () => {
    const orphan = REQUIRED_FIELDS.filter(f => !EMPLOYEE_EDITABLE_FIELDS.includes(f));
    expect(orphan).toEqual([]);
  });
});
