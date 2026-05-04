import { connectMDB, disconnectDB } from "../config/db.js";
import { processAllUsersGpsData } from "./processors/gps.processor.js";

async function main() {
  try {
    await connectMDB();

    await processAllUsersGpsData();

    await disconnectDB();

    console.log("GPS processing completed");
  } catch (error) {
    console.error("Application failed:", error);
    await disconnectDB();
    process.exit(1);
  }
}

main();