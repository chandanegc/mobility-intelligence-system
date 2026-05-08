import mongoose from "mongoose";

const userMovementPatternSchema = new mongoose.Schema(
  {
    user_id: { type: String, required: true, index: true },

    from_cluster_id: { type: String, required: true },
    to_cluster_id: { type: String, required: true },

    from_place_type: { type: String, default: "UNKNOWN" },
    to_place_type: { type: String, default: "UNKNOWN" },

    from_place_name: { type: String, default: null },
    to_place_name: { type: String, default: null },

    day_of_week: { type: String, required: true },
    time_of_day: { type: String, required: true },

    transition_count: { type: Number, default: 0 },
    total_transitions_from_cluster: { type: Number, default: 0 },
    probability: { type: Number, default: 0 },

    avg_departure_hour: { type: Number, default: 0 },
    avg_travel_duration_sec: { type: Number, default: 0 },
    avg_distance_meters: { type: Number, default: null },
    avg_speed_kmph: { type: Number, default: 0 },
    max_speed_kmph: { type: Number, default: 0 },

    most_common_travel_mode: { type: String, default: "UNKNOWN" },

    reliable_trip_count: { type: Number, default: 0 },
    unreliable_trip_count: { type: Number, default: 0 },

    first_seen: Number,
    last_seen: Number,

    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now }
  },
  {
    collection: "user_movement_patterns"
  }
);

// Indexes suggested by user
userMovementPatternSchema.index(
  {
    user_id: 1,
    from_cluster_id: 1,
    to_cluster_id: 1,
    day_of_week: 1,
    time_of_day: 1
  },
  { unique: true }
);

userMovementPatternSchema.index({
  user_id: 1,
  from_cluster_id: 1,
  day_of_week: 1,
  time_of_day: 1,
  probability: -1
});

const UserMovementPattern = mongoose.model("UserMovementPattern", userMovementPatternSchema);

export default UserMovementPattern;
