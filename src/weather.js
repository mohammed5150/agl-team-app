// Airfield weather for the AGL team.
//
// Open-Meteo is the source: it needs no API key, which matters because this is
// a static client-side app with no backend to hide one in. Anything keyed
// would ship the key inside app.js for anyone to read. It is also CORS-enabled,
// so the browser can call it directly, and free for non-commercial use.
//
// Everything in this file is pure. The fetch lives in the component; the rules
// below are the part worth testing, so they are kept away from it.

// Each site the roster assigns people to. Coordinates are the aerodrome
// reference points — close enough for weather, which does not vary across a
// few kilometres of apron.
export const AIRPORTS = {
  ZIA: { icao: "OMAA", name: "Zayed International",  lat: 24.4330, lon: 54.6511 },
  AAN: { icao: "OMAL", name: "Al Ain International", lat: 24.2617, lon: 55.6092 },
  AZI: { icao: "OMAD", name: "Al Bateen Executive",  lat: 24.4283, lon: 54.4581 },
  XSB: { icao: "OMBY", name: "Sir Bani Yas",         lat: 24.2836, lon: 52.5803 },
  ZDY: { icao: "OMDL", name: "Delma Island",         lat: 24.5100, lon: 52.3355 },
};

// Five of the ninety-two on the roster have no airport recorded. They are
// almost all ZIA-based, and a card that says "pick a site first" helps nobody,
// so ZIA is the fallback.
export const DEFAULT_AIRPORT = "ZIA";

export function airportKeyFor(user) {
  const k = (user?.airport || "").trim().toUpperCase();
  return AIRPORTS[k] ? k : DEFAULT_AIRPORT;
}

export function forecastUrl(airportKey) {
  const a = AIRPORTS[airportKey] || AIRPORTS[DEFAULT_AIRPORT];
  const q = new URLSearchParams({
    latitude: String(a.lat),
    longitude: String(a.lon),
    current: "temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,wind_gusts_10m,weather_code,is_day,precipitation",
    daily: "temperature_2m_max,temperature_2m_min,weather_code,wind_speed_10m_max",
    timezone: "Asia/Dubai",
    wind_speed_unit: "kmh",
    forecast_days: "5",
  });
  return `https://api.open-meteo.com/v1/forecast?${q}`;
}

// WMO weather codes, trimmed to what actually turns up over the Gulf. Snow and
// freezing rain are in the table only so an unexpected code never renders as
// "undefined"; nobody is expecting them on the apron.
const CODES = {
  0:  ["Clear",             "☀️"],
  1:  ["Mostly clear",      "🌤️"],
  2:  ["Partly cloudy",     "⛅"],
  3:  ["Overcast",          "☁️"],
  45: ["Fog",               "🌫️"],
  48: ["Freezing fog",      "🌫️"],
  51: ["Light drizzle",     "🌦️"],
  53: ["Drizzle",           "🌦️"],
  55: ["Heavy drizzle",     "🌧️"],
  61: ["Light rain",        "🌦️"],
  63: ["Rain",              "🌧️"],
  65: ["Heavy rain",        "🌧️"],
  66: ["Freezing rain",     "🌧️"],
  67: ["Freezing rain",     "🌧️"],
  71: ["Snow",              "🌨️"],
  73: ["Snow",              "🌨️"],
  75: ["Heavy snow",        "🌨️"],
  77: ["Snow grains",       "🌨️"],
  80: ["Showers",           "🌦️"],
  81: ["Showers",           "🌧️"],
  82: ["Heavy showers",     "⛈️"],
  85: ["Snow showers",      "🌨️"],
  86: ["Snow showers",      "🌨️"],
  95: ["Thunderstorm",      "⛈️"],
  96: ["Thunderstorm",      "⛈️"],
  99: ["Thunderstorm",      "⛈️"],
};

export function describeCode(code, isDay = 1) {
  const hit = CODES[code];
  if (!hit) return { label: "—", icon: "🌡️" };
  // Clear night is a moon, not a sun. Everything else reads the same after dark.
  if (code === 0 && !isDay) return { label: "Clear", icon: "🌙" };
  if (code === 1 && !isDay) return { label: "Mostly clear", icon: "🌙" };
  return { label: hit[0], icon: hit[1] };
}

export function isRainy(code) {
  return (code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95;
}
export function isFoggy(code) {
  return code === 45 || code === 48;
}

// The UAE midday break: outdoor work is prohibited 12:30–15:00 from 15 June to
// 15 September. The card is not the legal authority on it, but a reminder in
// the right window is worth more than one in January.
export function inMiddayBreakSeason(date) {
  const m = date.getMonth(); // 0-based
  const d = date.getDate();
  if (m > 5 && m < 8) return true;          // July, August
  if (m === 5 && d >= 15) return true;      // 15 June onward
  if (m === 8 && d <= 15) return true;      // to 15 September
  return false;
}

/**
 * The lines under the numbers. Ordered worst-first and capped by the caller,
 * so a genuinely dangerous day never has its warning pushed off the bottom by
 * a joke about the humidity.
 *
 * Every line is meant to raise a smile and still leave the reader knowing what
 * to do. Where the two pull against each other — heat, wind, storms — the
 * advice wins and the joke gets out of the way.
 */
export function banter(c, now = new Date()) {
  const out = [];
  const t = Number(c?.tempC);
  const feels = Number.isFinite(Number(c?.feelsC)) ? Number(c.feelsC) : t;
  const wind = Number(c?.windKph) || 0;
  const gust = Number(c?.gustKph) || 0;
  const hum = Number(c?.humidity) || 0;
  const code = Number(c?.code);

  // --- Conditions that change whether work happens ------------------------
  if (code >= 95) {
    out.push({ icon: "⛈️", text: "Thunderstorm. Nothing on the airfield is worth being the tallest thing out there — get inside." });
  }
  if (isFoggy(code)) {
    out.push({ icon: "🌫️", text: "Fog. You will find the runway; the vehicle behind you might not find you. Lights on, eyes up." });
  }
  if (gust >= 60 || wind >= 55) {
    out.push({ icon: "🌪️", text: `Gusting ${Math.round(gust || wind)} km/h. Hold on to your hard hat, your paperwork, and any panel you have unbolted.` });
  } else if (wind >= 35) {
    out.push({ icon: "💨", text: `${Math.round(wind)} km/h wind — enough to redecorate the site with your own drawings. Weigh things down.` });
  }
  if (isRainy(code) && code < 95) {
    out.push({ icon: "🌧️", text: "Rain. A genuine Abu Dhabi event. Sealant and paint can wait; standing water on the apron cannot." });
  }

  // Anything above this point is a reason to change what the shift does.
  // Once one of those is on the card, the light-hearted lines stop: telling
  // somebody it is "genuinely pleasant out" directly beneath a thunderstorm
  // warning reads as though the card has not understood its own data, and it
  // undercuts the line that actually matters.
  const severe = out.length > 0;

  // --- Heat ---------------------------------------------------------------
  // The heat warnings are themselves operational, so they still appear
  // alongside a storm. Only the banter is suppressed.
  if (Number.isFinite(t)) {
    if (feels >= 45) {
      out.push({ icon: "🥵", text: `Feels like ${Math.round(feels)}°C. The apron is a griddle. Water, shade, buddy checks — no heroics today.` });
    } else if (feels >= 40) {
      out.push({ icon: "🔥", text: `Feels like ${Math.round(feels)}°C. Hydrate like it is part of the job, because today it is.` });
    } else if (!severe) {
      if (t >= 33) {
        out.push({ icon: "😅", text: "Warm one. Normal service for this place — keep the water bottle within reach." });
      } else if (t >= 22) {
        out.push({ icon: "😎", text: "Genuinely pleasant out. Enjoy it. It is not contractual and it will not last." });
      } else if (t >= 15) {
        out.push({ icon: "🧥", text: "Cool by local standards. Somebody on shift is definitely wearing a jacket." });
      } else {
        out.push({ icon: "🥶", text: "Cold for Abu Dhabi. Expect strong opinions about it in the crew room." });
      }
    }
  }

  if (!severe && hum >= 75 && feels >= 32) {
    out.push({ icon: "💦", text: `${Math.round(hum)}% humidity. It is not the heat, it is the soup.` });
  }

  if (inMiddayBreakSeason(now) && feels >= 38) {
    out.push({ icon: "⏱️", text: "Midday break season: outdoor work stops 12:30–15:00 until 15 September. Plan the runway visit around it." });
  }

  if (!out.length) {
    out.push({ icon: "🛫", text: "Nothing dramatic out there. A rare and beautiful thing." });
  }
  return out;
}

/** Open-Meteo's JSON, reduced to what the card draws. */
export function parseForecast(json) {
  const cur = json?.current;
  if (!cur) return null;
  const daily = json?.daily || {};
  const days = (daily.time || []).map((iso, i) => ({
    date: iso,
    maxC: daily.temperature_2m_max?.[i],
    minC: daily.temperature_2m_min?.[i],
    code: daily.weather_code?.[i],
    windKph: daily.wind_speed_10m_max?.[i],
  }));
  return {
    current: {
      tempC:    cur.temperature_2m,
      feelsC:   cur.apparent_temperature,
      humidity: cur.relative_humidity_2m,
      windKph:  cur.wind_speed_10m,
      gustKph:  cur.wind_gusts_10m,
      code:     cur.weather_code,
      isDay:    cur.is_day,
      rain:     cur.precipitation,
    },
    days,
  };
}

/** "Mon", "Tue"… for the strip, with today named as such. */
export function dayLabel(iso, todayIso) {
  if (iso === todayIso) return "Today";
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-GB", { weekday: "short" });
}
