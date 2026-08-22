import { theme } from "../constants.js";
import {
  EMPLOYEE_EDITABLE_FIELDS, REQUIRED_FIELDS, FIELD_LABELS,
  missingRequired, isProfileComplete, completionPercent,
  profileStatus, PROFILE_STATUS, PROFILE_STATUS_LABELS,
  FINALIZE_CONFIRM_MESSAGE,
} from "../onboarding.js";
import { ib, Bt, Sec, Modal } from "../uiPrimitives.jsx";
import { GlyphIcon } from "../icons.jsx";

const { useState } = React;

/* ============================================================
   PROFILE SETUP — first-login onboarding
   Complete → Review → Finalize (confirm) → locked
   ============================================================ */

const STATUS_COLOR = {
  [PROFILE_STATUS.INCOMPLETE]: theme.yl,
  [PROFILE_STATUS.READY]: theme.bu,
  [PROFILE_STATUS.FINALIZED]: theme.gn,
};

export function ProfileStatusBadge({ emp }) {
  const st = profileStatus(emp);
  const color = STATUS_COLOR[st];
  return (
    <span style={{
      display:"inline-block", padding:"4px 12px", borderRadius:20,
      background:`${color}20`, border:`1px solid ${color}55`,
      color, fontSize:11, fontWeight:700
    }}>{PROFILE_STATUS_LABELS[st]}</span>
  );
}

function Progress({ pct }) {
  return (
    <div style={{ marginBottom:18 }}>
      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
        <span style={{ fontSize:11, color:theme.td, fontWeight:700, letterSpacing:1 }}>COMPLETION</span>
        <span style={{ fontSize:11, color:theme.or, fontWeight:700 }}>{pct}%</span>
      </div>
      <div
        role="progressbar"
        aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}
        style={{ height:6, borderRadius:3, background:theme.ch, overflow:"hidden" }}
      >
        <div style={{ width:`${pct}%`, height:"100%", background:theme.ga, transition:"width .3s" }} />
      </div>
    </div>
  );
}

// Field types that need a specific input control.
const FIELD_TYPE = {
  dob: "date", passportExpiry: "date", visaExpiry: "date", eidExpiry: "date",
  mobile: "tel", emergencyContact: "tel",
};

const GROUPS = [
  { title:"Personal", icon:"👤", fields:["name","nationality","dob","maritalStatus","mobile","address"] },
  { title:"Emergency contact", icon:"🚨", fields:["emergencyName","emergencyContact"] },
  { title:"Documents", icon:"📄", fields:["passportNo","passportExpiry","visaExpiry","eidNo","eidExpiry"] },
];

function FieldRow({ f, value, onChange, readOnly }) {
  const required = REQUIRED_FIELDS.includes(f);
  const blank = value === null || value === undefined || String(value).trim() === "";
  return (
    <div style={{ marginBottom:14 }}>
      <label style={{ display:"block", fontSize:10, color:theme.td, fontWeight:700, marginBottom:5, letterSpacing:1, textTransform:"uppercase" }}>
        {FIELD_LABELS[f]}
        {required && <span style={{ color:theme.or, marginLeft:4 }}>*</span>}
      </label>
      {readOnly
        ? <div style={{ ...ib, background:"transparent", borderColor:theme.bd }}>{blank ? "—" : value}</div>
        : <input
            type={FIELD_TYPE[f] || "text"}
            value={value || ""}
            onChange={e => onChange(e.target.value)}
            style={{
              ...ib,
              borderColor: required && blank ? `${theme.yl}80` : theme.or,
              background:"rgba(255,255,255,0.08)",
            }}
          />}
    </div>
  );
}

export function Onboarding({ emp, onSave, onFinalize, onSkip }) {
  const [fm, setFm] = useState(() => {
    // Pre-fill from whatever the record already holds. Nothing is invented.
    const seed = {};
    for (const f of EMPLOYEE_EDITABLE_FIELDS) seed[f] = emp[f] ?? "";
    return seed;
  });
  const [step, setStep] = useState("edit");      // edit | review
  const [confirming, setConfirming] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState("");

  const merged = { ...emp, ...fm };
  const missing = missingRequired(merged);
  const complete = isProfileComplete(merged);
  const pct = completionPercent(merged);

  const up = f => v => { setFm(p => ({ ...p, [f]:v })); setSaved(false); setErr(""); };

  const saveDraft = () => {
    onSave(fm);
    setSaved(true);
  };

  const goReview = () => {
    if (!complete) {
      setErr(`Still needed: ${missing.map(f => FIELD_LABELS[f]).join(", ")}`);
      return;
    }
    onSave(fm);
    setErr("");
    setStep("review");
  };

  const doFinalize = () => {
    setConfirming(false);
    onFinalize(fm);
  };

  return (
    <div style={{ minHeight:"100vh", background:theme.bg, padding:"32px 16px" }}>
      <div style={{ maxWidth:760, margin:"0 auto" }}>
        <div style={{ textAlign:"center", marginBottom:24 }}>
          <h1 style={{ color:theme.tx, fontSize:24, fontWeight:800, margin:0 }}>Profile Setup</h1>
          <p style={{ color:theme.ts, fontSize:13, margin:"8px 0 12px" }}>
            Welcome, {emp.name || emp.email}. Complete your details to finish onboarding.
          </p>
          <ProfileStatusBadge emp={merged} />
        </div>

        <div style={{ background:theme.cs, borderRadius:16, padding:24, border:`1px solid ${theme.bd}` }}>
          <Progress pct={pct} />

          <div style={{ fontSize:11, color:theme.td, marginBottom:16 }}>
            Signed in as <strong style={{ color:theme.ts }}>{emp.email}</strong> — this is your
            permanent login ID and cannot be changed here.
          </div>

          {err && (
            <div role="alert" style={{
              background:"rgba(245,166,35,0.1)", border:`1px solid ${theme.yl}55`,
              borderRadius:10, padding:"9px 12px", marginBottom:14, color:theme.yl, fontSize:12
            }}>{err}</div>
          )}

          {step === "review" && (
            <div style={{
              background:`${theme.bu}12`, border:`1px solid ${theme.bu}44`,
              borderRadius:10, padding:"10px 14px", marginBottom:18, color:theme.bu, fontSize:12.5
            }}>Review your information carefully before finalizing.</div>
          )}

          {GROUPS.map(g => (
            <Sec key={g.title} title={g.title} icon={g.icon}>
              {g.fields.map(f => (
                <FieldRow
                  key={f} f={f} value={fm[f]}
                  onChange={up(f)} readOnly={step === "review"}
                />
              ))}
            </Sec>
          ))}

          <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginTop:20 }}>
            {step === "edit" && <>
              <Bt onClick={goReview} bg={theme.or}>Review →</Bt>
              <Bt onClick={saveDraft} outline={true}>
                {saved ? "✓ Saved" : <><GlyphIcon glyph="save" size={13} /> Save & continue later</>}
              </Bt>
              {onSkip && <Bt onClick={onSkip} outline={true}>Skip for now</Bt>}
            </>}
            {step === "review" && <>
              <Bt onClick={() => setConfirming(true)} bg={theme.gn}><GlyphIcon glyph="lock" size={13} /> Finalize Profile</Bt>
              <Bt onClick={() => setStep("edit")} outline={true}>← Back to edit</Bt>
            </>}
          </div>

          {step === "edit" && missing.length > 0 && (
            <p style={{ color:theme.td, fontSize:11, marginTop:14 }}>
              {missing.length} required field{missing.length === 1 ? "" : "s"} remaining.
              You can save and come back at any time.
            </p>
          )}
        </div>
      </div>

      {confirming && (
        <Modal title="Finalize your profile?" onClose={() => setConfirming(false)} width={480}>
          <p style={{ color:theme.ts, fontSize:13, lineHeight:1.6, marginBottom:18 }}>
            {FINALIZE_CONFIRM_MESSAGE}
          </p>
          <div style={{ display:"flex", gap:8 }}>
            <Bt onClick={doFinalize} bg={theme.gn}>Yes, finalize</Bt>
            <Bt onClick={() => setConfirming(false)} outline={true}>Cancel</Bt>
          </div>
        </Modal>
      )}
    </div>
  );
}
