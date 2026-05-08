import MlNextPlaceTrainingSample from "../models/mlNextPlaceTrainingSample.model.js";
import MlTripDurationTrainingSample from "../models/mlTripDurationTrainingSample.model.js";
import MlPlaceTypeTrainingSample from "../models/mlPlaceTypeTrainingSample.model.js";
import fs from "fs";
import path from "path";

/**
 * Exports ML training samples to JSON files for Python processing.
 */
export async function exportTrainingSamplesToJson(userId = null) {
  const query = userId ? { user_id: userId } : {};
  const exportDir = path.resolve("../ai-service/exports");

  if (!fs.existsSync(exportDir)) {
    fs.mkdirSync(exportDir);
  }

  const result = {};

  // 1. Next Place Samples
  const nextPlaceSamples = await MlNextPlaceTrainingSample.find(query).lean();
  const nextPlacePath = path.join(exportDir, "next_place_samples.json");
  fs.writeFileSync(nextPlacePath, JSON.stringify(nextPlaceSamples, null, 2));
  result.nextPlace = {
    count: nextPlaceSamples.length,
    file: nextPlacePath
  };

  // 2. Trip Duration Samples
  const tripDurationSamples = await MlTripDurationTrainingSample.find(query).lean();
  const tripDurationPath = path.join(exportDir, "trip_duration_samples.json");
  fs.writeFileSync(tripDurationPath, JSON.stringify(tripDurationSamples, null, 2));
  result.tripDuration = {
    count: tripDurationSamples.length,
    file: tripDurationPath
  };

  // 3. Place Type Samples
  const placeTypeSamples = await MlPlaceTypeTrainingSample.find(query).lean();
  const placeTypePath = path.join(exportDir, "place_type_samples.json");
  fs.writeFileSync(placeTypePath, JSON.stringify(placeTypeSamples, null, 2));
  result.placeType = {
    count: placeTypeSamples.length,
    file: placeTypePath
  };

  return result;
}

/**
 * Exports ML training samples to CSV files (simplified flat version).
 */
export async function exportTrainingSamplesToCsv(userId = null) {
  const query = userId ? { user_id: userId } : {};
  const exportDir = path.resolve("../ai-service/exports");

  if (!fs.existsSync(exportDir)) {
    fs.mkdirSync(exportDir);
  }

  // Helper to convert array of objects to CSV
  const toCsv = (data) => {
    if (data.length === 0) return "";
    const headers = Object.keys(data[0]);
    const rows = data.map(obj => 
      headers.map(header => {
        let val = obj[header];
        if (val === null || val === undefined) return "";
        if (typeof val === "string") return `"${val.replace(/"/g, '""')}"`;
        return val;
      }).join(",")
    );
    return [headers.join(","), ...rows].join("\n");
  };

  const result = {};

  // 1. Next Place Samples
  const nextPlaceSamples = await MlNextPlaceTrainingSample.find(query).lean();
  const nextPlacePath = path.join(exportDir, "next_place_samples.csv");
  fs.writeFileSync(nextPlacePath, toCsv(nextPlaceSamples));
  result.nextPlace = { count: nextPlaceSamples.length, file: nextPlacePath };

  // 2. Trip Duration Samples
  const tripDurationSamples = await MlTripDurationTrainingSample.find(query).lean();
  const tripDurationPath = path.join(exportDir, "trip_duration_samples.csv");
  fs.writeFileSync(tripDurationPath, toCsv(tripDurationSamples));
  result.tripDuration = { count: tripDurationSamples.length, file: tripDurationPath };

  // 3. Place Type Samples
  const placeTypeSamples = await MlPlaceTypeTrainingSample.find(query).lean();
  const placeTypePath = path.join(exportDir, "place_type_samples.csv");
  fs.writeFileSync(placeTypePath, toCsv(placeTypeSamples));
  result.placeType = { count: placeTypeSamples.length, file: placeTypePath };

  return result;
}
