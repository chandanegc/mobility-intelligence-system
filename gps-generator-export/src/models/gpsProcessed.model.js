import mongoose from "mongoose";
import { PROCESSING_VERSION } from "../constants/gps.constants.js";

const pointSchema = {
  type: {
    type: String,
    enum: ["Point"],
    default: "Point"
  },
  coordinates: {
    type: [Number],
    required: true
  }
};

const gpsProcessedSchema = new mongoose.Schema(
  {
    raw_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "GpsRaw",
      required: true,
      index: true
    },

    user_id: { type: String, required: true, index: true },
    vin: String,
    device_type: String,

    gps_TimeStamp: { type: Number, required: true, index: true },

    lat: Number,
    lng: Number,

    raw_lat: Number,
    raw_lng: Number,

    location: pointSchema,

    gps_accuracy_m: {
      type: Number,
      default: null
    },

    gps_quality_score: {
      type: Number,
      default: 1
    },

    is_sparse_point: {
      type: Boolean,
      default: false
    },

    activity_type: {
      type: String,
      enum: ["STAY", "WALK", "DRIVE", "UNKNOWN"],
      default: "UNKNOWN"
    },

    activity_confidence: {
      type: Number,
      default: 1.0
    },

    trip_id: {
      type: String,
      default: null,
      index: true
    },

    is_stay_point: {
      type: Boolean,
      default: false
    },

    stay_start_time: {
      type: Number,
      default: null
    },

    stay_duration: {
      type: Number,
      default: 0
    },

    stay_confidence: {
      type: Number,
      default: 0
    },

    stay_radius_m: {
      type: Number,
      default: null
    },

    stay_distance_from_anchor_m: {
      type: Number,
      default: null
    },

    stay_point_count: {
      type: Number,
      default: 0
    },

    stay_reason: {
      type: String,
      default: null
    },

    cluster_id: {
      type: String,
      default: null,
      index: true
    },

    distance_from_prev: {
      type: Number,
      default: 0
    },

    raw_distance_from_prev: {
      type: Number,
      default: 0
    },

    time_gap: {
      type: Number,
      default: 0
    },

    speed_change: {
      type: Number,
      default: 0
    },

    heading_change: {
      type: Number,
      default: 0
    },

    calculated_speed_kmph: {
      type: Number,
      default: 0
    },

    raw_calculated_speed_kmph: {
      type: Number,
      default: 0
    },

    is_anomaly: {
      type: Boolean,
      default: false
    },

    anomaly_reason: {
      type: String,
      default: null
    },

    processing_version: {
      type: String,
      default: PROCESSING_VERSION
    },

    processed_at: {
      type: Number,
      default: () => Date.now()
    }
  },
  {
    collection: "gps_processed"
  }
);

gpsProcessedSchema.index({ location: "2dsphere" });
gpsProcessedSchema.index({ user_id: 1, gps_TimeStamp: 1 });
gpsProcessedSchema.index({ raw_id: 1 }, { unique: true });
gpsProcessedSchema.index({ user_id: 1, cluster_id: 1 });

const GpsProcessed = mongoose.model("GpsProcessed", gpsProcessedSchema);

export default GpsProcessed;
