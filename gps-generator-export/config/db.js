import mongoose from 'mongoose';

const connectDB = async () => {
    try {
        const conn = await mongoose.connect(process.env.MONGO_URI, {
            serverSelectionTimeoutMS: 5000
        });
        console.log(`✓ MongoDB connected: ${conn.connection.host}`);
    } catch (err) {
        console.error('✗ MongoDB connection failed:', err.message);
        process.exit(1);
    }
};

export async function connectMDB() {
   try {
        const conn = await mongoose.connect(process.env.MONGO_URI || "mongodb://10.10.21.44:27017/gps_tracking_ai", {
            serverSelectionTimeoutMS: 5000
        });
        console.log(`✓ MongoDB connected: ${conn.connection.host}`);
    } catch (err) {
        console.error('✗ MongoDB connection failed:', err.message);
        process.exit(1);
    }
}

export async function disconnectDB() {
  await mongoose.disconnect();
  console.log("MongoDB disconnected");
}



export default connectDB;

