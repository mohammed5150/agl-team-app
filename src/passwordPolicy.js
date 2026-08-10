// Password policy — one definition, used by every path that accepts a password.
//
// WHY THIS MODULE EXISTS
// The portal accepts a password in three places: first-ever sign-in (which
// signs the user up and so SETS their permanent password), the change-password
// screen, and the reset-password screen reached from a recovery email. Before
// this module they disagreed — the change screen asked for 6 characters with an
// uppercase and a digit, and the sign-up path asked for nothing at all beyond
// whatever Supabase's own minimum happened to be. The weakest path is the one
// that decides an account's real strength, so all three now share this file.
//
// WHAT IT IS NOT
// A client-side check is a usability feature, not a security boundary — anyone
// can call Supabase Auth directly. The boundary is Supabase's own password
// policy, which must be raised to match in the project's Auth settings (see
// docs/SECURITY.md). This module makes the app consistent and tells the user
// exactly what is wrong before the round trip.

export const MIN_LENGTH = 12;
export const MAX_LENGTH = 128;

/**
 * Passwords that must never be accepted regardless of how they score against
 * the character rules. Deliberately short: it covers the shapes people reach
 * for on a shared onboarding password (the exact risk called out in the
 * publishing checklist), not a general breach corpus. Compared lowercased and
 * with trailing digits/punctuation stripped, so "Password123!" is caught by
 * the "password" entry.
 */
// Entries must be plain lowercase letters: baseOf() folds digits and symbols
// away before comparing, so a leetspeak entry here could never match. Rely on
// that folding instead — "password" already catches "P4ssw0rd!".
export const BANNED_BASES = [
  "password", "letmein", "welcome", "changeme", "qwerty",
  "abcdef", "iloveyou", "admin", "administrator", "login", "secret",
  // Portal- and employer-specific guesses.
  "adbsafegate", "safegate", "adbportal", "portal", "aglteam", "agl",
  "abudhabi", "airport", "maintenance", "teamportal",
];

/** Digit-for-letter substitutions people reach for when a policy demands one. */
const LEET = { 0: "o", 1: "i", 3: "e", 4: "a", 5: "s", 7: "t", 8: "b", 9: "g", $: "s", "@": "a", "!": "i" };

/**
 * Normalised form used for the banned-base comparison: lowercased, common
 * substitutions undone, everything else dropped. So "P4ssw0rd!" and
 * "p-a-s-s-w-o-r-d" both reduce to "password" and are caught by one entry.
 */
function baseOf(pw) {
  return String(pw)
    .toLowerCase()
    .replace(/[0134578 9$@!]/g, c => LEET[c] || "")
    .replace(/[^a-z]/g, "");
}

/**
 * Every rule, in the order they are shown to the user. `test` receives
 * ({ password, email, name }) so identity rules can be expressed here too
 * rather than being bolted on at each call site.
 */
export const RULES = [
  {
    key: "length",
    label: `At least ${MIN_LENGTH} characters`,
    test: ({ password }) => password.length >= MIN_LENGTH,
  },
  {
    key: "uppercase",
    label: "One uppercase letter",
    test: ({ password }) => /[A-Z]/.test(password),
  },
  {
    key: "lowercase",
    label: "One lowercase letter",
    test: ({ password }) => /[a-z]/.test(password),
  },
  {
    key: "digit",
    label: "One number",
    test: ({ password }) => /[0-9]/.test(password),
  },
  {
    key: "symbol",
    label: "One symbol (e.g. ! ? @ #)",
    test: ({ password }) => /[^A-Za-z0-9]/.test(password),
  },
  {
    key: "notCommon",
    label: "Not a common or portal-related word",
    test: ({ password }) => {
      const base = baseOf(password);
      if (!base) return true;
      return !BANNED_BASES.some(b => base === b || base.startsWith(b));
    },
  },
  {
    key: "notIdentity",
    label: "Does not contain your name or email",
    test: ({ password, email, name }) => {
      const pw = password.toLowerCase();
      const local = String(email || "").split("@")[0].toLowerCase();
      // Split the email local part and the display name into words worth
      // checking. Two-character fragments match far too much to be useful.
      const parts = [
        ...local.split(/[^a-z0-9]+/i),
        ...String(name || "").split(/\s+/),
      ].map(s => s.toLowerCase()).filter(s => s.length >= 3);
      return !parts.some(p => pw.includes(p));
    },
  },
  {
    key: "notRepeated",
    label: "Not a single repeated character or a run like 1234",
    test: ({ password }) => {
      if (/^(.)\1*$/.test(password)) return false;
      const seqs = "abcdefghijklmnopqrstuvwxyz0123456789";
      const lower = password.toLowerCase();
      for (let i = 0; i + 5 <= seqs.length; i++) {
        const run = seqs.slice(i, i + 5);
        if (lower.includes(run)) return false;
        if (lower.includes([...run].reverse().join(""))) return false;
      }
      return true;
    },
  },
];

/**
 * Check a candidate password.
 *
 * @param {string} password
 * @param {{ email?: string, name?: string }} [identity]
 * @returns {{ ok: boolean, failed: string[], results: Array<{key,label,pass}>, error: string }}
 *   `error` is a single sentence suitable for showing directly; empty when ok.
 */
export function checkPassword(password, identity = {}) {
  const pw = typeof password === "string" ? password : "";
  const ctx = { password: pw, email: identity.email || "", name: identity.name || "" };

  if (!pw) {
    return {
      ok: false,
      failed: RULES.map(r => r.key),
      results: RULES.map(r => ({ key: r.key, label: r.label, pass: false })),
      error: "Enter a password",
    };
  }
  if (pw.length > MAX_LENGTH) {
    return {
      ok: false,
      failed: ["length"],
      results: RULES.map(r => ({ key: r.key, label: r.label, pass: r.key !== "length" })),
      error: `Password must be ${MAX_LENGTH} characters or fewer`,
    };
  }

  const results = RULES.map(r => ({ key: r.key, label: r.label, pass: !!r.test(ctx) }));
  const failed = results.filter(r => !r.pass);
  return {
    ok: failed.length === 0,
    failed: failed.map(r => r.key),
    results,
    // One requirement outstanding reads better named; several read better
    // summarised, because listing them all makes an unreadable sentence.
    error: failed.length === 0 ? ""
      : failed.length === 1 ? `Password needs: ${failed[0].label.toLowerCase()}`
      : `Password does not meet the requirements (${failed.length} still to go)`,
  };
}

/** Convenience predicate for call sites that only need a yes/no. */
export function isStrongPassword(password, identity = {}) {
  return checkPassword(password, identity).ok;
}

/**
 * 0-4 strength score derived from the same rules, for the meter in the UI.
 * Deliberately derived from the rule results rather than an independent
 * entropy estimate, so the meter can never say "strong" about a password the
 * form is about to refuse.
 */
export function passwordStrength(password, identity = {}) {
  const { results, ok } = checkPassword(password, identity);
  const passed = results.filter(r => r.pass).length;
  if (!ok) return Math.min(2, Math.floor((passed / RULES.length) * 3));
  // Everything required is satisfied; length beyond the minimum is the only
  // thing left that meaningfully separates a good password from a great one.
  const pw = String(password);
  if (pw.length >= MIN_LENGTH + 8) return 4;
  return 3;
}

export const STRENGTH_LABELS = ["Very weak", "Weak", "Fair", "Strong", "Very strong"];

/** Human summary of the policy, for help text under a password field. */
export const POLICY_SUMMARY =
  `At least ${MIN_LENGTH} characters with upper and lower case, a number and a `
  + "symbol. Must not contain your name or email, or be a common word.";
