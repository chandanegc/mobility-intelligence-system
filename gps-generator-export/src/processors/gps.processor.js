import GpsRaw from "../models/gpsRaw.model.js";
import GpsProcessed from "../models/gpsProcessed.model.js";

import { TIME, PROCESSING_VERSION } from "../constants/gps.constants.js";

import {
  haversineDistance,
  headingDiff,
  getCalculatedSpeedKmph
} from "../utils/geo.util.js";

import { detectAnomaly } from "../services/anomaly.service.js";
import { detectActivity } from "../services/activity.service.js";
import { detectTrip } from "../services/trip.service.js";
import { detectStay } from "../services/stay.service.js";
import {
  scoreGpsQuality,
  smoothGpsPoint
} from "../services/gpsQuality.service.js";

function createEmptyState(lastProcessed = null) {
  return {
    lastPoint: lastProcessed
      ? {
          _id: lastProcessed.raw_id,
          user_id: lastProcessed.user_id,
          gps_TimeStamp: lastProcessed.gps_TimeStamp,
          lat: lastProcessed.lat,
          lng: lastProcessed.lng,
          speed: 0,
          heading: 0,
          trip_id: lastProcessed.trip_id
        }
      : null,

    currentTripId: lastProcessed?.trip_id || null,
    stoppedSince: null,

    stayAnchor: null,
    stayStartTime: null,
    stayPointCount: 0,
    stayDistanceSum: 0,

    filteredPoint: lastProcessed
      ? {
          lat: lastProcessed.lat,
          lng: lastProcessed.lng
        }
      : null
  };
}

function resetMovementState(state) {
  state.currentTripId = null;
  state.stoppedSince = null;
  state.stayAnchor = null;
  state.stayStartTime = null;
  state.stayPointCount = 0;
  state.stayDistanceSum = 0;
  state.filteredPoint = null;
}

function buildProcessedPoint(raw, state) {
  const prev = state.lastPoint;

  const timeGap = prev ? raw.gps_TimeStamp - prev.gps_TimeStamp : 0;

  const distanceFromPrev = prev
    ? haversineDistance(prev.lat, prev.lng, raw.lat, raw.lng)
    : 0;

  const calculatedSpeedKmph = getCalculatedSpeedKmph(
    distanceFromPrev,
    timeGap
  );

  const speedChange = prev
    ? Number(raw.speed || 0) - Number(prev.speed || 0)
    : 0;

  const hChange = prev
    ? headingDiff(prev.heading || 0, raw.heading || 0)
    : 0;

  const anomaly = detectAnomaly({
    curr: raw,
    prev,
    distanceFromPrev,
    timeGap,
    calculatedSpeedKmph
  });

  if (timeGap > TIME.RESET_GAP_SEC) {
    resetMovementState(state);
  }

  const filteredPoint = anomaly.isAnomaly
    ? {
        lat: raw.lat,
        lng: raw.lng
      }
    : smoothGpsPoint({
        raw,
        previousFiltered: state.filteredPoint
      });

  const filteredCurr = {
    ...raw,
    lat: filteredPoint.lat,
    lng: filteredPoint.lng
  };

  const filteredDistanceFromPrev = prev
    ? haversineDistance(prev.lat, prev.lng, filteredCurr.lat, filteredCurr.lng)
    : 0;

  const filteredCalculatedSpeedKmph = getCalculatedSpeedKmph(
    filteredDistanceFromPrev,
    timeGap
  );

  const activityType = detectActivity({
    rawSpeedKmph: raw.speed,
    calculatedSpeedKmph: filteredCalculatedSpeedKmph,
    distanceFromPrev: filteredDistanceFromPrev,
    timeGap,
    isAnomaly: anomaly.isAnomaly
  });

  const tripId = anomaly.isAnomaly
    ? null
    : detectTrip({
        curr: raw,
        state,
        activityType
      });

  const stay = detectStay({
    curr: filteredCurr,
    state,
    activityType,
    isAnomaly: anomaly.isAnomaly,
    timeGap
  });

  const gpsQualityScore = scoreGpsQuality({
    accuracy: raw.accuracy,
    timeGap
  });

  const processed = {
    raw_id: raw._id,

    user_id: raw.user_id,
    vin: raw.vin,
    device_type: raw.device_type,

    gps_TimeStamp: raw.gps_TimeStamp,

    raw_lat: raw.lat,
    raw_lng: raw.lng,

    lat: filteredCurr.lat,
    lng: filteredCurr.lng,

    location: {
      type: "Point",
      coordinates: [filteredCurr.lng, filteredCurr.lat]
    },

    gps_accuracy_m: raw.accuracy ?? null,
    gps_quality_score: gpsQualityScore,
    is_sparse_point: timeGap > TIME.SPARSE_POINT_GAP_SEC,

    activity_type: activityType,
    activity_confidence:
      activityType === "UNKNOWN" ? 0 : Number(gpsQualityScore.toFixed(2)),

    trip_id: tripId,

    is_stay_point: stay.is_stay_point,
    stay_start_time: stay.stay_start_time,
    stay_duration: stay.stay_duration,
    stay_confidence: stay.stay_confidence,
    stay_radius_m: stay.stay_radius_m,
    stay_distance_from_anchor_m: stay.stay_distance_from_anchor_m,
    stay_point_count: stay.stay_point_count,
    stay_reason: stay.stay_reason,

    cluster_id: null,

    distance_from_prev: Number(filteredDistanceFromPrev.toFixed(2)),
    raw_distance_from_prev: Number(distanceFromPrev.toFixed(2)),
    time_gap: timeGap,
    speed_change: Number(speedChange.toFixed(2)),
    heading_change: Number(hChange.toFixed(2)),
    calculated_speed_kmph: Number(filteredCalculatedSpeedKmph.toFixed(2)),
    raw_calculated_speed_kmph: Number(calculatedSpeedKmph.toFixed(2)),

    is_anomaly: anomaly.isAnomaly,
    anomaly_reason: anomaly.reason,

    processing_version: PROCESSING_VERSION,
    processed_at: Date.now()
  };

  state.lastPoint = {
    _id: raw._id,
    user_id: raw.user_id,
    gps_TimeStamp: raw.gps_TimeStamp,
    lat: filteredCurr.lat,
    lng: filteredCurr.lng,
    speed: raw.speed || 0,
    heading: raw.heading || 0,
    trip_id: processed.trip_id
  };

  if (!anomaly.isAnomaly) {
    state.filteredPoint = filteredPoint;
  }

  return processed;
}

async function getUsersWithUnprocessedData() {
  return GpsRaw.distinct("user_id", {
    processed: false
  });
}

async function getLastProcessedPoint(userId) {
  return GpsProcessed.findOne({
    user_id: userId
  })
    .sort({ gps_TimeStamp: -1 })
    .lean();
}

export async function processUserGpsData(userId, limit = 5000) {
  const rawPoints = await GpsRaw.find({
    user_id: userId,
    processed: false
  })
    .sort({ gps_TimeStamp: 1 })
    .limit(limit)
    .lean();

  if (!rawPoints.length) {
    console.log(`No unprocessed data for user ${userId}`);
    return { inserted: 0, failed: 0 };
  }

  const lastProcessed = await getLastProcessedPoint(userId);
  const state = createEmptyState(lastProcessed);

  const processedDocs = [];
  const rawIds = [];
  let failedCount = 0;
  let errorReasons = {};

  for (const raw of rawPoints) {
    try {
      const processed = buildProcessedPoint(raw, state);

      processedDocs.push(processed);
      rawIds.push(raw._id);
    } catch (error) {
      failedCount++;
      const reason = error.message || "unknown";
      errorReasons[reason] = (errorReasons[reason] || 0) + 1;
      
      // Log first occurrence of each unique error with stack trace
      if (errorReasons[reason] === 1) {
        console.error(`   First error "${reason}":`, error.stack?.split('\n').slice(0, 3).join('\n'));
      }
    }
  }

  // Log error summary
  if (failedCount > 0) {
    console.log(`   ⚠️  Failed to process ${failedCount} points:`);
    for (const [reason, count] of Object.entries(errorReasons)) {
      console.log(`      - ${reason}: ${count}`);
    }
  }

  if (!processedDocs.length) {
    console.log(`No documents processed for user ${userId}`);
    return { inserted: 0, failed: failedCount };
  }

  try {
    await GpsProcessed.insertMany(processedDocs, {
      ordered: false
    });
  } catch (error) {
    console.error("Insert warning:", error.message);
  }

  await GpsRaw.updateMany(
    {
      _id: {
        $in: rawIds
      }
    },
    {
      $set: {
        processed: true,
        updatedOn: Date.now()
      }
    }
  );

  console.log(
    `Processed user=${userId}, raw=${rawPoints.length}, success=${processedDocs.length}, failed=${failedCount}`
  );

  return { inserted: processedDocs.length, failed: failedCount };
}

export async function processAllUsersGpsData() {
  const users = await getUsersWithUnprocessedData();

  console.log("Users to process:", users);

  for (const userId of users) {
    let hasMoreData = true;
    let batchNum = 0;
    let consecutiveEmptyBatches = 0;

    while (hasMoreData) {
      batchNum++;
      console.log(`\n📦 User ${userId}, Batch ${batchNum}...`);

      const beforeCount = await GpsRaw.countDocuments({
        user_id: userId,
        processed: false
      });

      if (beforeCount === 0) {
        console.log(`✅ All data processed for user ${userId}`);
        hasMoreData = false;
        break;
      }

      const result = await processUserGpsData(userId, 5000);

      const afterCount = await GpsRaw.countDocuments({
        user_id: userId,
        processed: false
      });

      console.log(`   Remaining unprocessed for ${userId}: ${afterCount}`);

      // Check if we're stuck in a loop
      if (beforeCount === afterCount) {
        consecutiveEmptyBatches++;
        console.warn(`⚠️  No progress made. Empty batches: ${consecutiveEmptyBatches}`);

        if (consecutiveEmptyBatches >= 3) {
          console.error(`❌ Stopping for ${userId} - 3 consecutive batches with no progress (likely all data has processing errors)`);
          hasMoreData = false;
          break;
        }
      } else {
        consecutiveEmptyBatches = 0;
      }

      hasMoreData = afterCount > 0;
    }
  }

  console.log("\n🎉 All users processed!");
}
