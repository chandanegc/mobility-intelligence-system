import "dotenv/config";
import mongoose from "mongoose";

const DEFAULT_MONGO_URI = "mongodb://10.10.21.44:27017/gps_tracking_ai";

async function checkTripSegments() {
  try {
    const uri = process.env.MONGO_URI || DEFAULT_MONGO_URI;
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });

    const TripSegment = mongoose.model('TripSegment', {}, 'trip_segments');

    const count = await TripSegment.countDocuments({ user_id: "U123", date: "2026-05-05" });
    console.log(`Total trip segments for U123 on 2026-05-05: ${count}`);

    const sample = await TripSegment.findOne({ user_id: "U123", date: "2026-05-05" }).lean();
    console.log("Sample document:", JSON.stringify(sample, null, 2));

    await mongoose.disconnect();
  } catch (error) {
    console.error("Error:", error);
  }
}

checkTripSegments();