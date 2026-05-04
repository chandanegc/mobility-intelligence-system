import { DISTANCE, SPEED, TIME } from "../constants/gps.constants.js";

export function detectActivity({
  rawSpeedKmph,
  calculatedSpeedKmph,
  distanceFromPrev,
  timeGap,
  isAnomaly
}) {
  if (isAnomaly) return "UNKNOWN";

  if (timeGap > TIME.RESET_GAP_SEC) {
    return "UNKNOWN";
  }

  const speed = Number(rawSpeedKmph || 0);
  const calcSpeed = Number(calculatedSpeedKmph || 0);

  // 1. STAY: slow movement + small drift
  if (
    speed <= SPEED.STAY_MAX &&
    distanceFromPrev <= DISTANCE.SMALL_DRIFT_M
  ) {
    return "STAY";
  }

  // 2. DRIVE: strong vehicle movement
  if (speed > 12 || calcSpeed > 12) {
    return "DRIVE";
  }

  // 3. WALK: realistic walking movement
  if (
    speed > SPEED.STAY_MAX &&
    speed <= SPEED.WALK_MAX &&
    distanceFromPrev > 5 &&
    timeGap <= 30
  ) {
    return "WALK";
  }

  // Ambiguous moving range: 7-12 km/h
  if (speed > SPEED.WALK_MAX && speed <= 12) {
    return "UNKNOWN";
  }

  return "UNKNOWN";
}