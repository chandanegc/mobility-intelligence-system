import mongoose from 'mongoose';
import 'dotenv/config';
import MlNextPlaceTrainingSample from './src/models/mlNextPlaceTrainingSample.model.js';
import MlTripDurationTrainingSample from './src/models/mlTripDurationTrainingSample.model.js';
import MlPlaceTypeTrainingSample from './src/models/mlPlaceTypeTrainingSample.model.js';

async function checkCounts() {
    await mongoose.connect(process.env.MONGO_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true
    });

    const nextPlaceCount = await MlNextPlaceTrainingSample.countDocuments();
    const tripDurationCount = await MlTripDurationTrainingSample.countDocuments();
    const placeTypeCount = await MlPlaceTypeTrainingSample.countDocuments();

    console.log(`ML Next Place Samples: ${nextPlaceCount}`);
    console.log(`ML Trip Duration Samples: ${tripDurationCount}`);
    console.log(`ML Place Type Samples: ${placeTypeCount}`);

    await mongoose.connection.close();
}

checkCounts().catch(console.error);
