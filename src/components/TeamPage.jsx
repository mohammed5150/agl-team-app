import { SECTIONS, AIRPORTS, BAND_BY_KEY, theme } from "../constants.js";
import { gradeFromRating, TIER_COLORS, TIERS_CAP, TIER_CAP_COLORS } from "../rating.js";
import { parseCSV } from "../helpers.js";
import { ib, Bd, Bt, Modal } from "../uiPrimitives.jsx";
import { GlyphIcon } from "../icons.jsx";

const { useState } = React;

/* ============================================================
   TEAM LIST
   ============================================================ */

export function InviteForm({ onInvite, onApproveLogin, onClose }) {
  const [fm, setFm] = useState({
    email: "", name: "", section: SECTIONS[0] || "",
    designation: "", role: "employee", tier: ""
  });
  const [err, setErr] = useState("");
  const [notice, setNotice] = useState("");
  // Set when the invite was refused because the address is not an approved
  // Team Mail ID. A manager can approve it here rather than needing a
  // developer with SQL access, which was the only route before.
  const [needsApproval, setNeedsApproval] = useState(false);
  const [busy, setBusy] = useState(false);
  const up = k => v => setFm(p => ({ ...p, [k]: v, ...(k === "email" ? {} : {}) }));
  // onInvite is async: the approved-address check is a database round trip
  // now that production bundles carry no local Team Mail ID list.
  const submit = async () => {
    if (busy) return;
    setErr(""); setNotice("");
    setBusy(true);
    try {
      const res = await onInvite(fm);
      if (!res.ok) {
        setErr(res.error || "Failed to invite");
        setNeedsApproval(!!res.notApproved && !!onApproveLogin);
        return;
      }
      onClose(res.id);
    } finally {
      setBusy(false);
    }
  };

  // Approve the address, then immediately retry the invite — the manager
  // asked to invite this person, not to perform two separate operations.
  const approveThenInvite = async () => {
    if (busy) return;
    setErr(""); setNotice("");
    setBusy(true);
    try {
      const appr = await onApproveLogin(fm.email, fm.name);
      if (!appr.ok) { setErr(appr.message); return; }
      setNotice(appr.message);
      setNeedsApproval(false);
      const res = await onInvite(fm);
      if (!res.ok) { setErr(res.error || "Failed to invite"); return; }
      onClose(res.id);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="Invite Employee" onClose={() => onClose(null)} width={520}>
      <p style={{ color:theme.ts, fontSize:12, margin:"0 0 14px" }}>
        Creates a placeholder record. The employee then signs up at the login
        page using this email and sets their own password — they'll land on the
        profile page to fill in personal details.
      </p>
      <div style={{ display:"grid", gap:10 }}>
        <label style={{ color:theme.tx, fontSize:12, fontWeight:600 }}>
          Email <span style={{ color:theme.rd }}>*</span>
          <input value={fm.email} onChange={e => up("email")(e.target.value)}
            placeholder="someone@adbsafegate.com or @gmail / @outlook"
            style={{ ...ib, marginTop:4 }} />
        </label>
        <label style={{ color:theme.tx, fontSize:12, fontWeight:600 }}>
          Full name <span style={{ color:theme.rd }}>*</span>
          <input value={fm.name} onChange={e => up("name")(e.target.value)}
            style={{ ...ib, marginTop:4 }} />
        </label>
        <label style={{ color:theme.tx, fontSize:12, fontWeight:600 }}>
          Section
          <select value={fm.section} onChange={e => up("section")(e.target.value)}
            style={{ ...ib, marginTop:4 }}>
            {SECTIONS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label style={{ color:theme.tx, fontSize:12, fontWeight:600 }}>
          Designation
          <input value={fm.designation} onChange={e => up("designation")(e.target.value)}
            style={{ ...ib, marginTop:4 }} />
        </label>
        <label style={{ color:theme.tx, fontSize:12, fontWeight:600 }}>
          Role
          <select value={fm.role} onChange={e => up("role")(e.target.value)}
            style={{ ...ib, marginTop:4 }}>
            <option value="employee">Employee</option>
            <option value="teamlead">Team Lead</option>
            <option value="manager">Manager</option>
          </select>
        </label>
        <div>
          <div style={{ color:theme.tx, fontSize:12, fontWeight:600, marginBottom:6 }}>
            Capability Tier
          </div>
          <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
            {["", ...TIERS_CAP].map(t => (
              <button key={t || "none"} onClick={() => up("tier")(t)} style={{
                padding:"8px 14px", borderRadius:8, fontWeight:700, cursor:"pointer", fontSize:12,
                background: fm.tier === t ? (TIER_CAP_COLORS[t] || theme.ch) : theme.ch,
                color: fm.tier === t && t ? "#fff" : theme.tx,
                border: `1px solid ${fm.tier === t ? (TIER_CAP_COLORS[t] || theme.bd) : theme.bd}`
              }}>{t || "—"}</button>
            ))}
          </div>
        </div>
      </div>
      {err && (
        <div role="alert" style={{
          background:"rgba(239,68,68,0.1)", border:"1px solid rgba(239,68,68,0.3)",
          borderRadius:8, padding:"8px 12px", marginTop:12, color:theme.rd, fontSize:12, lineHeight:1.6
        }}><GlyphIcon glyph="alert-triangle" size={13} style={{ verticalAlign:"-2px" }} /> {err}</div>
      )}
      {notice && (
        <div role="status" style={{
          background:"rgba(16,185,129,0.1)", border:"1px solid rgba(16,185,129,0.3)",
          borderRadius:8, padding:"8px 12px", marginTop:12, color:theme.gn, fontSize:12
        }}>✓ {notice}</div>
      )}
      {needsApproval && (
        <div style={{
          background:`${theme.yl}12`, border:`1px solid ${theme.yl}35`,
          borderRadius:8, padding:"10px 12px", marginTop:10, fontSize:12,
          color:theme.ts, lineHeight:1.6
        }}>
          You can add this address to the approved Team Mail ID list yourself.
          Check the spelling first — approving a mistyped address would let
          whoever really owns it create a Team Portal account.
          <div style={{ marginTop:8 }}>
            <Bt onClick={approveThenInvite} bg={theme.yl} small={true} disabled={busy}>
              {busy ? "Working…" : `Approve ${fm.email} and invite`}
            </Bt>
          </div>
        </div>
      )}
      <div style={{ display:"flex", gap:10, justifyContent:"flex-end", marginTop:16 }}>
        <Bt onClick={() => onClose(null)} outline={true}>Cancel</Bt>
        <Bt onClick={submit} bg={theme.gn} disabled={busy}>{busy ? "Checking…" : "Send invite"}</Bt>
      </div>
    </Modal>
  );
}

export function BulkInviteForm({ onBulkInvite, onClose }) {
  const [csv, setCsv] = useState("");
  const [preview, setPreview] = useState(null);  // { columns, rows } | null
  const [result,  setResult]  = useState(null);  // outcome from onBulkInvite | null

  const sample = "email,name,section,designation,role,tier\n" +
                 "john.doe@adbsafegate.com,John Doe,AGL 12hrs,Technician,employee,T2\n" +
                 "jane.smith@gmail.com,Jane Smith,Helpdesk,Specialist,employee,T1";

  const parsePreview = () => {
    const parsed = parseCSV(csv);
    if (!parsed.rows.length) {
      setPreview({ columns: parsed.columns, rows: [], err: "No data rows. Paste at least one row." });
      return;
    }
    // Map each row to an object using the column order
    const rowsObj = parsed.rows.map(cols => {
      const o = {};
      parsed.columns.forEach((c, i) => o[c] = cols[i] || "");
      return o;
    });
    setPreview({ columns: parsed.columns, rows: rowsObj });
    setResult(null);
  };

  const [busy, setBusy] = useState(false);

  const importNow = async () => {
    if (!preview?.rows?.length || busy) return;
    setBusy(true);
    try {
      const r = await onBulkInvite(preview.rows);
      setResult(r);
    } finally {
      setBusy(false);
    }
  };

  const headers = ["email","name","section","designation","role","tier"];

  return (
    <Modal title="Bulk Import Employees (CSV)" onClose={() => onClose(result)} width={760}>
      {!result && (
        <>
          <p style={{ color:theme.ts, fontSize:12, margin:"0 0 10px" }}>
            Paste a CSV (or copy a range from Excel — tab-separated also works).
            First row may be a header. Recognized columns: {headers.join(", ")}.
            Tier values: T1, T2, T3, T4 or blank.
          </p>
          <details style={{ color:theme.td, fontSize:11, marginBottom:10 }}>
            <summary style={{ cursor:"pointer" }}>Sample format</summary>
            <pre style={{ background:theme.ch, padding:10, borderRadius:6, marginTop:6, fontSize:11, overflow:"auto" }}>
{sample}
            </pre>
          </details>
          <textarea
            value={csv}
            onChange={e => setCsv(e.target.value)}
            placeholder="Paste rows here…"
            rows={8}
            style={{ ...ib, fontFamily:"monospace", fontSize:12, resize:"vertical" }}
          />
          <div style={{ display:"flex", gap:8, justifyContent:"flex-end", marginTop:12 }}>
            <Bt onClick={() => onClose(null)} outline={true}>Cancel</Bt>
            <Bt onClick={parsePreview} bg={theme.bu} disabled={!csv.trim()}>Parse preview</Bt>
          </div>

          {preview && preview.err && (
            <div style={{ color:theme.rd, fontSize:12, marginTop:12 }}>{preview.err}</div>
          )}

          {preview && preview.rows?.length > 0 && (
            <div style={{ marginTop:14 }}>
              <div style={{ color:theme.tx, fontSize:13, fontWeight:700, marginBottom:6 }}>
                Preview ({preview.rows.length} rows)
              </div>
              <div style={{ maxHeight:240, overflowY:"auto", border:`1px solid ${theme.bd}`, borderRadius:8 }}>
                <table style={{ width:"100%", borderCollapse:"collapse", fontSize:11 }}>
                  <thead>
                    <tr style={{ background:theme.ch, position:"sticky", top:0 }}>
                      {headers.map(h => (
                        <th key={h} style={{ padding:"6px 8px", textAlign:"left", color:theme.td, fontWeight:700, fontSize:10, textTransform:"uppercase" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.map((r, i) => (
                      <tr key={i} style={{ borderTop:`1px solid ${theme.bd}` }}>
                        {headers.map(h => (
                          <td key={h} style={{ padding:"4px 8px", color:theme.tx, whiteSpace:"nowrap" }}>{r[h] || ""}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ display:"flex", gap:8, justifyContent:"flex-end", marginTop:12 }}>
                <Bt onClick={() => { setPreview(null); setCsv(""); }} outline={true}>Clear</Bt>
                <Bt onClick={importNow} bg={theme.gn} disabled={busy}>{busy ? "Importing…" : `Import ${preview.rows.length} rows`}</Bt>
              </div>
            </div>
          )}
        </>
      )}

      {result && (
        <>
          <div style={{
            background:"rgba(16,185,129,0.08)", border:"1px solid rgba(16,185,129,0.3)",
            borderRadius:10, padding:14, marginBottom:14
          }}>
            <div style={{ color:theme.gn, fontSize:14, fontWeight:700 }}>
              Done — {result.created} created, {result.skipped} skipped, {result.errors} errors
            </div>
          </div>
          {result.outcomes.length > 0 && (
            <div style={{ maxHeight:300, overflowY:"auto", border:`1px solid ${theme.bd}`, borderRadius:8 }}>
              <table style={{ width:"100%", borderCollapse:"collapse", fontSize:11 }}>
                <thead>
                  <tr style={{ background:theme.ch, position:"sticky", top:0 }}>
                    {["#","email","status","details"].map(h => (
                      <th key={h} style={{ padding:"6px 8px", textAlign:"left", color:theme.td, fontWeight:700, fontSize:10, textTransform:"uppercase" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.outcomes.map((o, i) => (
                    <tr key={i} style={{ borderTop:`1px solid ${theme.bd}` }}>
                      <td style={{ padding:"4px 8px", color:theme.td }}>{o.line}</td>
                      <td style={{ padding:"4px 8px", color:theme.tx }}>{o.email}</td>
                      <td style={{ padding:"4px 8px" }}>
                        <Bd
                          text={o.status}
                          color={o.status === "created" ? theme.gn : o.status === "skipped" ? theme.yl : theme.rd}
                        />
                      </td>
                      <td style={{ padding:"4px 8px", color:theme.ts }}>{o.id || o.reason || ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div style={{ display:"flex", gap:8, justifyContent:"flex-end", marginTop:12 }}>
            <Bt onClick={() => onClose(result)} bg={theme.gn}>Close</Bt>
          </div>
        </>
      )}
    </Modal>
  );
}

export function Team({ employees, onSel, isMgr, isTL, onInvite, onBulkInvite, onApproveLogin }) {
  const [f, setF] = useState("All");
  const [tierF, setTierF] = useState("all");
  const [s, setS] = useState("");
  const [apF, setApF] = useState("All");
  const [showInvite, setShowInvite] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const showRating = isMgr || isTL;

  const fl = employees
    .filter(e => f === "All" || e.section === f)
    .filter(e => apF === "All" || e.airport === apF)
    .filter(e => !e.name.toLowerCase().includes(s.toLowerCase()) ? false : true)
    .filter(e => {
      if (!showRating || tierF === "all") return true;
      if (tierF === "unrated") return !gradeFromRating(e.rating);
      if (tierF.startsWith("grade:")) return gradeFromRating(e.rating)?.label === tierF.slice(6);
      if (tierF.startsWith("cap:")) return e.tier === tierF.slice(4);
      return e.rating?.tier === tierF;
    });

  const headers = showRating
    ? (isMgr
        ? ["Name","Section","Designation","Band","Grade","Tier","Salary",""]
        : ["Name","Section","Designation","Band","Grade","Tier",""])
    : ["Name","Section","Designation","Band",""];

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16, flexWrap:"wrap", gap:10 }}>
        <h2 style={{ fontSize:22, fontWeight:700, color:theme.tx, margin:0 }}>All Employees ({employees.length})</h2>
        {isMgr && (
          <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
            {onBulkInvite && (
              <Bt onClick={() => setShowBulk(true)} bg={theme.bu}><GlyphIcon glyph="clipboard" size={13} /> Bulk Import (CSV)</Bt>
            )}
            {onInvite && (
              <Bt onClick={() => setShowInvite(true)} bg={theme.gn}>+ Invite Employee</Bt>
            )}
          </div>
        )}
      </div>
      <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:12 }}>
        {["All", ...SECTIONS].map(sec => (
          <button type="button" key={sec} onClick={() => setF(sec)} style={{
            padding:"7px 16px", borderRadius:10, cursor:"pointer",
            fontSize:12, fontWeight:600,
            background: f === sec ? theme.pl : theme.card, border:"none",
            color: f === sec ? "#fff" : theme.ts
          }}>{sec} ({sec === "All" ? employees.length : employees.filter(e => e.section === sec).length})</button>
        ))}
      </div>
      <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:12 }}>
        {["All", ...AIRPORTS].map(ap => {
          const n = ap === "All" ? employees.length : employees.filter(e => e.airport === ap).length;
          if (ap !== "All" && n === 0) return null;
          return (
            <button type="button" key={ap} onClick={() => setApF(ap)} style={{
              padding:"6px 14px", borderRadius:8, cursor:"pointer", fontSize:11, fontWeight:600,
              background: apF === ap ? theme.cy : theme.card, border:"none",
              color: apF === ap ? "#0b1a2b" : theme.ts
            }}>{ap} ({n})</button>
          );
        })}
      </div>
      {showRating && (
        <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:12 }}>
          {[{k:"all",l:"All"},{k:"grade:A+",l:"A+"},{k:"grade:A",l:"A"},{k:"grade:B+",l:"B+"},{k:"grade:B",l:"B"},{k:"grade:C",l:"C"},
            ...TIERS_CAP.map(t => ({ k:`cap:${t}`, l:t })),
            ...(isMgr ? [{k:"A",l:"Salary A"},{k:"B",l:"Salary B"},{k:"C",l:"Salary C"}] : []),
            {k:"unrated",l:"Unrated"}].map(x => (
            <button type="button" key={x.k} onClick={() => setTierF(x.k)} style={{
              padding:"6px 14px", borderRadius:8, cursor:"pointer", fontSize:11, fontWeight:600,
              background: tierF === x.k ? theme.or : theme.card, border:"none",
              color: tierF === x.k ? "#fff" : theme.ts
            }}>{x.l}</button>
          ))}
        </div>
      )}
      <input placeholder="Search..." value={s} onChange={e => setS(e.target.value)}
        style={{ ...ib, marginBottom:14 }} />
      <div style={{ background:theme.card, borderRadius:14, border:`1px solid ${theme.bd}`, overflow:"hidden" }}>
        <div style={{ overflowX:"auto" }}>
          <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
            <thead>
              <tr style={{ background:"rgba(255,255,255,0.03)" }}>
                {headers.map(h => (
                  <th key={h} style={{
                    padding:"12px", textAlign:"left", color:theme.td,
                    fontWeight:700, fontSize:10, textTransform:"uppercase"
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {fl.map(e => {
                const grade = gradeFromRating(e.rating);
                return (
                  <tr key={e.id} style={{ borderTop:`1px solid ${theme.bd}` }}>
                    <td style={{ padding:"10px 12px", color:theme.tx, fontWeight:500 }}>{e.name}</td>
                    <td style={{ padding:"10px 12px" }}><Bd text={e.section} color={theme.bu} /></td>
                    <td style={{ padding:"10px 12px", color:theme.ts }}>{e.designation}</td>
                    <td style={{ padding:"10px 12px" }}>
                      {e.band
                        ? <Bd text={e.band} color={(BAND_BY_KEY[e.band] || {}).color || theme.bu} />
                        : <span style={{ color:theme.td, fontSize:11 }}>—</span>}
                    </td>
                    {showRating && (
                      <td style={{ padding:"10px 12px" }}>
                        {grade ? <Bd text={grade.label} color={grade.color} /> : <span style={{ color:theme.td, fontSize:11 }}>—</span>}
                      </td>
                    )}
                    {showRating && (
                      <td style={{ padding:"10px 12px" }}>
                        {e.tier
                          ? <Bd text={e.tier} color={TIER_CAP_COLORS[e.tier] || theme.bu} />
                          : <span style={{ color:theme.td, fontSize:11 }}>—</span>}
                      </td>
                    )}
                    {isMgr && (
                      <td style={{ padding:"10px 12px" }}>
                        {e.rating?.tier ? <Bd text={e.rating.tier} color={TIER_COLORS[e.rating.tier]} /> : <span style={{ color:theme.td, fontSize:11 }}>—</span>}
                      </td>
                    )}
                    <td style={{ padding:"10px 12px" }}><Bt onClick={() => onSel(e)} small={true}>View</Bt></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      {showInvite && isMgr && onInvite && (
        <InviteForm onInvite={onInvite} onApproveLogin={onApproveLogin}
          onClose={() => setShowInvite(false)} />
      )}
      {showBulk && isMgr && onBulkInvite && (
        <BulkInviteForm onBulkInvite={onBulkInvite}
          onClose={() => setShowBulk(false)} />
      )}
    </div>
  );
}
