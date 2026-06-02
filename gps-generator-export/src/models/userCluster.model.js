import mongoose from "mongoose";

const userClusterSchema = new mongoose.Schema(
  {
    cluster_id: { type: String, required: true, index: true },
    user_id: { type: String, required: true, index: true },

    center: {
      lat: Number,
      lng: Number
    },

    center_location: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point"
      },
      coordinates: {
        type: [Number],
        required: true
      }
    },

    total_points: { type: Number, default: 0 },

    visit_count: { type: Number, default: 0 },
    avg_duration_sec: { type: Number, default: 0 },
    total_duration_sec: { type: Number, default: 0 },

    first_seen: Number,
    last_seen: Number,

    place_type: {
      type: String,
      enum: [
        "AIRPORT",
        "BANK",
        "BOOK_STORE",
        "CAFE",
        "CINEMA",
        "COFFEE_SHOP",
        "COWORKING",
        "DOCTOR",
        "FAMILY_HOME",
        "FRIEND_HOME",
        "GROCERY",
        "GYM",
        "HOME",
        "LAKE",
        "LIBRARY",
        "LUNCH",
        "MALL",
        "MARKET",
        "METRO",
        "NIGHTOUT",
        "OFFICE",
        "OTHER",
        "PARK",
        "PETROL_PUMP",
        "PHARMACY",
        "REPAIR_SHOP",
        "SALON",
        "SPORTS",
        "STREET_FOOD",
        "TEMPLE",
        null
      ],
      default: null
    },

    place_type_source: {
      type: String,
      enum: ["rule", "google_api", "ml", "manual", "known_generated_location", null],
      default: null
    },

    place_type_confidence: {
      type: Number,
      default: 0
    },

    place_name: {
      type: String,
      default: null
    },

    place_api_types: {
      type: [String],
      default: []
    },

    night_visit_ratio: { type: Number, default: 0 },
    day_visit_ratio: { type: Number, default: 0 },
    weekday_ratio: { type: Number, default: 0 },

    avg_arrival_hour: { type: Number, default: 0 },
    avg_departure_hour: { type: Number, default: 0 },

    radius_meters: { type: Number, default: 0 },

    created_at: { type: Number, default: () => Date.now() },
    updated_at: { type: Number, default: () => Date.now() },

    clustering_version: {
      type: String,
      default: "v1"
    }
  },
  {
    collection: "user_clusters"
  }
);

userClusterSchema.index({ center_location: "2dsphere" });
userClusterSchema.index({ user_id: 1, cluster_id: 1 }, { unique: true });

const UserCluster = mongoose.model("UserCluster", userClusterSchema);

export default UserCluster;
