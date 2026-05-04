import mongoose from "mongoose";

const clusterVisitSchema = new mongoose.Schema(
  {
    user_id: { type: String, required: true, index: true },
    cluster_id: { type: String, required: true, index: true },

    visit_start: { type: Number, required: true },
    visit_end: { type: Number, default: null },
    duration_sec: { type: Number, default: null },

    arrival_hour: Number,
    departure_hour: Number,

    day_of_week: String,
    is_weekend: Boolean,
    time_of_day: String,

    prev_cluster_id: {
      type: String,
      default: null
    },

    next_cluster_id: {
      type: String,
      default: null
    },

    point_count: {
      type: Number,
      default: 0
    },

    is_merged: {
      type: Boolean,
      default: false
    },

    date: String,

    created_at: {
      type: Number,
      default: () => Date.now()
    }
  },
  {
    collection: "cluster_visits"
  }
);

clusterVisitSchema.index({ user_id: 1, cluster_id: 1 });
clusterVisitSchema.index({ user_id: 1, visit_start: 1 });
clusterVisitSchema.index({ user_id: 1, date: 1 });

const ClusterVisit = mongoose.model("ClusterVisit", clusterVisitSchema);

export default ClusterVisit;