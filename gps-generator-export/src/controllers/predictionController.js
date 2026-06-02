import {
  predictNextPlace,
  predictUserClusterAtTime,
  predictUserDayFromClusterVisits
} from "../services/prediction.service.js";

/**
 * Controller to handle next place prediction requests.
 */
export const getNextPlacePrediction = async (req, res) => {
  const { user_id, current_cluster_id, previous_cluster_id, current_stay_duration_sec } = req.body;

  if (!user_id || !current_cluster_id) {
    return res.status(400).json({ 
        success: false, 
        error: "user_id and current_cluster_id are required" 
    });
  }

  try {
    const result = await predictNextPlace(
        user_id, 
        current_cluster_id, 
        previous_cluster_id || "START", 
        current_stay_duration_sec || 0
    );
    return res.status(200).json({ success: true, data: result });
  } catch (err) {
    console.error("[predictionController] Error predicting next place:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
};

export const getUserDayPrediction = async (req, res) => {
  const {
    user_id,
    date = new Date().toISOString().slice(0, 10),
    day_of_week
  } = req.query;

  if (!user_id) {
    return res.status(400).json({
      success: false,
      error: "user_id is required"
    });
  }

  try {
    const result = await predictUserDayFromClusterVisits({
      userId: user_id,
      date,
      dayOfWeek: day_of_week
    });

    return res.status(200).json({
      success: true,
      data: result
    });
  } catch (err) {
    console.error("[predictionController] Error predicting user day:", err);
    return res.status(500).json({
      success: false,
      error: err.message
    });
  }
};

export const getUserTimePrediction = async (req, res) => {
  const {
    user_id,
    date = new Date().toISOString().slice(0, 10),
    day_of_week,
    time
  } = req.query;

  if (!user_id || !time) {
    return res.status(400).json({
      success: false,
      error: "user_id and time are required"
    });
  }

  try {
    const result = await predictUserClusterAtTime({
      userId: user_id,
      date,
      dayOfWeek: day_of_week,
      time
    });

    return res.status(200).json({
      success: true,
      data: result
    });
  } catch (err) {
    console.error("[predictionController] Error predicting user time:", err);
    return res.status(500).json({
      success: false,
      error: err.message
    });
  }
};
