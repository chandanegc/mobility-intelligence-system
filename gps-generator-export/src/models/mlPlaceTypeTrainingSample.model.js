import mongoose from "mongoose";

const mlPlaceTypeTrainingSampleSchema = new mongoose.Schema(
  {
    user_id: { type: String, required: true, index: true },
    cluster_id: { type: String, required: true },

    avg_arrival_hour: { type: Number, required: true },
    avg_departure_hour: { type: Number, required: true },
    avg_duration_sec: { type: Number, required: true },

    weekday_ratio: { type: Number, required: true },
    night_visit_ratio: { type: Number, required: true },
    day_visit_ratio: { type: Number, required: true },

    visit_count: { type: Number, required: true },

    // The target (label)
    place_type: { type: String, required: true },

    created_at: { type: Date, default: Date.now }
  },
  {
    collection: "ml_place_type_training_samples"
  }
);

mlPlaceTypeTrainingSampleSchema.index({ user_id: 1, cluster_id: 1 }, { unique: true });

const MlPlaceTypeTrainingSample = mongoose.model(
  "MlPlaceTypeTrainingSample",
  mlPlaceTypeTrainingSampleSchema
);

export default MlPlaceTypeTrainingSample;
