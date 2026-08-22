import { theme } from "../constants.js";
import { ib, Bt, Bd, Sec, Empty } from "../uiPrimitives.jsx";
import { fmtDt } from "../helpers.js";
import {
  AUDIT_FILTERS, filterEntries, describeChanges, summarize, actorName,
  tableLabel, toCsv,
} from "../auditLog.js";
import { GlyphIcon } from "../icons.jsx";

const { useState, useMemo, useId } = React;

const ACTION_COLOR = {
  insert: theme.gn,
  update: theme.bu,
  delete: theme.rd,
};

/** One entry, collapsed to a line until it is opened. */
function Entry({ entry, employees }) {
  const [open, setOpen] = useState(false);
  const changes = describeChanges(entry);
  const who = actorName(entry, employees);

  return (
    <div style={{
      borderBottom: `1px solid ${theme.bd}`, padding: "10px 4px",
    }}>
      <div
        onClick={() => setOpen(o => !o)}
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen(o => !o); } }}
        style={{
          display: "flex", alignItems: "center", gap: 10,
          cursor: "pointer", flexWrap: "wrap",
        }}
      >
        <span aria-hidden="true" style={{ color: theme.td, fontSize: 11, width: 12 }}>
          {open ? "▾" : "▸"}
        </span>
        <Bd text={tableLabel(entry.table_name)} color={ACTION_COLOR[entry.action] || theme.ts} />
        <span style={{ color: theme.tx, fontSize: 12, flex: "1 1 240px", minWidth: 0 }}>
          {summarize(entry, employees.find(e => e.id === entry.record_id)?.name)}
        </span>
        <span style={{ color: theme.ts, fontSize: 11, whiteSpace: "nowrap" }}>{who}</span>
        <span style={{ color: theme.td, fontSize: 11, whiteSpace: "nowrap", minWidth: 68, textAlign: "right" }}>
          {fmtDt(entry.occurredAt)}
        </span>
      </div>

      {open && (
        <div style={{
          marginTop: 10, marginLeft: 22, padding: "10px 12px",
          background: "rgba(255,255,255,0.03)", borderRadius: 10,
          border: `1px solid ${theme.bd}`,
        }}>
          <div style={{ fontSize: 11, color: theme.td, marginBottom: 8 }}>
            {new Date(entry.occurredAt).toLocaleString("en-GB")}
            {entry.actor_email && <> · {entry.actor_email}</>}
            {entry.actor_role && <> · {entry.actor_role}</>}
            {entry.actor_context && entry.actor_context !== "authenticated" && (
              <> · <span style={{ color: theme.yl }}>{entry.actor_context}</span></>
            )}
          </div>

          {entry.reason && (
            <div style={{
              fontSize: 12, color: theme.tx, marginBottom: 10,
              padding: "6px 10px", background: `${theme.bu}12`,
              borderLeft: `2px solid ${theme.bu}`, borderRadius: 4,
            }}>{entry.reason}</div>
          )}

          {changes.length === 0 ? (
            <div style={{ fontSize: 12, color: theme.td }}>No field-level detail recorded.</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: 340 }}>
                <thead>
                  <tr style={{ color: theme.td, fontSize: 10, textAlign: "left" }}>
                    <th style={{ padding: "4px 8px 4px 0", fontWeight: 700 }}>FIELD</th>
                    <th style={{ padding: "4px 8px", fontWeight: 700 }}>FROM</th>
                    <th style={{ padding: "4px 8px", fontWeight: 700 }}>TO</th>
                  </tr>
                </thead>
                <tbody>
                  {changes.map(c => (
                    <tr key={c.column} style={{ borderTop: `1px solid ${theme.bd}` }}>
                      <td style={{ padding: "5px 8px 5px 0", color: theme.ts }}>
                        {c.label}
                        {c.redacted && (
                          <span title="Value not copied into the audit log"
                            style={{ marginLeft: 5, color: theme.td, display:"inline-flex", verticalAlign:"-1px" }}><GlyphIcon glyph="lock" size={10} /></span>
                        )}
                      </td>
                      <td style={{ padding: "5px 8px", color: theme.td }}>{c.from}</td>
                      <td style={{ padding: "5px 8px", color: theme.tx, fontWeight: 600 }}>{c.to}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Manager-only audit view.
 *
 * `entries` are already scoped by the database: audit_log's only policy is
 * audit_select_manager, so a non-manager session reads an empty table however
 * it asks. This component is the presentation of that, not the control.
 */
export function AuditPage({ entries, employees, loading, error, onReload }) {
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const searchId = useId();

  const shown = useMemo(
    () => filterEntries(entries, { filter, query, employees }),
    [entries, filter, query, employees]
  );

  const download = () => {
    const csv = toCsv(shown, employees);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <Sec
        title="Audit Trail"
        icon="🧾"
        action={
          <div style={{ display: "flex", gap: 8 }}>
            <Bt onClick={onReload} outline={true} small={true}>Refresh</Bt>
            <Bt onClick={download} small={true} disabled={!shown.length}>Export CSV</Bt>
          </div>
        }
      >
        <p style={{ color: theme.ts, fontSize: 12, margin: "0 0 14px", lineHeight: 1.6 }}>
          Every change to employees, leave, overtime and announcements, with who made
          it. Written by database triggers rather than by the app, so an entry cannot
          be skipped or edited from here — including by the person it records.
          Document numbers and contact details show as <GlyphIcon glyph="lock" size={11} style={{ verticalAlign:"-1px" }} />: the log records that they
          changed, never what they changed to.
        </p>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          {AUDIT_FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              style={{
                padding: "6px 14px", borderRadius: 8, fontSize: 12, cursor: "pointer",
                fontWeight: filter === f.key ? 700 : 500,
                background: filter === f.key ? `${theme.or}20` : theme.ch,
                color: filter === f.key ? theme.or : theme.ts,
                border: `1px solid ${filter === f.key ? `${theme.or}50` : theme.bd}`,
              }}
            >{f.label}</button>
          ))}
        </div>

        <label htmlFor={searchId} style={{
          display: "block", fontSize: 10, color: theme.td,
          fontWeight: 700, marginBottom: 5, letterSpacing: 1,
        }}>SEARCH</label>
        <input
          id={searchId}
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Employee, record ID, field or person who made the change"
          style={{ ...ib, marginBottom: 14 }}
        />

        {error && (
          <div role="alert" style={{
            background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)",
            borderRadius: 10, padding: "8px 12px", marginBottom: 12,
            color: theme.rd, fontSize: 12,
          }}><GlyphIcon glyph="alert-triangle" size={13} style={{ verticalAlign:"-2px" }} /> {error}</div>
        )}

        {loading ? (
          <div style={{ color: theme.td, fontSize: 13, padding: "20px 0", textAlign: "center" }}>
            Loading audit trail…
          </div>
        ) : shown.length === 0 ? (
          <Empty
            icon="🧾"
            text={
              entries?.length
                ? "No entries match this filter"
                : "No audit entries yet — apply supabase_audit_log.sql, then changes appear here"
            }
          />
        ) : (
          <>
            <div style={{ fontSize: 11, color: theme.td, marginBottom: 4 }}>
              {shown.length} {shown.length === 1 ? "entry" : "entries"}
              {shown.length !== (entries?.length || 0) && ` of ${entries.length}`}
            </div>
            <div>
              {shown.map(e => <Entry key={e.id} entry={e} employees={employees} />)}
            </div>
          </>
        )}
      </Sec>
    </div>
  );
}
