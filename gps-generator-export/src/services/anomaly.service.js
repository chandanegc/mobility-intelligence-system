import {
  DISTANCE,
  QUALITY,
  TIME
} from "../constants/gps.constants.js";

import { isValidLatLng } from "../utils/geo.util.js";

export function detectAnomaly({
  curr,
  prev,
  distanceFromPrev,
  timeGap,
  calculatedSpeedKmph
}) {
  if (!isValidLatLng(curr.lat, curr.lng)) {
    return {
      isAnomaly: true,
      reason: "INVALID_LAT_LNG"
    };
  }

  if (!curr.gps_TimeStamp || curr.gps_TimeStamp <= 0) {
    return {
      isAnomaly: true,
      reason: "INVALID_TIMESTAMP"
    };
  }

  if (curr.accuracy && curr.accuracy > QUALITY.MAX_ACCEPTABLE_ACCURACY_M) {
    return {
      isAnomaly: true,
      reason: "LOW_GPS_ACCURACY"
    };
  }

  if (!prev) {
    return {
      isAnomaly: false,
      reason: null
    };
  }

  if (timeGap <= 0) {
    return {
      isAnomaly: true,
      reason: "NON_INCREASING_TIMESTAMP"
    };
  }

  if (
    distanceFromPrev > DISTANCE.IMPOSSIBLE_JUMP_M &&
    timeGap < TIME.RESET_GAP_SEC
  ) {
    return {
      isAnomaly: true,
      reason: "IMPOSSIBLE_DISTANCE_JUMP"
    };
  }

  if (calculatedSpeedKmph > QUALITY.MAX_REALISTIC_SPEED_KMPH) {
    return {
      isAnomaly: true,
      reason: "IMPOSSIBLE_SPEED"
    };
  }

  return {
    isAnomaly: false,
    reason: null
  };
}