import { theme } from "../constants.js";
import { checkPassword, passwordStrength, STRENGTH_LABELS, RULES } from "../passwordPolicy.js";

/**
 * Live requirement checklist + strength meter.
 *
 * Shared by every screen that sets a password (first sign-in, change password,
 * reset from a recovery link) so all three state the same rules in the same
 * words. The list is rendered from passwordPolicy.RULES rather than restated
 * here, so a rule change cannot leave the UI describing the old policy.
 */
export function PasswordRequirements({ password, identity = {}, showWhenEmpty = false }) {
  const pw = password || "";
  if (!pw && !showWhenEmpty) return null;

  const { results } = checkPassword(pw, identity);
  const score = pw ? passwordStrength(pw, identity) : 0;
  const meterColor = score >= 3 ? theme.gn : score >= 2 ? theme.yl : theme.rd;

  return (
    <div style={{ marginBottom: 14 }}>
      {pw && (
        <div style={{ marginBottom: 10 }}>
          <div
            style={{
              display: "flex", gap: 4, marginBottom: 5,
            }}
            role="img"
            aria-label={`Password strength: ${STRENGTH_LABELS[score]}`}
          >
            {[0, 1, 2, 3].map(i => (
              <div key={i} style={{
                flex: 1, height: 4, borderRadius: 2,
                background: i < score ? meterColor : "rgba(255,255,255,0.1)",
                transition: "background 0.2s",
              }} />
            ))}
          </div>
          <div style={{ fontSize: 10, color: meterColor, fontWeight: 700, letterSpacing: 0.5 }}>
            {STRENGTH_LABELS[score]}
          </div>
        </div>
      )}
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 3 }}>
        {results.map(r => (
          <li key={r.key} style={{
            fontSize: 11,
            color: r.pass ? theme.gn : theme.td,
            display: "flex", alignItems: "center", gap: 6,
          }}>
            <span aria-hidden="true" style={{ fontSize: 10, width: 12 }}>
              {r.pass ? "✓" : "○"}
            </span>
            <span>{r.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export { RULES };
