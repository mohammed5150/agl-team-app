import { describe, it, expect } from "vitest";
import {
  MIN_LENGTH, MAX_LENGTH, RULES, BANNED_BASES,
  checkPassword, isStrongPassword, passwordStrength, STRENGTH_LABELS,
  POLICY_SUMMARY,
} from "../src/passwordPolicy.js";

// A password that satisfies every rule, used as the baseline the negative
// cases are varied from. Deliberately not a real-looking phrase.
const GOOD = "Kx7#mQvz2Lpr";

describe("the baseline password is accepted", () => {
  it("passes every rule", () => {
    const r = checkPassword(GOOD);
    expect(r.ok).toBe(true);
    expect(r.failed).toEqual([]);
    expect(r.error).toBe("");
  });

  it("is exactly at the minimum length, so the boundary is covered", () => {
    expect(GOOD.length).toBe(MIN_LENGTH);
  });
});

describe("length", () => {
  it("refuses one character under the minimum", () => {
    const short = GOOD.slice(0, MIN_LENGTH - 1);
    const r = checkPassword(short);
    expect(r.ok).toBe(false);
    expect(r.failed).toContain("length");
  });

  it("refuses an empty password with a plain message", () => {
    const r = checkPassword("");
    expect(r.ok).toBe(false);
    expect(r.error).toBe("Enter a password");
  });

  it("refuses anything past the maximum", () => {
    const r = checkPassword("Aa1!" + "x".repeat(MAX_LENGTH));
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/128 characters or fewer/);
  });

  it("accepts a long passphrase that meets the other rules", () => {
    expect(isStrongPassword("Correct-Horse-Battery-Staple-7")).toBe(true);
  });
});

describe("character classes", () => {
  const cases = [
    ["uppercase", "kx7#mqvz2lpr"],
    ["lowercase", "KX7#MQVZ2LPR"],
    ["digit",     "Kxs#mQvzTLpr"],
    ["symbol",    "Kx7amQvz2Lpr"],
  ];

  it.each(cases)("requires one %s", (rule, password) => {
    const r = checkPassword(password);
    expect(r.ok).toBe(false);
    expect(r.failed).toContain(rule);
  });
});

describe("common and portal-related words are refused", () => {
  // The exact risk the publishing checklist names: a shared onboarding
  // password that never gets replaced.
  it.each([
    "Password123!",
    "Welcome2026!",
    "ChangeMe123!",
    "AdbSafegate1!",
    "AglTeam2026!",
    "AbuDhabi123!",
  ])("refuses %s even though it satisfies the character rules", pw => {
    // Each of these WOULD pass on characters alone — that is the point.
    const r = checkPassword(pw);
    expect(r.failed).toContain("notCommon");
    expect(r.ok).toBe(false);
  });

  it("every banned base is itself refused with padding that would otherwise pass", () => {
    for (const base of BANNED_BASES) {
      const padded = base[0].toUpperCase() + base.slice(1) + "1!" + "z".repeat(MIN_LENGTH);
      expect(checkPassword(padded).failed).toContain("notCommon");
    }
  });

  it("does not refuse a password that merely contains a banned word mid-string", () => {
    // The rule anchors at the start, so a real password is not caught by an
    // incidental substring.
    expect(checkPassword("Kx7#adminQvz2L").failed).not.toContain("notCommon");
  });
});

describe("a password must not contain the user's own identity", () => {
  const identity = { email: "nisar.ahmed@adbsafegate.com", name: "Nisar Ahmed" };

  it.each([
    "Nisar#2026xyzQ",
    "xxAhmed#2026Qv",
    "Kx7#nisarQvz2L",
  ])("refuses %s", pw => {
    expect(checkPassword(pw, identity).failed).toContain("notIdentity");
  });

  it("accepts an unrelated password for the same user", () => {
    expect(checkPassword(GOOD, identity).ok).toBe(true);
  });

  it("ignores fragments under three characters, which would match everything", () => {
    // "bv" from Bv4haris@gmail.com must not veto every password with those letters.
    const shortLocal = { email: "bv4haris@gmail.com", name: "Haris" };
    expect(checkPassword("Kx7#bvQmvz2Lp", shortLocal).failed).not.toContain("notIdentity");
  });

  it("applies no identity rule when no identity is supplied", () => {
    expect(checkPassword("Nisar#2026xyzQ").failed).not.toContain("notIdentity");
  });
});

describe("runs and repeats are refused", () => {
  it.each([
    "Abcde#123456Z",   // alphabetical run
    "Kx7#Qvz12345Lp",  // numeric run
    "Kx7#Qvz54321Lp",  // reversed numeric run
  ])("refuses %s", pw => {
    expect(checkPassword(pw).failed).toContain("notRepeated");
  });

  it("refuses a single repeated character", () => {
    expect(checkPassword("aaaaaaaaaaaaaa").failed).toContain("notRepeated");
  });

  it("allows a four-character run, which is short enough to be incidental", () => {
    expect(checkPassword("Kx7#Qvz1234Lp").failed).not.toContain("notRepeated");
  });
});

describe("the error message names one failure but summarises several", () => {
  it("names the single outstanding requirement", () => {
    // Everything but the symbol.
    const r = checkPassword("Kx7amQvz2Lpr");
    expect(r.failed).toEqual(["symbol"]);
    expect(r.error).toBe("Password needs: one symbol (e.g. ! ? @ #)");
  });

  it("summarises when more than one rule fails", () => {
    const r = checkPassword("abc");
    expect(r.failed.length).toBeGreaterThan(1);
    expect(r.error).toMatch(/does not meet the requirements \(\d+ still to go\)/);
  });
});

describe("the strength meter never contradicts the checker", () => {
  it("scores a refused password below the passing band", () => {
    for (const bad of ["abc", "password", "Password1", "kx7#mqvz2lpr"]) {
      expect(checkPassword(bad).ok).toBe(false);
      expect(passwordStrength(bad)).toBeLessThanOrEqual(2);
    }
  });

  it("scores an accepted password at least 3", () => {
    expect(passwordStrength(GOOD)).toBeGreaterThanOrEqual(3);
  });

  it("rewards length beyond the minimum with the top score", () => {
    expect(passwordStrength(GOOD)).toBe(3);
    expect(passwordStrength(GOOD + "qW9#rTz1")).toBe(4);
  });

  it("has a label for every score it can return", () => {
    for (const pw of ["", "a", "abc", GOOD, GOOD + "qW9#rTz1"]) {
      const s = passwordStrength(pw);
      expect(STRENGTH_LABELS[s]).toBeTypeOf("string");
    }
  });
});

describe("the policy is self-describing", () => {
  it("returns one result per rule, in order, whatever the input", () => {
    for (const pw of ["", "x", GOOD]) {
      const r = checkPassword(pw);
      expect(r.results.map(x => x.key)).toEqual(RULES.map(x => x.key));
    }
  });

  it("states the minimum length in the summary, so the two cannot drift", () => {
    expect(POLICY_SUMMARY).toContain(String(MIN_LENGTH));
  });

  it("treats a non-string as absent rather than throwing", () => {
    for (const v of [null, undefined, 0, {}, []]) {
      expect(checkPassword(v).ok).toBe(false);
    }
  });
});

describe("the old policy would no longer pass", () => {
  // The previous screen asked for six characters, one capital and one digit.
  // Every one of these was accepted before and must not be now.
  it.each(["Abc123", "Passw1", "Team01", "Adb123"])("refuses %s", pw => {
    expect(isStrongPassword(pw)).toBe(false);
  });
});
