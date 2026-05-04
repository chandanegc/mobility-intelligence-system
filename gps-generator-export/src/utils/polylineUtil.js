import { getDistance, getBearing, movePoint } from './geoUtils.js';
import { TYPE } from '../constants/constants.js';

// ─── Async generators (chunked / streaming) ──────────────────────────────────

export async function* startPolylineSimulationChunked(startPoint, endPoint, speedMps, type, startTime, chunkSize = 50000) {
    const intervalMs      = 3000;
    const distancePerStep = speedMps * 3;
    let prevPoint         = { ...startPoint };
    let step              = 0;
    let baseTime          = new Date(startTime).getTime();
    let chunk             = [];

    while (true) {
        const remainingDistance = getDistance(prevPoint, endPoint);
        let currentPoint, coveredDistance, reachedEnd = false;

        if (remainingDistance <= distancePerStep) {
            currentPoint    = { ...endPoint };
            coveredDistance = remainingDistance;
            reachedEnd      = true;
        } else {
            const bearing = getBearing(prevPoint, endPoint);
            currentPoint    = movePoint(prevPoint, bearing, distancePerStep);
            coveredDistance = distancePerStep;
        }

        chunk.push({
            location: { type: 'Point', coordinates: [currentPoint.lng, currentPoint.lat] },
            distanceFromPrevious: coveredDistance,
            reachedEnd,
            type,
            timestamp: new Date(baseTime + step * intervalMs),
            speed:     speedMps * 3.6
        });

        if (chunk.length >= chunkSize) { yield chunk; chunk = []; }

        prevPoint = currentPoint;
        step++;

        if (reachedEnd) { if (chunk.length > 0) yield chunk; break; }
        if (step % 100 === 0) await new Promise(r => setImmediate(r));
    }
}

export async function* generateTrackingPointsChunked(point, startTime, endTime, intervalSec, type, chunkSize = 50000) {
    const start      = new Date(startTime).getTime();
    const end        = new Date(endTime).getTime();
    const intervalMs = intervalSec * 1000;

    if (start >= end) throw new Error('endTime must be after startTime.');

    const lng   = point.lng;
    const lat   = point.lat;
    let chunk   = [];
    let count   = 0;

    for (let currentTime = start; currentTime <= end; currentTime += intervalMs) {
        chunk.push({
            location: { type: 'Point', coordinates: [lng, lat] },
            distanceFromPrevious: 0,
            reachedEnd: false,
            type,
            timestamp: new Date(currentTime)
        });

        if (chunk.length >= chunkSize) { yield chunk; chunk = []; }

        count++;
        if (count % 1000 === 0) await new Promise(r => setImmediate(r));
    }

    if (chunk.length > 0) yield chunk;
}

// ─── Legacy (non-chunked) ────────────────────────────────────────────────────

export const startPolylineSimulation = (startPoint, endPoint, speedMps, type, startTime) => {
    const intervalMs      = 3000;
    const distancePerStep = speedMps * 3;
    const points          = [];
    let prevPoint         = { ...startPoint };
    let step              = 0;
    let baseTime          = new Date(startTime).getTime();

    while (true) {
        const remainingDistance = getDistance(prevPoint, endPoint);
        let currentPoint, coveredDistance, reachedEnd = false;

        if (remainingDistance <= distancePerStep) {
            currentPoint    = { ...endPoint };
            coveredDistance = remainingDistance;
            reachedEnd      = true;
        } else {
            const bearing = getBearing(prevPoint, endPoint);
            currentPoint    = movePoint(prevPoint, bearing, distancePerStep);
            coveredDistance = distancePerStep;
        }

        points.push({
            location: { type: 'Point', coordinates: [currentPoint.lng, currentPoint.lat] },
            distanceFromPrevious: coveredDistance,
            reachedEnd,
            type,
            timestamp: new Date(baseTime + step * intervalMs),
            speed:     speedMps * 3.6
        });

        prevPoint = currentPoint;
        step++;
        if (reachedEnd) break;
    }

    return points;
};

export const generateTrackingPoints = (point, startTime, endTime, intervalSec, type) => {
    const start      = new Date(startTime).getTime();
    const end        = new Date(endTime).getTime();
    const intervalMs = intervalSec * 1000;

    if (start >= end) throw new Error('endTime must be after startTime.');

    const points = [];
    for (let currentTime = start; currentTime <= end; currentTime += intervalMs) {
        points.push({
            location: { type: 'Point', coordinates: [point.lng, point.lat] },
            distanceFromPrevious: 0,
            reachedEnd: false,
            type,
            timestamp: new Date(currentTime)
        });
    }

    return points;
};
