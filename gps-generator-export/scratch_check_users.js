import mongoose from 'mongoose';
import 'dotenv/config';

async function checkUsers() {
    await mongoose.connect(process.env.MONGO_URI);

    const users = await mongoose.connection.db.collection('cluster_visits').distinct('user_id');
    console.log("Users in cluster_visits:");
    console.log(users);

    await mongoose.connection.close();
}

checkUsers().catch(console.error);
