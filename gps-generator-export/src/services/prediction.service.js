import axios from 'axios';
import ClusterVisit from '../models/clusterVisit.model.js';
import UserMovementPattern from '../models/userMovementPattern.model.js';
import UserCluster from '../models/userCluster.model.js';
import { applyResolvedPlace } from '../utils/placeResolver.js';

const PYTHON_API_URL = process.env.PYTHON_API_URL || 'http://localhost:8000';
const SLOT_MINUTES = 30;
const MINUTES_IN_DAY = 24 * 60;

function getISTPartsFromTimestamp(timestampSec) {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Kolkata',
        weekday: 'long',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    }).formatToParts(new Date(timestampSec * 1000));

    return {
        dayOfWeek: parts.find(part => part.type === 'weekday')?.value,
        hour: Number(parts.find(part => part.type === 'hour')?.value || 0),
        minute: Number(parts.find(part => part.type === 'minute')?.value || 0)
    };
}

function getDayOfWeekFromDate(dateText) {
    return new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Kolkata',
        weekday: 'long'
    }).format(new Date(`${dateText}T00:00:00+05:30`));
}

function parseTimeToMinutes(timeText) {
    if (typeof timeText !== 'string') return null;

    const trimmed = timeText.trim();
    const amPmMatch = trimmed.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);

    if (amPmMatch) {
        let hour = Number(amPmMatch[1]);
        const minute = Number(amPmMatch[2]);
        const period = amPmMatch[3].toUpperCase();

        if (period === 'PM' && hour !== 12) hour += 12;
        if (period === 'AM' && hour === 12) hour = 0;

        return hour * 60 + minute;
    }

    const match = trimmed.match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return null;

    const hour = Number(match[1]);
    const minute = Number(match[2]);

    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
    return hour * 60 + minute;
}

function formatMinutes(minutes, options = {}) {
    if (options.endOfDayAs24 && minutes >= MINUTES_IN_DAY) {
        return '24:00';
    }

    const safeMinutes = ((Math.round(minutes) % MINUTES_IN_DAY) + MINUTES_IN_DAY) % MINUTES_IN_DAY;
    const hour = Math.floor(safeMinutes / 60);
    const minute = safeMinutes % 60;

    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function getVisitStartMinute(visit) {
    if (typeof visit.visit_start !== 'number') return null;

    const parts = getISTPartsFromTimestamp(visit.visit_start);
    return parts.hour * 60 + parts.minute;
}

function getVisitEndMinute(visit) {
    const endTimestamp = typeof visit.visit_end === 'number'
        ? visit.visit_end
        : visit.visit_start + (visit.duration_sec || 0);

    if (typeof endTimestamp !== 'number') return null;

    const parts = getISTPartsFromTimestamp(endTimestamp);
    return parts.hour * 60 + parts.minute;
}

function getTimeOfDayFromMinutes(minutes) {
    const hour = Math.floor(minutes / 60);

    if (hour < 12) return 'morning';
    if (hour < 17) return 'afternoon';
    if (hour < 21) return 'evening';

    return 'night';
}

function getClusterLocation(cluster) {
    if (typeof cluster?.center?.lat === 'number' && typeof cluster?.center?.lng === 'number') {
        return {
            lat: cluster.center.lat,
            lng: cluster.center.lng
        };
    }

    const coordinates = cluster?.center_location?.coordinates;

    if (
        Array.isArray(coordinates) &&
        coordinates.length >= 2 &&
        typeof coordinates[0] === 'number' &&
        typeof coordinates[1] === 'number'
    ) {
        return {
            lat: coordinates[1],
            lng: coordinates[0]
        };
    }

    return {
        lat: null,
        lng: null
    };
}

async function getClusterMetaById(userId) {
    const clusters = await UserCluster.find({ user_id: userId }).lean();
    const clusterById = new Map();

    clusters.forEach(cluster => {
        clusterById.set(cluster.cluster_id, cluster);
    });

    return clusterById;
}

function toPredictionPoint(clusterId, clusterById, extra = {}) {
    const cluster = clusterById.get(clusterId);
    const location = getClusterLocation(cluster);

    return applyResolvedPlace({
        cluster_id: clusterId,
        cluster_name: cluster?.place_name || cluster?.place_type || clusterId,
        place_type: cluster?.place_type || null,
        place_type_confidence: cluster?.place_type_confidence ?? null,
        visit_count: cluster?.visit_count ?? null,
        total_points: cluster?.total_points ?? null,
        radius_meters: cluster?.radius_meters ?? null,
        lat: location.lat,
        lng: location.lng,
        ...extra
    });
}

async function loadVisitsForPrediction(userId, dayOfWeek) {
    const exactVisits = await ClusterVisit.find({
        user_id: userId,
        day_of_week: dayOfWeek,
        visit_start: { $type: 'number' }
    })
        .sort({ visit_start: 1 })
        .lean();

    if (exactVisits.length) {
        return {
            visits: exactVisits,
            match_level: 'same_day_of_week'
        };
    }

    const fallbackVisits = await ClusterVisit.find({
        user_id: userId,
        visit_start: { $type: 'number' }
    })
        .sort({ visit_start: 1 })
        .lean();

    return {
        visits: fallbackVisits,
        match_level: 'all_days_fallback'
    };
}

function addScore(scoreMap, clusterId, score) {
    if (!clusterId || score <= 0) return;
    scoreMap.set(clusterId, (scoreMap.get(clusterId) || 0) + score);
}

function getTopCluster(scoreMap) {
    let topClusterId = null;
    let topScore = 0;
    let totalScore = 0;

    scoreMap.forEach((score, clusterId) => {
        totalScore += score;

        if (score > topScore) {
            topScore = score;
            topClusterId = clusterId;
        }
    });

    return {
        clusterId: topClusterId,
        confidence: totalScore > 0 ? Number((topScore / totalScore).toFixed(3)) : 0,
        support: Number(topScore.toFixed(2)),
        totalSupport: Number(totalScore.toFixed(2))
    };
}

function getVisitMinuteRanges(visit) {
    const startMinute = getVisitStartMinute(visit);
    const endMinute = getVisitEndMinute(visit);

    if (startMinute === null || endMinute === null) return [];

    if (endMinute >= startMinute) {
        return [{ startMinute, endMinute }];
    }

    return [
        { startMinute, endMinute: MINUTES_IN_DAY },
        { startMinute: 0, endMinute }
    ];
}

/**
 * Predicts a user's likely cluster at one requested date/time using cluster_visits.
 */
export async function predictUserClusterAtTime({ userId, date, dayOfWeek, time }) {
    const targetDayOfWeek = dayOfWeek || getDayOfWeekFromDate(date);
    const targetMinute = parseTimeToMinutes(time);

    if (targetMinute === null) {
        throw new Error('time must be HH:mm or h:mmAM/PM');
    }

    const clusterById = await getClusterMetaById(userId);
    const { visits, match_level } = await loadVisitsForPrediction(userId, targetDayOfWeek);
    const directScores = new Map();
    const nearbyScores = new Map();
    const targetTimeOfDay = getTimeOfDayFromMinutes(targetMinute);

    visits.forEach(visit => {
        const ranges = getVisitMinuteRanges(visit);
        const durationScore = Math.max(1, Math.min((visit.duration_sec || 0) / 1800, 6));

        ranges.forEach(({ startMinute, endMinute }) => {
            if (targetMinute >= startMinute && targetMinute <= endMinute) {
                addScore(directScores, visit.cluster_id, durationScore);
                return;
            }

            const midpoint = (startMinute + endMinute) / 2;
            const distanceMinutes = Math.abs(targetMinute - midpoint);

            if (distanceMinutes <= 90) {
                addScore(nearbyScores, visit.cluster_id, durationScore * (1 - distanceMinutes / 120));
            }
        });

        if (visit.time_of_day === targetTimeOfDay) {
            addScore(nearbyScores, visit.cluster_id, 0.35);
        }
    });

    const scoreMap = directScores.size ? directScores : nearbyScores;
    const top = getTopCluster(scoreMap);

    if (!top.clusterId) {
        return {
            user_id: userId,
            date,
            day_of_week: targetDayOfWeek,
            time,
            source: 'cluster_visits_time_rule',
            match_level,
            prediction: null,
            message: 'No cluster visit pattern found for this time'
        };
    }

    const alternatives = [...scoreMap.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([clusterId, score], index) => toPredictionPoint(clusterId, clusterById, {
            rank: index + 1,
            confidence: Number((score / top.totalSupport).toFixed(3)),
            support: Number(score.toFixed(2))
        }));

    return {
        user_id: userId,
        date,
        day_of_week: targetDayOfWeek,
        time,
        source: 'cluster_visits_time_rule',
        match_level,
        prediction: toPredictionPoint(top.clusterId, clusterById, {
            confidence: top.confidence,
            support: top.support
        }),
        alternatives
    };
}

/**
 * Predicts a full day schedule in 30-minute slots using historical cluster_visits.
 */
export async function predictUserDayFromClusterVisits({ userId, date, dayOfWeek }) {
    const targetDayOfWeek = dayOfWeek || getDayOfWeekFromDate(date);
    const clusterById = await getClusterMetaById(userId);
    const { visits, match_level } = await loadVisitsForPrediction(userId, targetDayOfWeek);
    const slotCount = MINUTES_IN_DAY / SLOT_MINUTES;
    const slotScores = Array.from({ length: slotCount }, () => new Map());

    visits.forEach(visit => {
        const ranges = getVisitMinuteRanges(visit);
        const durationScore = Math.max(1, Math.min((visit.duration_sec || 0) / 1800, 6));

        ranges.forEach(({ startMinute, endMinute }) => {
            const startSlot = Math.max(0, Math.floor(startMinute / SLOT_MINUTES));
            const endSlot = Math.min(slotCount - 1, Math.floor(Math.max(endMinute - 1, 0) / SLOT_MINUTES));

            for (let slot = startSlot; slot <= endSlot; slot++) {
                addScore(slotScores[slot], visit.cluster_id, durationScore);
            }
        });
    });

    const predictedSlots = slotScores.map((scoreMap, slot) => {
        const top = getTopCluster(scoreMap);

        if (!top.clusterId) return null;

        return {
            slot,
            start_minute: slot * SLOT_MINUTES,
            end_minute: (slot + 1) * SLOT_MINUTES,
            cluster_id: top.clusterId,
            confidence: top.confidence,
            support: top.support
        };
    });

    const schedule = [];

    predictedSlots.forEach(slotPrediction => {
        if (!slotPrediction) return;

        const last = schedule[schedule.length - 1];

        if (
            last &&
            last.cluster_id === slotPrediction.cluster_id &&
            last.end_minute === slotPrediction.start_minute
        ) {
            last.end_minute = slotPrediction.end_minute;
            last.confidence = Number(((last.confidence + slotPrediction.confidence) / 2).toFixed(3));
            last.support = Number((last.support + slotPrediction.support).toFixed(2));
            return;
        }

        schedule.push({ ...slotPrediction });
    });

    const predicted_schedule = schedule.map((item, index) => toPredictionPoint(
        item.cluster_id,
        clusterById,
        {
            rank: index + 1,
            start_time: formatMinutes(item.start_minute),
            end_time: formatMinutes(item.end_minute, { endOfDayAs24: true }),
            duration_min: item.end_minute - item.start_minute,
            confidence: item.confidence,
            support: item.support
        }
    ));

    return {
        user_id: userId,
        date,
        day_of_week: targetDayOfWeek,
        source: 'cluster_visits_day_rule',
        match_level,
        slot_minutes: SLOT_MINUTES,
        input_visit_count: visits.length,
        predicted_count: predicted_schedule.length,
        predicted_schedule
    };
}

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
