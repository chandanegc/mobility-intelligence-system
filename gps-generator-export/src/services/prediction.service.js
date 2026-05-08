import axios from 'axios';
import UserMovementPattern from '../models/userMovementPattern.model.js';
import UserCluster from '../models/userCluster.model.js';

const PYTHON_API_URL = process.env.PYTHON_API_URL || 'http://localhost:8000';

/**
 * Predicts the next place using ML model with rule-based fallback.
 */
export async function predictNextPlace(userId, currentClusterId, previousClusterId, currentStayDurationSec) {
    try {
        // 1. Try ML Prediction
        let mlResponse;
        try {
            mlResponse = await axios.post(`${PYTHON_API_URL}/predict-next-place`, {
                user_id: userId,
                current_cluster_id: currentClusterId,
                previous_cluster_id: previousClusterId,
                current_stay_duration_sec: currentStayDurationSec
            });
        } catch (err) {
            console.error("[prediction.service] ML Model API Error:", err.message);
        }

        const mlPredictions = mlResponse?.data?.predictions || [];
        const topPrediction = mlPredictions[0];

        // 2. If ML confidence is high enough (>= 0.70), return ML results
        if (topPrediction && topPrediction.confidence >= 0.70) {
            return {
                user_id: userId,
                source: "ml_model",
                confidence_score: topPrediction.confidence,
                predictions: mlPredictions
            };
        }

        // 3. Fallback to Rule-based Movement Patterns
        console.log(`[prediction.service] ML confidence low (${topPrediction?.confidence || 0}), falling back to patterns`);
        
        const now = new Date();
        const dayOfWeek = now.toLocaleDateString('en-US', { weekday: 'long' });
        const hour = now.getHours();
        let timeOfDay = "night";
        if (hour >= 5 && hour < 12) timeOfDay = "morning";
        else if (hour >= 12 && hour < 17) timeOfDay = "afternoon";
        else if (hour >= 17 && hour < 21) timeOfDay = "evening";

        // Try Level 1: user + from_cluster + day_of_week + time_of_day
        let patterns = await UserMovementPattern.find({
            user_id: userId,
            from_cluster_id: currentClusterId,
            day_of_week: dayOfWeek,
            time_of_day: timeOfDay
        }).sort({ probability: -1 }).limit(3).lean();

        let fallbackLevel = "level_1";

        // Try Level 2: user + from_cluster + time_of_day
        if (patterns.length === 0) {
            patterns = await UserMovementPattern.find({
                user_id: userId,
                from_cluster_id: currentClusterId,
                time_of_day: timeOfDay
            }).sort({ probability: -1 }).limit(3).lean();
            fallbackLevel = "level_2";
        }

        // Try Level 3: user + from_cluster
        if (patterns.length === 0) {
            patterns = await UserMovementPattern.find({
                user_id: userId,
                from_cluster_id: currentClusterId
            }).sort({ probability: -1 }).limit(3).lean();
            fallbackLevel = "level_3";
        }

        if (patterns.length > 0) {
            const predictions = await Promise.all(patterns.map(async (p, index) => {
                const cluster = await UserCluster.findOne({ user_id: userId, cluster_id: p.to_cluster_id }).lean();
                return {
                    rank: index + 1,
                    next_cluster_id: p.to_cluster_id,
                    next_place_type: p.to_place_type,
                    lat: cluster?.center?.lat,
                    lng: cluster?.center?.lng,
                    confidence: p.probability,
                    expected_trip_duration_min: Math.round(p.avg_travel_duration_sec / 60),
                    source: `rule_based_${fallbackLevel}`
                };
            }));

            return {
                user_id: userId,
                source: "rule_based_fallback",
                fallback_level: fallbackLevel,
                predictions
            };
        }

        // 4. Ultimate Fallback: User's most frequent destination
        const mostFreq = await UserMovementPattern.find({ user_id: userId })
            .sort({ transition_count: -1 })
            .limit(1)
            .lean();

        if (mostFreq.length > 0) {
            const p = mostFreq[0];
            const cluster = await UserCluster.findOne({ user_id: userId, cluster_id: p.to_cluster_id }).lean();
            return {
                user_id: userId,
                source: "most_frequent_fallback",
                predictions: [{
                    rank: 1,
                    next_cluster_id: p.to_cluster_id,
                    next_place_type: p.to_place_type,
                    lat: cluster?.center?.lat,
                    lng: cluster?.center?.lng,
                    confidence: 0.1, // low confidence for generic fallback
                    expected_trip_duration_min: Math.round(p.avg_travel_duration_sec / 60),
                    source: "most_frequent"
                }]
            };
        }

        return {
            user_id: userId,
            source: "none",
            message: "No prediction possible"
        };

    } catch (err) {
        console.error("[prediction.service] Error in predictNextPlace:", err);
        throw err;
    }
}
