import mongoose from "mongoose";
import { connectDB, disconnectDB } from "../config/db.js";
import { processAllUsersGpsData } from "./processors/gps.processor.js";
import { createTripSegmentsForAllUsersByDate } from "./services/tripSegments.service.js";
import ClusterVisit from "./models/clusterVisit.model.js";

async function main() {
  try {
    await connectDB();

    // 1. Process Raw GPS to Processed (Stays, Activity, Trips)
    console.log("Step 1: Processing Raw GPS data...");
    await processAllUsersGpsData();
    console.log("✓ GPS processing completed");

    // 2. Generate Trip Segments (Movement between stays)
    // console.log("\nStep 2: Generating Trip Segments...");
    // const dates = await ClusterVisit.distinct("date");
    // console.log(`Found ${dates.length} dates to process: ${dates.join(", ")}`);

    // for (const date of dates) {
    //   await createTripSegmentsForAllUsersByDate(date);
    // }

    await disconnectDB();
    console.log("\n🚀 All processing completed successfully!");
  } catch (error) {
    console.error("✗ Application failed:", error);
    if (mongoose.connection && mongoose.connection.readyState !== 0) {
        await disconnectDB();
    }
    process.exit(1);
  }
}

main();