import { VISIT_CONFIG } from "../constants/clustering.constants.js";

function getDateParts(timestampSec) {
  const date = new Date(timestampSec * 1000);

  const day_of_week = date.toLocaleDateString("en-US", {
    weekday: "long"
  });

  const hour = date.getHours();

  let time_of_day = "night";

  if (hour >= 6 && hour < 12) time_of_day = "morning";
  else if (hour >= 12 && hour < 17) time_of_day = "afternoon";
  else if (hour >= 17 && hour < 21) time_of_day = "evening";

  const is_weekend = date.getDay() === 0 || date.getDay() === 6;

  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");

  return {
    day_of_week,
    hour,
    time_of_day,
    is_weekend,
    date: `${yyyy}-${mm}-${dd}`
  };
}

function createVisit({ userId, clusterId, startPoint, prevClusterId }) {
  const meta = getDateParts(startPoint.gps_TimeStamp);

  return {
    user_id: userId,
    cluster_id: clusterId,

    visit_start: startPoint.gps_TimeStamp,
    visit_end: null,
    duration_sec: null,

    arrival_hour: meta.hour,
    departure_hour: null,

    day_of_week: meta.day_of_week,
    is_weekend: meta.is_weekend,
    time_of_day: meta.time_of_day,

    prev_cluster_id: prevClusterId || null,
    next_cluster_id: null,

    point_count: 1,
    is_merged: false,
    date: meta.date,

    created_at: Date.now()
  };
}

function closeVisit(visit, endPoint, nextClusterId = null) {
  const meta = getDateParts(endPoint.gps_TimeStamp);

  visit.visit_end = endPoint.gps_TimeStamp;
  visit.duration_sec = visit.visit_end - visit.visit_start;
  visit.departure_hour = meta.hour;
  visit.next_cluster_id = nextClusterId;

  return visit;
}

function shouldKeepVisit(visit) {
  return (
    visit.duration_sec &&
    visit.duration_sec >= VISIT_CONFIG.MIN_VISIT_DURATION_SEC
  );
}

function tryMergeVisits(visits) {
  if (!visits.length) return [];

  const merged = [visits[0]];

  for (let i = 1; i < visits.length; i++) {
    const prev = merged[merged.length - 1];
    const curr = visits[i];

    const gap = curr.visit_start - prev.visit_end;

    if (
      prev.cluster_id === curr.cluster_id &&
      gap >= 0 &&
      gap <= VISIT_CONFIG.MERGE_GAP_SEC
    ) {
      prev.visit_end = curr.visit_end;
      prev.duration_sec = prev.visit_end - prev.visit_start;
      prev.departure_hour = curr.departure_hour;
      prev.point_count += curr.point_count;
      prev.is_merged = true;
      prev.next_cluster_id = curr.next_cluster_id;
    } else {
      merged.push(curr);
    }
  }

  return merged;
}

export function detectClusterVisits(points) {
  if (!points.length) return [];

  const sorted = [...points].sort(
    (a, b) => a.gps_TimeStamp - b.gps_TimeStamp
  );

  const visits = [];

  let currentVisit = null;
  let prevPoint = null;
  let prevClusterId = null;

  for (const point of sorted) {
    if (!point.cluster_id || point.cluster_id === "-1") {
      continue;
    }

    if (!currentVisit) {
      currentVisit = createVisit({
        userId: point.user_id,
        clusterId: point.cluster_id,
        startPoint: point,
        prevClusterId
      });

      prevPoint = point;
      continue;
    }

    if (point.cluster_id === currentVisit.cluster_id) {
      currentVisit.point_count += 1;
      prevPoint = point;
      continue;
    }

    closeVisit(currentVisit, prevPoint, point.cluster_id);

    if (shouldKeepVisit(currentVisit)) {
      visits.push(currentVisit);
    }

    prevClusterId = currentVisit.cluster_id;

    currentVisit = createVisit({
      userId: point.user_id,
      clusterId: point.cluster_id,
      startPoint: point,
      prevClusterId
    });

    prevPoint = point;
  }

  if (currentVisit && prevPoint) {
    closeVisit(currentVisit, prevPoint, null);

    if (shouldKeepVisit(currentVisit)) {
      visits.push(currentVisit);
    }
  }

  return tryMergeVisits(visits);
}