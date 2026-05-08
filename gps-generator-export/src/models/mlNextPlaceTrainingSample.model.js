import mongoose from "mongoose";

const mlNextPlaceTrainingSampleSchema = new mongoose.Schema(
  {
    user_id: { type: String, required: true, index: true },
    trip_segment_id: { type: mongoose.Schema.Types.ObjectId, required: true },

    // Core features
    from_cluster_id: { type: String, required: true },
    from_place_type: { type: String, default: "UNKNOWN" },
    previous_cluster_id: { type: String, default: null },

    day_of_week: { type: String, required: true },
    is_weekend: { type: Boolean, default: false },
    time_of_day: { type: String, required: true },
    departure_hour: { type: Number, required: true },

    current_stay_duration_sec: { type: Number, default: 0 },

    // Cluster stats features
    from_cluster_visit_count: { type: Number, default: 0 },
    from_cluster_avg_duration_sec: { type: Number, default: 0 },
    from_cluster_night_visit_ratio: { type: Number, default: 0 },
    from_cluster_day_visit_ratio: { type: Number, default: 0 },
    from_cluster_place_type_confidence: { type: Number, default: 0 },

    // Trip behavior (optional context)
    travel_mode: { type: String, default: "UNKNOWN" },
    avg_speed_kmph: { type: Number, default: 0 },

    // Target (Labels)
    to_cluster_id: { type: String, required: true },
    to_place_type: { type: String, default: "UNKNOWN" },

    // Metadata
    trip_start: { type: Number, required: true },
    source: { type: String, default: "trip_segments" },
    created_at: { type: Date, default: Date.now }
  },
  {
    collection: "ml_next_place_training_samples"
  }
);

mlNextPlaceTrainingSampleSchema.index({ user_id: 1, trip_segment_id: 1 }, { unique: true });

const MlNextPlaceTrainingSample = mongoose.model(
  "MlNextPlaceTrainingSample",
  mlNextPlaceTrainingSampleSchema
);

export default MlNextPlaceTrainingSample;
