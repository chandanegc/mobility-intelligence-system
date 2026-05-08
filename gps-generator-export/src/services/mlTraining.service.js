import TripSegment from "../models/tripSegment.model.js";
import UserCluster from "../models/userCluster.model.js";
import MlNextPlaceTrainingSample from "../models/mlNextPlaceTrainingSample.model.js";
import MlTripDurationTrainingSample from "../models/mlTripDurationTrainingSample.model.js";
import MlPlaceTypeTrainingSample from "../models/mlPlaceTypeTrainingSample.model.js";

/**
 * Generates ML training samples for predicting the next place.
 * Uses trip_segments joined with user_clusters to get place types.
 */
export async function generateNextPlaceTrainingSamples(userId) {
  const pipeline = [
    { $match: { user_id: userId } },
    // Join from cluster visit info (to get previous_cluster and stay_duration)
    {
      $lookup: {
        from: "cluster_visits",
        let: { uid: "$user_id", tStart: "$trip_start" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$user_id", "$$uid"] },
                  { $eq: ["$visit_end", "$$tStart"] }
                ]
              }
            }
          },
          {
            $project: {
              _id: 0,
              prev_cluster_id: 1,
              duration_sec: 1,
              is_weekend: 1
            }
          }
        ],
        as: "from_visit"
      }
    },
    // Join from cluster stats
    {
      $lookup: {
        from: "user_clusters",
        let: { uid: "$user_id", fromCid: "$from_cluster_id" },
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
              visit_count: 1,
              avg_duration_sec: 1,
              night_visit_ratio: 1,
              day_visit_ratio: 1,
              place_type_confidence: 1
            }
          }
        ],
        as: "from_cluster_info"
      }
    },
    // Join to cluster info
    {
      $lookup: {
        from: "user_clusters",
        let: { uid: "$user_id", toCid: "$to_cluster_id" },
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
          { $project: { _id: 0, place_type: 1 } }
        ],
        as: "to_cluster_info"
      }
    },
    {
      $addFields: {
        from_visit: { $arrayElemAt: ["$from_visit", 0] },
        from_cluster: { $arrayElemAt: ["$from_cluster_info", 0] },
        to_cluster: { $arrayElemAt: ["$to_cluster_info", 0] }
      }
    },
    {
      $project: {
        _id: 0,
        user_id: 1,
        trip_segment_id: "$_id",

        from_cluster_id: 1,
        from_place_type: { $ifNull: ["$from_cluster.place_type", "UNKNOWN"] },
        previous_cluster_id: { $ifNull: ["$from_visit.prev_cluster_id", null] },

        day_of_week: 1,
        is_weekend: { $ifNull: ["$from_visit.is_weekend", false] },
        time_of_day: 1,
        departure_hour: 1,

        current_stay_duration_sec: { $ifNull: ["$from_visit.duration_sec", 0] },

        from_cluster_visit_count: { $ifNull: ["$from_cluster.visit_count", 0] },
        from_cluster_avg_duration_sec: {
          $ifNull: ["$from_cluster.avg_duration_sec", 0]
        },
        from_cluster_night_visit_ratio: {
          $ifNull: ["$from_cluster.night_visit_ratio", 0]
        },
        from_cluster_day_visit_ratio: {
          $ifNull: ["$from_cluster.day_visit_ratio", 0]
        },
        from_cluster_place_type_confidence: {
          $ifNull: ["$from_cluster.place_type_confidence", 0]
        },

        travel_mode: 1,
        avg_speed_kmph: 1,

        to_cluster_id: 1,
        to_place_type: { $ifNull: ["$to_cluster.place_type", "UNKNOWN"] },

        trip_start: 1,
        source: { $literal: "trip_segments" }
      }
    }
  ];

  const samples = await TripSegment.aggregate(pipeline).allowDiskUse(true);

  if (samples.length === 0) return { user_id: userId, samples_created: 0 };

  const bulkOps = samples.map((sample) => ({
    updateOne: {
      filter: {
        user_id: sample.user_id,
        trip_segment_id: sample.trip_segment_id
      },
      update: { $set: sample },
      upsert: true
    }
  }));

  const result = await MlNextPlaceTrainingSample.bulkWrite(bulkOps, {});
  return {
    user_id: userId,
    samples_created: result.upsertedCount,
    samples_updated: result.modifiedCount
  };
}

/**
 * Generates ML training samples for predicting trip duration.
 * Only uses high-quality trip segments.
 */
export async function generateTripDurationTrainingSamples(userId) {
  const trips = await TripSegment.find({
    user_id: userId,
    data_quality: { $in: ["GOOD", "LOW_POINTS"] },
    distance_meters: { $gt: 0 },
    duration_sec: { $gt: 0 }
  }).lean();

  if (trips.length === 0) return { user_id: userId, samples_created: 0 };

  const bulkOps = trips.map(trip => ({
    updateOne: {
      filter: { user_id: userId, trip_segment_id: trip._id },
      update: {
        $set: {
          user_id: userId,
          trip_segment_id: trip._id,
          from_cluster_id: trip.from_cluster_id,
          to_cluster_id: trip.to_cluster_id,
          departure_hour: trip.departure_hour,
          day_of_week: trip.day_of_week,
          travel_mode: trip.travel_mode,
          distance_meters: trip.distance_meters,
          duration_sec: trip.duration_sec,
          trip_start: trip.trip_start
        }
      },
      upsert: true
    }
  }));

  const result = await MlTripDurationTrainingSample.bulkWrite(bulkOps, {});
  return {
    user_id: userId,
    samples_created: result.upsertedCount,
    samples_updated: result.modifiedCount
  };
}

/**
 * Generates ML training samples for predicting cluster place type.
 * Uses user_clusters that have a known place_type.
 */
export async function generatePlaceTypeTrainingSamples(userId) {
  const clusters = await UserCluster.find({
    user_id: userId,
    place_type: { $ne: null, $nin: ["UNKNOWN", "OTHER"] }
  }).lean();

  if (clusters.length === 0) return { user_id: userId, samples_created: 0 };

  const bulkOps = clusters.map(cluster => ({
    updateOne: {
      filter: { user_id: userId, cluster_id: cluster.cluster_id },
      update: {
        $set: {
          user_id: userId,
          cluster_id: cluster.cluster_id,
          avg_arrival_hour: cluster.avg_arrival_hour,
          avg_departure_hour: cluster.avg_departure_hour,
          avg_duration_sec: cluster.avg_duration_sec,
          weekday_ratio: cluster.weekday_ratio,
          night_visit_ratio: cluster.night_visit_ratio,
          day_visit_ratio: cluster.day_visit_ratio,
          visit_count: cluster.visit_count,
          place_type: cluster.place_type
        }
      },
      upsert: true
    }
  }));

  const result = await MlPlaceTypeTrainingSample.bulkWrite(bulkOps, {});
  return {
    user_id: userId,
    samples_created: result.upsertedCount,
    samples_updated: result.modifiedCount
  };
}

/**
 * Runs all ML training sample generation for a user.
 */
export async function generateAllMlTrainingSamples(userId) {
  const results = {};
  results.nextPlace = await generateNextPlaceTrainingSamples(userId);
  results.tripDuration = await generateTripDurationTrainingSamples(userId);
  results.placeType = await generatePlaceTypeTrainingSamples(userId);
  return results;
}
