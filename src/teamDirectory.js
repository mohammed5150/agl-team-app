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
// This list is UX only. The authority lives in the database
// (supabase_team_onboarding.sql section f):
//   - approved_team_logins       the authoritative list, unreadable by
//                                anon/authenticated so it cannot be enumerated
//   - is_approved_team_login()   SECURITY DEFINER RPC returning one boolean
//   - trg_guard_auth_user_approved   BEFORE INSERT on auth.users, so an
//                                unapproved address cannot get an account even
//                                by calling Supabase directly
//   - trg_guard_employee_email_approved   blocks a roster row for one
// Bypassing the JavaScript therefore achieves nothing: the writes themselves
// are refused. This copy exists so the form can answer instantly and so the
// check still degrades safely if the RPC is unreachable.
//
// Addresses are stored verbatim and compared case-insensitively — one real ID
// is "Bv4haris@gmail.com".

export const APPROVED_TEAM_LOGINS = [
  "muhammed.farhan.ext@adbsafegate.com",  // Farhan — ADB-048
  "anurag.aikkal@adbsafegate.com",        // Anurag — ADB-009
  "amarnath.munderi@adbsafegate.com",     // Amarnath — ADB-001
  "gopakumar.gopinadhan@adbsafegate.com", // Gopa — ADB-005
  "nisar.ahmed@adbsafegate.com",          // Nisar — ADB-019
  "jjijosebastian311@gmail.com",          // Jiji — employee mapping UNRESOLVED
  "nithin.kumar@adbsafegate.com",         // Nithin — ADB-050
  "praveen6273@gmail.com",                // Praveen — employee mapping UNRESOLVED
  "jesudaskt22@gmail.com",                // Jesudas
  "prajeshprabhakar002@gmail.com",        // Prajesh — ADB-049
  "Bv4haris@gmail.com",                   // Haris — ADB-051
  "ragesh.menon@adbsafegate.com",         // Ragesh — ADB-3001, manager
  "sanoop.louis@adbsafegate.com",         // Sanoop — ADB-018
  "mohammed.faheem@adbsafegate.com",      // Mohammed Faheem — team lead
  // Second batch.
  "tahseenkhan2332@gmail.com",            // Tahseen Khan — ADB-027
  "vikrampal642@gmail.com",               // Vikram Pal — ADB-014
  "midhunbabu1902@gmail.com",             // Midhun Babu — ADB-035
  "vineethpatteri@gmail.com",             // Vineeth Patteri — ADB-032
  "dhivakarangunasekaran@gmail.com",      // Divakar Gunasekaran — ADB-056
  "yadunath.kaitheri@adbsafegate.com",    // Yadhunath Kaitheri — ADB-046
  "srigajeg84@gmail.com",                 // employee mapping UNRESOLVED
  "rajumottammal276@gmail.com",           // employee mapping UNRESOLVED
  "ganesh2842014@gmail.com",              // employee mapping UNRESOLVED
  "thomas2937@gmail.com",                 // employee mapping UNRESOLVED
  "abubaker.ab151@gmail.com",             // employee mapping UNRESOLVED
  "Mepeese@gmail.com",                    // employee mapping UNRESOLVED
  "muhammed.talhalateef@adbsafegate.com", // employee mapping UNRESOLVED
];

// Four addresses from the second batch are deliberately absent, because they
// are unusable as supplied:
//   "abhishe kabhi0280@gmail.com"  contains a space, and is ambiguous between
//                                  Abhishek Aramban ADB-055 and Abhishekh Pujari ADB-028
//   "sandeepse lvan1999@gmail.com" contains a space; likely sandeepselvan1999@gmail.com
//   "syedmuzaffar7869@gmsil.com"   "gmsil.com" is not a Gmail domain
//   "danisn.khan7556@gmail.com"    "danisn" looks like a typo for Danish Khan ADB-037
// Approving a mistyped address is not a harmless no-op — whoever really owns
// it could then create an account. Each needs confirming first.

// Approved to sign in, but not yet mapped to an employee row. They will pass
// the login gate and then be stopped by loadPortalData with the "no employee
// record" message — which is the correct outcome until an admin confirms which
// roster entry each belongs to. Listed here so the gap is explicit rather than
// looking like an oversight.
export const UNRESOLVED_TEAM_LOGINS = [
  "praveen6273@gmail.com",
  "jjijosebastian311@gmail.com",
  "srigajeg84@gmail.com",
  "rajumottammal276@gmail.com",
  "ganesh2842014@gmail.com",
  "thomas2937@gmail.com",
  "abubaker.ab151@gmail.com",
  "Mepeese@gmail.com",
  "muhammed.talhalateef@adbsafegate.com",
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

/**
 * Authoritative eligibility check — asks the database.
 *
 * Returns the RPC's boolean when it answers. If the RPC is unreachable (not
 * yet migrated, offline, network error) it falls back to the local list, which
 * is a strict subset of the same rule and still denies unknown addresses.
 * Either way the database triggers remain the actual boundary, so a wrong
 * answer here cannot grant access — only delay a correct refusal.
 */
export async function checkApprovedTeamLogin(supa, email) {
  const local = isApprovedTeamLogin(email);
  if (!supa) return { approved: local, source: "local" };
  try {
    const { data, error } = await supa.rpc("is_approved_team_login", {
      p_email: (email || "").trim(),
    });
    if (error) throw error;
    return { approved: data === true, source: "database" };
  } catch (e) {
    console.warn("[auth] approval RPC unavailable, using local list:", e?.message || e);
    return { approved: local, source: "local-fallback" };
  }
}
