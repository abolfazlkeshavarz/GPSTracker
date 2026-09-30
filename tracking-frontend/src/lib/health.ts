/** Fields of a live position that the health score looks at. */
export interface HealthInput {
  timestamp?: number;
  sat?: number;
  satellites?: number;
  hdop?: number;
  csq?: number;
  jamming?: boolean;
  ext_power?: boolean;
}

export type Health = "excellent" | "good" | "fair" | "poor";

export function trackerHealth(location: HealthInput | null, online: boolean, intervalS = 30): Health {
  if (!location || !online) return "poor";

  let score = 0;
  const ageS = typeof location.timestamp === "number" ? Date.now() / 1000 - location.timestamp : Infinity;
  if (ageS < intervalS * 3) score += 2;
  else if (ageS < 900) score += 1;

  const sats = location.sat ?? location.satellites ?? 0;
  if (typeof location.hdop === "number" && location.hdop > 0) {
    score += location.hdop <= 1.5 ? 2 : location.hdop <= 3 ? 1 : 0;
  } else {
    score += sats >= 7 ? 2 : sats >= 4 ? 1 : 0;
  }

  const csq = location.csq;
  if (typeof csq !== "number" || csq === 0 || csq === 99) score += 1;
  else score += csq >= 15 ? 2 : csq >= 9 ? 1 : 0;

  if (location.jamming === true || location.ext_power === false) score -= 2;

  if (score >= 6) return "excellent";
  if (score >= 4) return "good";
  if (score >= 2) return "fair";
  return "poor";
}
