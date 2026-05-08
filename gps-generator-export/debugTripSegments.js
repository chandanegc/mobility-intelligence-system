import "dotenv/config";
import mongoose from "mongoose";
import fs from "node:fs";
import ClusterVisit from "./src/models/clusterVisit.model.js";
import { createTripSegmentsForUserDate } from "./src/services/tripSegments.service.js";

const DEFAULT_USER = "U123";
const DEFAULT_DATE = "2026-05-05";

const DEFAULT_MONGO_URI = "mongodb://10.10.21.44:27017/gps_tracking_ai";

const SAME_CLUSTER_MIN_GAP_SEC = 120;
const MIN_TRIP_DURATION_SEC = 60;

function buildDateWindow(date) {
  const [year, month, day] = date.split("-").map(Number);
  const startOfDay = new Date(year, month - 1, day, 0, 0, 0);
  const dayStart = Math.floor(startOfDay.getTime() / 1000);
  const dayEnd = dayStart + 24 * 60 * 60;
  return { dayStart, dayEnd };
}

function classifySkip({
  tripStart,
  tripEnd,
  fromCluster,
  toCluster,
  dayStart,
  dayEnd
}) {
  if (!tripStart || !tripEnd || !fromCluster || !toCluster) return "missing_fields";

  const durationSec = tripEnd - tripStart;
  if (durationSec <= 0) return "non_positive_duration";
  if (fromCluster === toCluster && durationSec < SAME_CLUSTER_MIN_GAP_SEC) return "same_cluster_small_gap";
  if (durationSec < MIN_TRIP_DURATION_SEC) return "below_min_duration";
  if (tripStart >= dayEnd || tripEnd < dayStart) return "outside_day_window";

  return null;
}

async function main() {
  const userId = process.argv[2] || DEFAULT_USER;
  const date = process.argv[3] || DEFAULT_DATE;

  const uri = process.env.MONGO_URI || DEFAULT_MONGO_URI;
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });

  const { dayStart, dayEnd } = buildDateWindow(date);

  const visits = await ClusterVisit.find({ user_id: userId, date })
    .sort({ visit_start: 1 })
    .lean();

  const report = {
    user_id: userId,
    date,
    visits_on_date: visits.length,
    visits: [],
    possible_pairs: 0,
    skip_summary: {},
    pairs: [],
    service_result: null
  };

  report.visits = visits.map((v) => ({
    cluster_id: v.cluster_id,
    visit_start: v.visit_start,
    visit_end: v.visit_end,
    duration_sec: v.duration_sec,
    prev: v.prev_cluster_id,
    next: v.next_cluster_id
  }));

  const pairs = [];
  const skipCounts = {};

  for (let i = 0; i < visits.length - 1; i++) {
    const fromVisit = visits[i];
    const toVisit = visits[i + 1];

    const tripStart = fromVisit.visit_end;
    const tripEnd = toVisit.visit_start;
    const fromCluster = fromVisit.cluster_id;
    const toCluster = toVisit.cluster_id;

    const reason = classifySkip({ tripStart, tripEnd, fromCluster, toCluster, dayStart, dayEnd });
    if (reason) {
      skipCounts[reason] = (skipCounts[reason] || 0) + 1;
    }

    pairs.push({
      i,
      from: fromCluster,
      to: toCluster,
      tripStart,
      tripEnd,
      durationSec: tripStart && tripEnd ? tripEnd - tripStart : null,
      skip_reason: reason
    });
  }

  report.possible_pairs = pairs.length;
  report.skip_summary = skipCounts;
  report.pairs = pairs;

  const result = await createTripSegmentsForUserDate(userId, date);
  report.service_result = {
    total_trips_created: result.total_trips_created,
    total_trips_updated: result.total_trips_updated,
    skipped_count: result.skipped_count,
    trips_count: result.trips.length
  };

  fs.writeFileSync(
    new URL("./debugTripSegments.report.json", import.meta.url),
    JSON.stringify(report, null, 2),
    "utf-8"
  );

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

