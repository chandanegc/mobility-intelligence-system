import { predictNextPlace } from "../services/prediction.service.js";

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
