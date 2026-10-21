// Approved Team Mail IDs — who onboarding admits.
//
// THE LIST LIVES ONLY IN THE DATABASE. This module asks for it; it holds no
// addresses of its own.
//
// HISTORY — WHY THERE IS NO CLIENT-SIDE COPY
// The eligibility check once had to run before any Supabase call, so the
// approved list was a static array here. That made it a build-time constant:
// a production bundle served 35 addresses, over half of them team members'
// PERSONAL Gmail accounts, to anyone who fetched /app.js. It was then compiled
// out of production behind an __EMBED_TEAM_DIRECTORY__ define, but the source
// still carried every address, and this repository is public. So the list has
// been removed from the source altogether. Do not reintroduce one, in this file
// or in a test: invent a placeholder on example.com instead.
//
// WHERE THE AUTHORITY IS
// supabase_team_onboarding.sql section f:
//   - approved_team_logins       the authoritative list, unreadable by
//                                anon/authenticated so it cannot be enumerated
//   - is_approved_team_login()   SECURITY DEFINER RPC returning one boolean
//   - trg_guard_auth_user_approved   BEFORE INSERT on auth.users, so an
//                                unapproved address cannot get an account even
//                                by calling Supabase directly
//   - trg_guard_employee_email_approved   blocks a roster row for one
// The seed data for a new project is supabase_team_onboarding_data.local.sql,
// which is gitignored; supabase_team_onboarding_data.example.sql shows its shape.
//
// Addresses are stored verbatim and compared case-insensitively.

export const NOT_REGISTERED_MESSAGE =
  "This email address is not registered for the Team Portal. " +
  "Please contact your administrator.";

/**
 * Approve a Team Mail ID so a new joiner can be invited and can sign in.
 *
 * Manager-only, enforced by the RPC itself (approve_team_login checks
 * is_manager()). Before this existed the only way to add an address was the
 * SQL editor, which meant every new hire needed a developer — or somebody was
 * handed the service-role key. Both are worse than an audited action by the
 * manager who already sets roles and pay bands.
 */
export async function approveTeamLogin(supa, email, label) {
  if (!supa) return { ok: false, message: "Backend unavailable — try again shortly" };
  const addr = (email || "").trim().toLowerCase();
  if (!addr.includes("@")) return { ok: false, message: "Enter a valid email address" };
  try {
    const { data, error } = await supa.rpc("approve_team_login", {
      p_email: addr,
      p_label: label || null,
    });
    if (error) {
      return {
        ok: false,
        message: /insufficient_privilege|Only a manager/i.test(error.message || "")
          ? "Only a manager can approve a Team Mail ID"
          : (error.message || "Could not approve that address"),
      };
    }
    return {
      ok: true,
      alreadyApproved: data === "already approved",
      message: data === "already approved"
        ? `${addr} was already approved`
        : `${addr} approved — they can now be invited and sign in`,
    };
  } catch (e) {
    console.warn("[onboarding] approve failed:", e);
    return { ok: false, message: "Could not approve that address. Check your connection." };
  }
}

/**
 * Authoritative eligibility check — asks the database.
 *
 * `approved` is deliberately THREE-VALUED:
 *   true   the RPC confirmed the address
 *   false  a definite refusal — show NOT_REGISTERED_MESSAGE
 *   null   no answer available (no client, or the RPC failed)
 *
 * Refusing on "don't know" would lock out the entire team the moment the RPC
 * hiccups, for no gain: an unapproved address that gets past this check is
 * still refused by trg_guard_auth_user_approved when Supabase tries to create
 * the account. Callers must therefore branch on `=== false`, never on falsy.
 */
export async function checkApprovedTeamLogin(supa, email) {
  if (!supa) return { approved: null, source: "unavailable" };
  try {
    const { data, error } = await supa.rpc("is_approved_team_login", {
      p_email: (email || "").trim(),
    });
    if (error) throw error;
    return { approved: data === true, source: "database" };
  } catch (e) {
    console.warn("[auth] approval RPC unavailable:", e?.message || e);
    return { approved: null, source: "unavailable" };
  }
}
