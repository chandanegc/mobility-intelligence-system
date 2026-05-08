import TripSegment from "../models/tripSegment.model.js";
import ClusterVisit from "../models/clusterVisit.model.js";
import GpsProcessed from "../models/gpsProcessed.model.js";
import { haversineDistance, getCalculatedSpeedKmph, isValidLatLng } from "../utils/geo.util.js";
import { QUALITY } from "../constants/gps.constants.js";

// Same-cluster trips shorter than this are treated as duplicate/noise
const SAME_CLUSTER_MIN_GAP_SEC = 120;

/**
 * Creates trip segments for a given user and date.
 * A trip segment = movement between two consecutive cluster_visits.
 *
 * @param {string} userId
 * @param {string} date - "YYYY-MM-DD"
 * @param {object} [options]
 * @param {number} [options.minTripDurationSec=60]
 * @returns {object} { user_id, date, total_trips_created, total_trips_updated, skipped_count, trips }
 */
export async function createTripSegmentsForUserDate(userId, date, options = {}) {
  const { minTripDurationSec = 60, strictFiltering = false } = options;

  console.log(`[trip_segments] user=${userId} date=${date} — starting`);

  const { dayStart, dayEnd } = buildDateWindow(date);

  const visits = await loadClusterVisitsForDate(userId, date);
  console.log(`[trip_segments] visits_found=${visits.length} (including boundary visits)`);

  if (visits.length < 2) {
    console.log(`[trip_segments] Skipping: need >= 2 visits, got ${visits.length}`);
    return { user_id: userId, date, total_trips_created: 0, total_trips_updated: 0, skipped_count: 0, trips: [] };
  }

  // Build candidate trip windows first (cheap validations),
  // then fetch gps_processed points once for the full window.
  const candidates = [];
  let skippedCount = 0;

  for (let i = 0; i < visits.length - 1; i++) {
    const fromVisit = visits[i];
    const toVisit = visits[i + 1];

    // Some older cluster_visits may not have visit_end populated.
    // In that case, derive it from (visit_start + duration_sec) if possible.
    const derivedFromEnd =
      typeof fromVisit.visit_start === "number" && typeof fromVisit.duration_sec === "number"
        ? fromVisit.visit_start + fromVisit.duration_sec
        : null;

    const tripStart = fromVisit.visit_end ?? derivedFromEnd;
    const tripEnd = toVisit.visit_start;
    const fromCluster = fromVisit.cluster_id;
    const toCluster = toVisit.cluster_id;

    // --- Validation & skip checks ---

    if (!tripStart || !tripEnd || !fromCluster || !toCluster) {
      skippedCount++;
      continue;
    }

    const durationSec = tripEnd - tripStart;

    if (durationSec <= 0) {
      skippedCount++;
      continue;
    }

    // Soft filters: keep segment but mark as filtered (unless strictFiltering=true)
    let filterReason = null;
    let isFiltered = false;

    if (fromCluster === toCluster && durationSec < SAME_CLUSTER_MIN_GAP_SEC) {
      filterReason = "same_cluster_small_gap";
      isFiltered = true;
      if (strictFiltering) {
        skippedCount++;
        continue;
      }
    }

    if (durationSec < minTripDurationSec) {
      // Only override reason if not already set (same-cluster case is more specific)
      if (!filterReason) filterReason = "below_min_duration";
      isFiltered = true;
      if (strictFiltering) {
        skippedCount++;
        continue;
      }
    }

    // Trip must overlap with target date window
    if (tripStart >= dayEnd || tripEnd < dayStart) {
      skippedCount++;
      continue;
    }

    candidates.push({
      fromVisit,
      toVisit,
      tripStart,
      tripEnd,
      durationSec,
      fromCluster,
      toCluster,
      isFiltered,
      filterReason
    });
  }

  console.log(`[trip_segments] trip_pairs=${candidates.length} skipped=${skippedCount}`);

  if (!candidates.length) {
    return { user_id: userId, date, total_trips_created: 0, total_trips_updated: 0, skipped_count: skippedCount, trips: [] };
  }

  const overallStart = Math.min(...candidates.map((c) => c.tripStart));
  const overallEnd = Math.max(...candidates.map((c) => c.tripEnd));

  const allPoints = await GpsProcessed.find(
    { user_id: userId, gps_TimeStamp: { $gte: overallStart, $lte: overallEnd } },
    { lat: 1, lng: 1, gps_TimeStamp: 1, activity_type: 1, movement_type: 1, _id: 0 }
  )
    .sort({ gps_TimeStamp: 1 })
    .lean();

  const trips = [];
  let startIdx = 0;
  let endIdx = 0;

  for (const c of candidates) {
    // advance pointers monotonically since trip windows are in time order
    while (startIdx < allPoints.length && allPoints[startIdx].gps_TimeStamp < c.tripStart) startIdx++;
    if (endIdx < startIdx) endIdx = startIdx;
    while (endIdx < allPoints.length && allPoints[endIdx].gps_TimeStamp <= c.tripEnd) endIdx++;

    const points = allPoints.slice(startIdx, endIdx);

    // --- Calculate metrics ---
    const metrics = calculateTripMetrics(points, c.durationSec);

    // --- Extract locations ---
    const startLocation = extractLocation(c.fromVisit);
    const endLocation = extractLocation(c.toVisit);

    // --- ML helper fields ---
    const mlFields = calculateMLFields(c.tripStart);

    trips.push({
      user_id: userId,
      date,
      from_cluster_id: c.fromCluster,
      to_cluster_id: c.toCluster,
      trip_start: c.tripStart,
      trip_end: c.tripEnd,
      duration_sec: c.durationSec,
      ...metrics,
      start_location: startLocation,
      end_location: endLocation,
      ...mlFields,
      is_filtered: c.isFiltered,
      filter_reason: c.filterReason,
      source: "cluster_visits_gps_processed",
      updated_at: new Date()
    });
  }

  // --- Bulk upsert for idempotency ---
  const bulkOps = trips.map(trip => ({
    updateOne: {
      filter: {
        user_id: trip.user_id,
        date: trip.date,
        from_cluster_id: trip.from_cluster_id,
        to_cluster_id: trip.to_cluster_id,
        trip_start: trip.trip_start
      },
      update: { $set: trip, $setOnInsert: { created_at: new Date() } },
      upsert: true
    }
  }));

  const bulkResult = await TripSegment.bulkWrite(bulkOps, { ordered: false });

  const result = {
    user_id: userId,
    date,
    total_trips_created: bulkResult.upsertedCount,
    total_trips_updated: bulkResult.modifiedCount,
    skipped_count: skippedCount,
    trips
  };

  console.log(
    `[trip_segments] user=${userId} date=${date} created=${result.total_trips_created} ` +
    `updated=${result.total_trips_updated} skipped=${skippedCount}`
  );

  return result;
}

/**
 * Generate trip_segments for ALL users who have cluster_visits on a given date.
 * @param {string} date - "YYYY-MM-DD"
 */
export async function createTripSegmentsForAllUsersByDate(date) {
  const userIds = await ClusterVisit.distinct("user_id", { date });
  console.log(`[trip_segments] Processing ${userIds.length} users for date=${date}`);

  const allResults = [];

  for (const userId of userIds) {
    const result = await createTripSegmentsForUserDate(userId, date);
    allResults.push(result);
  }

  const totalCreated = allResults.reduce((s, r) => s + r.total_trips_created, 0);
  const totalUpdated = allResults.reduce((s, r) => s + r.total_trips_updated, 0);
  const totalSkipped = allResults.reduce((s, r) => s + r.skipped_count, 0);

  console.log(
    `[trip_segments] date=${date} ALL DONE — users=${userIds.length} ` +
    `created=${totalCreated} updated=${totalUpdated} skipped=${totalSkipped}`
  );

  return allResults;
}

// ────────────────────────────────────────────────────────────────────────────────
// Internal helpers (not exported)
// ────────────────────────────────────────────────────────────────────────────────

/**
 * Calculate distance, speed, travel mode, data quality from GPS points.
 * Reuses haversineDistance & getCalculatedSpeedKmph from geo.util.js.
 */
function calculateTripMetrics(points, durationSec) {
  const pointCount = points.length;

  // Early-exit data quality
  if (pointCount === 0) {
    return {
      distance_meters: 0, distance_km: 0,
      avg_speed_kmph: 0, max_speed_kmph: 0,
      travel_mode: "UNKNOWN",
      point_count: 0, valid_segment_count: 0, gps_jump_count: 0,
      data_quality: "NO_POINTS"
    };
  }

  let distanceMeters = 0;
  let maxSpeedKmph = 0;
  let validSegmentCount = 0;
  let gpsJumpCount = 0;

  // --- Distance & speed from consecutive segments ---
  for (let i = 1; i < pointCount; i++) {
    const prev = points[i - 1];
    const curr = points[i];

    // NOTE: don't use falsy checks (0 is valid). Use strict validation instead.
    if (!isValidLatLng(prev.lat, prev.lng) || !isValidLatLng(curr.lat, curr.lng)) continue;

    const timeGap = curr.gps_TimeStamp - prev.gps_TimeStamp;
    if (timeGap <= 0) continue;

    const dist = haversineDistance(prev.lat, prev.lng, curr.lat, curr.lng);
    const speedKmph = getCalculatedSpeedKmph(dist, timeGap);

    // GPS jump filter
    if (speedKmph > QUALITY.MAX_REALISTIC_SPEED_KMPH) {
      gpsJumpCount++;
      continue;
    }

    distanceMeters += dist;
    maxSpeedKmph = Math.max(maxSpeedKmph, speedKmph);
    validSegmentCount++;
  }

  // --- Travel mode: count activity from ALL points independently ---
  let walkCount = 0;
  let driveCount = 0;

  for (const pt of points) {
    const activity = (pt.activity_type || pt.movement_type || "").toUpperCase();
    if (activity === "WALK") walkCount++;
    else if (activity === "DRIVE") driveCount++;
  }

  const movementPoints = walkCount + driveCount;
  let travelMode = "UNKNOWN";

  if (movementPoints > 0) {
    const driveRatio = driveCount / movementPoints;
    const walkRatio = walkCount / movementPoints;

    if (driveRatio >= 0.6) travelMode = "DRIVE";
    else if (walkRatio >= 0.6) travelMode = "WALK";
    else if (driveCount > 0 && walkCount > 0) travelMode = "MIXED";
  }

  // --- Avg speed from total distance / total trip duration ---
  const avgSpeedKmph = durationSec > 0 ? (distanceMeters / durationSec) * 3.6 : 0;
  const distanceKm = distanceMeters / 1000;

  // --- Data quality ---
  let dataQuality = "GOOD";
  if (pointCount < 5) {
    dataQuality = "LOW_POINTS";
  } else if (gpsJumpCount > 0 && validSegmentCount > 0) {
    dataQuality = "GPS_JUMP_FILTERED";
  }

  return {
    distance_meters: Math.round(distanceMeters * 100) / 100,
    distance_km: Math.round(distanceKm * 10000) / 10000,
    avg_speed_kmph: Math.round(avgSpeedKmph * 100) / 100,
    max_speed_kmph: Math.round(maxSpeedKmph * 100) / 100,
    travel_mode: travelMode,
    point_count: pointCount,
    valid_segment_count: validSegmentCount,
    gps_jump_count: gpsJumpCount,
    data_quality: dataQuality
  };
}

/**
 * Extract lat/lng from a cluster visit, handling multiple field formats.
 * Priority: center → top-level lat/lng → center_location GeoJSON [lng, lat].
 */
function extractLocation(visit) {
  if (visit.center && visit.center.lat != null && visit.center.lng != null) {
    return { lat: visit.center.lat, lng: visit.center.lng };
  }
  if (visit.lat != null && visit.lng != null) {
    return { lat: visit.lat, lng: visit.lng };
  }
  if (visit.center_location && Array.isArray(visit.center_location.coordinates) && visit.center_location.coordinates.length >= 2) {
    const [lng, lat] = visit.center_location.coordinates;
    return { lat, lng };
  }
  return { lat: null, lng: null };
}

/**
 * ML training helper fields derived from trip_start timestamp.
 */
function calculateMLFields(timestamp) {
  const d = new Date(timestamp * 1000);
  const hour = d.getHours();

  let timeOfDay;
  if (hour >= 6 && hour < 12) timeOfDay = "morning";
  else if (hour >= 12 && hour < 18) timeOfDay = "afternoon";
  else if (hour >= 18 && hour < 22) timeOfDay = "evening";
  else timeOfDay = "night";

  return {
    day_of_week: d.toLocaleDateString("en-US", { weekday: "long" }),
    time_of_day: timeOfDay,
    departure_hour: hour
  };
}

/**
 * Convert "YYYY-MM-DD" to epoch boundaries (seconds) for that day.
 */
function buildDateWindow(date) {
  const [year, month, day] = date.split("-").map(Number);
  const startOfDay = new Date(year, month - 1, day, 0, 0, 0);
  const dayStart = Math.floor(startOfDay.getTime() / 1000);
  const dayEnd = dayStart + 24 * 60 * 60;
  return { dayStart, dayEnd };
}

/**
 * Load cluster_visits for the date PLUS one boundary visit before the first
 * and one boundary visit after the last — so we can capture cross-midnight trips.
 */
async function loadClusterVisitsForDate(userId, date) {
  const visits = await ClusterVisit.find({ user_id: userId, date })
    .sort({ visit_start: 1 })
    .lean();

  if (!visits.length) return visits;

  // Boundary: previous visit (its visit_end → first visit_start = a trip)
  const firstVisit = visits[0];
  const previousVisit = await ClusterVisit.findOne({
    user_id: userId,
    visit_end: { $lte: firstVisit.visit_start }
  }).sort({ visit_end: -1 }).lean();

  if (previousVisit) {
    visits.unshift(previousVisit);
    console.log(`[trip_segments] boundary prev visit: ${previousVisit.cluster_id} (${previousVisit.date})`);
  }

  // Boundary: next visit (last visit_end → its visit_start = a trip)
  const lastVisit = visits[visits.length - 1];
  const lastVisitEnd =
    lastVisit.visit_end ??
    (typeof lastVisit.visit_start === "number" && typeof lastVisit.duration_sec === "number"
      ? lastVisit.visit_start + lastVisit.duration_sec
      : null);
  const nextVisit = await ClusterVisit.findOne({
    user_id: userId,
    ...(lastVisitEnd != null ? { visit_start: { $gte: lastVisitEnd } } : {})
  }).sort({ visit_start: 1 }).lean();

  if (nextVisit) {
    visits.push(nextVisit);
    console.log(`[trip_segments] boundary next visit: ${nextVisit.cluster_id} (${nextVisit.date})`);
  }

  return visits;
}