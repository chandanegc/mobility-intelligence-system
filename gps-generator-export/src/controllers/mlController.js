import { generateUserMovementPatterns, generateAllUserMovementPatterns } from "../services/userMovementPatterns.service.js";
import { generateAllMlTrainingSamples } from "../services/mlTraining.service.js";
import TripSegment from "../models/tripSegment.model.js";
import {
  exportTrainingSamplesToJson,
  exportTrainingSamplesToCsv
} from "../services/mlExport.service.js";

/**
 * Controller to trigger the generation of user movement patterns.
 */
export const generateMovementPatterns = async (req, res) => {
  const { userId } = req.body;

  try {
    if (userId) {
      const result = await generateUserMovementPatterns(userId);
      return res.status(200).json({ success: true, data: result });
    } else {
      const results = await generateAllUserMovementPatterns();
      return res.status(200).json({ success: true, data: results });
    }
  } catch (err) {
    console.error("[mlController] Error generating movement patterns:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * Controller to trigger the generation of ML training samples.
 */
export const generateMlTrainingSamples = async (req, res) => {
  const { userId } = req.body;

  try {
    if (userId) {
      const result = await generateAllMlTrainingSamples(userId);
      return res.status(200).json({ success: true, data: result });
    } else {
      // Find all user IDs from trip segments
      const userIds = await TripSegment.distinct("user_id");
      const results = [];
      for (const id of userIds) {
        const result = await generateAllMlTrainingSamples(id);
        results.push(result);
      }
      return res.status(200).json({ success: true, data: results });
    }
  } catch (err) {
    console.error("[mlController] Error generating ML training samples:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * Controller to export ML training data.
 */
export const exportMlData = async (req, res) => {
  const { userId, format = "json" } = req.query;

  try {
    let result;
    if (format.toLowerCase() === "csv") {
      result = await exportTrainingSamplesToCsv(userId);
    } else {
      result = await exportTrainingSamplesToJson(userId);
    }

    return res.status(200).json({
      success: true,
      message: `Data exported successfully to ${format.toUpperCase()} files`,
      data: result
    });
  } catch (err) {
    console.error("[mlController] Error exporting ML data:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
};
