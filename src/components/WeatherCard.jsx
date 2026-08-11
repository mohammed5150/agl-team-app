import { theme } from "../constants.js";
import {
  AIRPORTS, airportKeyFor, forecastUrl, parseForecast,
  describeCode, banter, dayLabel,
} from "../weather.js";

const { useState, useEffect, useMemo } = React;

/* ============================================================
   AIRFIELD WEATHER

   Reads the site off the signed-in person's employee record, so a
   technician at Al Ain is not shown Zayed International's numbers.
   Managers get a switcher, because they are the ones asking "what
   is it like out at Delma today".

   The fetch is deliberately forgiving: this is a PWA that spends its
   life on airfield wifi, and a weather card is the last thing that
   should shout when the network is poor. A failure leaves a quiet
   line, never an error banner and never a blank hole in the page.
   ============================================================ */

const CACHE_MS = 15 * 60 * 1000; // Open-Meteo updates every 15 min; asking faster is just noise.
const cache = new Map();         // airport key -> { at, data }

export function WeatherCard({ user, canSwitchSite = false }) {
  // Resolved to a plain string first. Depending on `user` itself would re-run
  // the effect below on every unrelated re-render of the dashboard and snap a
  // manager's chosen site back to their own each time.
  const assigned = airportKeyFor(user);
  const [site, setSite] = useState(assigned);
  const [state, setState] = useState({ status: "loading", data: null });

  useEffect(() => { setSite(assigned); }, [assigned]);

  useEffect(() => {
    let alive = true;
    const hit = cache.get(site);
    if (hit && Date.now() - hit.at < CACHE_MS) {
      setState({ status: "ok", data: hit.data });
      return;
    }
    setState({ status: "loading", data: null });

    // 8s is long enough for a slow airfield connection and short enough that
    // the card resolves one way or the other while somebody is still looking.
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);

    fetch(forecastUrl(site), { signal: ctrl.signal })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(json => {
        const data = parseForecast(json);
        if (!data) throw new Error("unexpected response shape");
        cache.set(site, { at: Date.now(), data });
        if (alive) setState({ status: "ok", data });
      })
      .catch(e => {
        // Never surfaced as a sync error: the roster still works without this.
        if (e.name !== "AbortError") console.warn("[weather]", e.message);
        if (alive) setState({ status: "error", data: null });
      })
      .finally(() => clearTimeout(timer));

    return () => { alive = false; ctrl.abort(); clearTimeout(timer); };
  }, [site]);

  const meta = AIRPORTS[site];
  const cur = state.data?.current;
  const lines = useMemo(() => (cur ? banter(cur).slice(0, 3) : []), [cur]);
  const sky = cur ? describeCode(cur.code, cur.isDay) : null;
  const todayIso = new Date().toISOString().slice(0, 10);

  return (
    <div style={{
      background: theme.card, borderRadius: 14, padding: 16,
      border: `1px solid ${theme.bd}`, marginBottom: 14,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: theme.tx }}>
          🌤️ Airfield Weather
        </div>
        {canSwitchSite ? (
          <select
            value={site}
            onChange={e => setSite(e.target.value)}
            aria-label="Airfield"
            style={{
              background: theme.ch, color: theme.tx, border: `1px solid ${theme.bl}`,
              borderRadius: 8, padding: "6px 10px", fontSize: 12, minHeight: 44,
            }}
          >
            {Object.entries(AIRPORTS).map(([k, a]) => (
              <option key={k} value={k}>{k} — {a.name}</option>
            ))}
          </select>
        ) : (
          <span style={{ fontSize: 11, color: theme.ts }}>{site} · {meta.icao}</span>
        )}
      </div>

      {state.status === "loading" && (
        <div style={{ fontSize: 12, color: theme.td }}>Checking the sky…</div>
      )}

      {state.status === "error" && (
        <div style={{ fontSize: 12, color: theme.td }}>
          🛰️ Weather unavailable right now — everything else on this page still works.
        </div>
      )}

      {state.status === "ok" && cur && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            <div style={{ fontSize: 40, lineHeight: 1 }}>{sky.icon}</div>
            <div>
              <div style={{ fontSize: 30, fontWeight: 800, color: theme.tx, lineHeight: 1.1 }}>
                {Math.round(cur.tempC)}°C
              </div>
              <div style={{ fontSize: 11, color: theme.ts }}>
                {sky.label} · feels {Math.round(cur.feelsC)}°C
              </div>
            </div>
            <div style={{ display: "flex", gap: 16, marginLeft: "auto", flexWrap: "wrap" }}>
              <Stat label="Wind"     value={`${Math.round(cur.windKph)} km/h`} />
              <Stat label="Gusts"    value={`${Math.round(cur.gustKph)} km/h`} />
              <Stat label="Humidity" value={`${Math.round(cur.humidity)}%`} />
            </div>
          </div>

          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
            {lines.map((l, i) => (
              <div key={i} style={{
                display: "flex", gap: 8, alignItems: "flex-start",
                background: theme.ch, borderRadius: 10, padding: "8px 10px",
              }}>
                <span aria-hidden="true" style={{ fontSize: 14, lineHeight: 1.4 }}>{l.icon}</span>
                <span style={{ fontSize: 12, color: theme.ts, lineHeight: 1.5 }}>{l.text}</span>
              </div>
            ))}
          </div>

          {state.data.days.length > 0 && (
            <div style={{ display: "flex", gap: 8, marginTop: 12, overflowX: "auto" }}>
              {state.data.days.map(d => {
                const s = describeCode(d.code, 1);
                return (
                  // flex-basis 0 so the five days share the width evenly and
                  // the last one is not clipped on a narrow phone; the
                  // overflow-x on the parent stays as the safety net.
                  <div key={d.date} style={{
                    flex: "1 1 0", minWidth: 0, textAlign: "center", background: theme.ch,
                    borderRadius: 10, padding: "8px 4px",
                  }}>
                    <div style={{ fontSize: 10, color: theme.td, marginBottom: 2 }}>
                      {dayLabel(d.date, todayIso)}
                    </div>
                    <div style={{ fontSize: 18, lineHeight: 1.2 }} title={s.label}>{s.icon}</div>
                    <div style={{ fontSize: 11, color: theme.tx, fontWeight: 700 }}>
                      {Math.round(d.maxC)}°
                    </div>
                    <div style={{ fontSize: 10, color: theme.td }}>{Math.round(d.minC)}°</div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: theme.td, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 700, color: theme.tx }}>{value}</div>
    </div>
  );
}
