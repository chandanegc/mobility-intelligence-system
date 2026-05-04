import { generateTrackingPointsChunked, startPolylineSimulationChunked } from '../utils/polylineUtil.js';
import LocationPoint from '../models/LocationPoint.js';
import { TYPE } from '../constants/constants.js';

// ─── Batch Insert ─────────────────────────────────────────────────────────────

const batchInsertPointsFast = async (points) => {
    if (points.length === 0) return 0;
    const bulkOps = points.map(doc => ({ insertOne: { document: doc } }));
    try {
        const result = await LocationPoint.bulkWrite(bulkOps, { ordered: false });
        return result.insertedCount;
    } catch (err) {
        console.error('Batch insert error:', err.message);
        return 0;
    }
};

// ─── Controller ───────────────────────────────────────────────────────────────

export const calculateTotalDistance = async (req, res) => {
    const { current, last } = req.body;

    if (!current || !last) {
        return res.status(400).json({ message: 'Please provide current and last.' });
    }

    // ── Destructure current ──
    const {
        latC, langC, createdAt, startedAt, speedC,
        user_id,
        vin,
        accuracy:      accuracyC,
        soc:           socC,
        igs:           igsC,
        activity_type: activityC,
        gps_TimeStamp: gpsC,
        createdOn:     createdOnC,
        updatedOn:     updatedOnC
    } = current;

    // ── Destructure last ──
    const {
        latL, langL, reachedAt, returnedAt, speedL,
        accuracy:      accuracyL,
        soc:           socL,
        igs:           igsL,
        activity_type: activityL,
        gps_TimeStamp: gpsL,
        createdOn:     createdOnL,
        updatedOn:     updatedOnL
    } = last;

    // ── Validation ──
    if (!latC || !langC || !createdAt || !startedAt || !speedC) {
        return res.status(400).json({ message: 'Incomplete current object.' });
    }
    if (!latL || !langL || !reachedAt || !returnedAt || !speedL) {
        return res.status(400).json({ message: 'Incomplete last object.' });
    }

    const startPoint = { lat: parseFloat(latC), lng: parseFloat(langC) };
    const endPoint   = { lat: parseFloat(latL), lng: parseFloat(langL) };
    const speedMpsC  = parseFloat(speedC) / 3.6;
    const speedMpsL  = parseFloat(speedL) / 3.6;

    // ── Meta objects per phase ──
    const metaCurrent = {
        user_id:       user_id      ?? null,
        vin:           vin          ?? null,
        lat:           startPoint.lat,
        lng:           startPoint.lng,
        accuracy:      accuracyC    ?? null,
        soc:           socC         ?? null,
        igs:           igsC         ?? null,
        activity_type: activityC    ?? null,
        gps_TimeStamp: gpsC         ?? null,
        createdOn:     createdOnC   ?? null,
        updatedOn:     updatedOnC   ?? null
    };

    const metaLast = {
        user_id:       user_id      ?? null,
        vin:           vin          ?? null,
        lat:           endPoint.lat,
        lng:           endPoint.lng,
        accuracy:      accuracyL    ?? null,
        soc:           socL         ?? null,
        igs:           igsL         ?? null,
        activity_type: activityL    ?? null,
        gps_TimeStamp: gpsL         ?? null,
        createdOn:     createdOnL   ?? null,
        updatedOn:     updatedOnL   ?? null
    };

    try {
        console.log('Starting bulk insert operation...');
        const startTime = Date.now();

        console.log('Clearing existing data...');
        await LocationPoint.deleteMany({});

        let totalPointsInserted = 0;
        const phaseStats = { stopAtCurrent: 0, goToDestination: 0, stopAtDestination: 0, returnBack: 0 };
        const CHUNK_SIZE = 50000;

        // ── Phase 1: Stop at current location ────────────────────────────────
        console.log('Phase 1: Stop at current location...');
        for await (const chunk of generateTrackingPointsChunked(startPoint, createdAt, startedAt, 3, TYPE.STOP_AT_CURRENT, CHUNK_SIZE)) {
            const enriched = chunk.map(p => ({ ...p, ...metaCurrent }));
            const inserted = await batchInsertPointsFast(enriched);
            phaseStats.stopAtCurrent += inserted;
            totalPointsInserted      += inserted;
            console.log(`Phase 1 progress: ${totalPointsInserted} total`);
        }

        // ── Phase 2: Go to destination ────────────────────────────────────────
        console.log('Phase 2: Go to destination...');
        for await (const chunk of startPolylineSimulationChunked(startPoint, endPoint, speedMpsC, TYPE.GO, startedAt, CHUNK_SIZE)) {
            const enriched = chunk.map(p => ({
                ...p,
                ...metaCurrent,
                lat: p.location.coordinates[1],
                lng: p.location.coordinates[0]
            }));
            const inserted = await batchInsertPointsFast(enriched);
            phaseStats.goToDestination += inserted;
            totalPointsInserted        += inserted;
            console.log(`Phase 2 progress: ${totalPointsInserted} total`);
        }

        // ── Phase 3: Stop at destination ──────────────────────────────────────
        console.log('Phase 3: Stop at destination...');
        for await (const chunk of generateTrackingPointsChunked(endPoint, reachedAt, returnedAt, 3, TYPE.STOP_AT_DESTINATION, CHUNK_SIZE)) {
            const enriched = chunk.map(p => ({ ...p, ...metaLast }));
            const inserted = await batchInsertPointsFast(enriched);
            phaseStats.stopAtDestination += inserted;
            totalPointsInserted          += inserted;
            console.log(`Phase 3 progress: ${totalPointsInserted} total`);
        }

        // ── Phase 4: Return back ──────────────────────────────────────────────
        console.log('Phase 4: Return back...');
        for await (const chunk of startPolylineSimulationChunked(endPoint, startPoint, speedMpsL, TYPE.RETURN, returnedAt, CHUNK_SIZE)) {
            const enriched = chunk.map(p => ({
                ...p,
                ...metaLast,
                lat: p.location.coordinates[1],
                lng: p.location.coordinates[0]
            }));
            const inserted = await batchInsertPointsFast(enriched);
            phaseStats.returnBack   += inserted;
            totalPointsInserted     += inserted;
            console.log(`Phase 4 progress: ${totalPointsInserted} total`);
        }

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log(`✓ Journey saved in ${elapsed}s — ${totalPointsInserted} points (${(totalPointsInserted / elapsed).toFixed(0)} pts/s)`);

        return res.status(200).json({
            message:              'Simulation completed successfully',
            totalPoints:          totalPointsInserted,
            phases:               phaseStats,
            startPoint,
            endPoint,
            speedGoKmh:           parseFloat(speedC),
            speedReturnKmh:       parseFloat(speedL),
            executionTimeSeconds: parseFloat(elapsed),
            pointsPerSecond:      Math.round(totalPointsInserted / parseFloat(elapsed))
        });

    } catch (err) {
        console.error('Error in simulation:', err.message);
        return res.status(500).json({ message: 'Failed to complete simulation.', error: err.message });
    }
};
