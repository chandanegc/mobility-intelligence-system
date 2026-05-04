import ngeohash from 'ngeohash';
import { ACTIVITY, TIME_OF_DAY, DAYS } from '../constants/constants.js';

// ─── Earth Math ───────────────────────────────────────────────────────────────
const R       = 6371e3;
const PI_180  = Math.PI / 180;
const _180_PI = 180 / Math.PI;

export const toRad = x => x * PI_180;
export const toDeg = x => x * _180_PI;

export const getDistance = (p1, p2) => {
    const φ1 = toRad(p1.lat), φ2 = toRad(p2.lat);
    const Δφ = toRad(p2.lat - p1.lat);
    const Δλ = toRad(p2.lng - p1.lng);
    const sinΔφ2 = Math.sin(Δφ / 2);
    const sinΔλ2 = Math.sin(Δλ / 2);
    const a = sinΔφ2 * sinΔφ2 + Math.cos(φ1) * Math.cos(φ2) * sinΔλ2 * sinΔλ2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

export const getBearing = (p1, p2) => {
    const φ1 = toRad(p1.lat), φ2 = toRad(p2.lat);
    const Δλ = toRad(p2.lng - p1.lng);
    const cosφ2 = Math.cos(φ2);
    const y = Math.sin(Δλ) * cosφ2;
    const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * cosφ2 * Math.cos(Δλ);
    return (toDeg(Math.atan2(y, x)) + 360) % 360;
};

export const movePoint = (point, bearing, distanceMeters) => {
    const δ  = distanceMeters / R;
    const θ  = toRad(bearing);
    const φ1 = toRad(point.lat);
    const λ1 = toRad(point.lng);
    const sinδ = Math.sin(δ), cosδ = Math.cos(δ);
    const sinφ1 = Math.sin(φ1), cosφ1 = Math.cos(φ1);
    const φ2 = Math.asin(sinφ1 * cosδ + cosφ1 * sinδ * Math.cos(θ));
    const λ2 = λ1 + Math.atan2(Math.sin(θ) * sinδ * cosφ1, cosδ - sinφ1 * Math.sin(φ2));
    return { lat: toDeg(φ2), lng: toDeg(λ2) };
};

// ─── Derived Field Helpers ────────────────────────────────────────────────────

export const computeGeoHash = (lat, lng, precision = 7) => {
    try { return ngeohash.encode(lat, lng, precision); }
    catch { return null; }
};

export const getTimeOfDay = (hour) => {
    if (hour >= 5  && hour < 12) return TIME_OF_DAY.MORNING;
    if (hour >= 12 && hour < 17) return TIME_OF_DAY.AFTERNOON;
    if (hour >= 17 && hour < 21) return TIME_OF_DAY.EVENING;
    return TIME_OF_DAY.NIGHT;
};

export const getDayOfWeek = (date) => DAYS[date.getDay()];

export const getIsWeekend = (date) => {
    const d = date.getDay();
    return d === 0 || d === 6;
};

/**
 * Infer activity_type from speed (km/h)
 * 0        → STAY
 * 0.1–7    → WALK
 * >7       → DRIVE
 */
export const inferActivity = (speedKmh) => {
    if (speedKmh === 0)       return ACTIVITY.STAY;
    if (speedKmh <= 7)        return ACTIVITY.WALK;
    if (speedKmh > 7)         return ACTIVITY.DRIVE;
    return ACTIVITY.UNKNOWN;
};

/**
 * Build a complete GpsData document from raw fields.
 * All derived fields (geoHash, time_of_day, day_of_week, etc.) are auto-computed.
 */
export const buildGpsRecord = ({
    user_id, vin, lat, lng, speed = 0,
    accuracy = 5, soc = null, igs = 0,
    gps_TimeStamp, trip_id = null,
    heading = 0, device_type = 'mobile'
}) => {
    const date        = new Date(gps_TimeStamp * 1000);
    const hour        = date.getHours();
    const now         = Date.now();

    return {
        user_id,
        vin,
        lat,
        lng,
        location: { type: 'Point', coordinates: [lng, lat] },
        geoHash:       computeGeoHash(lat, lng),
        accuracy,
        speed,
        soc,
        gps_TimeStamp,
        activity_type: inferActivity(speed),
        heading,
        device_type,
        trip_id,
        igs,
        day_of_week:   getDayOfWeek(date),
        is_weekend:    getIsWeekend(date),
        time_of_day:   getTimeOfDay(hour),
        createdOn:     now,
        updatedOn:     now,
        processed:     false
    };
};
