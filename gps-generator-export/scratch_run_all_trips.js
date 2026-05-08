import mongoose from 'mongoose';
import 'dotenv/config';
import { createTripSegmentsForAllUsersByDate } from "./src/services/tripSegments.service.js";
import { connectDB, disconnectDB } from "./config/db.js";

async function runForAllDates() {
    await connectDB();

    const uniqueDates = await mongoose.connection.db.collection('cluster_visits').distinct('date');
    console.log(`Unique dates found: ${uniqueDates.length}`);

    for (const date of uniqueDates) {
        console.log(`Processing date: ${date}`);
        const results = await createTripSegmentsForAllUsersByDate(date);
        const totalCreated = results.reduce((s, r) => s + r.total_trips_created, 0);
        console.log(`  Created ${totalCreated} trips for ${date}`);
    }

    await disconnectDB();
}

runForAllDates().catch(console.error);
