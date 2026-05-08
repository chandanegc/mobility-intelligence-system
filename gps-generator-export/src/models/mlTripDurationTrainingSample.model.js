import mongoose from "mongoose";

const mlTripDurationTrainingSampleSchema = new mongoose.Schema(
  {
    user_id: { type: String, required: true, index: true },
    trip_segment_id: { type: mongoose.Schema.Types.ObjectId, required: true },

    from_cluster_id: { type: String, required: true },
    to_cluster_id: { type: String, required: true },

    departure_hour: { type: Number, required: true },
    day_of_week: { type: String, required: true },

    travel_mode: { type: String, required: true },
    distance_meters: { type: Number, required: true },

    // The target (label)
    duration_sec: { type: Number, required: true },

    trip_start: { type: Number, required: true },

    created_at: { type: Date, default: Date.now }
  },
  {
    collection: "ml_trip_duration_training_samples"
  }
);

mlTripDurationTrainingSampleSchema.index({ user_id: 1, trip_segment_id: 1 }, { unique: true });

const MlTripDurationTrainingSample = mongoose.model(
  "MlTripDurationTrainingSample",
  mlTripDurationTrainingSampleSchema
);

export default MlTripDurationTrainingSample;
