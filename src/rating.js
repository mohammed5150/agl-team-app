// Rating helpers
export const RATING_KEYS = [
  { k:"knowledge",  label:"Knowledge",  icon:"📘" },
  { k:"experience", label:"Experience", icon:"🏅" },
  { k:"loyalty",    label:"Loyalty",    icon:"🤝" },
  { k:"capability", label:"Capability", icon:"🛠️" },
];
export const gradeFromRating = r => {
  if (!r) return null;
  const vals = RATING_KEYS.map(x => Number(r[x.k]) || 0).filter(v => v > 0);
  if (vals.length < 4) return null;
  const avg = vals.reduce((a,b) => a+b, 0) / 4;
  if (avg >= 4.5) return { label:"A+", color:"#10b981" };
  if (avg >= 4.0) return { label:"A",  color:"#22c55e" };
  if (avg >= 3.5) return { label:"B+", color:"#eab308" };
  if (avg >= 3.0) return { label:"B",  color:"#f59e0b" };
  return { label:"C", color:"#ef4444" };
};
export const TIERS = ["A", "B", "C"];
export const TIER_COLORS = { A:"#10b981", B:"#f59e0b", C:"#94a3b8" };

// Capability tier — top-level employees.tier column. Visible to TL + Manager,
// editable by Manager only (server-side enforced by trigger in supabase_tier.sql).
export const TIERS_CAP = ["T1", "T2", "T3", "T4"];
export const TIER_CAP_COLORS = { T1:"#10b981", T2:"#38bdf8", T3:"#f59e0b", T4:"#94a3b8" };
