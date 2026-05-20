import mongoose from "mongoose";

const pointSchema = {
  type: {
    type: String,
    enum: ["Point"],
    default: "Point"
  },
  coordinates: {
    type: [Number], // [lng, lat]
    required: true
  }
};

const gpsRawSchema = new mongoose.Schema(
  {
    user_id: { type: String, required: true, index: true },
    device_id: { type: String, index: true },
    vin: { type: String },
    device_type: { type: String, default: "mobile" },

    gps_TimeStamp: { type: Number, required: true, index: true },
    createdOn: { type: Number, default: () => Date.now(), index: true },
    updatedOn: { type: Number, default: () => Date.now() },

    lat: { type: Number, required: true },
    lng: { type: Number, required: true },

    location: pointSchema,

    geoHash: String,

    speed: { type: Number, default: 0 },
    heading: { type: Number, default: 0 },
    accuracy: { type: Number, default: null },
    altitude: Number,
    hdop: Number,
    soc: Number,
    igs: Number,

    day_of_week: String,
    is_weekend: Boolean,
    time_of_day: String,

    processed: { type: Boolean, default: false, index: true }
  },
  {
    collection: "gps_raw"
  }
);

gpsRawSchema.index({ location: "2dsphere" });
gpsRawSchema.index({ user_id: 1, gps_TimeStamp: 1 });
gpsRawSchema.index({ device_id: 1, gps_TimeStamp: 1 });
gpsRawSchema.index({ processed: 1, gps_TimeStamp: 1 });

const GpsRaw = mongoose.model("GpsRaw", gpsRawSchema);

export default GpsRaw;
