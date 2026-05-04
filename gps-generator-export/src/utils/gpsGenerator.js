import { getBearing, movePoint, getDistance, buildGpsRecord } from './geoUtils.js';
import { buildDaySchedule } from './daySchedule.js';
import { INTERVAL_SEC, CHUNK_SIZE } from '../constants/constants.js';

/**
 * Generates GPS records for a single segment (STAY / WALK / DRIVE).
 * Yields batched chunks of records.
 */
async function* generateSegmentChunked(profile, segment, tripId, chunkSize) {
    const { user_id, vin, device_type, initialSoc } = profile;
    const { type, from, to, start, end, speed: baseSpeed, label } = segment;

    const intervalMs   = INTERVAL_SEC * 1000;
    const totalSeconds = end - start;
    if (totalSeconds <= 0) return;

    const chunk = [];
    let currentPoint = { ...from };
    let bearing      = to ? getBearing(from, to) : 0;
    let step         = 0;
    let socValue     = initialSoc;

    for (let ts = start; ts <= end; ts += INTERVAL_SEC) {
        // ── SOC drain: ~20% over a full day (86400s) ──
        socValue = Math.max(5, socValue - (20 / (86400 / INTERVAL_SEC)));

        // ── Speed with natural jitter ──
        let speed = baseSpeed;
        if (speed > 0) {
            speed = Math.max(0, baseSpeed + (Math.random() - 0.5) * 4);
        }

        // ── Move point if in transit ──
        if (to && speed > 0) {
            const distancePerStep = (speed / 3.6) * INTERVAL_SEC; // meters
            const remaining       = getDistance(currentPoint, to);

            if (remaining <= distancePerStep) {
                currentPoint = { ...to };
            } else {
                bearing      = getBearing(currentPoint, to); // recalculate each step
                currentPoint = movePoint(currentPoint, bearing, distancePerStep);
            }
        }

        // ── Small GPS noise for STAY points (real devices drift ±1–5m) ──
        const lat = currentPoint.lat + (speed === 0 ? (Math.random() - 0.5) * 0.00003 : 0);
        const lng = currentPoint.lng + (speed === 0 ? (Math.random() - 0.5) * 0.00003 : 0);

        const record = buildGpsRecord({
            user_id,
            vin,
            lat,
            lng,
            speed,
            accuracy:      Math.floor(Math.random() * 10) + 3, // 3–12m
            soc:           parseFloat(socValue.toFixed(1)),
            igs:           speed > 0 ? 1 : 0,
            gps_TimeStamp: ts,
            trip_id:       tripId,
            heading:       Math.round(bearing),
            device_type,
        });

        chunk.push(record);

        if (chunk.length >= chunkSize) {
            yield [...chunk];
            chunk.length = 0; // clear in place
        }

        step++;
        if (step % 500 === 0) {
            await new Promise(resolve => setImmediate(resolve)); // yield event loop
        }
    }

    if (chunk.length > 0) {
        yield [...chunk];
        chunk.length = 0;
    }
}

/**
 * Main generator — full day for one user.
 * Iterates over all segments in the day's schedule and yields GPS record chunks.
 *
 * @param {object} profile  - user profile from generateUserProfile()
 * @param {Date}   dayDate  - the calendar date to simulate
 * @param {number} chunkSize
 */
export async function* generateDayChunked(profile, dayDate, chunkSize = CHUNK_SIZE) {
    const date      = new Date(dayDate);
    const isWeekend = date.getDay() === 0 || date.getDay() === 6;
    const segments  = buildDaySchedule(profile, dayDate, isWeekend);

    let tripCounter = 1;

    for (const segment of segments) {
        const tripId = segment.type !== 'STAY'
            ? `${profile.user_id}_${date.toISOString().slice(0, 10)}_T${tripCounter++}`
            : null;

        for await (const chunk of generateSegmentChunked(profile, segment, tripId, chunkSize)) {
            yield chunk;
        }
    }
}
