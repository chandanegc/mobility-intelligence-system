import { connectDB, disconnectDB } from "./config/db.js";
import {
  createTripSegmentsForUserDate,
  createTripSegmentsForAllUsersByDate
} from "./src/services/tripSegments.service.js";

/**
 * Validation script for trip_segments generation.
 *
 * Usage:
 *   node testTripSegments.js                          → runs for U123 on 2026-05-05
 *   node testTripSegments.js U456 2026-05-06          → custom user + date
 *   node testTripSegments.js --all 2026-05-05         → all users for a date
 */
async function main() {
  const args = process.argv.slice(2);

  try {
    await connectDB();

    // --all <date> mode
    if (args[0] === "--all") {
      const date = args[1] || "2026-05-05";
      console.log(`\n═══ Running for ALL users on ${date} ═══\n`);
      const results = await createTripSegmentsForAllUsersByDate(date);
      printAllUsersResults(results);
      await disconnectDB();
      return;
    }

    // Single user mode
    const userId = args[0] || "U123";
    const date = args[1] || "2026-05-05";

    console.log(`\n═══ Running for user=${userId} date=${date} ═══\n`);
    const result = await createTripSegmentsForUserDate(userId, date);
    printResult(result);

    await disconnectDB();
  } catch (error) {
    console.error("Test failed:", error);
    await disconnectDB();
    process.exit(1);
  }
}

function printResult(result) {
  console.log("\n────────── RESULT ──────────");
  console.log(`user_id:             ${result.user_id}`);
  console.log(`date:                ${result.date}`);
  console.log(`total_trips_created: ${result.total_trips_created}`);
  console.log(`total_trips_updated: ${result.total_trips_updated}`);
  console.log(`skipped_count:       ${result.skipped_count}`);
  console.log(`trips_count:         ${result.trips.length}`);

  if (result.trips.length) {
    console.log("\n────────── TRIPS ──────────");
    for (const trip of result.trips) {
      console.log(`  ${trip.from_cluster_id} → ${trip.to_cluster_id}`);
      console.log(`    duration:    ${trip.duration_sec}s`);
      console.log(`    distance:    ${trip.distance_km} km (${trip.distance_meters} m)`);
      console.log(`    avg_speed:   ${trip.avg_speed_kmph} km/h`);
      console.log(`    max_speed:   ${trip.max_speed_kmph} km/h`);
      console.log(`    travel_mode: ${trip.travel_mode}`);
      console.log(`    points:      ${trip.point_count} (valid_segments: ${trip.valid_segment_count}, jumps: ${trip.gps_jump_count})`);
      console.log(`    quality:     ${trip.data_quality}`);
      console.log(`    start_loc:   ${JSON.stringify(trip.start_location)}`);
      console.log(`    end_loc:     ${JSON.stringify(trip.end_location)}`);
      console.log("");
    }
  }
}

function printAllUsersResults(results) {
  const totalCreated = results.reduce((s, r) => s + r.total_trips_created, 0);
  const totalUpdated = results.reduce((s, r) => s + r.total_trips_updated, 0);

  console.log("\n────────── ALL USERS SUMMARY ──────────");
  console.log(`users_processed: ${results.length}`);
  console.log(`total_created:   ${totalCreated}`);
  console.log(`total_updated:   ${totalUpdated}`);

  for (const r of results) {
    if (r.trips.length > 0) {
      console.log(`  ${r.user_id}: ${r.trips.length} trips`);
    }
  }
}

main();