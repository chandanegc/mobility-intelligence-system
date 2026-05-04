import express from 'express';
import { generateGpsData, getGenerationStats, clearGpsData } from '../controllers/generateController.js';
import { calculateTotalDistance } from '../controllers/journeyController.js';

const router = express.Router();

// ── GPS Data Generator ────────────────────────────────────────────────────────

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

export default router;
