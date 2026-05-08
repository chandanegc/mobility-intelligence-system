import mongoose from 'mongoose';
import 'dotenv/config';
import TripSegment from './src/models/tripSegment.model.js';
import UserCluster from './src/models/userCluster.model.js';

async function checkData() {
    await mongoose.connect(process.env.MONGO_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true
    });

    const tripCount = await TripSegment.countDocuments();
    const clusterCount = await UserCluster.countDocuments();

    console.log(`Trip Segments: ${tripCount}`);
    console.log(`User Clusters: ${clusterCount}`);

    if (tripCount > 0) {
        const sampleTrip = await TripSegment.findOne();
        console.log('Sample Trip Segment:', JSON.stringify(sampleTrip, null, 2));
    }

    await mongoose.connection.close();
}

checkData().catch(console.error);
