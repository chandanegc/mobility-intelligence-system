import TripSegment from "../models/tripSegment.model.js";
import UserCluster from "../models/userCluster.model.js";
import UserMovementPattern from "../models/userMovementPattern.model.js";

/**
 * Generates or updates movement patterns for a specific user based on their trip segments.
 *
 * @param {string} userId - The unique identifier of the user.
 * @returns {Promise<object>} Result summary with count of patterns created/updated.
 */
export async function generateUserMovementPatterns(userId) {
  const now = new Date();

  const pipeline = [
    {
      $match: {
        user_id: userId
      }
    },

    // Join from cluster info
    {
      $lookup: {
        from: "user_clusters",
        let: {
          uid: "$user_id",
          fromCid: "$from_cluster_id"
        },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$user_id", "$$uid"] },
                  { $eq: ["$cluster_id", "$$fromCid"] }
                ]
              }
            }
          },
          {
            $project: {
              _id: 0,
              place_type: 1,
              place_name: 1
            }
          }
        ],
        as: "from_cluster"
      }
    },

    // Join to cluster info
    {
      $lookup: {
        from: "user_clusters",
        let: {
          uid: "$user_id",
          toCid: "$to_cluster_id"
        },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$user_id", "$$uid"] },
                  { $eq: ["$cluster_id", "$$toCid"] }
                ]
              }
            }
          },
          {
            $project: {
              _id: 0,
              place_type: 1,
              place_name: 1
            }
          }
        ],
        as: "to_cluster"
      }
    },

    {
      $addFields: {
        from_cluster: { $arrayElemAt: ["$from_cluster", 0] },
        to_cluster: { $arrayElemAt: ["$to_cluster", 0] },

        is_reliable_trip: {
          $cond: [
            {
              $in: ["$data_quality", ["GOOD", "LOW_POINTS"]]
            },
            true,
            false
          ]
        }
      }
    },

    // Group route pattern
    {
      $group: {
        _id: {
          user_id: "$user_id",
          from_cluster_id: "$from_cluster_id",
          to_cluster_id: "$to_cluster_id",
          day_of_week: "$day_of_week",
          time_of_day: "$time_of_day"
        },

        transition_count: { $sum: 1 },

        avg_departure_hour: { $avg: "$departure_hour" },
        avg_travel_duration_sec: { $avg: "$duration_sec" },

        // Distance only reliable trips se lo
        reliable_distance_sum: {
          $sum: {
            $cond: ["$is_reliable_trip", "$distance_meters", 0]
          }
        },

        reliable_distance_count: {
          $sum: {
            $cond: ["$is_reliable_trip", 1, 0]
          }
        },

        avg_speed_kmph: { $avg: "$avg_speed_kmph" },
        max_speed_kmph: { $max: "$max_speed_kmph" },

        reliable_trip_count: {
          $sum: {
            $cond: ["$is_reliable_trip", 1, 0]
          }
        },

        unreliable_trip_count: {
          $sum: {
            $cond: ["$is_reliable_trip", 0, 1]
          }
        },

        first_seen: { $min: "$trip_start" },
        last_seen: { $max: "$trip_end" },

        travel_modes: { $push: "$travel_mode" },

        from_place_type: { $first: "$from_cluster.place_type" },
        to_place_type: { $first: "$to_cluster.place_type" },

        from_place_name: { $first: "$from_cluster.place_name" },
        to_place_name: { $first: "$to_cluster.place_name" }
      }
    },

    // Avg reliable distance calculate
    {
      $addFields: {
        avg_distance_meters: {
          $cond: [
            { $gt: ["$reliable_distance_count", 0] },
            {
              $divide: ["$reliable_distance_sum", "$reliable_distance_count"]
            },
            null
          ]
        }
      }
    },

    // Group by from cluster/day/time to calculate probability denominator
    {
      $group: {
        _id: {
          user_id: "$_id.user_id",
          from_cluster_id: "$_id.from_cluster_id",
          day_of_week: "$_id.day_of_week",
          time_of_day: "$_id.time_of_day"
        },

        total_transitions_from_cluster: {
          $sum: "$transition_count"
        },

        routes: {
          $push: {
            to_cluster_id: "$_id.to_cluster_id",

            transition_count: "$transition_count",

            avg_departure_hour: "$avg_departure_hour",
            avg_travel_duration_sec: "$avg_travel_duration_sec",
            avg_distance_meters: "$avg_distance_meters",
            avg_speed_kmph: "$avg_speed_kmph",
            max_speed_kmph: "$max_speed_kmph",

            reliable_trip_count: "$reliable_trip_count",
            unreliable_trip_count: "$unreliable_trip_count",

            first_seen: "$first_seen",
            last_seen: "$last_seen",

            travel_modes: "$travel_modes",

            from_place_type: "$from_place_type",
            to_place_type: "$to_place_type",

            from_place_name: "$from_place_name",
            to_place_name: "$to_place_name"
          }
        }
      }
    },

    { $unwind: "$routes" },

    {
      $project: {
        _id: 0,

        user_id: "$_id.user_id",
        from_cluster_id: "$_id.from_cluster_id",
        to_cluster_id: "$routes.to_cluster_id",

        day_of_week: "$_id.day_of_week",
        time_of_day: "$_id.time_of_day",

        from_place_type: {
          $ifNull: ["$routes.from_place_type", "UNKNOWN"]
        },
        to_place_type: {
          $ifNull: ["$routes.to_place_type", "UNKNOWN"]
        },

        from_place_name: {
          $ifNull: ["$routes.from_place_name", null]
        },
        to_place_name: {
          $ifNull: ["$routes.to_place_name", null]
        },

        transition_count: "$routes.transition_count",
        total_transitions_from_cluster: "$total_transitions_from_cluster",

        probability: {
          $divide: ["$routes.transition_count", "$total_transitions_from_cluster"]
        },
        avg_departure_hour: "$routes.avg_departure_hour",
        avg_travel_duration_sec: "$routes.avg_travel_duration_sec",
        avg_distance_meters: "$routes.avg_distance_meters",
        avg_speed_kmph: "$routes.avg_speed_kmph",
        max_speed_kmph: "$routes.max_speed_kmph",

        reliable_trip_count: "$routes.reliable_trip_count",
        unreliable_trip_count: "$routes.unreliable_trip_count",

        travel_modes: "$routes.travel_modes",

        first_seen: "$routes.first_seen",
        last_seen: "$routes.last_seen"
      }
    }
  ];

  const patterns = await TripSegment.aggregate(pipeline).allowDiskUse(true);

  if (!patterns.length) {
    return {
      user_id: userId,
      patterns_created_or_updated: 0,
      message: "No trip patterns found"
    };
  }

  // Calculate metrics and cleanup
  for (const pattern of patterns) {
    pattern.most_common_travel_mode = getMostCommonTravelMode(
      pattern.travel_modes || []
    );
    delete pattern.travel_modes;

    // Manual rounding for older MongoDB support
    pattern.probability = Number((pattern.probability || 0).toFixed(4));
    pattern.avg_departure_hour = Number((pattern.avg_departure_hour || 0).toFixed(2));
    pattern.avg_travel_duration_sec = Math.round(pattern.avg_travel_duration_sec || 0);
    pattern.avg_speed_kmph = Number((pattern.avg_speed_kmph || 0).toFixed(2));
    pattern.max_speed_kmph = Number((pattern.max_speed_kmph || 0).toFixed(2));

    if (pattern.avg_distance_meters !== null) {
      pattern.avg_distance_meters = Number(pattern.avg_distance_meters.toFixed(2));
    }

    pattern.updated_at = now;
  }

  const operations = patterns.map((pattern) => ({
    updateOne: {
      filter: {
        user_id: pattern.user_id,
        from_cluster_id: pattern.from_cluster_id,
        to_cluster_id: pattern.to_cluster_id,
        day_of_week: pattern.day_of_week,
        time_of_day: pattern.time_of_day
      },
      update: {
        $set: pattern,
        $setOnInsert: {
          created_at: now
        }
      },
      upsert: true
    }
  }));

  const bulkResult = await UserMovementPattern.bulkWrite(operations, {});

  return {
    user_id: userId,
    patterns_created_or_updated: patterns.length,
    upsertedCount: bulkResult.upsertedCount,
    modifiedCount: bulkResult.modifiedCount
  };
}

/**
 * Generates movement patterns for all users who have trip segments.
 *
 * @returns {Promise<Array>} List of results for each user.
 */
export async function generateAllUserMovementPatterns() {
  const userIds = await TripSegment.distinct("user_id");
  console.log(`[movement_patterns] Processing ${userIds.length} users`);

  const results = [];
  for (const userId of userIds) {
    console.log(`[movement_patterns] Processing user: ${userId}`);
    const result = await generateUserMovementPatterns(userId);
    results.push(result);
  }

  return results;
}

// ────────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ────────────────────────────────────────────────────────────────────────────────

/**
 * Determines the most frequent travel mode from a list.
 *
 * @param {Array<string>} modes
 * @returns {string} The most common mode or "UNKNOWN".
 */
function getMostCommonTravelMode(modes = []) {
  const count = {};

  for (const mode of modes) {
    if (!mode) continue;
    count[mode] = (count[mode] || 0) + 1;
  }

  const entries = Object.entries(count);
  if (entries.length === 0) return "UNKNOWN";

  return entries.sort((a, b) => b[1] - a[1])[0][0];
}
