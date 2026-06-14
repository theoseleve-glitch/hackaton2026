/**
 * Open-Meteo capture (D27): fills run conditions from a track's GPS + a
 * datetime. Free, no key. This is DATA CAPTURE, not advice — the engine
 * never talks to the network (D18); it only reads the numbers stored here.
 */

export interface WeatherFill {
  air_temp_c?: number;
  humidity_pct?: number;
  wind_kmh?: number;
  pressure_hpa?: number;
  sun_pct?: number;
  rain_risk_pct?: number;
}

const HOURLY =
  "temperature_2m,relative_humidity_2m,wind_speed_10m,surface_pressure,cloud_cover,precipitation_probability";

/** Fetch the hour closest to `whenIso` (covers the recent past via past_days
 *  and the next week via forecast — enough for run logging AND race planning). */
export async function fetchWeather(
  lat: number,
  lon: number,
  whenIso: string,
): Promise<WeatherFill | null> {
  try {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&hourly=${HOURLY}&past_days=2&forecast_days=7&timezone=auto`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as {
      hourly?: Record<string, (number | null)[] | string[]>;
    };
    const times = (data.hourly?.time ?? []) as string[];
    if (times.length === 0) return null;

    const target = Date.parse(whenIso);
    let best = 0;
    let bestGap = Infinity;
    for (let i = 0; i < times.length; i++) {
      const gap = Math.abs(Date.parse(times[i]) - target);
      if (gap < bestGap) {
        bestGap = gap;
        best = i;
      }
    }
    // beyond the data window (e.g. race in 3 weeks) → no fill rather than lies
    if (bestGap > 6 * 3600_000) return null;

    const num = (key: string): number | undefined => {
      const v = (data.hourly?.[key] as (number | null)[] | undefined)?.[best];
      return typeof v === "number" ? Math.round(v * 10) / 10 : undefined;
    };
    const cloud = num("cloud_cover");
    return {
      air_temp_c: num("temperature_2m"),
      humidity_pct: num("relative_humidity_2m"),
      wind_kmh: num("wind_speed_10m"),
      pressure_hpa: num("surface_pressure"),
      sun_pct: cloud !== undefined ? Math.round(100 - cloud) : undefined,
      rain_risk_pct: num("precipitation_probability"),
    };
  } catch {
    return null; // offline at the track is the normal case, not an error
  }
}
