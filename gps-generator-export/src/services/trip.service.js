import { SPEED, TIME } from "../constants/gps.constants.js";

// Simple ID generator without crypto dependency
function generateTripId() {
  return `trip_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export function detectTrip({ curr, state, activityType }) {
  const speed = Number(curr.speed || 0);

  if (
    !state.currentTripId &&
    speed > SPEED.TRIP_START &&
    activityType !== "UNKNOWN"
  ) {
    state.currentTripId = generateTripId();
    state.stoppedSince = null;

    return state.currentTripId;
  }

  if (state.currentTripId && speed < SPEED.TRIP_STOP) {
    if (!state.stoppedSince) {
      state.stoppedSince = curr.gps_TimeStamp;
    }

    const stoppedDuration = curr.gps_TimeStamp - state.stoppedSince;

    if (stoppedDuration >= TIME.TRIP_STOP_SEC) {
      state.currentTripId = null;
      state.stoppedSince = null;

      return null;
    }
  }

  if (state.currentTripId && speed >= SPEED.TRIP_STOP) {
    state.stoppedSince = null;
  }

  return state.currentTripId;
}