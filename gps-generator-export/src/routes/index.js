import express from 'express';
import axios from 'axios';
import { generateGpsData, getGenerationStats, clearGpsData } from '../controllers/generateController.js';
import { calculateTotalDistance } from '../controllers/journeyController.js';
import {
  generateMovementPatterns,
  generateMlTrainingSamples,
  exportMlData
} from '../controllers/mlController.js';
import ClusterVisit from '../models/clusterVisit.model.js';
import UserCluster from '../models/userCluster.model.js';
import { getNextPlacePrediction } from '../controllers/predictionController.js';
import {
    createUserGpsData,
    getUserGpsData,
    loginUser
} from '../controllers/userController.js';

const router = express.Router();
const MAPPLS_ACCESS_TOKEN = process.env.MAPPLS_ACCESS_TOKEN || 'vokkcycrqlivzvdfngabetjfojmgdzubghbx';

function formatVisitTime(timestampSec) {
    if (typeof timestampSec !== 'number') {
        return null;
    }

    return new Date(timestampSec * 1000)
        .toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        })
        .replace(' ', '');
}

// ── GPS Data Generator ────────────────────────────────────────────────────────

/**
 * POST /api/user/login
 * Body: { user_id, device_id, vin?, device_type? }
 */
router.post('/user/login', loginUser);

/**
 * POST /api/user/data
 * Body: { user_id, device_id, lat, lng, accuracy?, altitude?, speed?, heading?, gps_timestamp? }
 */
router.post('/user/data', createUserGpsData);

/**
 * GET /api/user/data?user_id=U123&limit=100
 * Returns recent GPS data for a user or device.
 */
router.get('/user/data', getUserGpsData);

/**
 * POST /api/generate
 * Body: { users: 5, days: 30, clearExisting: true }
 * Generates synthetic GPS data for N users over N days (~28800 records/user/day)
 */
router.post('/generate', generateGpsData);

/**
 * GET /api/stats
 * Returns record counts grouped by user, activity_type, time_of_day
 */
router.get('/stats', getGenerationStats);

router.get('/cluster-visits/polyline', async (req, res) => {
    try {
        const query = {};

        if (req.query.user_id) {
            query.user_id = req.query.user_id;
        }

        const visits = await ClusterVisit.find(query, {
            _id: 0,
            center: 1,
            center_location: 1,
            cluster_id: 1,
            day_of_week: 1,
            time_of_day: 1,
            date: 1,
            duration_sec: 1,
            point_count: 1,
            user_id: 1,
            visit_end: 1,
            visit_start: 1
        })
            .sort({ visit_start: 1 })
            .lean();

        const clusterIds = [...new Set(visits.map(visit => visit.cluster_id).filter(Boolean))];
        const userIds = [...new Set(visits.map(visit => visit.user_id).filter(Boolean))];
        const clusterQuery = {
            cluster_id: { $in: clusterIds }
        };

        if (userIds.length) {
            clusterQuery.user_id = { $in: userIds };
        }

        const clusters = clusterIds.length
            ? await UserCluster.find(clusterQuery, {
                _id: 0,
                cluster_id: 1,
                place_name: 1,
                place_type_confidence: 1,
                place_type: 1,
                total_points: 1,
                user_id: 1,
                visit_count: 1
            }).lean()
            : [];
        const clusterById = new Map();

        clusters.forEach(cluster => {
            clusterById.set(`${cluster.user_id}:${cluster.cluster_id}`, cluster);
            clusterById.set(cluster.cluster_id, cluster);
        });

        const points = visits
            .map(visit => {
                const cluster = clusterById.get(`${visit.user_id}:${visit.cluster_id}`) ||
                    clusterById.get(visit.cluster_id);
                const clusterName = cluster?.place_name || cluster?.place_type || visit.cluster_id;
                const commonFields = {
                    cluster_id: visit.cluster_id,
                    cluster_name: clusterName,
                    duration_sec: visit.duration_sec,
                    point_count: visit.point_count,
                    place_type_confidence: cluster?.place_type_confidence,
                    total_cluster_points: cluster?.total_points,
                    visit_count: cluster?.visit_count
                };

                if (
                    typeof visit.center?.lat === 'number' &&
                    typeof visit.center?.lng === 'number'
                ) {
                    return {
                        ...commonFields,
                        lat: visit.center.lat,
                        lng: visit.center.lng,
                        day_of_week: visit.day_of_week,
                        time_of_day: visit.time_of_day,
                        date: visit.date,
                        visit_start_time: formatVisitTime(visit.visit_start),
                        visit_end_time: formatVisitTime(visit.visit_end)
                    };
                }

                const coordinates = visit.center_location?.coordinates;

                if (
                    Array.isArray(coordinates) &&
                    coordinates.length >= 2 &&
                    typeof coordinates[0] === 'number' &&
                    typeof coordinates[1] === 'number'
                ) {
                    return {
                        ...commonFields,
                        lat: coordinates[1],
                        lng: coordinates[0],
                        day_of_week: visit.day_of_week,
                        time_of_day: visit.time_of_day,
                        date: visit.date,
                        visit_start_time: formatVisitTime(visit.visit_start),
                        visit_end_time: formatVisitTime(visit.visit_end)
                    };
                }

                return null;
            })
            .filter(Boolean);

        res.json({
            count: points.length,
            points
        });
    } catch (error) {
        res.status(500).json({
            message: 'Failed to load cluster visit points',
            error: error.message
        });
    }
});

router.post('/mappls/route', async (req, res) => {
    try {
        const points = Array.isArray(req.body?.points) ? req.body.points : [];
        const routePoints = points
            .map(point => ({
                lat: Number(point.lat),
                lng: Number(point.lng)
            }))
            .filter(point => Number.isFinite(point.lat) && Number.isFinite(point.lng));

        if (routePoints.length < 2) {
            return res.status(400).json({
                message: 'At least two valid route points are required'
            });
        }

        const geoPositions = routePoints
            .map(point => `${point.lng},${point.lat}`)
            .join(';');
        const routeUrl = `https://route.mappls.com/route/direction/route_adv/driving/${geoPositions}`;
        const { data } = await axios.get(routeUrl, {
            params: {
                geometries: 'geojson',
                overview: 'full',
                steps: false,
                access_token: MAPPLS_ACCESS_TOKEN
            }
        });

        const coordinates = data?.routes?.[0]?.geometry?.coordinates;

        if (!Array.isArray(coordinates) || !coordinates.length) {
            return res.status(502).json({
                message: 'Mappls route response did not include geometry',
                code: data?.code
            });
        }

        res.json({
            code: data.code,
            duration: data.routes[0].duration,
            distance: data.routes[0].distance,
            path: coordinates
                .map(coordinate => ({
                    lat: Number(coordinate[1]),
                    lng: Number(coordinate[0])
                }))
                .filter(point => Number.isFinite(point.lat) && Number.isFinite(point.lng))
        });
    } catch (error) {
        res.status(error.response?.status || 500).json({
            message: 'Failed to load Mappls route',
            error: error.response?.data || error.message
        });
    }
});

/**
 * DELETE /api/clear
 * Deletes all records from gps_data collection
 */
router.delete('/clear', clearGpsData);

// ── Journey Simulation (existing) ────────────────────────────────────────────

/**
 * POST /api/journey/simulate
 * Simulates a 4-phase journey and stores LocationPoints
 */
router.post('/journey/simulate', calculateTotalDistance);

// ── ML Training & Patterns ───────────────────────────────────────────────────

/**
 * POST /api/ml/movement-patterns
 * Body: { userId: "U123" } (optional)
 * Generates user movement patterns from trip segments.
 */
router.post('/ml/movement-patterns', generateMovementPatterns);

/**
 * POST /api/ml/training-samples
 * Body: { userId: "U123" } (optional)
 * Generates ML training samples for next place, duration, and place type.
 */
router.post('/ml/training-samples', generateMlTrainingSamples);

/**
 * GET /api/ml/export
 * Query: ?userId=U123&format=json (format can be json or csv)
 * Exports ML training samples to files.
 */
router.get('/ml/export', exportMlData);

/**
 * POST /api/ml/predict
 * Body: { user_id, current_cluster_id, previous_cluster_id, current_stay_duration_sec }
 * Predicts the next place with ML + Fallback.
 */
router.post('/ml/predict', getNextPlacePrediction);

export default router;
