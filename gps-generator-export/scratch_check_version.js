import mongoose from 'mongoose';
import 'dotenv/config';

async function checkVersion() {
    await mongoose.connect(process.env.MONGO_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true
    });

    const admin = mongoose.connection.db.admin();
    const info = await admin.serverStatus();
    console.log(`MongoDB Version: ${info.version}`);

    await mongoose.connection.close();
}

checkVersion().catch(console.error);
