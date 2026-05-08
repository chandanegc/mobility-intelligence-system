import mongoose from "mongoose";

const tripSegmentSchema = new mongoose.Schema(
  {
    user_id: { type: String, required: true, index: true },
    date: { type: String, required: true, index: true }, // e.g., "2026-05-05"

    from_cluster_id: { type: String, required: true, index: true },
    to_cluster_id: { type: String, required: true, index: true },

    trip_start: { type: Number, required: true },
    trip_end: { type: Number, required: true },
    duration_sec: { type: Number, required: true },

    distance_meters: { type: Number, default: 0 },
    distance_km: { type: Number, default: 0 },

    avg_speed_kmph: { type: Number, default: 0 },
    max_speed_kmph: { type: Number, default: 0 },

    travel_mode: {
      type: String,
      enum: ["DRIVE", "WALK", "MIXED", "UNKNOWN"],
      default: "UNKNOWN"
    },

    point_count: { type: Number, default: 0 },
    valid_segment_count: { type: Number, default: 0 },
    gps_jump_count: { type: Number, default: 0 },

    start_location: {
      lat: { type: Number, default: null },
      lng: { type: Number, default: null }
    },

    end_location: {
      lat: { type: Number, default: null },
      lng: { type: Number, default: null }
    },

    data_quality: {
      type: String,
      enum: ["GOOD", "LOW_POINTS", "NO_POINTS", "GPS_JUMP_FILTERED"],
      default: "GOOD"
    },

    // Soft filtering metadata: we still store the segment but mark why it might be low-signal.
    is_filtered: { type: Boolean, default: false },
    filter_reason: { type: String, default: null },

    source: { type: String, default: "cluster_visits_gps_processed" },

    // ML training fields
    day_of_week: String,
    time_of_day: String,
    departure_hour: Number,

    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now }
  },
  {
    collection: "trip_segments"
  }
);

// Unique index for upsert
tripSegmentSchema.index(
  { user_id: 1, date: 1, from_cluster_id: 1, to_cluster_id: 1, trip_start: 1 },
  { unique: true }
);

// Additional indexes
tripSegmentSchema.index({ user_id: 1, date: 1, trip_start: 1 });
tripSegmentSchema.index({ user_id: 1, from_cluster_id: 1, to_cluster_id: 1 });
tripSegmentSchema.index({
  user_id: 1,
  from_cluster_id: 1,
  to_cluster_id: 1,
  day_of_week: 1,
  time_of_day: 1
});

const TripSegment = mongoose.model("TripSegment", tripSegmentSchema);

export default TripSegment;