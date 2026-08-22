// Single-stroke SVG icon set, drawn on a 24px grid, colored by currentColor.
// Replaces the emoji that used to serve as UI chrome: emoji render with a
// different weight and palette on every OS the team carries, and they cannot
// take the active/hover color of the control they sit in.
//
// GlyphIcon accepts either a registry name ("folder") or the legacy emoji
// string ("📁"): the primitives (Sec, SC2, Empty) and nav pass whatever they
// were given through EMOJI_TO_NAME, so existing call sites keep working.
// Unknown glyphs fall back to rendering the raw string, which keeps content
// emoji (weather symbols, user-authored text) untouched.

const P = ({ d }) => <path d={d} />;

// Registry: name -> array of path data strings.
const ICONS = {
  "bar-chart": ["M18 20V10", "M12 20V4", "M6 20v-6"],
  "user": ["M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2", "M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0z"],
  "users": ["M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2", "M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0z", "M23 21v-2a4 4 0 0 0-3-3.87", "M16 3.13a4 4 0 0 1 0 7.75"],
  "calendar": ["M19 4H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z", "M16 2v4", "M8 2v4", "M3 10h18"],
  "calendar-days": ["M19 4H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z", "M16 2v4", "M8 2v4", "M3 10h18", "M8 14h.01", "M12 14h.01", "M16 14h.01", "M8 18h.01", "M12 18h.01"],
  "clock": ["M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z", "M12 6v6l4 2"],
  "stopwatch": ["M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16z", "M12 9v4l2.5 2.5", "M9 2h6", "M12 2v3"],
  "hourglass": ["M6 2h12", "M6 22h12", "M8 2v4l4 4 4-4V2", "M8 22v-4l4-4 4 4v4"],
  "check-square": ["M9 11l3 3L22 4", "M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"],
  "x-circle": ["M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z", "M15 9l-6 6", "M9 9l6 6"],
  "alert-triangle": ["M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z", "M12 9v4", "M12 17h.01"],
  "sun": ["M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10z", "M12 1v2", "M12 21v2", "M4.22 4.22l1.42 1.42", "M18.36 18.36l1.42 1.42", "M1 12h2", "M21 12h2", "M4.22 19.78l1.42-1.42", "M18.36 5.64l1.42-1.42"],
  "moon": ["M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"],
  "grad-cap": ["M12 4L2 9.5 12 15l10-5.5L12 4z", "M6 12v4.5c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5V12", "M22 9.5V15"],
  "target": ["M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z", "M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12z", "M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"],
  "award": ["M12 15a7 7 0 1 0 0-14 7 7 0 0 0 0 14z", "M8.21 13.89L7 23l5-3 5 3-1.21-9.12"],
  "umbrella": ["M23 12a11.05 11.05 0 0 0-22 0z", "M12 12v7a2 2 0 0 0 4 0"],
  "building": ["M4 21V4a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v17", "M2 21h20", "M9 21v-4h6v4", "M8 7h2", "M14 7h2", "M8 11h2", "M14 11h2"],
  "folder": ["M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"],
  "file-text": ["M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z", "M14 2v6h6", "M16 13H8", "M16 17H8"],
  "bookmark": ["M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"],
  "megaphone": ["M11 5L6 9H3a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h3l5 4V5z", "M15.5 8.5a5 5 0 0 1 0 7", "M18.5 5.5a9 9 0 0 1 0 13"],
  "bell": ["M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9", "M13.73 21a2 2 0 0 1-3.46 0"],
  "gear": ["M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z", "M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"],
  "wrench": ["M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"],
  "list": ["M8 6h13", "M8 12h13", "M8 18h13", "M3 6h.01", "M3 12h.01", "M3 18h.01"],
  "clipboard": ["M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2", "M9 2h6a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z"],
  "thermometer": ["M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z"],
  "siren": ["M7 17v-3a5 5 0 0 1 10 0v3", "M5 17h14a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-2a1 1 0 0 1 1-1z", "M12 3v2", "M5 6l1.5 1.5", "M19 6l-1.5 1.5"],
  "inbox": ["M22 12h-6l-2 3h-4l-2-3H2", "M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"],
  "briefcase": ["M20 7H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z", "M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"],
  "hard-hat": ["M4 15a8 8 0 0 1 16 0", "M3 15h18v2a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-2z", "M10 4h4v4h-4z"],
  "eye": ["M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z", "M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0z"],
  "eye-off": ["M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94", "M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19", "M14.12 14.12a3 3 0 1 1-4.24-4.24", "M1 1l22 22"],
  "menu": ["M3 6h18", "M3 12h18", "M3 18h18"],
  "more-horizontal": ["M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z", "M19 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z", "M5 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z"],
  "x": ["M18 6L6 18", "M6 6l12 12"],
  "chevron-left": ["M15 18l-6-6 6-6"],
  "chevron-right": ["M9 18l6-6-6-6"],
  "log-out": ["M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4", "M16 17l5-5-5-5", "M21 12H9"],
  "book": ["M4 19.5A2.5 2.5 0 0 1 6.5 17H20", "M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"],
  "id-card": ["M3 5h18a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z", "M10 11a2 2 0 1 0-4 0 2 2 0 0 0 4 0z", "M5 16c.5-1.6 1.8-2.5 3-2.5s2.5.9 3 2.5", "M14 9h5", "M14 13h5"],
  "car": ["M4 11l1.7-4.7A2 2 0 0 1 7.6 5h8.8a2 2 0 0 1 1.9 1.3L20 11", "M3 11h18a1 1 0 0 1 1 1v4h-3v1a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1v-1H8v1a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-1H2v-4a1 1 0 0 1 1-1z", "M6.5 14h.01", "M17.5 14h.01"],
  "medical-cross": ["M9 3h6v6h6v6h-6v6H9v-6H3V9h6V3z"],
  "plane-takeoff": ["M2 21h20", "M3.6 15.4l16.6-4.6a2 2 0 0 0-1.1-3.8l-4.3 1.2-7.7-4-2.3.6 5 5.1-4.5 1.2-2.5-1.5-1.8.5 2.6 5.3z"],
  "pencil": ["M17 3a2.83 2.83 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"],
  "star": ["M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21 7 14.2 2 9.3l6.9-1L12 2z"],
  "shield": ["M12 22s8-3.6 8-10V5l-8-3-8 3v7c0 6.4 8 10 8 10z"],
  "send": ["M22 2L11 13", "M22 2l-7 20-4-9-9-4 20-7z"],
  "trash": ["M3 6h18", "M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2", "M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6", "M10 11v6", "M14 11v6"],
  "undo": ["M3 7v6h6", "M21 17a9 9 0 0 0-15-6.7L3 13"],
  "save": ["M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z", "M17 21v-8H7v8", "M7 3v5h8"],
  "search": ["M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z", "M21 21l-4.35-4.35"],
  "lock": ["M5 11h14a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1z", "M8 11V7a4 4 0 0 1 8 0v4"],
  "unlock": ["M5 11h14a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1z", "M8 11V7a4 4 0 0 1 7.9-.9"],
  "ban": ["M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z", "M4.93 4.93l14.14 14.14"],
  "pause": ["M8 5v14", "M16 5v14"],
  "mail": ["M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z", "M22 6l-10 7L2 6"],
  "key": ["M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"],
  "coins": ["M9 15A6 6 0 1 0 9 3a6 6 0 0 0 0 12z", "M15 21a6 6 0 1 0 0-12 6 6 0 0 0 0 12z"],
  "paperclip": ["M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"],
  "user-minus": ["M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2", "M12.5 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0z", "M23 11h-6"],
};

// Legacy emoji -> registry name. Keys are stored without the VS16 variation
// selector (️); GlyphIcon strips it before lookup so both forms match.
const EMOJI_TO_NAME = {
  "📊": "bar-chart", "👤": "user", "👥": "users", "📅": "calendar",
  "🗓": "calendar-days", "⏰": "clock", "⏱": "stopwatch", "⏳": "hourglass",
  "✅": "check-square", "❌": "x-circle", "⚠": "alert-triangle",
  "☀": "sun", "🌙": "moon", "🎓": "grad-cap", "🎯": "target",
  "🏆": "award", "🏖": "umbrella", "🏢": "building", "📁": "folder",
  "📄": "file-text", "📜": "file-text", "📌": "bookmark", "📢": "megaphone",
  "🔔": "bell", "⚙": "gear", "🔧": "wrench", "🧾": "list",
  "📋": "clipboard", "🤒": "thermometer", "🚨": "siren", "📭": "inbox",
  "👨‍💼": "briefcase", "👔": "briefcase", "👷": "hard-hat",
  "📘": "book", "🆔": "id-card", "🚗": "car", "🏥": "medical-cross",
  "🛫": "plane-takeoff", "📝": "pencil", "✏": "pencil", "🏅": "star",
  "🤝": "shield", "🛠": "wrench", "📤": "send", "🗑": "trash",
  "↩": "undo", "💾": "save", "🔍": "search", "🔒": "lock", "🔓": "unlock",
  "🚫": "ban", "⏸": "pause", "✉": "mail", "📧": "mail", "🔑": "key",
  "🔐": "key", "💰": "coins", "📎": "paperclip", "👋": "user-minus",
};

export function iconName(glyph) {
  if (typeof glyph !== "string") return null;
  if (ICONS[glyph]) return glyph;
  return EMOJI_TO_NAME[glyph.replace(/️/g, "")] || null;
}

export const GlyphIcon = ({ glyph, size = 16, strokeWidth = 1.8, style }) => {
  const name = iconName(glyph);
  if (!name) return glyph ? <span style={style}>{glyph}</span> : null;
  return (
    <svg
      viewBox="0 0 24 24" width={size} height={size} aria-hidden="true"
      fill="none" stroke="currentColor" strokeWidth={strokeWidth}
      strokeLinecap="round" strokeLinejoin="round"
      style={{ flexShrink: 0, verticalAlign: "middle", ...style }}
    >
      {ICONS[name].map((d, i) => <P key={i} d={d} />)}
    </svg>
  );
};
