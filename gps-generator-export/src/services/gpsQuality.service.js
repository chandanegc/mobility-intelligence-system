import { DISTANCE, QUALITY, TIME } from "../constants/gps.constants.js";

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

export function scoreGpsQuality({ accuracy, timeGap = 0 }) {
  const accuracyMeters = Number(accuracy || QUALITY.GOOD_ACCURACY_M);

  let accuracyScore = 1;
  if (accuracyMeters > QUALITY.EXCELLENT_ACCURACY_M) {
    const range = QUALITY.MAX_ACCEPTABLE_ACCURACY_M - QUALITY.EXCELLENT_ACCURACY_M;
    accuracyScore = 1 - (accuracyMeters - QUALITY.EXCELLENT_ACCURACY_M) / range;
  }

  const freshnessScore =
    timeGap > TIME.SPARSE_POINT_GAP_SEC
      ? 0.55
      : clamp(1 - timeGap / (TIME.SPARSE_POINT_GAP_SEC * 2), 0.65, 1);

  return Number(clamp(accuracyScore * freshnessScore, 0.05, 1).toFixed(2));
}

export function getAdaptiveStayRadius({ accuracy }) {
  const accuracyMeters = Number(accuracy || QUALITY.GOOD_ACCURACY_M);
  const radius = Math.max(DISTANCE.STAY_RADIUS_M, accuracyMeters * 1.5);

  return Math.round(
    console.log("Calculated :", { accuracyMeters, radius }),
    clamp(radius, DISTANCE.MIN_STAY_RADIUS_M, DISTANCE.MAX_STAY_RADIUS_M)
  );
}

export function smoothGpsPoint({ raw, previousFiltered }) {
  if (!previousFiltered) {
    return {
      lat: raw.lat,
      lng: raw.lng
    };
  }

  const accuracyMeters = Number(raw.accuracy || QUALITY.GOOD_ACCURACY_M);
  const trust = clamp(
    1 - accuracyMeters / QUALITY.MAX_ACCEPTABLE_ACCURACY_M,
    0.15,
    0.85
  );

  return {
    lat: previousFiltered.lat + (raw.lat - previousFiltered.lat) * trust,
    lng: previousFiltered.lng + (raw.lng - previousFiltered.lng) * trust
  };
}

