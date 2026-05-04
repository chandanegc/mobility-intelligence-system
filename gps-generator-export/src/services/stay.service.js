import { DISTANCE, TIME } from "../constants/gps.constants.js";
import { haversineDistance } from "../utils/geo.util.js";

export function detectStay({ curr, state, activityType, isAnomaly }) {
  if (isAnomaly || activityType === "UNKNOWN") {
    state.stayAnchor = null;
    state.stayStartTime = null;

    return {
      is_stay_point: false,
      stay_start_time: null,
      stay_duration: 0
    };
  }

  if (!state.stayAnchor) {
    state.stayAnchor = {
      lat: curr.lat,
      lng: curr.lng,
      gps_TimeStamp: curr.gps_TimeStamp
    };

    state.stayStartTime = curr.gps_TimeStamp;

    return {
      is_stay_point: false,
      stay_start_time: state.stayStartTime,
      stay_duration: 0
    };
  }

  const distanceFromAnchor = haversineDistance(
    state.stayAnchor.lat,
    state.stayAnchor.lng,
    curr.lat,
    curr.lng
  );

  if (distanceFromAnchor <= DISTANCE.STAY_RADIUS_M) {
    const stayDuration = curr.gps_TimeStamp - state.stayStartTime;

    return {
      is_stay_point: stayDuration >= TIME.STAY_MIN_SEC,
      stay_start_time: state.stayStartTime,
      stay_duration: stayDuration
    };
  }

  state.stayAnchor = {
    lat: curr.lat,
    lng: curr.lng,
    gps_TimeStamp: curr.gps_TimeStamp
  };

  state.stayStartTime = curr.gps_TimeStamp;

  return {
    is_stay_point: false,
    stay_start_time: state.stayStartTime,
    stay_duration: 0
  };
}