import { describe, it, expect } from "vitest";
import {
  AIRPORTS, DEFAULT_AIRPORT, airportKeyFor, forecastUrl, parseForecast,
  describeCode, isRainy, isFoggy, inMiddayBreakSeason, banter, dayLabel,
} from "../src/weather.js";

// The fetch is not tested here — it is a network call. What is tested is
// everything that decides what the card SAYS, because that is the part that
// can be wrong while still rendering happily.

describe("which airfield a person sees", () => {
  it("uses the airport on their employee record", () => {
    expect(airportKeyFor({ airport: "AAN" })).toBe("AAN");
    expect(airportKeyFor({ airport: "ZDY" })).toBe("ZDY");
  });

  it("tolerates the casing and padding real data arrives with", () => {
    expect(airportKeyFor({ airport: " aan " })).toBe("AAN");
  });

  it("falls back to ZIA for the five people with no airport recorded", () => {
    expect(airportKeyFor({ airport: null })).toBe(DEFAULT_AIRPORT);
    expect(airportKeyFor({})).toBe(DEFAULT_AIRPORT);
    expect(airportKeyFor(undefined)).toBe(DEFAULT_AIRPORT);
  });

  it("falls back rather than requesting a site that does not exist", () => {
    expect(airportKeyFor({ airport: "XXX" })).toBe(DEFAULT_AIRPORT);
  });

  it("covers every airport the roster actually assigns", () => {
    for (const k of ["ZIA", "AAN", "AZI", "XSB", "ZDY"]) {
      expect(AIRPORTS[k]).toBeDefined();
      expect(AIRPORTS[k].lat).toBeGreaterThan(23);
      expect(AIRPORTS[k].lat).toBeLessThan(26);
      expect(AIRPORTS[k].lon).toBeGreaterThan(51);
      expect(AIRPORTS[k].lon).toBeLessThan(57);
    }
  });
});

describe("the request", () => {
  it("asks the documented host, which is the one the CSP allows", () => {
    expect(forecastUrl("ZIA")).toMatch(/^https:\/\/api\.open-meteo\.com\/v1\/forecast\?/);
  });

  it("carries the site's own coordinates", () => {
    const u = new URL(forecastUrl("ZDY"));
    expect(Number(u.searchParams.get("latitude"))).toBeCloseTo(AIRPORTS.ZDY.lat, 3);
    expect(Number(u.searchParams.get("longitude"))).toBeCloseTo(AIRPORTS.ZDY.lon, 3);
  });

  it("asks for km/h and local time, because that is what the card prints", () => {
    const u = new URL(forecastUrl("ZIA"));
    expect(u.searchParams.get("wind_speed_unit")).toBe("kmh");
    expect(u.searchParams.get("timezone")).toBe("Asia/Dubai");
  });

  it("sends no identifying information — only a place", () => {
    const u = new URL(forecastUrl("ZIA"));
    const allowed = new Set([
      "latitude", "longitude", "current", "daily",
      "timezone", "wind_speed_unit", "forecast_days",
    ]);
    for (const k of u.searchParams.keys()) expect(allowed.has(k)).toBe(true);
  });
});

const SAMPLE = {
  current: {
    temperature_2m: 44.2, apparent_temperature: 49.1, relative_humidity_2m: 62,
    wind_speed_10m: 18, wind_gusts_10m: 31, weather_code: 0, is_day: 1, precipitation: 0,
  },
  daily: {
    time: ["2026-08-11", "2026-08-12"],
    temperature_2m_max: [45.0, 44.1],
    temperature_2m_min: [32.2, 31.8],
    weather_code: [0, 1],
    wind_speed_10m_max: [22, 19],
  },
};

describe("parsing the response", () => {
  it("reduces it to what the card draws", () => {
    const p = parseForecast(SAMPLE);
    expect(p.current.tempC).toBe(44.2);
    expect(p.current.windKph).toBe(18);
    expect(p.days).toHaveLength(2);
    expect(p.days[0]).toMatchObject({ date: "2026-08-11", maxC: 45.0, minC: 32.2 });
  });

  it("returns null rather than half a card when the shape is wrong", () => {
    expect(parseForecast({})).toBeNull();
    expect(parseForecast(null)).toBeNull();
    expect(parseForecast({ daily: SAMPLE.daily })).toBeNull();
  });

  it("survives a response with no daily block", () => {
    const p = parseForecast({ current: SAMPLE.current });
    expect(p.days).toEqual([]);
  });
});

describe("sky descriptions", () => {
  it("names the codes that actually occur over the Gulf", () => {
    expect(describeCode(0).label).toBe("Clear");
    expect(describeCode(45).label).toBe("Fog");
    expect(describeCode(63).label).toBe("Rain");
    expect(describeCode(95).label).toBe("Thunderstorm");
  });

  it("shows a moon, not a sun, on a clear night", () => {
    expect(describeCode(0, 1).icon).toBe("☀️");
    expect(describeCode(0, 0).icon).toBe("🌙");
  });

  it("never renders undefined for a code it does not know", () => {
    const d = describeCode(12345);
    expect(d.label).toBe("—");
    expect(d.icon).toBeTruthy();
  });

  it("classifies rain and fog for the advice rules", () => {
    expect(isRainy(63)).toBe(true);
    expect(isRainy(82)).toBe(true);
    expect(isRainy(95)).toBe(true);
    expect(isRainy(0)).toBe(false);
    expect(isFoggy(45)).toBe(true);
    expect(isFoggy(3)).toBe(false);
  });
});

describe("the UAE midday break window", () => {
  it("covers 15 June to 15 September", () => {
    expect(inMiddayBreakSeason(new Date("2026-06-15T09:00:00"))).toBe(true);
    expect(inMiddayBreakSeason(new Date("2026-07-20T09:00:00"))).toBe(true);
    expect(inMiddayBreakSeason(new Date("2026-09-15T09:00:00"))).toBe(true);
  });

  it("excludes the days either side of it", () => {
    expect(inMiddayBreakSeason(new Date("2026-06-14T09:00:00"))).toBe(false);
    expect(inMiddayBreakSeason(new Date("2026-09-16T09:00:00"))).toBe(false);
    expect(inMiddayBreakSeason(new Date("2026-01-10T09:00:00"))).toBe(false);
  });
});

describe("the advice lines", () => {
  const winter = new Date("2026-01-10T09:00:00");

  it("always says something, even on a completely unremarkable day", () => {
    const out = banter({ tempC: 28, feelsC: 28, windKph: 8, gustKph: 10, humidity: 40, code: 0 }, winter);
    expect(out.length).toBeGreaterThan(0);
    expect(out[0].text).toBeTruthy();
  });

  it("puts the thunderstorm before the joke about the weather being nice", () => {
    const out = banter({ tempC: 28, feelsC: 28, windKph: 10, gustKph: 12, humidity: 50, code: 95 }, winter);
    expect(out[0].text).toMatch(/thunderstorm/i);
  });

  it("warns about fog, which is the real winter hazard here", () => {
    const out = banter({ tempC: 19, feelsC: 19, windKph: 5, gustKph: 7, humidity: 90, code: 45 }, winter);
    expect(out.some(l => /fog/i.test(l.text))).toBe(true);
  });

  it("escalates from breezy to hold-onto-your-hat", () => {
    const breezy = banter({ tempC: 30, feelsC: 30, windKph: 40, gustKph: 45, humidity: 40, code: 0 }, winter);
    const wild   = banter({ tempC: 30, feelsC: 30, windKph: 50, gustKph: 70, humidity: 40, code: 0 }, winter);
    expect(breezy.some(l => l.icon === "💨")).toBe(true);
    expect(wild.some(l => l.icon === "🌪️")).toBe(true);
  });

  it("treats extreme heat by what it feels like, not the raw reading", () => {
    // 40°C air but 47°C apparent — humidity is doing the damage.
    const out = banter({ tempC: 40, feelsC: 47, windKph: 10, gustKph: 12, humidity: 80, code: 0 }, winter);
    expect(out.some(l => l.icon === "🥵")).toBe(true);
  });

  it("raises the midday-break reminder only in season and only when hot", () => {
    const summer = new Date("2026-07-20T09:00:00");
    const hot  = banter({ tempC: 44, feelsC: 48, windKph: 10, gustKph: 12, humidity: 55, code: 0 }, summer);
    const mild = banter({ tempC: 26, feelsC: 26, windKph: 10, gustKph: 12, humidity: 40, code: 0 }, summer);
    const winterHot = banter({ tempC: 44, feelsC: 48, windKph: 10, gustKph: 12, humidity: 55, code: 0 }, winter);
    expect(hot.some(l => /12:30/.test(l.text))).toBe(true);
    expect(mild.some(l => /12:30/.test(l.text))).toBe(false);
    expect(winterHot.some(l => /12:30/.test(l.text))).toBe(false);
  });

  it("drops the cheerful line when the weather is actually dangerous", () => {
    // Caught by looking at the rendered card: a thunderstorm with 71 km/h
    // gusts was being followed by "Genuinely pleasant out. Enjoy it." The
    // joke read as though the card had not understood its own data, and it
    // undercut the warning directly above it.
    const storm = banter({ tempC: 30, feelsC: 31, windKph: 52, gustKph: 71, humidity: 78, code: 95 }, winter);
    expect(storm.some(l => /pleasant/i.test(l.text))).toBe(false);
    expect(storm.some(l => /thunderstorm/i.test(l.text))).toBe(true);

    const fog = banter({ tempC: 18, feelsC: 18, windKph: 6, gustKph: 9, humidity: 93, code: 45 }, winter);
    expect(fog.some(l => /jacket/i.test(l.text))).toBe(false);
  });

  it("still warns about heat even when something worse is also happening", () => {
    // Heat is operational, not banter — a storm does not make 49°C safe.
    const out = banter({ tempC: 44, feelsC: 49, windKph: 55, gustKph: 70, humidity: 60, code: 95 }, winter);
    expect(out.some(l => l.icon === "🥵")).toBe(true);
    expect(out.some(l => /thunderstorm/i.test(l.text))).toBe(true);
  });

  it("keeps the banter on an ordinary day, which is the whole point", () => {
    const out = banter({ tempC: 26, feelsC: 26, windKph: 10, gustKph: 12, humidity: 45, code: 0 }, winter);
    expect(out.some(l => /pleasant/i.test(l.text))).toBe(true);
  });

  it("says rain blocks sealant, which is the bit that costs a shift", () => {
    const out = banter({ tempC: 24, feelsC: 24, windKph: 12, gustKph: 15, humidity: 80, code: 63 }, winter);
    expect(out.some(l => /sealant/i.test(l.text))).toBe(true);
  });

  it("keeps every line short enough to read on a phone", () => {
    const out = banter({ tempC: 46, feelsC: 52, windKph: 60, gustKph: 75, humidity: 85, code: 95 },
                       new Date("2026-07-20T09:00:00"));
    for (const l of out) expect(l.text.length).toBeLessThanOrEqual(140);
  });

  it("does not fall over on a response with missing numbers", () => {
    expect(() => banter({}, winter)).not.toThrow();
    expect(() => banter(null, winter)).not.toThrow();
    expect(banter({}, winter).length).toBeGreaterThan(0);
  });
});

describe("the day strip", () => {
  it("names today as Today", () => {
    expect(dayLabel("2026-08-11", "2026-08-11")).toBe("Today");
  });

  it("uses a short weekday for the rest", () => {
    expect(dayLabel("2026-08-12", "2026-08-11")).toMatch(/^[A-Z][a-z]{2}$/);
  });

  it("returns the raw value rather than Invalid Date", () => {
    expect(dayLabel("not-a-date", "2026-08-11")).toBe("not-a-date");
  });
});
