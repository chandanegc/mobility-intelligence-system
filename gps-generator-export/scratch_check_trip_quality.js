import mongoose from 'mongoose';
import 'dotenv/config';

async function checkTripQuality() {
    await mongoose.connect(process.env.MONGO_URI);

    const qualityCounts = await mongoose.connection.db.collection('trip_segments').aggregate([
        {
            $group: {
                _id: "$data_quality",
                count: { $sum: 1 }
            }
        }
    ]).toArray();

    console.log("Trip Data Quality Counts:");
    console.log(JSON.stringify(qualityCounts, null, 2));

    const totalTrips = await mongoose.connection.db.collection('trip_segments').countDocuments();
    console.log(`Total Trips: ${totalTrips}`);

    await mongoose.connection.close();
}

checkTripQuality().catch(console.error);
