import mongoose from 'mongoose';
import { TYPE } from '../constants/constants.js';

const locationPointSchema = new mongoose.Schema({
    // User & Vehicle Identity
    user_id: { type: String, default: null },
    vin:     { type: String, default: null },

    // Raw lat/lng
    lat: { type: Number, default: null },
    lng: { type: Number, default: null },

    // GeoJSON location
    location: {
        type: { type: String, enum: ['Point'], default: 'Point' },
        coordinates: { type: [Number], required: true } // [lng, lat]
    },

    // Telemetry
    accuracy:      { type: Number, default: null },
    soc:           { type: Number, default: null },
    speed:         { type: Number, default: 0 },
    igs:           { type: Number, enum: [0, 1], default: null },
    activity_type: {
        type: String,
        enum: ['trip-start', 'trip-stop', 'ignition-start', 'ignition-stop', null],
        default: null
    },

    // GPS Timestamp (epoch)
    gps_TimeStamp: { type: Number, default: null },

    // Simulation / tracking fields
    distanceFromPrevious: { type: Number, default: 0 },
    reachedEnd:           { type: Boolean, default: false },
    type: {
        type: String,
        enum: Object.values(TYPE),
        default: TYPE.STOP_AT_CURRENT
    },
    timestamp: { type: Date, default: Date.now },

    // Audit timestamps (epoch)
    createdOn: { type: Number, default: null },
    updatedOn: { type: Number, default: null }
});

locationPointSchema.index({ location: '2dsphere' });

const LocationPoint = mongoose.model('LocationPoint', locationPointSchema);

export default LocationPoint;
