import mongoose from 'mongoose';
import 'dotenv/config';

async function checkDateRange() {
    await mongoose.connect(process.env.MONGO_URI);

    const visits = await mongoose.connection.db.collection('cluster_visits').aggregate([
        {
            $group: {
                _id: null,
                min_date: { $min: "$date" },
                max_date: { $max: "$date" },
                unique_dates: { $addToSet: "$date" }
            }
        }
    ]).toArray();

    console.log(JSON.stringify(visits, null, 2));

    await mongoose.connection.close();
}

checkDateRange().catch(console.error);
