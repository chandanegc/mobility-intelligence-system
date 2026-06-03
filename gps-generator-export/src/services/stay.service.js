import { QUALITY, TIME } from "../constants/gps.constants.js";
import { getAdaptiveStayRadius, scoreGpsQuality } from "./gpsQuality.service.js";
import { haversineDistance } from "../utils/geo.util.js";

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function resetStayState(state) {
  state.stayAnchor = null;
  state.stayStartTime = null;
  state.stayPointCount = 0;
  state.stayDistanceSum = 0;
}

function buildStayResult({
  isStayPoint,
  state,
  curr,
  distanceFromAnchor = null,
  radiusMeters = null,
  confidence = 0,
  reason = "NO_STAY_CANDIDATE"
}) {
  return {
    is_stay_point: isStayPoint,
    stay_start_time: state.stayStartTime,
    stay_duration: state.stayStartTime ? curr.gps_TimeStamp - state.stayStartTime : 0,
    stay_confidence: Number(confidence.toFixed(2)),
    stay_radius_m: radiusMeters,
    stay_distance_from_anchor_m:
      distanceFromAnchor === null ? null : Number(distanceFromAnchor.toFixed(2)),
    stay_point_count: state.stayPointCount || 0,
    stay_reason: reason
  };
}

function calculateStayConfidence({
  curr,
  state,
  activityType,
  distanceFromAnchor,
  radiusMeters,
  timeGap
}) {
  const duration = curr.gps_TimeStamp - state.stayStartTime;
  const qualityScore = scoreGpsQuality({ accuracy: curr.accuracy, timeGap });
  const dwellScore = clamp(duration / (TIME.STAY_MIN_SEC * 2), 0, 1);
  const compactnessScore = clamp(1 - distanceFromAnchor / radiusMeters, 0, 1);
  const densityScore = clamp((state.stayPointCount || 0) / 4, 0, 1);

  let activityScore = 0.35;
  if (activityType === "STAY") activityScore = 1;
  if (activityType === "WALK") activityScore = 0.55;
  if (activityType === "DRIVE") activityScore = 0.05;

  return (
    qualityScore * 0.2 +
    dwellScore * 0.25 +
    compactnessScore * 0.2 +
    densityScore * 0.15 +
    activityScore * 0.2
  );
}

export function detectStay({ curr, state, activityType, isAnomaly, timeGap = 0 }) {
  if (isAnomaly || activityType === "UNKNOWN") {
    resetStayState(state);

    return buildStayResult({
      isStayPoint: false,
      state,
      curr,
      confidence: 0,
      reason: isAnomaly ? "ANOMALY" : "UNKNOWN_ACTIVITY"
    });
  }

  if (!state.stayAnchor) {
    state.stayAnchor = {
      lat: curr.lat,
      lng: curr.lng,
      gps_TimeStamp: curr.gps_TimeStamp
    };

    state.stayStartTime = curr.gps_TimeStamp;
    state.stayPointCount = 1;
    state.stayDistanceSum = 0;

    return buildStayResult({
      isStayPoint: false,
      state,
      curr,
      radiusMeters: getAdaptiveStayRadius({ accuracy: curr.accuracy }),
      confidence: 0.2,
      reason: "ANCHOR_CREATED"
    });
  }

  const radiusMeters = getAdaptiveStayRadius({ accuracy: curr.accuracy });
  const distanceFromAnchor = haversineDistance(
    state.stayAnchor.lat,
    state.stayAnchor.lng,
    curr.lat,
    curr.lng
  );

  if (distanceFromAnchor <= radiusMeters) {
    state.stayPointCount += 1;
    state.stayDistanceSum += distanceFromAnchor;

    const confidence = calculateStayConfidence({
      curr,
      state,
      activityType,
      distanceFromAnchor,
      radiusMeters,
      timeGap
    });

    const stayDuration = curr.gps_TimeStamp - state.stayStartTime;
    const isStayPoint =
      stayDuration >= TIME.STAY_MIN_SEC &&
      confidence >= QUALITY.MIN_STOP_CONFIDENCE &&
      activityType !== "DRIVE";

    const anchorWeight = 1 / state.stayPointCount;
    state.stayAnchor.lat =
      state.stayAnchor.lat + (curr.lat - state.stayAnchor.lat) * anchorWeight;
    state.stayAnchor.lng =
      state.stayAnchor.lng + (curr.lng - state.stayAnchor.lng) * anchorWeight;

    return buildStayResult({
      isStayPoint,
      state,
      curr,
      distanceFromAnchor,
      radiusMeters,
      confidence,
      reason: isStayPoint ? "CONFIDENT_STAY" : "CANDIDATE_STAY"
    });
  }

  state.stayAnchor = {
    lat: curr.lat,
    lng: curr.lng,
    gps_TimeStamp: curr.gps_TimeStamp
  };

  state.stayStartTime = curr.gps_TimeStamp;
  state.stayPointCount = 1;
  state.stayDistanceSum = 0;

  return buildStayResult({
    isStayPoint: false,
    state,
    curr,
    distanceFromAnchor,
    radiusMeters,
    confidence: 0.15,
    reason: "ANCHOR_RESET"
  });
}
