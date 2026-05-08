import mongoose from 'mongoose';
import 'dotenv/config';

const Schema = mongoose.Schema;

async function checkAllCounts() {
    await mongoose.connect(process.env.MONGO_URI);

    const collections = [
        'gps_raw',
        'gps_processed',
        'user_clusters',
        'cluster_visits',
        'trip_segments',
        'user_movement_patterns',
        'ml_next_place_training_samples',
        'ml_trip_duration_training_samples',
        'ml_place_type_training_samples'
    ];

    for (const coll of collections) {
        try {
            const count = await mongoose.connection.db.collection(coll).countDocuments();
            console.log(`${coll}: ${count}`);
        } catch (err) {
            console.log(`${coll}: Error or Not Found`);
        }
    }

    await mongoose.connection.close();
}

checkAllCounts().catch(console.error);
