// Approved Team Mail IDs — the source of truth for onboarding eligibility.
//
// WHY THIS LIST EXISTS CLIENT-SIDE
// The eligibility check has to run BEFORE any Supabase call, because the old
// flow called auth.signUp() on any failed sign-in and so minted an auth user
// for whatever address was typed. At that point there is no session, so the
// employees table cannot be read (RLS denies anonymous select). A static list
// is the only thing available at that moment.
//
// WHAT THIS IS AND IS NOT
// This is a gate, not a security boundary. A determined caller can talk to
// Supabase directly and skip it. The real enforcement is two-layered:
//   1. Supabase Auth sign-up restrictions (dashboard: allowed email domains /
//      disabled open sign-up) — stops account creation at the source.
//   2. loadPortalData() signs out any authenticated email with no matching
//      employee row, so an account without a roster record reaches nothing.
// This list stops the accidental and the casual case, and gives the user a
// clear message instead of a silently-created orphan account.
//
// Addresses are stored verbatim and compared case-insensitively — one real ID
// is "Bv4haris@gmail.com".

export const APPROVED_TEAM_LOGINS = [
  "muhammed.farhan.ext@adbsafegate.com",  // Farhan
  "anurag.aikkal@adbsafegate.com",        // Anurag
  "amarnath.munderi@adbsafegate.com",     // Amarnath
  "gopakumar.gopinadhan@adbsafegate.com", // Gopa
  "nisar.ahmed@adbsafegate.com",          // Nisar
  "jjijosebastian311@gmail.com",          // Jiji — employee mapping UNRESOLVED
  "nithin.kumar@adbsafegate.com",         // Nithin
  "praveen6273@gmail.com",                // Praveen — employee mapping UNRESOLVED
  "jesudaskt22@gmail.com",                // Jesudas
  "prajeshprabhakar002@gmail.com",        // Prajesh
  "Bv4haris@gmail.com",                   // Haris
  "ragesh.menon@adbsafegate.com",         // Ragesh
  "sanoop.louis@adbsafegate.com",         // Sanoop
  "mohammed.faheem@adbsafegate.com",      // Mohammed Faheem
];

// Approved to sign in, but not yet mapped to an employee row. They will pass
// the login gate and then be stopped by loadPortalData with the "no employee
// record" message — which is the correct outcome until an admin confirms which
// roster entry each belongs to. Listed here so the gap is explicit rather than
// looking like an oversight.
export const UNRESOLVED_TEAM_LOGINS = [
  "praveen6273@gmail.com",
  "jjijosebastian311@gmail.com",
];

const APPROVED_SET = new Set(APPROVED_TEAM_LOGINS.map(e => e.toLowerCase()));

export const NOT_REGISTERED_MESSAGE =
  "This email address is not registered for the Team Portal. " +
  "Please contact your administrator.";

/** Is this address approved to create or access a Team Portal account? */
export function isApprovedTeamLogin(email) {
  if (typeof email !== "string") return false;
  const norm = email.trim().toLowerCase();
  if (!norm) return false;
  return APPROVED_SET.has(norm);
}

/** True for an approved address that has no employee record mapped yet. */
export function isUnresolvedTeamLogin(email) {
  if (typeof email !== "string") return false;
  const norm = email.trim().toLowerCase();
  return UNRESOLVED_TEAM_LOGINS.some(e => e.toLowerCase() === norm);
}
