import "dotenv/config";
import mongoose from "mongoose";

const DEFAULT_MONGO_URI = "mongodb://10.10.21.44:27017/gps_tracking_ai";
const uri = process.env.MONGO_URI || DEFAULT_MONGO_URI;
const ClusterVisitSchema = new mongoose.Schema({}, { strict: false, collection: 'cluster_visits' });
const ClusterVisit = mongoose.model('InspectClusterVisit', ClusterVisitSchema);

async function run() {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  const docs = await ClusterVisit.find({ user_id: 'U123' }).sort({ visit_start: 1 }).lean();
  console.log('total', docs.length);
  for (const doc of docs) {
    console.log(JSON.stringify({
      cluster_id: doc.cluster_id,
      date: doc.date,
      visit_start: doc.visit_start,
      visit_end: doc.visit_end,
      prev: doc.prev_cluster_id,
      next: doc.next_cluster_id,
      center: doc.center,
      center_location: doc.center_location,
      duration_sec: doc.duration_sec,
      is_merged: doc.is_merged
    }, null, 2));
  }
  await mongoose.disconnect();
}

run().catch(err => { console.error(err); process.exit(1); });