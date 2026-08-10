// Approved Team Mail IDs — the record of who onboarding admits.
//
// ⚠️ THIS LIST IS NEVER SHIPPED TO PRODUCTION. See "PII" below.
//
// WHY A CLIENT-SIDE COPY EXISTED
// The eligibility check has to run BEFORE any Supabase call, because the old
// flow called auth.signUp() on any failed sign-in and so minted an auth user
// for whatever address was typed. At that point there is no session, so the
// employees table cannot be read (RLS denies anonymous select). A static list
// was the only thing available at that moment.
//
// PII — WHY IT IS NOW COMPILED OUT
// That reasoning made the list a build-time constant in a PUBLIC bundle. A
// production build served 35 addresses — over half of them team members'
// PERSONAL Gmail accounts — to anyone who fetched /app.js unauthenticated.
// That is a standing disclosure of staff contact details and a ready-made
// phishing target list, in exchange for saving one round trip on a form the
// user is about to wait on anyway.
//
// So the array below is gated on the __EMBED_TEAM_DIRECTORY__ compile-time
// define, which build.js sets FALSE for every production build (see
// scripts/verify-dist.js, which fails the build if an address survives into
// dist/app.js). Tests and `npm run dev` see the real list; the deployed
// bundle sees an empty one and asks the database instead.
//
// WHAT THIS IS AND IS NOT
// This list was always UX only. The authority lives in the database
// (supabase_team_onboarding.sql section f):
//   - approved_team_logins       the authoritative list, unreadable by
//                                anon/authenticated so it cannot be enumerated
//   - is_approved_team_login()   SECURITY DEFINER RPC returning one boolean
//   - trg_guard_auth_user_approved   BEFORE INSERT on auth.users, so an
//                                unapproved address cannot get an account even
//                                by calling Supabase directly
//   - trg_guard_employee_email_approved   blocks a roster row for one
// Bypassing the JavaScript therefore achieves nothing: the writes themselves
// are refused. Removing the list from the bundle costs no security at all —
// it only means the browser has to ask.
//
// Addresses are stored verbatim and compared case-insensitively — one real ID
// is "Bv4haris@gmail.com".

// True in tests and `npm run dev`; false in every production bundle.
const EMBED = typeof __EMBED_TEAM_DIRECTORY__ !== "undefined"
  ? __EMBED_TEAM_DIRECTORY__
  : true;

const TEAM_LOGINS_SOURCE = [
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
  // Third batch — the four that arrived unusable and were corrected by an
  // administrator before being approved. The as-supplied forms are below.
  "sandeepselvan1999@gmail.com",          // Sandeep Selvan — ADB-036
  "abhishekabhi0280@gmail.com",           // Abhishek Aramban — ADB-055
  "syedmuzaffar7869@gmail.com",           // Syed Mussafir Shah — ADB-054
  "danish.khan7556@gmail.com",            // Danish Khan — ADB-037
];

// These four arrived in a form that could not be approved, and were held back
// until an administrator confirmed the correction. The BROKEN forms must never
// reappear on the list — a space makes an address invalid outright, and a
// mistyped domain is worse than useless: whoever really owns the mistyped
// address could create a Team Portal account with it.
//   as supplied                     corrected to
//   "abhishe kabhi0280@gmail.com"   abhishekabhi0280@gmail.com   (also chose
//                                   Abhishek Aramban ADB-055 over Abhishekh Pujari ADB-028)
//   "sandeepse lvan1999@gmail.com"  sandeepselvan1999@gmail.com
//   "syedmuzaffar7869@gmsil.com"    syedmuzaffar7869@gmail.com   (gmsil -> gmail)
//   "danisn.khan7556@gmail.com"     danish.khan7556@gmail.com    (danisn -> danish)

// Approved to sign in, but not yet mapped to an employee row. They will pass
// the login gate and then be stopped by loadPortalData with the "no employee
// record" message — which is the correct outcome until an admin confirms which
// roster entry each belongs to. Listed here so the gap is explicit rather than
// looking like an oversight.
const UNRESOLVED_LOGINS_SOURCE = [
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

// Empty in a production bundle — esbuild folds `EMBED` to false and drops both
// arrays, so no address reaches dist/app.js.
export const APPROVED_TEAM_LOGINS   = EMBED ? TEAM_LOGINS_SOURCE : [];
export const UNRESOLVED_TEAM_LOGINS = EMBED ? UNRESOLVED_LOGINS_SOURCE : [];

/** Does this build carry the directory at all? False in production. */
export const HAS_EMBEDDED_DIRECTORY = EMBED;

const APPROVED_SET = new Set(APPROVED_TEAM_LOGINS.map(e => e.toLowerCase()));

export const NOT_REGISTERED_MESSAGE =
  "This email address is not registered for the Team Portal. " +
  "Please contact your administrator.";

export const APPROVAL_UNAVAILABLE_MESSAGE =
  "We could not check your address just now. Try again in a moment.";

/**
 * Is this address on the LOCAL copy of the approved list?
 *
 * Only meaningful when HAS_EMBEDDED_DIRECTORY is true. A production bundle has
 * no list, so this answers false for everyone — which is why nothing that
 * decides access may call it directly. Use checkApprovedTeamLogin instead.
 */
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
 * `approved` is deliberately THREE-VALUED:
 *   true   the RPC confirmed the address, or the embedded list did
 *   false  a definite refusal — show NOT_REGISTERED_MESSAGE
 *   null   no answer available (RPC unreachable AND no embedded directory)
 *
 * The null case matters because production bundles no longer carry the list.
 * Refusing on "don't know" would lock out the entire team the moment the RPC
 * hiccups, for no gain: an unapproved address that gets past this check is
 * still refused by trg_guard_auth_user_approved when Supabase tries to create
 * the account. Callers must therefore branch on `=== false`, never on falsy.
 */
export async function checkApprovedTeamLogin(supa, email) {
  const local = isApprovedTeamLogin(email);
  if (!supa) {
    return EMBED
      ? { approved: local, source: "local" }
      : { approved: null, source: "unavailable" };
  }
  try {
    const { data, error } = await supa.rpc("is_approved_team_login", {
      p_email: (email || "").trim(),
    });
    if (error) throw error;
    return { approved: data === true, source: "database" };
  } catch (e) {
    console.warn("[auth] approval RPC unavailable:", e?.message || e);
    // With a directory compiled in (dev/tests) the local list is a safe
    // stand-in. Without one, say so rather than inventing a refusal.
    return EMBED
      ? { approved: local, source: "local-fallback" }
      : { approved: null, source: "unavailable" };
  }
}
