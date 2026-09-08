import { describe, it, expect } from "vitest";
import { TRAINING_CATALOG, ROLE_CODES, ROLE_ORDER, designationToRoleCode } from "../src/trainingCatalog.js";

// TrainingPage renders one row per catalog entry and decides who is missing a
// course by comparing employee training titles against it. A malformed or
// repeated entry therefore shows up as a duplicated row in the compliance
// matrix, or a course nobody can ever satisfy — neither of which looks like a
// bug at a glance, which is why they are pinned here.

const key = c => JSON.stringify([c.title.toLowerCase(), c.dur, c.mode, c.freq.trim(), [...c.roles].sort()]);

describe("the catalog has no repeated entries", () => {
  it("contains no two identical courses", () => {
    // `Adverse weather condition & weather hazards` and `Emergency reporting
    // and evacuation procedures` were each listed twice, byte for byte, inside
    // the monthly toolbox-talk block. Every person appeared twice against them
    // in the matrix.
    const seen = new Map();
    const dupes = [];
    for (const c of TRAINING_CATALOG) {
      const k = key(c);
      if (seen.has(k)) dupes.push(c.title);
      else seen.set(k, c);
    }
    expect(dupes).toEqual([]);
  });

  it("allows a title to repeat only when the courses genuinely differ", () => {
    // `Manual Handling` is deliberately listed twice: a 01h annual eLearn
    // course, and a 00h monthly toolbox talk. Same name, different training.
    const byTitle = new Map();
    for (const c of TRAINING_CATALOG) {
      const t = c.title.toLowerCase();
      byTitle.set(t, (byTitle.get(t) || []).concat(c));
    }
    for (const [title, entries] of byTitle) {
      if (entries.length === 1) continue;
      const shapes = new Set(entries.map(e => `${e.dur}|${e.mode}|${e.freq.trim()}`));
      expect(`${title}: ${shapes.size} distinct shapes`).toBe(`${title}: ${entries.length} distinct shapes`);
    }
  });
});

describe("every entry is usable by the UI", () => {
  it("carries the fields TrainingPage reads", () => {
    for (const c of TRAINING_CATALOG) {
      expect(typeof c.title).toBe("string");
      expect(c.title.trim().length).toBeGreaterThan(0);
      for (const f of ["dur", "mode", "freq", "type"]) expect(typeof c[f]).toBe("string");
      expect(Array.isArray(c.roles)).toBe(true);
      expect(c.roles.length).toBeGreaterThan(0);
    }
  });

  it("uses only role codes the matrix has columns for", () => {
    // A code outside ROLE_ORDER is required of nobody and renders nowhere.
    const bad = [];
    for (const c of TRAINING_CATALOG) {
      for (const r of c.roles) {
        if (!ROLE_ORDER.includes(r) || !ROLE_CODES[r]) bad.push(`${c.title} -> ${r}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("uses only the frequency and mode vocabularies already in use", () => {
    // The UI prints these verbatim; a new spelling silently becomes a new
    // category in the type filter and a new label in the table.
    const freqs = new Set(TRAINING_CATALOG.map(c => c.freq.trim()));
    const modes = new Set(TRAINING_CATALOG.map(c => c.mode));
    expect([...freqs].sort()).toEqual(["Annual", "Monthly"]);
    expect([...modes].sort()).toEqual(["Class", "eLearn", "eLearning·Int."]);
  });
});

describe("the courses the 2026 register imports must exist here", () => {
  // The import stores the catalog's exact spelling so these match literally.
  // If an entry is renamed or removed, the certificate stays on the employee's
  // profile but vanishes from the coverage matrix, which is the failure that
  // hid the WASAEL inductions in the first place.
  const IMPORTED = [
    "Basic First -Aid",
    "Defensive Driving",
    "EAT (GCAS) - Airside Safety Induction Training",
    "Electrical Safety + LOTO",
    "Fire warden",
    "GAA Induction Training",
    "MEWP Driver certificate , IPAF",
    "Manual Handling",
    "Movement AreaADAC ADP - Airside Driving Permit",
    "Power tools safety",
    "WASAEL AVSEC Awareness",
    "WASAEL HSE Induction",
    "Work at Heights Training",
  ];

  it("has a row for every imported course title", () => {
    const titles = new Set(TRAINING_CATALOG.map(c => c.title));
    expect(IMPORTED.filter(t => !titles.has(t))).toEqual([]);
  });

  it("keeps both contractor induction pairs", () => {
    const titles = TRAINING_CATALOG.map(c => c.title);
    for (const t of ["SINYAR HSE Induction", "SINYAR AVSEC Awareness",
                     "WASAEL HSE Induction", "WASAEL AVSEC Awareness"]) {
      expect(titles).toContain(t);
    }
  });
});

describe("designations map onto the matrix columns", () => {
  it("resolves the designations actually on the roster", () => {
    for (const d of ["AGL Technician", "Sr. AGL Technician", "AGL Supervisor",
                     "AGL Electrician", "FMV Driver", "Systems Technician",
                     "Helpdesk Operator", "Helper", "High Mast Technician",
                     "Team Leader", "Maintenance Manager"]) {
      expect(ROLE_ORDER).toContain(designationToRoleCode(d));
    }
  });

  it("falls back rather than returning nothing for an unknown designation", () => {
    expect(designationToRoleCode("Something Nobody Has")).toBe("GW");
    expect(designationToRoleCode(null)).toBeNull();
  });
});
